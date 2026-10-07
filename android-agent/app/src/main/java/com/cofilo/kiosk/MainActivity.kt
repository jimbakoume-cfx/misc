package com.cofilo.kiosk

import android.app.Activity
import android.app.ActivityManager
import android.app.AlertDialog
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Color
import android.graphics.Typeface
import android.media.AudioManager
import android.os.Bundle
import android.os.SystemClock
import android.provider.Settings
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.Button
import android.widget.EditText
import android.widget.GridLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.SeekBar
import android.widget.TextView
import android.widget.Toast
import java.text.DateFormat
import java.util.Date

/**
 * The kiosk home screen.
 *  - one allowed app  -> it opens straight into that app and reopens it if the agent leaves (Home/Back never get out)
 *  - several apps     -> a grid of the allowed apps; Home always returns here
 */
class MainActivity : Activity() {
    private lateinit var root: LinearLayout
    private var adminTaps = 0
    private var lastTap = 0L

    private var dialogOpen = false          // don't auto-launch while a settings/admin dialog is showing
    private var wifiPanelOpened = false     // settings app was temporarily allowed for the Wi-Fi panel
    private var lastAutoLaunch = 0L
    private val recentLaunches = ArrayDeque<Long>()

    private val navy = Color.parseColor("#081A51")
    private val slate = Color.parseColor("#475569")

