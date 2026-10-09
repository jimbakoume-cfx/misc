package com.cofilo.kiosk

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Entry point for the USB setup script: `adb shell am broadcast -n com.cofilo.kiosk/.UsbSetupReceiver --es server_url … --es enroll_token …`.
 * It only does anything while this app is the device owner and the phone is not enrolled yet, so it cannot be used to
 * re-point a phone that is already in the fleet.
 */
class UsbSetupReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val prefs = Prefs(context)
        val url = intent.getStringExtra("server_url")?.trim().orEmpty()
        val code = intent.getStringExtra("enroll_token")?.trim().orEmpty()
        val reply = when {
            !Policy.isOwner(context) -> "ignored: not the device owner"
            prefs.enrolled -> "ignored: already enrolled"
            !url.startsWith("https://") || code.isEmpty() -> "ignored: need an https server_url and an enroll_token"
            !allowedHost(url) -> "ignored: server_url host is not one of ${BuildConfig.ALLOWED_SERVER_HOSTS}"
            else -> {
                prefs.serverUrl = url
                prefs.enrollToken = code
                prefs.lastError = ""
                Beacon.send(context, "usb-setup", "owner=true")
                AgentService.start(context)
                "ok"
            }
        }
        resultData = reply
    }

    /** Only the fleet's own servers may be configured over USB (built into the app), so a stray broadcast cannot re-point a phone. */
    private fun allowedHost(url: String): Boolean {
        val allowed = BuildConfig.ALLOWED_SERVER_HOSTS.split(",").map { it.trim().lowercase() }.filter { it.isNotEmpty() }
        if (allowed.isEmpty()) return true
        val host = runCatching { android.net.Uri.parse(url).host?.lowercase() }.getOrNull() ?: return false
        return allowed.any { host == it || host.endsWith(".$it") }
    }
}
