package com.cofilo.kiosk

import android.Manifest
import android.app.Activity
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.IntentFilter
import android.os.Build
import android.os.UserManager
import android.provider.Settings
import java.security.MessageDigest
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

/**
 * Applies / removes the device lockdown. Everything here needs the app to be the
 * **device owner** (set during QR provisioning); without it the calls are no-ops.
 * 1.4.0: grants the location/phone runtime permissions the telemetry needs, sets the *system* brightness
 * (the window attribute only affected the kiosk screen) and offers a temporary lock-task allow-list used
 * for the Wi-Fi panel, the usage-access screen and the dialer.
 */
object Policy {
    const val ACTION_STATE_CHANGED = "com.cofilo.kiosk.STATE_CHANGED"

    /** Runtime permissions granted silently by the device owner (telemetry: location, IMEI/SIM, phone number). */
    private val RUNTIME_PERMISSIONS = listOf(
        Manifest.permission.ACCESS_FINE_LOCATION,
        Manifest.permission.ACCESS_COARSE_LOCATION,
        Manifest.permission.READ_PHONE_STATE,
        Manifest.permission.READ_PHONE_NUMBERS,
    )

    /** Samsung Auto Blocker switches (Settings.Secure / Global); names seen on One UI 6/7. */
    val AUTO_BLOCKER_KEYS = listOf("rampart_main_switch_enabled", "rampart_auto_enabled_switch_enabled", "block_unverified_apps")

    private val RESTRICTIONS = listOf(
        UserManager.DISALLOW_FACTORY_RESET,
        UserManager.DISALLOW_SAFE_BOOT,
        UserManager.DISALLOW_ADD_USER,
        UserManager.DISALLOW_REMOVE_USER,
        UserManager.DISALLOW_UNINSTALL_APPS,
        UserManager.DISALLOW_MODIFY_ACCOUNTS,
        UserManager.DISALLOW_USB_FILE_TRANSFER,
        UserManager.DISALLOW_MOUNT_PHYSICAL_MEDIA,
        UserManager.DISALLOW_CONFIG_TETHERING,
        UserManager.DISALLOW_NETWORK_RESET,
        UserManager.DISALLOW_FUN,
        UserManager.DISALLOW_CONFIG_DATE_TIME,
        UserManager.DISALLOW_CONFIG_LOCALE,
        UserManager.DISALLOW_APPS_CONTROL,          // no force-stop / clear-data / uninstall from Settings
        UserManager.DISALLOW_SYSTEM_ERROR_DIALOGS,  // no "app isn't responding" pop-ups
    )

    fun dpm(ctx: Context): DevicePolicyManager =
        ctx.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager

    fun admin(ctx: Context) = ComponentName(ctx, AdminReceiver::class.java)

    fun isOwner(ctx: Context) = dpm(ctx).isDeviceOwnerApp(ctx.packageName)

    private fun hex(b: ByteArray) = b.joinToString("") { "%02x".format(it) }

    private fun sha256Pin(salt: String, pin: String): String =
        hex(MessageDigest.getInstance("SHA-256").digest((salt + pin).toByteArray()))

