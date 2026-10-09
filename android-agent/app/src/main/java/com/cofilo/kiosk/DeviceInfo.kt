package com.cofilo.kiosk

import android.Manifest
import android.annotation.SuppressLint
import android.app.AppOpsManager
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.TrafficStats
import android.os.BatteryManager
import android.os.Build
import android.os.CancellationSignal
import android.os.Environment
import android.os.Process
import android.os.StatFs
import android.os.SystemClock
import android.provider.Settings
import android.telephony.TelephonyManager
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executor
import java.util.concurrent.TimeUnit

/**
 * Collects the telemetry reported to the dashboard.
 * 1.4.0: SIM/IMEI/signal, data usage deltas (TrafficStats), today's foreground minutes per allowed app
 * (UsageStats, only when usage access was granted) and an optional location.
 */
object DeviceInfo {

    @SuppressLint("HardwareIds")
    fun androidId(ctx: Context): String =
        Settings.Secure.getString(ctx.contentResolver, Settings.Secure.ANDROID_ID) ?: ""

    @SuppressLint("HardwareIds", "MissingPermission")
    fun serial(ctx: Context): String = try {
        // Allowed for the device owner; throws SecurityException otherwise.
        Build.getSerial()
    } catch (_: Throwable) {
        androidId(ctx)
    }

    private fun telephony(ctx: Context): TelephonyManager? =
        ctx.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager

    /** Device owner may read these; anything else (no SIM, no permission, OEM quirks) gives "". */
    @SuppressLint("HardwareIds", "MissingPermission")
    fun imei(ctx: Context): String = runCatching { telephony(ctx)?.imei ?: "" }.getOrDefault("")

    @SuppressLint("HardwareIds", "MissingPermission")
    fun simSerial(ctx: Context): String = runCatching { telephony(ctx)?.simSerialNumber ?: "" }.getOrDefault("")

    fun simOperator(ctx: Context): String = runCatching { telephony(ctx)?.simOperatorName ?: "" }.getOrDefault("")

    @SuppressLint("HardwareIds", "MissingPermission")
    @Suppress("DEPRECATION")
    fun phoneNumber(ctx: Context): String {
        val allowed = ctx.checkSelfPermission(Manifest.permission.READ_PHONE_NUMBERS) == PackageManager.PERMISSION_GRANTED ||
            ctx.checkSelfPermission(Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED
        if (!allowed) return ""
        return runCatching { telephony(ctx)?.line1Number ?: "" }.getOrDefault("")
    }

    /** 0..4 (API 28+), -1 when unknown. */
    fun signalLevel(ctx: Context): Int = runCatching {
        if (Build.VERSION.SDK_INT >= 28) telephony(ctx)?.signalStrength?.level ?: -1 else -1
    }.getOrDefault(-1)

    fun securityPatch(): String = runCatching { Build.VERSION.SECURITY_PATCH ?: "" }.getOrDefault("")

    fun identity(ctx: Context): JSONObject = JSONObject()
        .put("androidId", androidId(ctx))
        .put("serial", serial(ctx))
        .put("model", "${Build.MANUFACTURER} ${Build.MODEL}")
        .put("osVersion", "Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})")
        .put("securityPatch", securityPatch())
        .put("imei", imei(ctx))
        .put("simSerial", simSerial(ctx))

    /** Battery percent (-1 when unknown) and whether the phone is plugged in. Cheap: reads the sticky broadcast. */
    fun battery(ctx: Context): Pair<Int, Boolean> {
        val bat = ctx.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val level = bat?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = bat?.getIntExtra(BatteryManager.EXTRA_SCALE, 100) ?: 100
        val plugged = (bat?.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) ?: 0) != 0
        val pct = if (level >= 0 && scale > 0) level * 100 / scale else -1
        return pct to plugged
    }

