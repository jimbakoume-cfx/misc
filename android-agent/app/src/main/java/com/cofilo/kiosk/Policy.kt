package com.cofilo.kiosk

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.UserManager
import android.provider.Settings
import java.security.MessageDigest

/**
 * Applies / removes the device lockdown. Everything here needs the app to be the
 * **device owner** (set during QR provisioning); without it the calls are no-ops.
 */
object Policy {
    const val ACTION_STATE_CHANGED = "com.cofilo.kiosk.STATE_CHANGED"

    private val RESTRICTIONS = listOf(
        UserManager.DISALLOW_FACTORY_RESET,
        UserManager.DISALLOW_SAFE_BOOT,
        UserManager.DISALLOW_ADD_USER,
        UserManager.DISALLOW_REMOVE_USER,
        UserManager.DISALLOW_INSTALL_UNKNOWN_SOURCES,
        UserManager.DISALLOW_UNINSTALL_APPS,
        UserManager.DISALLOW_MODIFY_ACCOUNTS,
        UserManager.DISALLOW_USB_FILE_TRANSFER,
        UserManager.DISALLOW_MOUNT_PHYSICAL_MEDIA,
        UserManager.DISALLOW_CONFIG_TETHERING,
        UserManager.DISALLOW_NETWORK_RESET,
        UserManager.DISALLOW_FUN,
        UserManager.DISALLOW_CONFIG_DATE_TIME,
    )

    fun dpm(ctx: Context): DevicePolicyManager =
        ctx.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager

    fun admin(ctx: Context) = ComponentName(ctx, AdminReceiver::class.java)

    fun isOwner(ctx: Context) = dpm(ctx).isDeviceOwnerApp(ctx.packageName)

    fun hashPin(salt: String, pin: String): String =
        MessageDigest.getInstance("SHA-256").digest((salt + pin).toByteArray())
            .joinToString("") { "%02x".format(it) }

    fun checkPin(ctx: Context, pin: String): Boolean {
        val p = Prefs(ctx)
        if (p.pinHash.isEmpty()) return false
        return hashPin(p.pinSalt, pin) == p.pinHash
    }

    /** Applies the current prefs as the kiosk lockdown. Safe to call repeatedly. */
    fun apply(ctx: Context) {
        val prefs = Prefs(ctx)
        if (!isOwner(ctx) || prefs.released || !prefs.enrolled) return
        val dpm = dpm(ctx)
        val admin = admin(ctx)

        val pkgs = (prefs.allowedApps.map { it.first } + ctx.packageName).distinct().toTypedArray()
        runCatching { dpm.setLockTaskPackages(admin, pkgs) }
        runCatching { dpm.setLockTaskFeatures(admin, DevicePolicyManager.LOCK_TASK_FEATURE_HOME) }
        runCatching { dpm.setKeyguardDisabled(admin, true) }
        runCatching { dpm.setStatusBarDisabled(admin, true) }
        runCatching { dpm.setPermissionPolicy(admin, DevicePolicyManager.PERMISSION_POLICY_AUTO_GRANT) }
        runCatching {
            dpm.setGlobalSetting(admin, Settings.Global.STAY_ON_WHILE_PLUGGED_IN, "7")
        }

        RESTRICTIONS.forEach { runCatching { dpm.addUserRestriction(admin, it) } }
        if (prefs.disableDebugging) {
            runCatching { dpm.addUserRestriction(admin, UserManager.DISALLOW_DEBUGGING_FEATURES) }
        } else {
            runCatching { dpm.clearUserRestriction(admin, UserManager.DISALLOW_DEBUGGING_FEATURES) }
        }

        // Pin our launcher as the HOME app so Home / boot always lands in the kiosk.
        runCatching {
            val filter = IntentFilter(Intent.ACTION_MAIN).apply {
                addCategory(Intent.CATEGORY_HOME)
                addCategory(Intent.CATEGORY_DEFAULT)
            }
            dpm.addPersistentPreferredActivity(admin, filter, ComponentName(ctx, MainActivity::class.java))
        }
        notifyChanged(ctx)
    }

    /** Removes the lockdown (admin PIN or dashboard "release"). The app stays device owner. */
    fun release(ctx: Context) {
        val prefs = Prefs(ctx)
        prefs.released = true
        if (isOwner(ctx)) {
            val dpm = dpm(ctx)
            val admin = admin(ctx)
            runCatching { dpm.clearPackagePersistentPreferredActivities(admin, ctx.packageName) }
            runCatching { dpm.setLockTaskPackages(admin, arrayOf()) }
            runCatching { dpm.setKeyguardDisabled(admin, false) }
            runCatching { dpm.setStatusBarDisabled(admin, false) }
            (RESTRICTIONS + UserManager.DISALLOW_DEBUGGING_FEATURES).forEach {
                runCatching { dpm.clearUserRestriction(admin, it) }
            }
        }
        notifyChanged(ctx)
    }

    fun relock(ctx: Context) {
        Prefs(ctx).released = false
        apply(ctx)
    }

    /** Fully remove device-owner management (the device then behaves like a normal phone). */
    fun unenroll(ctx: Context) {
        release(ctx)
        runCatching { dpm(ctx).clearDeviceOwnerApp(ctx.packageName) }
    }

    private fun notifyChanged(ctx: Context) {
        ctx.sendBroadcast(Intent(ACTION_STATE_CHANGED).setPackage(ctx.packageName))
    }
}