    /** PIN hashes are `pbkdf2$<iterations>$<salt>$<hex>`; the old salted-SHA-256 form is still accepted. */
    fun checkPin(ctx: Context, pin: String): Boolean {
        val p = Prefs(ctx)
        val stored = p.pinHash
        if (stored.isEmpty()) return false
        val actual = if (stored.startsWith("pbkdf2$")) {
            val parts = stored.split("$")
            if (parts.size != 4) return false
            val spec = PBEKeySpec(pin.toCharArray(), parts[2].toByteArray(), parts[1].toIntOrNull() ?: return false, 256)
            hex(SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).encoded)
        } else sha256Pin(p.pinSalt, pin)
        val expected = if (stored.startsWith("pbkdf2$")) stored.substringAfterLast("$") else stored
        return MessageDigest.isEqual(actual.toByteArray(), expected.toByteArray())
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
        runCatching { dpm.setUserControlDisabledPackages(admin, pkgs.toList()) }
        runCatching { dpm.setPermissionPolicy(admin, DevicePolicyManager.PERMISSION_POLICY_AUTO_GRANT) }
        RUNTIME_PERMISSIONS.forEach { perm ->
            runCatching {
                dpm.setPermissionGrantState(admin, ctx.packageName, perm, DevicePolicyManager.PERMISSION_GRANT_STATE_GRANTED)
            }
        }
        disableAutoBlocker(ctx)
        // Portrait only, for the whole phone (the driver app included): auto-rotate off and rotation fixed to 0.
        // Writing these needs WRITE_SETTINGS, which the USB setup grants with adb; without it this app alone stays
        // portrait (manifest) and the system setting is left as it is.
        runCatching {
            if (Settings.System.canWrite(ctx)) {
                Settings.System.putInt(ctx.contentResolver, Settings.System.ACCELEROMETER_ROTATION, 0)
                Settings.System.putInt(ctx.contentResolver, Settings.System.USER_ROTATION, 0)
            }
        }
        runCatching {
            dpm.setGlobalSetting(admin, Settings.Global.STAY_ON_WHILE_PLUGGED_IN, "7")
        }