    fun status(ctx: Context): JSONObject {
        val (pct, plugged) = battery(ctx)
        val stat = StatFs(Environment.getDataDirectory().path)
        val pkgInfo = ctx.packageManager.getPackageInfo(ctx.packageName, 0)
        val dpm = ctx.getSystemService(Context.DEVICE_POLICY_SERVICE) as android.app.admin.DevicePolicyManager
        val prefs = Prefs(ctx)
        return JSONObject()
            .put("battery", pct)
            .put("charging", plugged)
            .put("network", networkType(ctx))
            .put("freeStorageMb", stat.availableBytes / (1024 * 1024))
            .put("model", (android.os.Build.MANUFACTURER + " " + android.os.Build.MODEL).trim())
            .put("osVersion", android.os.Build.VERSION.RELEASE ?: "")
            .put("agentVersion", pkgInfo.versionName)
            .put("agentVersionCode", pkgInfo.longVersionCode)
            .put("deviceOwner", dpm.isDeviceOwnerApp(ctx.packageName))
            .put("released", prefs.released)
            .put("lastCrash", prefs.lastCrash)
            .put("lastError", prefs.lastError)
            .put("pushConnected", PushClient.connected)
            .put("uptimeMin", SystemClock.elapsedRealtime() / 60000)
            .put("securityPatch", securityPatch())
            .put("simSerial", simSerial(ctx))
            .put("simOperator", simOperator(ctx))
            .put("phoneNumber", phoneNumber(ctx))
            .put("signal", signalLevel(ctx))
            .put("usageAccess", hasUsageAccess(ctx))
            .put("autoBlocker", runCatching { Policy.autoBlockerStatus(ctx) }.getOrDefault(""))
            .put("batteryExempt", runCatching { (ctx.getSystemService(Context.POWER_SERVICE) as android.os.PowerManager).isIgnoringBatteryOptimizations(ctx.packageName) }.getOrDefault(false))
            .put("lostMode", prefs.lostMode)
            .put("lang", prefs.lang.ifEmpty { Locale.getDefault().language })
    }

    /** "wifi" / "cellular" / "ethernet" / "none" / "other". */
    fun networkType(ctx: Context): String {
        val cm = ctx.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return "none"
        return when {
            caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "cellular"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "ethernet"
            else -> "other"
        }
    }

    /** All launchable apps on the device (so the dashboard can offer them in the picker), with their versionCode. */
    fun installedApps(ctx: Context): JSONArray {
        val pm = ctx.packageManager
        val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        val arr = JSONArray()
        val sysMask = ApplicationInfo.FLAG_SYSTEM or ApplicationInfo.FLAG_UPDATED_SYSTEM_APP
        pm.queryIntentActivities(intent, PackageManager.MATCH_ALL)
            .map { Triple(it.activityInfo.packageName, it.loadLabel(pm).toString(), (it.activityInfo.applicationInfo.flags and sysMask) != 0) }
            .distinctBy { it.first }
            .filter { it.first != ctx.packageName }
            .sortedBy { it.second.lowercase() }
            .forEach {
                arr.put(JSONObject().put("pkg", it.first).put("label", it.second).put("system", it.third)
                    .put("versionCode", installedVersionCode(ctx, it.first)))
            }
        return arr
    }

    /** Installed versionCode of [pkg], or -1 when it is not installed. */
    fun installedVersionCode(ctx: Context, pkg: String): Long =
        runCatching { ctx.packageManager.getPackageInfo(pkg, 0).longVersionCode }.getOrDefault(-1L)

    // ---------- data usage ----------

    private fun monthKey(): String = SimpleDateFormat("yyyy-MM", Locale.US).format(Date())

    /** One TrafficStats reading: the deltas to report and the raw counters to store once the report was accepted. */
    class TrafficSample(val mobileDelta: Long, val wifiDelta: Long, val mobileNow: Long, val totalNow: Long, val elapsed: Long) {
        fun toJson(): JSONObject = JSONObject().put("mobileBytes", mobileDelta).put("wifiBytes", wifiDelta)
    }

    /**
     * Bytes used since the previous heartbeat, from the TrafficStats counters. Returns null when the counters are
     * unsupported on this device. After a reboot (counters smaller than the stored sample, or elapsedRealtime went
     * backwards) the baseline is 0. Call [commitTraffic] after the heartbeat was accepted.
     */
    fun sampleTraffic(prefs: Prefs): TrafficSample? {
        val unsupported = TrafficStats.UNSUPPORTED.toLong()
        fun sum(rx: Long, tx: Long): Long = if (rx == unsupported || tx == unsupported || rx < 0 || tx < 0) -1L else rx + tx
        val mobile = runCatching { sum(TrafficStats.getMobileRxBytes(), TrafficStats.getMobileTxBytes()) }.getOrDefault(-1L)
        val total = runCatching { sum(TrafficStats.getTotalRxBytes(), TrafficStats.getTotalTxBytes()) }.getOrDefault(-1L)
        val now = SystemClock.elapsedRealtime()
        val mobileOk = mobile >= 0
        val totalOk = total >= 0
        if (!mobileOk && !totalOk) return null

        val rebooted = prefs.lastTrafficElapsed < 0 || prefs.lastTrafficElapsed > now
        fun delta(cur: Long, last: Long): Long = when {
            cur < 0 -> 0L
            rebooted || last < 0 || cur < last -> cur
            else -> cur - last
        }
        val mobileDelta = if (mobileOk) delta(mobile, prefs.lastTrafficMobile) else 0L
        val totalDelta = if (totalOk) delta(total, prefs.lastTrafficTotal) else mobileDelta
        val wifiDelta = (totalDelta - mobileDelta).coerceAtLeast(0L)
        return TrafficSample(mobileDelta, wifiDelta, if (mobileOk) mobile else -1L, if (totalOk) total else -1L, now)
    }

