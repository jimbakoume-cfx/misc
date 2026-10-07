package com.cofilo.kiosk

import android.app.admin.DeviceAdminReceiver
import android.app.admin.DevicePolicyManager
import android.content.Context
import android.content.Intent
import android.os.Bundle

class AdminReceiver : DeviceAdminReceiver() {
    override fun onEnabled(context: Context, intent: Intent) {
        Beacon.send(context, "admin-enabled", "owner=${Policy.isOwner(context)}")
    }

    override fun onProfileProvisioningComplete(context: Context, intent: Intent) {
        Beacon.send(context, "provisioning-complete", "owner=${Policy.isOwner(context)}")
        @Suppress("DEPRECATION")
        val extras = intent.getParcelableExtra<Bundle>(DevicePolicyManager.EXTRA_PROVISIONING_ADMIN_EXTRAS_BUNDLE)
        Provision.consume(context, extras)
        AgentService.start(context)
        context.startActivity(
            Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
    }
}

/** Reads the server URL / enrollment token that the QR code carries. */
object Provision {
    fun consume(ctx: Context, extras: Bundle?) {
        extras ?: return
        val p = Prefs(ctx)
        extras.getString("server_url")?.takeIf { it.isNotBlank() }?.let { p.serverUrl = it }
        extras.getString("enroll_token")?.takeIf { it.isNotBlank() }?.let { p.enrollToken = it }
    }
}
