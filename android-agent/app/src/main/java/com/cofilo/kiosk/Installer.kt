package com.cofilo.kiosk

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.widget.Toast
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
            else -> {
                prefs.lastError = "install $pkg failed ($status): ${msg ?: ""}".take(200)
                if (refusedBySecurityCheck(status, msg)) retryAfterRestart(context, prefs, pkg ?: "")
            }
        }
    }

    /** Samsung Auto Blocker answers INSTALL_FAILED_VERIFICATION_FAILURE "Install not allowed"; a plain policy block is STATUS_FAILURE_BLOCKED. */
    private fun refusedBySecurityCheck(status: Int, msg: String?): Boolean =
        status == PackageInstaller.STATUS_FAILURE_BLOCKED || (msg ?: "").let { it.contains("VERIFICATION", true) || it.contains("not allowed", true) }

    /**
     * The phone's security check refused the install. Observed on a Galaxy A17: after its switches are turned off the
     * check keeps refusing until the phone restarts, and the same update then installs at once. So: switch Auto
     * Blocker off, restart the phone (device owner), and let the agent retry right after boot. At most one restart
     * every six hours, so a refusal that survives a restart is reported instead of looping.
     */
    private fun retryAfterRestart(ctx: Context, prefs: Prefs, pkg: String) {
        if (!Policy.isOwner(ctx)) return
        if (System.currentTimeMillis() - prefs.lastInstallReboot < REBOOT_EVERY_MS) return
        // Never restart a phone in the middle of a call; the next check-in retries.
        val tm = ctx.getSystemService(Context.TELEPHONY_SERVICE) as? android.telephony.TelephonyManager
        if (runCatching { tm?.callState != android.telephony.TelephonyManager.CALL_STATE_IDLE }.getOrDefault(false)) return
        Policy.disableAutoBlocker(ctx)
        prefs.lastInstallReboot = System.currentTimeMillis()
        prefs.lastUpdateAttempt = 0L // retry the self-update at the first check-in after boot
        prefs.lastError = "install $pkg refused by the phone's security check: restarting the phone to retry"
        runCatching { Toast.makeText(ctx, Ui.tr("Installing the update: the phone restarts in a few seconds.", "Installation de la mise à jour : le téléphone redémarre dans quelques secondes."), Toast.LENGTH_LONG).show() }
        Handler(Looper.getMainLooper()).postDelayed({
            runCatching { Policy.dpm(ctx).reboot(Policy.admin(ctx)) }
                .onFailure { Log.w("KioskInstaller", "reboot refused: ${it.message}") }
        }, 4_000L)
    }

    private companion object { const val REBOOT_EVERY_MS = 6 * 60 * 60_000L }
}
