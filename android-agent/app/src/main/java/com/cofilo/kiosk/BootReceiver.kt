package com.cofilo.kiosk

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Restarts the agent after a reboot or after the agent itself was updated. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val p = Prefs(context)
        if (p.enrolled || p.hasEnrollConfig) AgentService.start(context)
        if (intent.action == Intent.ACTION_MY_PACKAGE_REPLACED && p.enrolled) {
            Policy.apply(context)
            context.startActivity(
                Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
        }
    }
}
