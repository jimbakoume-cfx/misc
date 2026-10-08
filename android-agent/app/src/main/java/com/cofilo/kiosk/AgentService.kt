package com.cofilo.kiosk

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.provider.Settings
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import kotlin.concurrent.thread

/** `optString` that gives [def] for JSON null too (org.json would give the text "null"). */
private fun JSONObject.str(key: String, def: String = ""): String =
    if (isNull(key)) def else optString(key, def)

/**
 * Long-running foreground service: enrolls the device, then every [Prefs.intervalSec] seconds (or
 * [Prefs.pushIntervalSec] while the push channel is live) sends a heartbeat to the backend and applies the returned
 * policy + commands.
 * 1.4.0: check-ins go to the Supabase REST RPC when the policy gave a `rest` address (falling back to `serverUrl`),
 * carry data usage / app usage / location, and the command set grows with install, lost/found, ring, locate, wipe.
 * Managed apps from `policy.installApps` are installed silently, one per check-in, at most once an hour per package.
 */
class AgentService : Service() {
    @Volatile private var running = false
    private var worker: Thread? = null
    private val wakeSignal = java.util.concurrent.Semaphore(0)
    private val push = PushClient { wakeSignal.release() }
    private val pendingAcks = JSONArray()
    private var lastPolicyVersion = -1
    /** Non-fatal problem met inside the current tick (managed-app install); becomes `status.lastError`. */
    @Volatile private var tickError = ""

