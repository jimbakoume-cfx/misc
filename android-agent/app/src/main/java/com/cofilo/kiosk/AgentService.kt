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
 * Long-running foreground service: enrolls the device, then every [INTERVAL_MS] sends a
 * heartbeat to the backend and applies the returned policy + commands.
 */
class AgentService : Service() {
    @Volatile private var running = false
    private val pendingAcks = JSONArray()
    private var lastPolicyVersion = -1

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForegroundCompat()
        if (!running) {
            running = true
            thread(name = "kiosk-agent", isDaemon = true) { loop() }
        }
        return START_STICKY
    }

    override fun onDestroy() {
        running = false
        super.onDestroy()
    }

    private fun startForegroundCompat() {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL, "Kiosk agent", NotificationManager.IMPORTANCE_MIN)
        )
        val n = Notification.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_lock_idle_lock)
            .setContentTitle("Company Kiosk")
            .setContentText("Device management active")
            .setOngoing(true)
            .build()
        startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
    }

    private fun loop() {
        // Re-apply the lockdown at every service start (boot, update, crash recovery).
        runCatching { Policy.apply(this) }
        while (running) {
            runCatching { tick() }.onFailure { Log.w(TAG, "tick failed: ${it.message}") }
            try {
                Thread.sleep(INTERVAL_MS)
            } catch (_: InterruptedException) {
                return
            }
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
        val res = Api.post(prefs.serverUrl, "/api/device/enroll", body)
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
        private const val INTERVAL_MS = 60_000L

        fun start(ctx: Context) {
            ctx.startForegroundService(Intent(ctx, AgentService::class.java))
        }
    }
}