        RESTRICTIONS.forEach { runCatching { dpm.addUserRestriction(admin, it) } }
        // Not restricted since 1.4.9: the "Install unknown apps" switch for this app must stay usable, so an admin can
        // authorise it as an update source on phones whose vendor blocks installs from unlisted sources (Samsung Auto
        // Blocker). Drivers never reach Settings in kiosk mode, so nothing is lost. Cleared explicitly for phones that
        // were set up by an older version.
        runCatching { dpm.clearUserRestriction(admin, UserManager.DISALLOW_INSTALL_UNKNOWN_SOURCES) }
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
        // Forget the fleet so the phone starts from the "enter server and code" screen again.
        Prefs(ctx).apply {
            deviceToken = ""
            enrollToken = ""
            allowedApps = emptyList()
            pinHash = ""
            released = false
            message = ""
            restUrl = ""; restKey = ""
            driverName = ""; vehicle = ""; dispatchPhone = ""
            lostMode = false; lostMessage = ""; lostPhone = ""
            pendingLocate = false; lastLocation = ""
        }
        notifyChanged(ctx)
    }

    /**
     * Lets [extra] packages run inside the lock task until the next [apply] (the caller re-applies on resume).
     * Used for the system Wi-Fi panel / usage-access screen and for the dialer while calling dispatch.
     */
    fun allowTemporarily(ctx: Context, vararg extra: String) {
        if (!isOwner(ctx)) return
        val pkgs = (Prefs(ctx).allowedApps.map { it.first } + ctx.packageName + extra.filter { it.isNotBlank() })
            .distinct().toTypedArray()
        runCatching { dpm(ctx).setLockTaskPackages(admin(ctx), pkgs) }
    }

    /** The package that handles `tel:` dialing, or "" when unknown. */
    fun defaultDialer(ctx: Context): String = runCatching {
        (ctx.getSystemService(Context.TELECOM_SERVICE) as? android.telecom.TelecomManager)?.defaultDialerPackage ?: ""
    }.getOrDefault("")

    /** Current system brightness in percent (0..100). */
    fun brightnessPercent(ctx: Context): Int = runCatching {
        Settings.System.getInt(ctx.contentResolver, Settings.System.SCREEN_BRIGHTNESS, 128) * 100 / 255
    }.getOrDefault(50).coerceIn(0, 100)

    /**
     * Sets the system brightness (API 28+ device owner: `setSystemSetting`, which also switches auto-brightness
     * off so the value sticks). Older releases only get the window attribute of [activity] (kiosk screen only).
     */
    fun setBrightness(ctx: Context, percent: Int, activity: Activity? = null) {
        val pct = percent.coerceIn(5, 100)
        val value = (pct * 255 / 100).coerceIn(1, 255)
        var done = false
        if (Build.VERSION.SDK_INT >= 28 && isOwner(ctx)) {
            done = runCatching {
                val dpm = dpm(ctx)
                val admin = admin(ctx)
                dpm.setSystemSetting(admin, Settings.System.SCREEN_BRIGHTNESS_MODE,
                    Settings.System.SCREEN_BRIGHTNESS_MODE_MANUAL.toString())
                dpm.setSystemSetting(admin, Settings.System.SCREEN_BRIGHTNESS, value.toString())
            }.isSuccess
        }
        if (!done && activity != null) {
            runCatching {
                val lp = activity.window.attributes
                lp.screenBrightness = pct / 100f
                activity.window.attributes = lp
            }
        }
    }

    private fun notifyChanged(ctx: Context) {
        ctx.sendBroadcast(Intent(ACTION_STATE_CHANGED).setPackage(ctx.packageName))
    }

    /** One Samsung Auto Blocker switch found on this phone: which settings table, its name and current value. */
    data class Switch(val table: String, val key: String, val value: String) {
        val on get() = value == "1" || value.equals("true", true)
    }

    /**
     * Samsung Auto Blocker ("rampart") switches present on this phone: the names known from One UI 6/7 plus every
     * secure/global setting whose name mentions rampart or auto-block and looks like a switch (…enabled / …switch /
     * block_…). The settings tables are readable by any app, so the list is exact for the phone at hand.
     */
    fun autoBlockerSwitches(ctx: Context): List<Switch> {
        val out = linkedMapOf<String, Switch>()
        for (table in listOf("secure", "global")) {
            val uri = if (table == "secure") Settings.Secure.CONTENT_URI else Settings.Global.CONTENT_URI
            runCatching {
                ctx.contentResolver.query(uri, arrayOf("name", "value"), null, null, null)?.use { c ->
                    while (c.moveToNext()) {
                        val name = c.getString(0) ?: continue
                        val looksLikeSwitch = name in AUTO_BLOCKER_KEYS ||
                            (Regex("rampart|auto_?block", RegexOption.IGNORE_CASE).containsMatchIn(name) && Regex("enabled|switch|^block_", RegexOption.IGNORE_CASE).containsMatchIn(name))
                        if (looksLikeSwitch) out["$table/$name"] = Switch(table, name, c.getString(1) ?: "")
                    }
                }
            }
        }
        return out.values.toList()
    }

    fun canWriteSecureSettings(ctx: Context) =
        ctx.checkSelfPermission(Manifest.permission.WRITE_SECURE_SETTINGS) == PackageManager.PERMISSION_GRANTED

    /**
     * Samsung Auto Blocker refuses every install that does not come from a store, our own updates included. When the
     * USB setup granted WRITE_SECURE_SETTINGS, every switch found on is written off (other brands have none, so they
     * are unaffected). Returns true when a switch was changed.
     */
    fun disableAutoBlocker(ctx: Context): Boolean {
        if (!canWriteSecureSettings(ctx)) return false
        var changed = false
        for (sw in autoBlockerSwitches(ctx)) {
            if (!sw.on) continue
            val ok = runCatching {
                if (sw.table == "secure") Settings.Secure.putInt(ctx.contentResolver, sw.key, 0) else Settings.Global.putInt(ctx.contentResolver, sw.key, 0)
            }.getOrDefault(false)
            if (ok) changed = true
        }
        return changed
    }

    /**
     * For the dashboard: "off" (every switch off), "on" (a switch is on and the app may not write it), "not found"
     * (no Samsung switch on this phone), followed by the switches seen, e.g. "off (rampart_main_switch_enabled=0)".
     */
    fun autoBlockerStatus(ctx: Context): String {
        val sws = autoBlockerSwitches(ctx)
        val state = when {
            sws.isEmpty() -> "not found"
            sws.none { it.on } -> "off"
            canWriteSecureSettings(ctx) -> "on, switching off"
            else -> "on, no permission"
        }
        return if (sws.isEmpty()) state else "$state (" + sws.joinToString(", ") { "${it.key}=${it.value}" }.take(300) + ")"
    }
}