    private val stateReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) = runOnUiThread {
            render()
            ensureLockTask()
            maybeAutoLaunch()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor("#F4F6FA"))
        }
        setContentView(root)
        val p = Prefs(this)
        if (p.enrolled || p.hasEnrollConfig) AgentService.start(this)
    }

    override fun onResume() {
        super.onResume()
        registerReceiver(stateReceiver, IntentFilter(Policy.ACTION_STATE_CHANGED), RECEIVER_NOT_EXPORTED)
        if (wifiPanelOpened) {            // back from the Wi-Fi panel: close the settings loophole again
            wifiPanelOpened = false
            Policy.apply(this)
        }
        render()
        ensureLockTask()
        maybeAutoLaunch()
    }

    override fun onPause() {
        super.onPause()
        runCatching { unregisterReceiver(stateReceiver) }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        render()
    }

    @Deprecated("Back is disabled in kiosk mode")
    override fun onBackPressed() { /* swallow */ }

    private fun ensureLockTask() {
        val p = Prefs(this)
        val am = getSystemService(ActivityManager::class.java)
        if (p.released || !p.enrolled || !Policy.isOwner(this)) {
            if (am.lockTaskModeState != ActivityManager.LOCK_TASK_MODE_NONE) runCatching { stopLockTask() }
            return
        }
        if (am.lockTaskModeState == ActivityManager.LOCK_TASK_MODE_NONE &&
            Policy.dpm(this).isLockTaskPermitted(packageName)
        ) {
            runCatching { startLockTask() }
        }
    }

    /** With exactly one allowed app, open it automatically; stop if it keeps closing (3 times in 30 s). */
    private fun maybeAutoLaunch() {
        val p = Prefs(this)
        if (!p.enrolled || p.released || dialogOpen || wifiPanelOpened) return
        val apps = p.allowedApps
        if (apps.size != 1) return
        val launch = packageManager.getLaunchIntentForPackage(apps[0].first) ?: return
        val now = SystemClock.elapsedRealtime()
        while (recentLaunches.isNotEmpty() && now - recentLaunches.first() > 30_000) recentLaunches.removeFirst()
        if (recentLaunches.size >= 3 || now - lastAutoLaunch < 1500) return
        recentLaunches.addLast(now)
        lastAutoLaunch = now
        runCatching { startActivity(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
    }

    // ---------- UI ----------

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    private fun version(): String = runCatching {
        val i = packageManager.getPackageInfo(packageName, 0)
        "${i.versionName} (${i.longVersionCode})"
    }.getOrDefault("?")

    private fun render() {
        root.removeAllViews()
        val p = Prefs(this)
        root.addView(header(p))
        val body: View = when {
            !p.enrolled -> enrollView(p)
            p.allowedApps.isEmpty() -> centerText("No apps assigned to this device yet.\nPlease contact your administrator.")
            else -> appGrid(p)
        }
        root.addView(body)
        root.addView(footer())
    }

    private fun header(p: Prefs): View {
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(20), dp(36), dp(20), dp(12))
        }
        row.addView(ImageView(this).apply { setImageResource(R.drawable.ic_logo_mark) }, LinearLayout.LayoutParams(dp(40), dp(45)))
        val col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(14), 0, 0, 0)
        }
        col.addView(TextView(this).apply {
            text = if (p.deviceName.isNotEmpty()) p.deviceName else "Confiance Kiosk"
            setTextColor(navy)
            textSize = 22f
            typeface = Typeface.DEFAULT_BOLD
            // Hidden shortcut to the administrator menu: tap the title 5 times quickly.
            setOnClickListener {
                val now = System.currentTimeMillis()
                adminTaps = if (now - lastTap < 2000) adminTaps + 1 else 1
                lastTap = now
                if (adminTaps >= 5) { adminTaps = 0; if (p.pinHash.isNotEmpty()) askPin { adminMenu() } }
            }
        })
        if (p.message.isNotBlank()) {
            col.addView(TextView(this).apply {
                text = p.message
                setTextColor(Color.parseColor("#B45309"))
                textSize = 14f
                setPadding(0, dp(4), 0, 0)
            })
        }
        if (p.released) {
            col.addView(TextView(this).apply {
                text = "Device released by administrator"
                setTextColor(Color.parseColor("#B91C1C"))
                textSize = 13f
            })
        }
        row.addView(col, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        return row
    }

    /** Version label + settings button. Always visible so the installed version is easy to check. */
    private fun footer(): View {
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(20), dp(8), dp(12), dp(14))
        }
        row.addView(TextView(this).apply {
            text = "Confiance Kiosk  v${version()}"
            setTextColor(slate)
            textSize = 12f
        }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        row.addView(Button(this).apply {
            text = "Settings"
            isAllCaps = false
            setOnClickListener { settingsDialog() }
        })
        return row
    }

    private fun centerText(msg: String): View = TextView(this).apply {
        text = msg
        setTextColor(slate)
        textSize = 16f
        gravity = Gravity.CENTER
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f)
    }

    private fun appGrid(p: Prefs): View {
        val columns = if (resources.displayMetrics.widthPixels / resources.displayMetrics.density > 600) 4 else 2
        val grid = GridLayout(this).apply {
            columnCount = columns
            setPadding(dp(12), dp(8), dp(12), dp(8))
        }
        val pm = packageManager
        p.allowedApps.forEach { (pkg, label) ->
            val launch = pm.getLaunchIntentForPackage(pkg)
            val tile = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER
                setPadding(dp(8), dp(16), dp(8), dp(16))
                setBackgroundColor(Color.WHITE)
                alpha = if (launch == null) 0.4f else 1f
            }
            val icon = ImageView(this)
            runCatching { icon.setImageDrawable(pm.getApplicationIcon(pkg)) }
            tile.addView(icon, LinearLayout.LayoutParams(dp(72), dp(72)))
            tile.addView(TextView(this).apply {
                text = if (launch == null) "$label\n(not installed)" else label
                setTextColor(navy)
                textSize = 15f
                gravity = Gravity.CENTER
                setPadding(0, dp(8), 0, 0)
            })
            tile.setOnClickListener {
                if (launch != null) startActivity(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                else Toast.makeText(this, "$label is not installed on this device", Toast.LENGTH_SHORT).show()
            }
            val lp = GridLayout.LayoutParams(
                GridLayout.spec(GridLayout.UNDEFINED, 1f),
                GridLayout.spec(GridLayout.UNDEFINED, 1f)
            ).apply { width = 0; setMargins(dp(6), dp(6), dp(6), dp(6)) }
            grid.addView(tile, lp)
        }
        return ScrollView(this).apply {
            addView(grid)
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f)
        }
    }

    /** Shown until the device has enrolled (e.g. if it was set up without a QR code). */
    private fun enrollView(p: Prefs): View {
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(24), dp(12), dp(24), dp(12))
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f)
        }
        val hintView = TextView(this).apply {
            text = if (p.hasEnrollConfig) "Connecting to the management server…"
            else "This device is not enrolled yet. Enter the server address and the enrollment code from the dashboard (Add devices → Code)."
            setTextColor(slate)
            textSize = 15f
        }
        box.addView(hintView)
        if (p.serverUrl.isNotEmpty()) {
            box.addView(TextView(this).apply {
                text = "Server: ${p.serverUrl}"
                setTextColor(slate)
                textSize = 13f
                setPadding(0, dp(8), 0, 0)
            })
        }
        if (p.lastError.isNotEmpty()) {
            box.addView(TextView(this).apply {
                text = "Problem: ${p.lastError}"
                setTextColor(Color.parseColor("#B91C1C"))
                textSize = 13f
                setPadding(0, dp(6), 0, dp(6))
            })
        }
        if (p.hasEnrollConfig) {
            box.addView(Button(this).apply {
                text = "Retry now"
                setOnClickListener { AgentService.retryNow(this@MainActivity) }
            })
        }
        if (!p.hasEnrollConfig) {
            val url = EditText(this).apply {
                hint = "https://dashboard.example.com"
                setHintTextColor(Color.GRAY); setTextColor(navy)
                inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
                setText(p.serverUrl.ifEmpty { "https://confiance-kiosk.netlify.app" })
            }
            val token = EditText(this).apply {
                hint = "Enrollment code (e.g. ABCDE-FGHJK)"
                setHintTextColor(Color.GRAY); setTextColor(navy)
                // No autocorrect / suggestions / auto-case: the code must reach the server exactly as typed.
                inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS or
                    InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS or InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD
            }
            val btn = Button(this).apply {
                text = "Enroll"
                setOnClickListener {
                    val address = url.text.toString().trim()
                    if (!address.startsWith("https://")) {
                        Toast.makeText(this@MainActivity, "The server address must start with https://", Toast.LENGTH_LONG).show()
                        return@setOnClickListener
                    }
                    p.serverUrl = address
                    p.enrollToken = token.text.toString().trim()
                    AgentService.start(this@MainActivity)
                    render()
                }
            }
            box.addView(url); box.addView(token); box.addView(btn)
        }
        return box
    }

    // ---------- Settings (everyone) ----------

    private fun settingsDialog() {
        val p = Prefs(this)
        val audio = getSystemService(AudioManager::class.java)
        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(24), dp(12), dp(24), dp(4))
        }
        fun label(t: String) = TextView(this).apply { text = t; setTextColor(slate); textSize = 13f; setPadding(0, dp(12), 0, dp(2)) }
        fun row(k: String, v: String) = TextView(this).apply { text = "$k:  $v"; setTextColor(navy); textSize = 14f; setPadding(0, dp(2), 0, dp(2)) }

        content.addView(row("App version", version()))
        content.addView(row("Device", p.deviceName.ifEmpty { "not enrolled" }))
        content.addView(row("Management", if (Policy.isOwner(this)) "Managed device" else "Not managed"))
        content.addView(row("Last check-in", if (p.lastCheckIn > 0) DateFormat.getTimeInstance(DateFormat.SHORT).format(Date(p.lastCheckIn)) else "never"))
        content.addView(row("Network", DeviceInfo.status(this).optString("network", "none")))

        content.addView(label("Volume"))
        content.addView(SeekBar(this).apply {
            max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
            progress = audio.getStreamVolume(AudioManager.STREAM_MUSIC)
            setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
                override fun onProgressChanged(s: SeekBar, v: Int, fromUser: Boolean) {
                    if (fromUser) runCatching { audio.setStreamVolume(AudioManager.STREAM_MUSIC, v, 0) }
                }
                override fun onStartTrackingTouch(s: SeekBar) {}
                override fun onStopTrackingTouch(s: SeekBar) {}
            })
        })

        content.addView(label("Screen brightness (this screen)"))
        content.addView(SeekBar(this).apply {
            max = 100
            val cur = window.attributes.screenBrightness
            progress = if (cur < 0) 60 else (cur * 100).toInt()
            setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
                override fun onProgressChanged(s: SeekBar, v: Int, fromUser: Boolean) {
                    if (!fromUser) return
                    val lp = window.attributes
                    lp.screenBrightness = (v.coerceAtLeast(5)) / 100f
                    window.attributes = lp
                }
                override fun onStartTrackingTouch(s: SeekBar) {}
                override fun onStopTrackingTouch(s: SeekBar) {}
            })
        })

        content.addView(Button(this).apply {
            text = "Check for updates now"
            isAllCaps = false
            setOnClickListener {
                AgentService.retryNow(this@MainActivity)
                Toast.makeText(this@MainActivity, "Checking with the server…", Toast.LENGTH_SHORT).show()
            }
        })
        if (p.pinHash.isNotEmpty()) {   // only when the dashboard enabled an exit PIN
            content.addView(Button(this).apply {
                text = "Administrator…"
                isAllCaps = false
                setOnClickListener { askPin { adminMenu() } }
            })
        } else {
            content.addView(TextView(this).apply {
                text = "This phone is managed from the dashboard."
                setTextColor(slate); textSize = 12f; setPadding(0, dp(10), 0, 0)
            })
        }

        dialogOpen = true
        AlertDialog.Builder(this)
            .setTitle("Settings")
            .setView(ScrollView(this).apply { addView(content) })
            .setPositiveButton("Close", null)
            .setOnDismissListener { dialogOpen = false }
            .show()
    }

    // ---------- Administrator (PIN) ----------

    /** Asks for the admin PIN. Five wrong attempts lock the prompt for a growing time. */
    private fun askPin(then: () -> Unit) {
        val p = Prefs(this)
        if (p.pinHash.isEmpty()) {
            Toast.makeText(this, "No admin PIN has been set in the dashboard", Toast.LENGTH_LONG).show()
            return
        }
        val wait = p.pinLockUntil - System.currentTimeMillis()
        if (wait > 0) {
            Toast.makeText(this, "Too many wrong attempts. Try again in ${(wait / 1000) + 1} s", Toast.LENGTH_LONG).show()
            return
        }
        val input = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD
            hint = "Admin PIN"
        }
        dialogOpen = true
        AlertDialog.Builder(this)
            .setTitle("Administrator")
            .setView(input)
            .setPositiveButton("OK") { _, _ ->
                if (Policy.checkPin(this, input.text.toString())) {
                    p.pinFails = 0
                    then()
                } else {
                    p.pinFails += 1
                    if (p.pinFails >= 5) {
                        val seconds = minOf(1800L, 60L shl (p.pinFails - 5).coerceAtMost(5))
                        p.pinLockUntil = System.currentTimeMillis() + seconds * 1000
                    }
                    Toast.makeText(this, "Wrong PIN", Toast.LENGTH_SHORT).show()
                }
            }
            .setNegativeButton("Cancel", null)
            .setOnDismissListener { dialogOpen = false }
            .show()
    }

    private fun adminMenu() {
        val p = Prefs(this)
        val items = mutableListOf<String>()
        items += "Wi-Fi networks"
        items += "Diagnostics"
        items += if (p.released) "Re-lock kiosk" else "Release device (exit kiosk)"
        if (p.released) items += "Open Android settings"
        items += "Close"
        dialogOpen = true
        AlertDialog.Builder(this)
            .setTitle("Administrator")
            .setItems(items.toTypedArray()) { _, which ->
                when (items[which]) {
                    "Wi-Fi networks" -> openWifiPanel()
                    "Diagnostics" -> diagnostics()
                    "Release device (exit kiosk)" -> {
                        Policy.release(this)
                        runCatching { stopLockTask() }
                        startActivity(Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                    }
                    "Re-lock kiosk" -> { Policy.relock(this); render(); ensureLockTask() }
                    "Open Android settings" ->
                        startActivity(Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                }
            }
            .setOnDismissListener { dialogOpen = false }
            .show()
    }

    /** Lets the system Wi-Fi panel open (the Settings app is otherwise blocked) and re-locks when we come back. */
    private fun openWifiPanel() {
        if (Policy.isOwner(this)) {
            val pkgs = (Prefs(this).allowedApps.map { it.first } + packageName + "com.android.settings").distinct().toTypedArray()
            runCatching { Policy.dpm(this).setLockTaskPackages(Policy.admin(this), pkgs) }
        }
        wifiPanelOpened = true
        runCatching {
            startActivity(Intent(Settings.Panel.ACTION_INTERNET_CONNECTIVITY).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }.onFailure {
            wifiPanelOpened = false
            Policy.apply(this)
            Toast.makeText(this, "Could not open Wi-Fi settings", Toast.LENGTH_LONG).show()
        }
    }

    private fun diagnostics() {
        val p = Prefs(this)
        val s = DeviceInfo.status(this)
        val text = buildString {
            appendLine("Version: ${version()}")
            appendLine("Server: ${p.serverUrl}")
            appendLine("Device owner: ${Policy.isOwner(this@MainActivity)}")
            appendLine("Battery: ${s.optInt("battery")}%  Network: ${s.optString("network")}")
            appendLine("Free storage: ${s.optLong("freeStorageMb")} MB")
            appendLine("Last problem: ${p.lastError.ifEmpty { "none" }}")
            appendLine("Last crash: ${p.lastCrash.ifEmpty { "none" }}")
        }
        AlertDialog.Builder(this).setTitle("Diagnostics").setMessage(text).setPositiveButton("Close", null).show()
    }
}
