package com.cofilo.kiosk

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.IBinder
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import kotlin.concurrent.thread

/**
 * Long-running foreground service: enrolls the device, then every [Prefs.intervalSec] seconds sends a
 * heartbeat to the backend and applies the returned policy + commands.
 */
class AgentService : Service() {
    @Volatile private var running = false
    private var worker: Thread? = null
    private val wakeSignal = java.util.concurrent.Semaphore(0)
    private val push = PushClient { wakeSignal.release() }
    private val pendingAcks = JSONArray()
    private var lastPolicyVersion = -1

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForegroundCompat()
        if (!running) {
            running = true
            worker = thread(name = "kiosk-agent", isDaemon = true) { loop() }
            instance = this
        }
        return START_STICKY
    }

    override fun onDestroy() {
        running = false
        wakeSignal.release()
        push.stop()
        if (instance === this) instance = null
        super.onDestroy()
    }

    private fun startForegroundCompat() {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL, "Confiance Kiosk", NotificationManager.IMPORTANCE_MIN)
        )
        val n = Notification.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_lock_idle_lock)
            .setContentTitle("Confiance Kiosk")
            .setContentText("Device management active")
            .setOngoing(true)
            .build()
        startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
    }

    private fun loop() {
        // Re-apply the lockdown at every service start (boot, update, crash recovery).
        runCatching { Policy.apply(this) }
        while (running) {
            val prefs = Prefs(this)
            wakeSignal.drainPermits()
            runCatching { tick() }
                .onSuccess { prefs.lastError = "" }
                .onFailure {
                    Log.w(TAG, "tick failed: ${it.message}")
                    prefs.lastError = "${it.javaClass.simpleName}: ${it.message}".take(200)
                }
            sendBroadcast(Intent(Policy.ACTION_STATE_CHANGED).setPackage(packageName))
            // Not enrolled yet: retry quickly. Enrolled: normal interval; with the live channel up it is only a safety net.
            val waitMs = when {
                !prefs.enrolled -> RETRY_MS
                PushClient.connected -> maxOf(prefs.intervalSec, 900) * 1000L
                else -> prefs.intervalSec * 1000L
            }
            // Sleeps until the interval ends or a ping / "retry now" arrives.
            wakeSignal.tryAcquire(waitMs, java.util.concurrent.TimeUnit.MILLISECONDS)
        }
    }

    private fun tick() {
        val prefs = Prefs(this)
        if (!prefs.enrolled) {
            if (!prefs.hasEnrollConfig) return
            enroll(prefs)
        }
        if (prefs.enrolled) heartbeat(prefs)
    }

    private fun enroll(prefs: Prefs) {
        val body = DeviceInfo.identity(this).put("enrollToken", prefs.enrollToken)
        val res = try {
            Api.post(prefs.serverUrl, "/api/device/enroll", body)
        } catch (e: Api.ApiException) {
            if (e.code == 403) {
                // The code was rejected: forget it so the entry form comes back and it can be retyped.
                prefs.enrollToken = ""
                throw Api.ApiException(403, "Code not accepted (${e.message}). Check it and try again.")
            }
            throw e
        }
        prefs.deviceToken = res.getString("deviceToken")
        prefs.deviceName = res.optString("name", "")
        Log.i(TAG, "enrolled as ${prefs.deviceName}")
    }

    private fun heartbeat(prefs: Prefs) {
        val body = JSONObject()
            .put("status", DeviceInfo.status(this))
            .put("acks", JSONArray(pendingAcks.toString()))
        // Only upload the app list when it changed (it can be long).
        val apps = DeviceInfo.installedApps(this)
        val hash = apps.toString().hashCode()
        if (hash != prefs.lastAppsHash) body.put("apps", apps)

        val res = try {
            Api.post(prefs.serverUrl, "/api/device/heartbeat", body, prefs.deviceToken)
        } catch (e: Api.ApiException) {
            if (e.code == 401) {
                // Removed from the dashboard: forget the token so we can re-enroll if still configured.
                prefs.deviceToken = ""
            }
            throw e
        }
        prefs.lastCheckIn = System.currentTimeMillis()
        if (body.has("apps")) prefs.lastAppsHash = hash
        // Server received the acks; clear them.
        while (pendingAcks.length() > 0) pendingAcks.remove(0)

        res.optJSONObject("policy")?.let { applyPolicy(prefs, it) }
        val cmds = res.optJSONArray("commands")
        if (cmds != null) for (i in 0 until cmds.length()) handleCommand(prefs, cmds.getJSONObject(i))
    }

    private fun applyPolicy(prefs: Prefs, p: JSONObject) {
        val version = p.optInt("version", 0)
        prefs.deviceName = p.optString("name", prefs.deviceName)
        prefs.message = p.optString("message", "")
        prefs.pinSalt = p.optString("pinSalt", prefs.pinSalt)
        prefs.pinHash = p.optString("pinHash", prefs.pinHash)
        prefs.disableDebugging = p.optBoolean("disableDebugging", true)
        prefs.intervalSec = p.optInt("intervalSec", 300)
        val pushCfg = p.optJSONObject("push")
        if (pushCfg != null && pushCfg.optString("channel").isNotEmpty()) {
            push.configure(pushCfg.optString("url"), pushCfg.optString("key"), pushCfg.optString("channel"))
        } else push.stop()
        val apps = p.optJSONArray("allowedApps")
        if (apps != null) {
            prefs.allowedApps = (0 until apps.length()).map {
                val o = apps.getJSONObject(it)
                o.getString("pkg") to o.optString("label", o.getString("pkg"))
            }
        }
        if (version != lastPolicyVersion) {
            lastPolicyVersion = version
            Policy.apply(this)
        }
        sendBroadcast(Intent(Policy.ACTION_STATE_CHANGED).setPackage(packageName))
    }

    private fun handleCommand(prefs: Prefs, c: JSONObject) {
        val id = c.getString("id")
        var status = "done"
        var error = ""
        try {
            when (c.getString("type")) {
                "refresh" -> Policy.apply(this)
                "reboot" -> {
                    ack(id, "done", "")
                    Policy.dpm(this).reboot(Policy.admin(this))
                    return
                }
                "lock" -> Policy.dpm(this).lockNow()
                "release" -> Policy.release(this)
                "relock" -> Policy.relock(this)
                "unenroll" -> Policy.unenroll(this)
                "update" -> {
                    val payload = c.getJSONObject("payload")
                    selfUpdate(payload.getString("url"), payload.getString("sha256"))
                }
                else -> { status = "failed"; error = "unknown command" }
            }
        } catch (e: Throwable) {
            status = "failed"
            error = e.message ?: e.javaClass.simpleName
        }
        ack(id, status, error)
    }

    private fun ack(id: String, status: String, error: String) {
        pendingAcks.put(JSONObject().put("id", id).put("status", status).put("error", error))
    }

    private fun selfUpdate(url: String, sha256: String) {
        val file = File(cacheDir, "update.apk")
        val actual = Api.download(url, file)
        if (!actual.equals(sha256, ignoreCase = true)) {
            file.delete()
            throw IllegalStateException("checksum mismatch")
        }
        val info = packageManager.getPackageArchiveInfo(file.path, 0)
            ?: throw IllegalStateException("invalid apk")
        if (info.packageName != packageName) throw IllegalStateException("wrong package")
        Installer.install(this, file)
    }

    companion object {
        private const val TAG = "KioskAgent"
        private const val CHANNEL = "agent"
        private const val RETRY_MS = 15_000L
        @Volatile private var instance: AgentService? = null

        /** Wakes the agent thread so it retries enrolment / check-in immediately. */
        fun retryNow(ctx: Context) {
            start(ctx)
            instance?.wakeSignal?.release()
        }

        fun start(ctx: Context) {
            ctx.startForegroundService(Intent(ctx, AgentService::class.java))
        }
    }
}
