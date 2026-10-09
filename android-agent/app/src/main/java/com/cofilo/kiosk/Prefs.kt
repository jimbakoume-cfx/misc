package com.cofilo.kiosk

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Plain SharedPreferences store (device-protected so it is readable right after boot).
 * 1.4.0 adds the REST check-in address, driver/vehicle identity, lost mode, the language override,
 * data-usage counters and the managed-app install bookkeeping.
 */
class Prefs(context: Context) {
    private val sp = context.createDeviceProtectedStorageContext()
        .getSharedPreferences("kiosk", Context.MODE_PRIVATE)

    private fun str(key: String, def: String = "") = sp.getString(key, def) ?: def
    private fun put(key: String, v: String) = sp.edit().putString(key, v).apply()
    private fun put(key: String, v: Boolean) = sp.edit().putBoolean(key, v).apply()
    private fun put(key: String, v: Long) = sp.edit().putLong(key, v).apply()
    private fun put(key: String, v: Int) = sp.edit().putInt(key, v).apply()

    var serverUrl: String
        get() = str("serverUrl")
        set(v) = put("serverUrl", v.trimEnd('/'))

    /** Supabase REST base + publishable key for the cheap check-in path (empty = use [serverUrl]). */
    var restUrl: String
        get() = str("restUrl")
        set(v) = put("restUrl", v.trimEnd('/'))

    var restKey: String
        get() = str("restKey")
        set(v) = put("restKey", v)

    val hasRest: Boolean get() = restUrl.startsWith("https://") && restKey.isNotEmpty()

    var enrollToken: String
        get() = str("enrollToken")
        set(v) = put("enrollToken", v)

    var deviceToken: String
        get() {
            val raw = str("deviceToken")
            if (raw.isNotEmpty() && !Vault.isSealed(raw)) { deviceToken = raw; return raw } // migrate a plain value
            return Vault.open(raw)
        }
        set(v) = put("deviceToken", Vault.seal(v))

    var deviceName: String
        get() = str("deviceName")
        set(v) = put("deviceName", v)

    var driverName: String
        get() = str("driverName")
        set(v) = put("driverName", v)

    var vehicle: String
        get() = str("vehicle")
        set(v) = put("vehicle", v)

    var message: String
        get() = str("message")
        set(v) = put("message", v)

    var pinSalt: String
        get() = str("pinSalt")
        set(v) = put("pinSalt", v)

    var pinHash: String
        get() = str("pinHash")
        set(v) = put("pinHash", v)

    /** When true the admin released the device: do not re-apply lockdown. */
    var released: Boolean
        get() = sp.getBoolean("released", false)
        set(v) = put("released", v)

    var disableDebugging: Boolean
        get() = sp.getBoolean("disableDebugging", true)
        set(v) = put("disableDebugging", v)

    /** Drivers may open the system Wi-Fi panel without the admin PIN. */
    var driverWifi: Boolean
        get() = sp.getBoolean("driverWifi", true)
        set(v) = put("driverWifi", v)

    /** Ops phone number offered as a "Call dispatch" action (empty = hidden). */
    var dispatchPhone: String
        get() = str("dispatchPhone")
        set(v) = put("dispatchPhone", v)

    var reportLocation: Boolean
        get() = sp.getBoolean("reportLocation", false)
        set(v) = put("reportLocation", v)

    /** Monthly cellular allowance shown to the driver (0 = not set). */
    var dataBudgetMb: Int
        get() = sp.getInt("dataBudgetMb", 0)
        set(v) = put("dataBudgetMb", v.coerceAtLeast(0))

    // ---- lost mode ----

    var lostMode: Boolean
        get() = sp.getBoolean("lostMode", false)
        set(v) = put("lostMode", v)

    var lostMessage: String
        get() = str("lostMessage")
        set(v) = put("lostMessage", v)

    var lostPhone: String
        get() = str("lostPhone")
        set(v) = put("lostPhone", v)

    /** In-app language override: "" (device), "fr" or "en". */
    var lang: String
        get() = str("lang")
        set(v) = put("lang", v)

    /** Last enrolment/check-in problem, shown on screen to help diagnose connection issues. */
    var lastError: String
        get() = str("lastError")
        set(v) = put("lastError", v)

    var lastCrash: String
        get() = str("lastCrash")
        set(v) = put("lastCrash", v)