    /** Stores the sample as the new baseline and adds its cellular delta to the month-to-date counter. */
    fun commitTraffic(prefs: Prefs, s: TrafficSample) {
        prefs.lastTrafficMobile = s.mobileNow
        prefs.lastTrafficTotal = s.totalNow
        prefs.lastTrafficElapsed = s.elapsed
        val key = monthKey()
        if (prefs.monthKey != key) { prefs.monthKey = key; prefs.monthMobileBytes = 0L }
        prefs.monthMobileBytes = prefs.monthMobileBytes + s.mobileDelta
    }

    /** Month-to-date cellular bytes (resets the counter if the month changed since the last sample). */
    fun monthMobileBytes(prefs: Prefs): Long = if (prefs.monthKey == monthKey()) prefs.monthMobileBytes else 0L

    // ---------- app usage ----------

    @Suppress("DEPRECATION")
    fun hasUsageAccess(ctx: Context): Boolean = runCatching {
        val ops = ctx.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        val mode = if (Build.VERSION.SDK_INT >= 29)
            ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), ctx.packageName)
        else ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), ctx.packageName)
        mode == AppOpsManager.MODE_ALLOWED
    }.getOrDefault(false)

    /** Today's foreground minutes per allowed package, or null when usage access is missing / nothing measured. */
    fun appUsage(ctx: Context, prefs: Prefs): JSONObject? {
        if (!hasUsageAccess(ctx)) return null
        val allowed = prefs.allowedApps.map { it.first }.toSet()
        if (allowed.isEmpty()) return null
        return runCatching {
            val usm = ctx.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
            val start = Calendar.getInstance().apply {
                set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
            }.timeInMillis
            val now = System.currentTimeMillis()
            val totals = HashMap<String, Long>()
            usm.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, start, now)?.forEach { s ->
                if (s.packageName in allowed) totals[s.packageName] = (totals[s.packageName] ?: 0L) + s.totalTimeInForeground
            }
            val out = JSONObject()
            totals.forEach { (pkg, ms) -> out.put(pkg, ms / 60_000) }
            if (out.length() == 0) null else out
        }.getOrNull()
    }

    // ---------- location ----------

    private fun hasLocationPermission(ctx: Context): Boolean =
        ctx.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            ctx.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

    private fun toJson(l: Location): JSONObject = JSONObject()
        .put("lat", l.latitude)
        .put("lon", l.longitude)
        .put("accuracy", if (l.hasAccuracy()) l.accuracy.toInt() else -1)
        .put("at", l.time)

    /** Best last-known fix (GPS first, then network), or null. */
    @SuppressLint("MissingPermission")
    fun lastKnownLocation(ctx: Context): JSONObject? {
        if (!hasLocationPermission(ctx)) return null
        val lm = ctx.getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return null
        for (provider in listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)) {
            val l = runCatching { lm.getLastKnownLocation(provider) }.getOrNull() ?: continue
            return toJson(l)
        }
        return null
    }

    /**
     * Tries for a fresh fix (API 30+ `getCurrentLocation`, up to [timeoutMs]) and falls back to the last known one.
     * Blocking: call from the agent thread only.
     */
    @SuppressLint("MissingPermission")
    fun freshLocation(ctx: Context, timeoutMs: Long = 6_000): JSONObject? {
        if (!hasLocationPermission(ctx)) return null
        if (Build.VERSION.SDK_INT >= 30) {
            val lm = ctx.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
            if (lm != null) {
                // Every provider is asked at the same time and the first answer wins: the fused/network fix comes
                // back in a second or two (indoors too), GPS only when the sky is visible. Asking one after the other
                // used to cost a full GPS timeout before the network fix was even tried.
                val providers = buildList {
                    if (Build.VERSION.SDK_INT >= 31) add(LocationManager.FUSED_PROVIDER)
                    add(LocationManager.GPS_PROVIDER); add(LocationManager.NETWORK_PROVIDER)
                }.filter { runCatching { lm.isProviderEnabled(it) }.getOrDefault(false) }
                val latch = CountDownLatch(1)
                val result = java.util.concurrent.atomic.AtomicReference<Location?>(null)
                val cancels = providers.map { provider ->
                    val cancel = CancellationSignal()
                    runCatching {
                        lm.getCurrentLocation(provider, cancel, Executor { it.run() }, java.util.function.Consumer<Location?> { loc ->
                            if (loc != null && result.compareAndSet(null, loc)) latch.countDown()
                        })
                    }
                    cancel
                }
                if (providers.isNotEmpty()) latch.await(timeoutMs, TimeUnit.MILLISECONDS)
                cancels.forEach { runCatching { it.cancel() } }
                result.get()?.let { return toJson(it) }
            }
        }
        return lastKnownLocation(ctx)
    }
}
