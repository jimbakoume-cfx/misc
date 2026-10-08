package com.cofilo.kiosk

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.util.Log
import java.io.File

/**
 * Silent install (works because the agent is the device owner): the self-update and, since 1.4.0, the managed
 * apps from `policy.installApps` / the `install` command. [pkg] is the package the APK must carry.
 */
object Installer {
    fun install(ctx: Context, apk: File, pkg: String = ctx.packageName) {
        val pi = ctx.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
        params.setAppPackageName(pkg)
        val id = pi.createSession(params)
        pi.openSession(id).use { session ->
            apk.inputStream().use { input ->
                session.openWrite("agent.apk", 0, apk.length()).use { out ->
                    input.copyTo(out)
                    session.fsync(out)
                }
            }
            val intent = Intent(ctx, InstallResultReceiver::class.java).putExtra("pkg", pkg)
            val pending = PendingIntent.getBroadcast(
                ctx, id, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
            )
            session.commit(pending.intentSender)
        }
    }
}

class InstallResultReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, -1)
        val msg = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)
        Log.i("KioskInstaller", "install ${intent.getStringExtra("pkg")} status=$status msg=$msg")
        if (status != PackageInstaller.STATUS_SUCCESS && status != PackageInstaller.STATUS_PENDING_USER_ACTION) {
            // Surfaces in the next heartbeat as status.lastError (the commit itself cannot fail synchronously).
            runCatching { Prefs(context).lastError = "install ${intent.getStringExtra("pkg")}: $status ${msg ?: ""}".take(200) }
        }
    }
}