    /** `policy.update` as sent by the server (url, sha256, versionCode, versionName), or "" when up to date. */
    var updateInfo: String
        get() = str("updateInfo")
        set(v) = put("updateInfo", v)
    var lastUpdateAttempt: Long
        get() = sp.getLong("lastUpdateAttempt", 0L)
        set(v) = put("lastUpdateAttempt", v)
    /** Wall-clock time the battery-optimisation exemption dialog was last shown (at most once a day). */
    var lastBatteryAsk: Long
        get() = sp.getLong("lastBatteryAsk", 0L)
        set(v) = put("lastBatteryAsk", v)
    /** Wall-clock time of the last restart made to get a refused install through (see [InstallResultReceiver]). */
    var lastInstallReboot: Long
        get() = sp.getLong("lastInstallReboot", 0L)
        set(v) = put("lastInstallReboot", v)

    var lastCheckIn: Long
        get() = sp.getLong("lastCheckIn", 0L)
        set(v) = put("lastCheckIn", v)

    /** Admin-PIN brute-force protection. */
    var pinFails: Int
        get() = sp.getInt("pinFails", 0)
        set(v) = put("pinFails", v)

    var pinLockUntil: Long
        get() = sp.getLong("pinLockUntil", 0L)
        set(v) = put("pinLockUntil", v)

    /** Seconds between check-ins without a live push connection; the server can change it through the policy. */
    var intervalSec: Int
        get() = sp.getInt("intervalSec", 600)
        set(v) = put("intervalSec", v.coerceIn(60, 3600))

    /** Seconds between check-ins while the push channel is connected (only a safety net then). */
    var pushIntervalSec: Int
        get() = sp.getInt("pushIntervalSec", 1800)
        set(v) = put("pushIntervalSec", v.coerceIn(60, 7200))

    var lastAppsHash: Int
        get() = sp.getInt("lastAppsHash", 0)
        set(v) = put("lastAppsHash", v)

    // ---- data usage (TrafficStats samples) ----

    var lastTrafficMobile: Long
        get() = sp.getLong("lastTrafficMobile", -1L)
        set(v) = put("lastTrafficMobile", v)

    var lastTrafficTotal: Long
        get() = sp.getLong("lastTrafficTotal", -1L)
        set(v) = put("lastTrafficTotal", v)

    /** SystemClock.elapsedRealtime() of the last sample; a smaller current value means the phone rebooted. */
    var lastTrafficElapsed: Long
        get() = sp.getLong("lastTrafficElapsed", -1L)
        set(v) = put("lastTrafficElapsed", v)

    /** "yyyy-MM" of the month [monthMobileBytes] belongs to. */
    var monthKey: String
        get() = str("monthKey")
        set(v) = put("monthKey", v)

    var monthMobileBytes: Long
        get() = sp.getLong("monthMobileBytes", 0L)
        set(v) = put("monthMobileBytes", v.coerceAtLeast(0L))

    // ---- managed app installs ----

    /** Package -> epoch ms of the last install attempt (policy.installApps is retried at most hourly). */
    var installAttempts: JSONObject
        get() = runCatching { JSONObject(str("installAttempts", "{}")) }.getOrDefault(JSONObject())
        set(v) = put("installAttempts", v.toString())

    // ---- location ----

    /** Set by the `locate` command: the next heartbeat must carry a fresh fix. */
    var pendingLocate: Boolean
        get() = sp.getBoolean("pendingLocate", false)
        set(v) = put("pendingLocate", v)

    /** Last location sent, as the JSON object of the heartbeat (`{lat, lon, accuracy, at}`), or "". */
    var lastLocation: String
        get() = str("lastLocation")
        set(v) = put("lastLocation", v)

    /** Allowed apps as a list of (package, label). */
    var allowedApps: List<Pair<String, String>>
        get() {
            val raw = str("allowedApps", "[]")
            val arr = JSONArray(raw)
            return (0 until arr.length()).map {
                val o = arr.getJSONObject(it)
                o.getString("pkg") to o.optString("label", o.getString("pkg"))
            }
        }
        set(v) {
            val arr = JSONArray()
            v.forEach { arr.put(JSONObject().put("pkg", it.first).put("label", it.second)) }
            put("allowedApps", arr.toString())
        }

    val enrolled: Boolean get() = deviceToken.isNotEmpty()
    val hasEnrollConfig: Boolean get() = serverUrl.isNotEmpty() && enrollToken.isNotEmpty()
}
