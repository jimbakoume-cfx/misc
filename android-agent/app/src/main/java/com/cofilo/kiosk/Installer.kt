package com.cofilo.kiosk

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.content.pm.PackageManager
import android.os.Build
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
        // A device owner may install without asking the user; without this Android 12+ answers "pending user action"
        // for the app's own update and nothing happens.
        if (Build.VERSION.SDK_INT >= 31) params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
        runCatching { params.setInstallReason(PackageManager.INSTALL_REASON_POLICY) }
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
        val pkg = intent.getStringExtra("pkg")
        Log.i("KioskInstaller", "install $pkg status=$status msg=$msg")
        val prefs = Prefs(context)
        when (status) {
            PackageInstaller.STATUS_SUCCESS -> if (prefs.lastError.startsWith("install ")) prefs.lastError = ""
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                // Android wants the user to confirm: show its dialog instead of dropping the install silently.
                @Suppress("DEPRECATION") val confirm = intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT)
                runCatching { context.startActivity(confirm?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
                prefs.lastError = "install $pkg: waiting for confirmation on the phone"
            }
            // Surfaces in the next heartbeat as status.lastError (the commit itself cannot fail synchronously).
            else -> prefs.lastError = "install $pkg failed ($status): ${msg ?: ""}".take(200)
        }
    }
}
