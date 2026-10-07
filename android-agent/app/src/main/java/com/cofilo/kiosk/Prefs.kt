package com.cofilo.kiosk

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/** Plain SharedPreferences store (device-protected so it is readable right after boot). */
class Prefs(context: Context) {
    private val sp = context.createDeviceProtectedStorageContext()
        .getSharedPreferences("kiosk", Context.MODE_PRIVATE)

    var serverUrl: String
        get() = sp.getString("serverUrl", "") ?: ""
        set(v) = sp.edit().putString("serverUrl", v.trimEnd('/')).apply()

    var enrollToken: String
        get() = sp.getString("enrollToken", "") ?: ""
        set(v) = sp.edit().putString("enrollToken", v).apply()

    var deviceToken: String
        get() = sp.getString("deviceToken", "") ?: ""
        set(v) = sp.edit().putString("deviceToken", v).apply()

    var deviceName: String
        get() = sp.getString("deviceName", "") ?: ""
        set(v) = sp.edit().putString("deviceName", v).apply()

    var message: String
        get() = sp.getString("message", "") ?: ""
        set(v) = sp.edit().putString("message", v).apply()

    var pinSalt: String
        get() = sp.getString("pinSalt", "") ?: ""
        set(v) = sp.edit().putString("pinSalt", v).apply()

    var pinHash: String
        get() = sp.getString("pinHash", "") ?: ""
        set(v) = sp.edit().putString("pinHash", v).apply()

    /** When true the admin released the device: do not re-apply lockdown. */
    var released: Boolean
        get() = sp.getBoolean("released", false)
        set(v) = sp.edit().putBoolean("released", v).apply()

    var disableDebugging: Boolean
        get() = sp.getBoolean("disableDebugging", true)
        set(v) = sp.edit().putBoolean("disableDebugging", v).apply()

    /** Last enrolment/check-in problem, shown on screen to help diagnose connection issues. */
    var lastError: String
        get() = sp.getString("lastError", "") ?: ""
        set(v) = sp.edit().putString("lastError", v).apply()

    /** Seconds between check-ins; the server can change it through the policy. */
    var intervalSec: Int
        get() = sp.getInt("intervalSec", 300)
        set(v) = sp.edit().putInt("intervalSec", v.coerceIn(60, 3600)).apply()

    var lastAppsHash: Int
        get() = sp.getInt("lastAppsHash", 0)
        set(v) = sp.edit().putInt("lastAppsHash", v).apply()

    /** Allowed apps as a list of (package, label). */
    var allowedApps: List<Pair<String, String>>
        get() {
            val raw = sp.getString("allowedApps", "[]") ?: "[]"
            val arr = JSONArray(raw)
            return (0 until arr.length()).map {
                val o = arr.getJSONObject(it)
                o.getString("pkg") to o.optString("label", o.getString("pkg"))
            }
        }
        set(v) {
            val arr = JSONArray()
            v.forEach { arr.put(JSONObject().put("pkg", it.first).put("label", it.second)) }
            sp.edit().putString("allowedApps", arr.toString()).apply()
        }

    val enrolled: Boolean get() = deviceToken.isNotEmpty()
    val hasEnrollConfig: Boolean get() = serverUrl.isNotEmpty() && enrollToken.isNotEmpty()
}
