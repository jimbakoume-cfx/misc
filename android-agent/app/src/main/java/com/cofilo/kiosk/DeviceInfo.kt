package com.cofilo.kiosk

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.BatteryManager
import android.os.Build
import android.os.Environment
import android.os.StatFs
import android.provider.Settings
import org.json.JSONArray
import org.json.JSONObject

/** Collects the telemetry reported to the dashboard. */
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

    fun identity(ctx: Context): JSONObject = JSONObject()
        .put("androidId", androidId(ctx))
        .put("serial", serial(ctx))
        .put("model", "${Build.MANUFACTURER} ${Build.MODEL}")
        .put("osVersion", "Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})")

    fun status(ctx: Context): JSONObject {
        val bat = ctx.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val level = bat?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = bat?.getIntExtra(BatteryManager.EXTRA_SCALE, 100) ?: 100
        val plugged = (bat?.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) ?: 0) != 0
        val pct = if (level >= 0 && scale > 0) level * 100 / scale else -1
        val stat = StatFs(Environment.getDataDirectory().path)
        val pkgInfo = ctx.packageManager.getPackageInfo(ctx.packageName, 0)
        val dpm = ctx.getSystemService(Context.DEVICE_POLICY_SERVICE) as android.app.admin.DevicePolicyManager
        return JSONObject()
            .put("battery", pct)
            .put("charging", plugged)
            .put("network", networkType(ctx))
            .put("freeStorageMb", stat.availableBytes / (1024 * 1024))
            .put("agentVersion", pkgInfo.versionName)
            .put("agentVersionCode", pkgInfo.longVersionCode)
            .put("deviceOwner", dpm.isDeviceOwnerApp(ctx.packageName))
            .put("released", Prefs(ctx).released)
            .put("uptimeMin", android.os.SystemClock.elapsedRealtime() / 60000)
    }

    private fun networkType(ctx: Context): String {
        val cm = ctx.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return "none"
        return when {
            caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "cellular"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "ethernet"
            else -> "other"
        }
    }

    /** All launchable apps on the device (so the dashboard can offer them in the picker). */
    fun installedApps(ctx: Context): JSONArray {
        val pm = ctx.packageManager
        val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        val arr = JSONArray()
        pm.queryIntentActivities(intent, PackageManager.MATCH_ALL)
            .map { it.activityInfo.packageName to it.loadLabel(pm).toString() }
            .distinctBy { it.first }
            .filter { it.first != ctx.packageName }
            .sortedBy { it.second.lowercase() }
            .forEach { arr.put(JSONObject().put("pkg", it.first).put("label", it.second)) }
        return arr
    }
}