    private val main = Handler(Looper.getMainLooper())
    private var ringer: MediaPlayer? = null
    private var ringStop: Runnable? = null
    private var ringLock: PowerManager.WakeLock? = null

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
        main.post { stopRinging() }
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
        if (android.os.Build.VERSION.SDK_INT >= 29) startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        else startForeground(1, n)
    }

    private fun loop() {
        // Re-apply the lockdown at every service start (boot, update, crash recovery).
        runCatching { Policy.apply(this) }
        while (running) {
            val prefs = Prefs(this)
            wakeSignal.drainPermits()
            tickError = ""
            runCatching { tick() }
                .onSuccess { prefs.lastError = tickError }
                .onFailure {
                    Log.w(TAG, "tick failed: ${it.message}")
                    prefs.lastError = "${it.javaClass.simpleName}: ${it.message}".take(200)
                }
            sendBroadcast(Intent(Policy.ACTION_STATE_CHANGED).setPackage(packageName))
            // Not enrolled yet: retry quickly. Enrolled: normal interval; with the live channel up it is only a safety net.
            val waitMs = when {
                !prefs.enrolled -> RETRY_MS
                PushClient.connected -> maxOf(prefs.pushIntervalSec, prefs.intervalSec) * 1000L
                else -> prefs.intervalSec * 1000L
            }
            // Sleeps until the interval ends or a ping / "retry now" / locate arrives.
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
        if (prefs.enrolled) maybeSelfUpdate(prefs)
    }

    /**
     * Installs the release the policy offers when it is newer than this build. Retried every check-in after a
     * [UPDATE_RETRY_MS] pause (an install the phone refused shows up as `lastError`); "Update now" resets the pause.
     */
    private fun maybeSelfUpdate(prefs: Prefs) {
        val info = prefs.updateInfo.takeIf { it.isNotEmpty() }?.let { runCatching { JSONObject(it) }.getOrNull() } ?: return
        val mine = packageManager.getPackageInfo(packageName, 0).longVersionCode
        if (info.optLong("versionCode", 0L) <= mine) return
        if (SystemClock.elapsedRealtime() - prefs.lastUpdateAttempt < UPDATE_RETRY_MS && prefs.lastUpdateAttempt > 0) return
        prefs.lastUpdateAttempt = SystemClock.elapsedRealtime()
        Log.i(TAG, "updating to ${info.optString("versionName")} (${info.optLong("versionCode")})")
        try {
            selfUpdate(info.getString("url"), info.getString("sha256"))
        } catch (e: Throwable) {
            tickError = "update: ${e.message ?: e.javaClass.simpleName}".take(200)
        }
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
        prefs.deviceName = res.str("name")
        storeRest(prefs, res.optJSONObject("rest"))
        Log.i(TAG, "enrolled as ${prefs.deviceName}")
    }

    /** Keeps the REST check-in address when the server gave a usable one, clears it otherwise. */
    private fun storeRest(prefs: Prefs, rest: JSONObject?) {
        val url = rest?.str("url")?.trim().orEmpty()
        val key = rest?.str("key")?.trim().orEmpty()
        if (url.startsWith("https://") && key.isNotEmpty()) {
            prefs.restUrl = url; prefs.restKey = key
        } else {
            prefs.restUrl = ""; prefs.restKey = ""
        }
    }

    private fun heartbeat(prefs: Prefs) {
        val body = JSONObject()
            .put("status", DeviceInfo.status(this))
            .put("acks", JSONArray(pendingAcks.toString()))
        // Only upload the app list when it changed (it can be long).
        val apps = DeviceInfo.installedApps(this)
        val hash = apps.toString().hashCode()
        if (hash != prefs.lastAppsHash) body.put("apps", apps)

        // Data usage since the last accepted heartbeat + today's foreground minutes per allowed app.
        val traffic = runCatching { DeviceInfo.sampleTraffic(prefs) }.getOrNull()
        val usage = traffic?.toJson() ?: JSONObject()
        runCatching { DeviceInfo.appUsage(this, prefs) }.getOrNull()?.let { usage.put("appUsage", it) }
        if (usage.length() > 0) body.put("usage", usage)

        // Location: fresh fix after a `locate` command, last known fix when the policy asks for it.
        val locate = prefs.pendingLocate
        val location = runCatching {
            when {
                locate -> DeviceInfo.freshLocation(this)
                prefs.reportLocation -> DeviceInfo.lastKnownLocation(this)
                else -> null
            }
        }.getOrNull()
        if (location != null) body.put("location", location)

        val res = send(prefs, body)

        prefs.lastCheckIn = System.currentTimeMillis()
        if (body.has("apps")) prefs.lastAppsHash = hash
        if (traffic != null) DeviceInfo.commitTraffic(prefs, traffic)
        if (location != null) prefs.lastLocation = location.toString()
        if (locate) prefs.pendingLocate = false
        // Server received the acks; clear them.
        while (pendingAcks.length() > 0) pendingAcks.remove(0)

        val policy = res.optJSONObject("policy")
        if (policy != null) applyPolicy(prefs, policy)
        val cmds = res.optJSONArray("commands")
        if (cmds != null) for (i in 0 until cmds.length()) handleCommand(prefs, cmds.getJSONObject(i))
        if (policy != null) maintainApps(prefs, policy.optJSONArray("installApps"))
    }

    /**
     * REST RPC first (cheap, no function invocation); on 401/403/404, 5xx or any transport failure the function
     * API at `serverUrl`. A 401 from that path means the phone was removed from the dashboard.
     */
    private fun send(prefs: Prefs, body: JSONObject): JSONObject {
        if (prefs.hasRest) {
            try {
                body.put("token", prefs.deviceToken)
                return Api.rpc(prefs.restUrl, "kiosk_heartbeat", body, prefs.restKey)
            } catch (t: Throwable) {
                if (!Api.shouldFallBack(t)) throw t
                Log.w(TAG, "REST check-in failed (${t.message}); falling back to serverUrl")
            } finally {
                body.remove("token")
            }
        }
        return try {
            Api.post(prefs.serverUrl, "/api/device/heartbeat", body, prefs.deviceToken)
        } catch (e: Api.ApiException) {
            if (e.code == 401) {
                // Removed from the dashboard: forget the token so we can re-enroll if still configured.
                prefs.deviceToken = ""
            }
            throw e
        }
    }

    private fun applyPolicy(prefs: Prefs, p: JSONObject) {
        val version = p.optInt("version", 0)
        prefs.deviceName = p.str("name", prefs.deviceName)
        prefs.driverName = p.str("driverName").trim()
        prefs.vehicle = p.str("vehicle").trim()
        prefs.message = p.str("message")
        prefs.pinSalt = p.str("pinSalt", prefs.pinSalt)
        prefs.pinHash = p.str("pinHash", prefs.pinHash)
        prefs.disableDebugging = p.optBoolean("disableDebugging", true)
        prefs.intervalSec = p.optInt("intervalSec", 600)
        prefs.pushIntervalSec = p.optInt("pushIntervalSec", 1800)
        prefs.driverWifi = p.optBoolean("driverWifi", true)
        prefs.dispatchPhone = p.str("dispatchPhone").trim()
        prefs.reportLocation = p.optBoolean("reportLocation", false)
        prefs.dataBudgetMb = p.optInt("dataBudgetMb", 0)
        prefs.updateInfo = p.optJSONObject("update")?.toString() ?: ""

        // Addresses: `rest` is stored when present and cleared when absent; `serverUrl` migrates phones from the
        // old Netlify address to the Supabase function.
        storeRest(prefs, p.optJSONObject("rest"))
        val newServer = p.str("serverUrl").trim().trimEnd('/')
        if (newServer.startsWith("https://") && newServer != prefs.serverUrl) {
            Log.i(TAG, "server address changed to $newServer")
            prefs.serverUrl = newServer
        }

        val pushCfg = p.optJSONObject("push")
        if (pushCfg != null && pushCfg.str("channel").isNotEmpty()) {
            push.configure(pushCfg.str("url"), pushCfg.str("key"), pushCfg.str("channel"))
        } else push.stop()
        val apps = p.optJSONArray("allowedApps")
        if (apps != null) {
            prefs.allowedApps = (0 until apps.length()).map {
                val o = apps.getJSONObject(it)
                o.getString("pkg") to o.str("label", o.getString("pkg"))
            }
        }
        val lost = p.optJSONObject("lostMode")
        if (lost != null) {
            if (lost.optBoolean("on", false)) enterLostMode(lost.str("message"), lost.str("phone"))
            else if (prefs.lostMode) leaveLostMode()
        }
        if (version != lastPolicyVersion) {
            lastPolicyVersion = version
            Policy.apply(this)
        }
        sendBroadcast(Intent(Policy.ACTION_STATE_CHANGED).setPackage(packageName))
    }

    private fun handleCommand(prefs: Prefs, c: JSONObject) {
        val id = c.getString("id")
        val payload = c.optJSONObject("payload") ?: JSONObject()
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
                "update" -> selfUpdate(payload.getString("url"), payload.getString("sha256"))
                "install" -> installApp(payload.str("pkg"), payload.str("url"), payload.str("sha256"))
                "lost" -> enterLostMode(payload.str("message"), payload.str("phone"))
                "found" -> leaveLostMode()
                "ring" -> ring(payload.optInt("seconds", 30))
                "locate" -> {
                    // Acked now; the fresh fix travels with the next heartbeat, which the wake-up makes immediate.
                    prefs.pendingLocate = true
                    ack(id, "done", "")
                    wakeSignal.release()
                    return
                }
                "wipe" -> {
                    // No ack is possible: the server marks it done when sent.
                    Policy.dpm(this).wipeData(0)
                    return
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

    // ---------- managed apps ----------

    /** Downloads, verifies and silently installs [pkg]. Throws with a short reason on any failure. */
    private fun installApp(pkg: String, url: String, sha256: String) {
        if (pkg.isBlank() || !url.startsWith("https://") || sha256.isBlank()) throw IllegalArgumentException("bad install payload")
        val file = File(cacheDir, "install-" + pkg.replace(Regex("[^A-Za-z0-9._-]"), "_") + ".apk")
        try {
            val actual = Api.download(url, file)
            if (!actual.equals(sha256, ignoreCase = true)) throw IllegalStateException("checksum mismatch")
            val info = packageManager.getPackageArchiveInfo(file.path, 0)
                ?: throw IllegalStateException("invalid apk")
            if (info.packageName != pkg) throw IllegalStateException("wrong package (${info.packageName})")
            Installer.install(this, file, pkg)
            Log.i(TAG, "install committed: $pkg")
        } finally {
            // The session holds its own copy once commit() returned.
            runCatching { file.delete() }
        }
    }

    /**
     * `policy.installApps`: installs the first entry that is missing or older than asked, if its last attempt was
     * more than an hour ago. One install per check-in; a failure is reported as `status.lastError`.
     */
    private fun maintainApps(prefs: Prefs, list: JSONArray?) {
        if (list == null || list.length() == 0) return
        val attempts = prefs.installAttempts
        val now = System.currentTimeMillis()
        for (i in 0 until list.length()) {
            val e = list.optJSONObject(i) ?: continue
            val pkg = e.str("pkg").trim()
            if (pkg.isEmpty() || pkg == packageName) continue
            val wanted = e.optLong("versionCode", 0L)
            val installed = DeviceInfo.installedVersionCode(this, pkg)
            if (installed >= 0 && installed >= wanted) continue
            val last = attempts.optLong(pkg, 0L)
            if (last in 1..now && now - last < INSTALL_RETRY_MS) continue
            attempts.put(pkg, now)
            prefs.installAttempts = attempts
            try {
                installApp(pkg, e.str("url"), e.str("sha256"))
            } catch (t: Throwable) {
                Log.w(TAG, "install $pkg failed: ${t.message}")
                tickError = "install $pkg: ${t.message ?: t.javaClass.simpleName}".take(200)
            }
            return
        }
    }

    // ---------- lost mode / ring ----------

    private fun enterLostMode(message: String, phone: String) {
        val prefs = Prefs(this)
        val wasLost = prefs.lostMode
        prefs.lostMessage = message
        prefs.lostPhone = phone.trim()
        prefs.lostMode = true
        sendBroadcast(Intent(Policy.ACTION_STATE_CHANGED).setPackage(packageName))
        if (!wasLost) {
            prefs.pendingLocate = true      // the next check-in carries a fresh fix
            ring(60)
        }
    }

    private fun leaveLostMode() {
        val prefs = Prefs(this)
        prefs.lostMode = false
        prefs.lostMessage = ""
        prefs.lostPhone = ""
        main.post { stopRinging() }
        sendBroadcast(Intent(Policy.ACTION_STATE_CHANGED).setPackage(packageName))
    }

    /** Alarm sound at full volume for [seconds], screen on, kiosk screen brought to the front. Any thread. */
    @Suppress("DEPRECATION")
    private fun ring(seconds: Int) {
        val secs = seconds.coerceIn(1, 600)
        ringingUntil = SystemClock.elapsedRealtime() + secs * 1000L
        main.post {
            stopRinging()
            ringingUntil = SystemClock.elapsedRealtime() + secs * 1000L
            runCatching {
                val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
                val wl = pm.newWakeLock(
                    PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP or PowerManager.ON_AFTER_RELEASE,
                    "kiosk:ring"
                )
                wl.acquire(secs * 1000L + 2000L)
                ringLock = wl
            }
            runCatching {
                val audio = getSystemService(AudioManager::class.java)
                audio.setStreamVolume(AudioManager.STREAM_ALARM, audio.getStreamMaxVolume(AudioManager.STREAM_ALARM), 0)
            }
            runCatching {
                val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
                    ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
                    ?: Settings.System.DEFAULT_ALARM_ALERT_URI
                val mp = MediaPlayer()
                mp.setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                )
                mp.setDataSource(this, uri)
                mp.isLooping = true
                mp.prepare()
                mp.start()
                ringer = mp
            }.onFailure { Log.w(TAG, "ring failed: ${it.message}") }
            val stop = Runnable { stopRinging() }
            ringStop = stop
            main.postDelayed(stop, secs * 1000L)
        }
        runCatching {
            startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
        sendBroadcast(Intent(Policy.ACTION_STATE_CHANGED).setPackage(packageName))
    }

    /** Main thread only. */
    private fun stopRinging() {
        ringStop?.let { main.removeCallbacks(it) }
        ringStop = null
        ringer?.let { mp -> runCatching { mp.stop() }; runCatching { mp.release() } }
        ringer = null
        ringLock?.let { wl -> runCatching { if (wl.isHeld) wl.release() } }
        ringLock = null
        ringingUntil = 0L
        sendBroadcast(Intent(Policy.ACTION_STATE_CHANGED).setPackage(packageName))
    }

    companion object {
        private const val TAG = "KioskAgent"
        private const val CHANNEL = "agent"
        private const val RETRY_MS = 15_000L
        private const val INSTALL_RETRY_MS = 60 * 60_000L
        private const val UPDATE_RETRY_MS = 10 * 60_000L
        @Volatile private var instance: AgentService? = null

        /** elapsedRealtime until which the alarm sound plays (0 = silent). The kiosk screen keeps the screen on meanwhile. */
        @Volatile var ringingUntil = 0L
        val ringing: Boolean get() = SystemClock.elapsedRealtime() < ringingUntil

        /** Wakes the agent thread so it retries enrolment / check-in immediately. */
        fun retryNow(ctx: Context) {
            start(ctx)
            instance?.wakeSignal?.release()
        }

        /** "Update now" from Settings: forgets the retry pause and checks in at once. */
        fun updateNow(ctx: Context) {
            Prefs(ctx).lastUpdateAttempt = 0L
            retryNow(ctx)
        }

        /** Silences a `ring` / lost-mode alarm (admin "leave lost mode"). */
        fun stopRing() {
            instance?.let { s -> s.main.post { s.stopRinging() } }
        }

        fun start(ctx: Context) {
            ctx.startForegroundService(Intent(ctx, AgentService::class.java))
        }
    }
}
