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
import android.os.Build
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.GridLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast

/** The kiosk home screen: a grid of the allowed company apps. */
class MainActivity : Activity() {
    private lateinit var root: LinearLayout
    private var adminTaps = 0
    private var lastTap = 0L

    private val stateReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) = runOnUiThread { render() }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor("#0F172A"))
        }
        setContentView(root)
        val p = Prefs(this)
        if (p.enrolled || p.hasEnrollConfig) AgentService.start(this)
    }

    override fun onResume() {
        super.onResume()
        registerReceiver(stateReceiver, IntentFilter(Policy.ACTION_STATE_CHANGED), RECEIVER_NOT_EXPORTED)
        render()
        ensureLockTask()
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

    // ---------- UI ----------

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    private fun render() {
        root.removeAllViews()
        val p = Prefs(this)
        root.addView(header(p))
        when {
            !p.enrolled -> root.addView(enrollView(p))
            p.allowedApps.isEmpty() -> root.addView(centerText("No apps assigned to this device yet.\nPlease contact your administrator."))
            else -> root.addView(appGrid(p))
        }
    }

    private fun header(p: Prefs): View {
        val bar = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(36), dp(20), dp(12))
        }
        val title = TextView(this).apply {
            text = if (p.deviceName.isNotEmpty()) p.deviceName else "Company Kiosk"
            setTextColor(Color.WHITE)
            textSize = 22f
            typeface = Typeface.DEFAULT_BOLD
            // Hidden admin entry: tap the title 5 times quickly.
            setOnClickListener {
                val now = System.currentTimeMillis()
                adminTaps = if (now - lastTap < 2000) adminTaps + 1 else 1
                lastTap = now
                if (adminTaps >= 5) { adminTaps = 0; askPin() }
            }
        }
        bar.addView(title)
        if (p.message.isNotBlank()) {
            bar.addView(TextView(this).apply {
                text = p.message
                setTextColor(Color.parseColor("#FBBF24"))
                textSize = 14f
                setPadding(0, dp(6), 0, 0)
            })
        }
        if (p.released) {
            bar.addView(TextView(this).apply {
                text = "Device released by administrator"
                setTextColor(Color.parseColor("#F87171"))
                textSize = 13f
            })
        }
        return bar
    }

    private fun centerText(msg: String): View = TextView(this).apply {
        text = msg
        setTextColor(Color.parseColor("#CBD5E1"))
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
                setBackgroundColor(Color.parseColor("#1E293B"))
                alpha = if (launch == null) 0.4f else 1f
            }
            val icon = ImageView(this)
            runCatching { icon.setImageDrawable(pm.getApplicationIcon(pkg)) }
            tile.addView(icon, LinearLayout.LayoutParams(dp(72), dp(72)))
            tile.addView(TextView(this).apply {
                text = if (launch == null) "$label\n(not installed)" else label
                setTextColor(Color.WHITE)
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

    /** Shown only until the device has enrolled (e.g. if it was set up without a QR code). */
    private fun enrollView(p: Prefs): View {
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(24), dp(12), dp(24), dp(12))
        }
        val hintView = TextView(this).apply {
            text = if (p.hasEnrollConfig) "Connecting to the management server…"
            else "This device is not enrolled yet. Enter the server address and enrollment code from the dashboard."
            setTextColor(Color.parseColor("#CBD5E1"))
            textSize = 15f
        }
        box.addView(hintView)
        if (!p.hasEnrollConfig) {
            val url = EditText(this).apply {
                hint = "https://dashboard.example.com"
                setHintTextColor(Color.GRAY); setTextColor(Color.WHITE)
                inputType = InputType.TYPE_TEXT_VARIATION_URI
                setText(p.serverUrl)
            }
            val token = EditText(this).apply {
                hint = "Enrollment code"
                setHintTextColor(Color.GRAY); setTextColor(Color.WHITE)
            }
            val btn = Button(this).apply {
                text = "Enroll"
                setOnClickListener {
                    p.serverUrl = url.text.toString().trim()
                    p.enrollToken = token.text.toString().trim()
                    AgentService.start(this@MainActivity)
                    render()
                }
            }
            box.addView(url); box.addView(token); box.addView(btn)
        }
        return box
    }

    // ---------- Admin ----------

    private fun askPin() {
        val p = Prefs(this)
        if (p.pinHash.isEmpty()) {
            Toast.makeText(this, "No admin PIN configured", Toast.LENGTH_SHORT).show()
            return
        }
        val input = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD
            hint = "Admin PIN"
        }
        AlertDialog.Builder(this)
            .setTitle("Administrator")
            .setView(input)
            .setPositiveButton("OK") { _, _ ->
                if (Policy.checkPin(this, input.text.toString())) adminMenu()
                else Toast.makeText(this, "Wrong PIN", Toast.LENGTH_SHORT).show()
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun adminMenu() {
        val p = Prefs(this)
        val items = if (p.released) arrayOf("Re-lock kiosk", "Open Android settings", "Close")
        else arrayOf("Release device (exit kiosk)", "Close")
        AlertDialog.Builder(this)
            .setTitle("Administrator")
            .setItems(items) { _, which ->
                when (items[which]) {
                    "Release device (exit kiosk)" -> {
                        Policy.release(this)
                        runCatching { stopLockTask() }
                        startActivity(Intent(android.provider.Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                    }
                    "Re-lock kiosk" -> { Policy.relock(this); render(); ensureLockTask() }
                    "Open Android settings" ->
                        startActivity(Intent(android.provider.Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                }
            }
            .show()
    }
}
