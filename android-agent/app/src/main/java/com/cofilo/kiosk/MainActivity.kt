package com.cofilo.kiosk

import android.app.Activity
import android.app.ActivityManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Color
import android.content.res.ColorStateList
import android.graphics.drawable.GradientDrawable
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.provider.Settings
import android.text.InputFilter
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.EditText
import android.app.Dialog
import android.widget.GridLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.SeekBar
import android.widget.TextView
import android.widget.Toast
import java.text.DateFormat
import java.util.Date
import kotlin.concurrent.thread

/**
 * The kiosk home screen.
 *  - one allowed app  -> it opens straight into that app and reopens it if the agent leaves (Home/Back never get out)
 *  - several apps     -> a grid of the allowed apps; Home always returns here
 *  - lost mode        -> a full-screen "this phone is lost" card with a call button; grid and Settings hidden
 * 1.4.0: driver name / vehicle in the header, a one-line status strip (battery, network, data this month), a bottom
 * bar (Wi-Fi, dispatch, settings), the Settings sheet split into "This phone" / "Adjust" with a language override and
 * "Report a problem", system brightness, and admin actions for usage access and lost mode.
 */
class MainActivity : Activity() {
    private lateinit var root: LinearLayout
    private var adminTaps = 0
    private var insetTop = 0
    private var insetBottom = 0
    private var lastTap = 0L

    private var dialogOpen = false          // don't auto-launch while a settings/admin dialog is showing
    private var tempAllowed = false         // another package (settings panel, dialer) was temporarily allowed in the lock task
    private var lastAutoLaunch = 0L
    private val recentLaunches = ArrayDeque<Long>()

    private val stateReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) = runOnUiThread {
            render()
            ensureLockTask()
            maybeAutoLaunch()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Ui.lang = Prefs(this).lang
        root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Ui.bg)
        }
        setContentView(root)
        // Edge to edge with the system-bar insets applied by hand: the header absorbs the status bar, the bottom
        // bar the gesture bar, so nothing sits under them on any phone.
        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = Color.TRANSPARENT
        if (Build.VERSION.SDK_INT >= 30) {
            window.setDecorFitsSystemWindows(false)
            window.insetsController?.setSystemBarsAppearance(
                android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS, android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS)
            root.setOnApplyWindowInsetsListener { _, insets ->
                val bars = insets.getInsets(android.view.WindowInsets.Type.systemBars() or android.view.WindowInsets.Type.displayCutout())
                if (bars.top != insetTop || bars.bottom != insetBottom) {
                    insetTop = bars.top; insetBottom = bars.bottom; Ui.insetBottom = bars.bottom
                    render()
                }
                insets
            }
        } else {
            window.statusBarColor = Ui.navy
            window.navigationBarColor = Ui.bg
        }
        val p = Prefs(this)
        if (p.enrolled || p.hasEnrollConfig) AgentService.start(this)
    }

    override fun onResume() {
        super.onResume()
        registerReceiver(stateReceiver, IntentFilter(Policy.ACTION_STATE_CHANGED), RECEIVER_NOT_EXPORTED)
        if (tempAllowed) {                // back from the Wi-Fi panel / dialer: close the lock-task loophole again
            tempAllowed = false
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
        if (!p.enrolled || p.released || p.lostMode || dialogOpen || tempAllowed) return
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

    /** Keeps the screen on (and turns it on) while the alarm rings or the phone is in lost mode. */
    @Suppress("DEPRECATION")
    private fun applyScreenFlags(p: Prefs) {
        val keepOn = p.lostMode || AgentService.ringing
        val flags = WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
        runCatching {
            if (keepOn) window.addFlags(flags) else window.clearFlags(flags)
            if (Build.VERSION.SDK_INT >= 27) setTurnScreenOn(keepOn)
        }
    }

    // ---------- UI ----------

    private fun dp(v: Int) = Ui.dp(this, v)
    private fun tr(en: String, fr: String) = Ui.tr(en, fr)

    private fun version(): String = runCatching {
        val i = packageManager.getPackageInfo(packageName, 0)
        "${i.versionName} (${i.longVersionCode})"
    }.getOrDefault("?")

    private fun render() {
        root.removeAllViews()
        val p = Prefs(this)
        applyScreenFlags(p)
        root.addView(header(p))
        if (p.enrolled && !Policy.isOwner(this)) root.addView(unmanagedBanner())
        if (p.enrolled) root.addView(statusStrip(p))
        val body: View = when {
            !p.enrolled -> enrollView(p)
            p.lostMode -> lostView(p)
            p.allowedApps.isEmpty() -> emptyState(
                tr("No apps yet", "Aucune application"),
                tr("Your administrator has not assigned any apps to this phone.", "Votre administrateur n'a pas encore attribué d'applications à ce téléphone.")
            )
            else -> appGrid(p)
        }
        root.addView(body)
        // Lost mode hides every quiet action; the administrator still gets in with the 5-tap shortcut + PIN.
        if (!p.lostMode) root.addView(bottomBar(p))
    }

    /** Red card when the app was installed by hand: nothing can be locked or controlled in that state. */
    private fun unmanagedBanner(): View = Ui.cardBox(this, 14).apply {
        background = Ui.round(this@MainActivity, Ui.badBg, 16)
        addView(Ui.text(this@MainActivity, tr("This phone is not managed", "Ce téléphone n'est pas géré"), 15f, Ui.bad, true))
        addView(Ui.text(this@MainActivity, tr(
            "The app was installed by hand, so it cannot be locked or controlled from the dashboard. Ask your administrator to reset the phone and set it up with the QR code.",
            "L'application a été installée à la main : le téléphone ne peut pas être verrouillé ni contrôlé depuis le tableau de bord. Demandez à votre administrateur de le réinitialiser et de le configurer avec le code QR."
        ), 13f, Ui.bad).apply { setPadding(0, dp(4), 0, 0) })
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
            .apply { setMargins(dp(16), dp(14), dp(16), 0) }
    }

    private fun header(p: Prefs): View {
        val ctx = this
        val soft = Color.parseColor("#C9D3F5")
        val box = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            background = GradientDrawable(GradientDrawable.Orientation.TL_BR, intArrayOf(Ui.navy, Ui.navyDeep)).apply {
                cornerRadii = floatArrayOf(0f, 0f, 0f, 0f, Ui.dpf(ctx, 28), Ui.dpf(ctx, 28), Ui.dpf(ctx, 28), Ui.dpf(ctx, 28))
            }
            setPadding(dp(Ui.s5), dp(Ui.s4) + insetTop, dp(Ui.s5), dp(Ui.s5))
        }
        // Logo mark + wordmark lockup, online chip on the right.
        val top = LinearLayout(ctx).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        top.addView(ImageView(ctx).apply {
            setImageResource(R.drawable.ic_logo_mark)
            setColorFilter(Color.WHITE)
        }, LinearLayout.LayoutParams(dp(30), dp(34)))
        top.addView(Ui.text(ctx, "CONFIANCE", 13f, soft, true).apply {
            letterSpacing = 0.18f
            setPadding(dp(12), 0, 0, 0)
        }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        if (p.enrolled) {
            val fresh = p.lastCheckIn > 0 && System.currentTimeMillis() - p.lastCheckIn < 12 * 60_000
            top.addView(
                if (fresh) Ui.chip(ctx, "● " + tr("Online", "En ligne"), Ui.good, Ui.goodBg)
                else Ui.chip(ctx, "● " + tr("Offline", "Hors ligne"), Ui.warn, Ui.warnBg)
            )
        }
        box.addView(top)
        box.addView(Ui.text(ctx, tr("Welcome", "Bienvenue"), 14f, soft).apply { setPadding(0, dp(20), 0, 0) })
        val name = p.driverName.ifEmpty { p.deviceName.ifEmpty { "Confiance Kiosk" } }
        box.addView(Ui.text(ctx, name, 26f, Color.WHITE, true).apply {
            maxLines = 2
            // Hidden shortcut to the administrator menu: tap the name 5 times quickly.
            setOnClickListener {
                val now = System.currentTimeMillis()
                adminTaps = if (now - lastTap < 2000) adminTaps + 1 else 1
                lastTap = now
                if (adminTaps >= 5) { adminTaps = 0; if (p.pinHash.isNotEmpty()) askPin { adminMenu() } }
            }
        })
        if (p.vehicle.isNotEmpty()) {
            box.addView(Ui.text(ctx, p.vehicle, 14f, soft).apply { setPadding(0, dp(2), 0, 0) })
        } else if (p.driverName.isNotEmpty() && p.deviceName.isNotEmpty()) {
            box.addView(Ui.text(ctx, p.deviceName, 14f, soft).apply { setPadding(0, dp(2), 0, 0) })
        }
        if (p.message.isNotBlank()) {
            // Group message: soft white banner on the navy header.
            box.addView(Ui.text(ctx, p.message, 14f, Color.WHITE).apply {
                background = Ui.round(ctx, Color.parseColor("#33FFFFFF"), 12)
                setPadding(dp(12), dp(8), dp(12), dp(8))
                layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT)
                    .apply { topMargin = dp(12) }
            })
        }
        if (p.released) {
            box.addView(Ui.text(ctx, tr("Released by the administrator", "Libéré par l'administrateur"), 13f, Color.parseColor("#FCA5A5"))
                .apply { setPadding(0, dp(8), 0, 0) })
        }
        return box
    }

    private fun networkLabel(): String = when (runCatching { DeviceInfo.networkType(this) }.getOrDefault("none")) {
        "wifi" -> "Wi-Fi"
        "cellular" -> tr("Cellular", "Réseau mobile")
        "ethernet" -> "Ethernet"
        "none" -> tr("No network", "Pas de réseau")
        else -> tr("Network", "Réseau")
    }

    /** "Data this month: 1.2 GB / 2 GB" (budget part omitted when the dashboard set none). */
    private fun dataLine(p: Prefs): String {
        val used = Ui.formatBytes(DeviceInfo.monthMobileBytes(p))
        val budget = if (p.dataBudgetMb > 0) " / " + Ui.formatBytes(p.dataBudgetMb * 1024L * 1024L) else ""
        return tr("Data this month: ", "Données mobiles ce mois : ") + used + budget
    }

    /** One muted line under the header: battery, network, cellular data this month. */
    private fun statusStrip(p: Prefs): View {
        val (pct, charging) = runCatching { DeviceInfo.battery(this) }.getOrDefault(-1 to false)
        val battery = (if (pct >= 0) tr("Battery $pct%", "Batterie $pct %") else tr("Battery ?", "Batterie ?")) + (if (charging) " ⚡" else "")
        return Ui.text(this, "$battery  ·  ${networkLabel()}  ·  ${dataLine(p)}", 12f, Ui.muted).apply {
            maxLines = 2
            setPadding(dp(22), dp(10), dp(22), 0)
        }
    }

    /** Bottom bar: up to three quiet actions (Wi-Fi, dispatch, settings). The version now lives in Settings. */
    private fun bottomBar(p: Prefs): View {
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(12), dp(8), dp(12), dp(12) + insetBottom)
        }
        fun item(label: String, onClick: () -> Unit) {
            row.addView(Ui.secondaryButton(this, label, onClick).apply {
                textSize = 14f
                setPadding(dp(8), dp(10), dp(8), dp(10))
                maxLines = 1
            }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { setMargins(dp(4), 0, dp(4), 0) })
        }
        if (!p.enrolled || p.driverWifi) item("Wi-Fi") { openWifiPanel() }
        if (p.enrolled && p.dispatchPhone.isNotEmpty()) item(tr("Dispatch", "Régulation")) { dial(p.dispatchPhone) }
        item(tr("Settings", "Réglages")) { settingsDialog() }
        return row
    }

    private fun emptyState(title: String, msg: String): View = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        gravity = Gravity.CENTER
        setPadding(dp(36), 0, dp(36), 0)
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f)
        addView(ImageView(this@MainActivity).apply { setImageResource(R.drawable.ic_logo_mark); alpha = 0.18f },
            LinearLayout.LayoutParams(dp(56), dp(63)))
        addView(Ui.text(this@MainActivity, title, 18f, Ui.ink, true).apply { gravity = Gravity.CENTER; setPadding(0, dp(16), 0, dp(4)) })
        addView(Ui.text(this@MainActivity, msg, 14f, Ui.muted).apply { gravity = Gravity.CENTER })
    }

    /** Lost mode: full card with the dashboard's message and a call button (dialer temporarily allowed). */
    private fun lostView(p: Prefs): View {
        val ctx = this
        val card = Ui.cardBox(ctx, 22)
        card.addView(Ui.text(ctx, tr("This phone has been reported lost", "Ce téléphone est perdu ou volé"), 22f, Ui.bad, true))
        val msg = p.lostMessage.ifBlank {
            tr("It belongs to Confiance. Please call the number below so it can be returned.",
                "Il appartient à Confiance. Merci d'appeler le numéro ci-dessous pour le restituer.")
        }
        card.addView(Ui.text(ctx, msg, 16f, Ui.ink).apply { setPadding(0, dp(12), 0, dp(6)) })
        if (p.deviceName.isNotEmpty()) card.addView(Ui.text(ctx, p.deviceName, 13f, Ui.muted))
        if (p.lostPhone.isNotEmpty()) {
            card.addView(Ui.gap(ctx, 18))
            card.addView(Ui.primaryButton(ctx, tr("Call ${p.lostPhone}", "Appeler ${p.lostPhone}")) { dial(p.lostPhone) })
        }
        return ScrollView(ctx).apply {
            addView(card, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
                .apply { setMargins(dp(16), dp(18), dp(16), dp(16)) })
            overScrollMode = View.OVER_SCROLL_NEVER
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f)
        }
    }

    private fun appGrid(p: Prefs): View {
        val columns = if (resources.displayMetrics.widthPixels / resources.displayMetrics.density > 600) 4 else 2
        val grid = GridLayout(this).apply {
            columnCount = columns
            setPadding(dp(12), dp(12), dp(12), dp(8))
        }
        val pm = packageManager
        p.allowedApps.forEach { (pkg, label) ->
            val launch = pm.getLaunchIntentForPackage(pkg)
            val tile = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER
                setPadding(dp(10), dp(22), dp(10), dp(18))
                background = Ui.tappable(this@MainActivity, Color.WHITE, Ui.r3, Ui.line)
                elevation = Ui.dpf(this@MainActivity, 2)
                alpha = if (launch == null) 0.5f else 1f
                isClickable = true; isFocusable = true
            }
            val icon = ImageView(this).apply {
                background = Ui.round(this@MainActivity, Ui.surface2, 22)
                setPadding(dp(12), dp(12), dp(12), dp(12))
            }
            runCatching { icon.setImageDrawable(pm.getApplicationIcon(pkg)) }
            tile.addView(icon, LinearLayout.LayoutParams(dp(80), dp(80)))
            tile.addView(Ui.text(this, label, 15f, Ui.ink, true).apply {
                gravity = Gravity.CENTER
                maxLines = 2
                setPadding(0, dp(12), 0, 0)
            })
            if (launch == null) {
                tile.addView(Ui.text(this, tr("Not installed", "Non installée"), 12f, Ui.warn).apply { gravity = Gravity.CENTER })
            }
            tile.setOnClickListener {
                if (launch != null) startActivity(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                else Toast.makeText(this, tr("$label is not installed on this phone", "$label n'est pas installée sur ce téléphone"), Toast.LENGTH_SHORT).show()
            }
            val lp = GridLayout.LayoutParams(
                GridLayout.spec(GridLayout.UNDEFINED, 1f),
                GridLayout.spec(GridLayout.UNDEFINED, 1f)
            ).apply { width = 0; setMargins(dp(6), dp(6), dp(6), dp(6)) }
            grid.addView(tile, lp)
        }
        return ScrollView(this).apply {
            addView(grid)
            overScrollMode = View.OVER_SCROLL_NEVER
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f)
        }
    }

    private fun field(hint: String, type: Int, initial: String = ""): EditText = EditText(this).apply {
        this.hint = hint
        setHintTextColor(Ui.muted); setTextColor(Ui.ink)
        textSize = 16f
        inputType = type
        setText(initial)
        background = Ui.round(this@MainActivity, Color.parseColor("#F8FAFC"), 12, Ui.line)
        setPadding(dp(14), dp(12), dp(14), dp(12))
    }

    /** Shown until the device has enrolled (e.g. if it was set up without a QR code). */
    private fun enrollView(p: Prefs): View {
        val ctx = this
        val card = Ui.cardBox(ctx, 20)
        if (p.hasEnrollConfig) {
            card.addView(Ui.text(ctx, tr("Connecting…", "Connexion…"), 20f, Ui.ink, true))
            card.addView(Ui.text(ctx, tr("This phone is contacting the management server.", "Ce téléphone contacte le serveur de gestion."), 14f, Ui.muted)
                .apply { setPadding(0, dp(4), 0, dp(10)) })
            if (p.serverUrl.isNotEmpty()) card.addView(Ui.text(ctx, p.serverUrl, 13f, Ui.muted))
        } else {
            card.addView(Ui.text(ctx, tr("Set up this phone", "Configurer ce téléphone"), 20f, Ui.ink, true))
            card.addView(Ui.text(ctx, tr(
                "Enter the enrollment code shown in the dashboard (Add phones → Code).",
                "Saisissez le code d'inscription affiché dans le tableau de bord (Ajouter des téléphones → Code)."
            ), 14f, Ui.muted).apply { setPadding(0, dp(4), 0, dp(14)) })
        }
        if (p.lastError.isNotEmpty()) {
            card.addView(Ui.text(ctx, p.lastError, 13f, Ui.bad).apply {
                background = Ui.round(ctx, Ui.badBg, 12)
                setPadding(dp(12), dp(10), dp(12), dp(10))
                layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
                    .apply { topMargin = dp(12) }
            })
        }
        if (p.hasEnrollConfig) {
            card.addView(Ui.gap(ctx, 14))
            card.addView(Ui.primaryButton(ctx, tr("Try again now", "Réessayer maintenant")) { AgentService.retryNow(this) })
        } else {
            val url = field("https://…", InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS,
                p.serverUrl.ifEmpty { Provision.DEFAULT_SERVER })
            // No autocorrect / suggestions: the code must reach the server exactly as typed.
            val token = field(tr("Enrollment code", "Code d'inscription") + "  (ABCDE-FGHJK)",
                InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS or
                    InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS or InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD)
            card.addView(Ui.text(ctx, tr("Server", "Serveur"), 12f, Ui.muted))
            card.addView(url)
            card.addView(Ui.gap(ctx, 12))
            card.addView(Ui.text(ctx, tr("Code", "Code"), 12f, Ui.muted))
            card.addView(token)
            card.addView(Ui.gap(ctx, 16))
            card.addView(Ui.primaryButton(ctx, tr("Enroll", "Inscrire")) {
                val address = url.text.toString().trim()
                if (!address.startsWith("https://")) {
                    Toast.makeText(this, tr("The server address must start with https://", "L'adresse du serveur doit commencer par https://"), Toast.LENGTH_LONG).show()
                } else {
                    p.serverUrl = address
                    p.enrollToken = token.text.toString().trim()
                    AgentService.start(this)
                    render()
                }
            })
        }
        return ScrollView(ctx).apply {
            addView(card, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
                .apply { setMargins(dp(16), dp(18), dp(16), dp(8)) })
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f)
        }
    }

    // ---------- Sheets ----------

    private fun showSheet(title: String, build: (Dialog, LinearLayout) -> Unit) {
        dialogOpen = true
        val (dlg, col) = Ui.sheet(this, title) { dialogOpen = false }
        build(dlg, col)
        dlg.show()
    }

    private fun infoRow(k: String, v: String): View = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        setPadding(0, dp(7), 0, dp(7))
        addView(Ui.text(this@MainActivity, k, 14f, Ui.muted), LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        addView(Ui.text(this@MainActivity, v, 14f, Ui.ink, true).apply { gravity = Gravity.END },
            LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1.3f))
    }

    private fun slider(label: String, max: Int, value: Int, onChange: (Int) -> Unit): View = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(0, dp(10), 0, 0)
        addView(Ui.text(this@MainActivity, label, 13f, Ui.muted))
        addView(SeekBar(this@MainActivity).apply {
            this.max = max
            progress = value
            progressTintList = ColorStateList.valueOf(Ui.navy)
            thumbTintList = ColorStateList.valueOf(Ui.navy)
            setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
                override fun onProgressChanged(s: SeekBar, v: Int, fromUser: Boolean) { if (fromUser) onChange(v) }
                override fun onStartTrackingTouch(s: SeekBar) {}
                override fun onStopTrackingTouch(s: SeekBar) {}
            })
        })
    }

    private fun actionRow(col: LinearLayout, label: String, primary: Boolean = false, onClick: () -> Unit) {
        col.addView(Ui.gap(this, 8))
        col.addView(if (primary) Ui.primaryButton(this, label, onClick) else Ui.secondaryButton(this, label, onClick))
    }

    /** Système / Français / English in one row; the chosen one is filled navy. */
    private fun languageRow(dlg: Dialog): View {
        val p = Prefs(this)
        val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; setPadding(0, dp(8), 0, 0) }
        listOf("" to tr("System", "Système"), "fr" to "Français", "en" to "English").forEach { (code, label) ->
            val selected = p.lang == code
            val onClick = {
                p.lang = code
                Ui.lang = code
                dlg.dismiss()
                render()
                settingsDialog()
            }
            val b = if (selected) Ui.primaryButton(this, label, onClick) else Ui.secondaryButton(this, label, onClick)
            b.textSize = 14f
            b.setPadding(dp(6), dp(10), dp(6), dp(10))
            row.addView(b, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { setMargins(dp(3), 0, dp(3), 0) })
        }
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(0, dp(10), 0, 0)
            addView(Ui.text(this@MainActivity, tr("Language", "Langue"), 13f, Ui.muted))
            addView(row)
        }
    }

    // ---------- Settings (everyone) ----------

    private fun settingsDialog() {
        val p = Prefs(this)
        val audio = getSystemService(AudioManager::class.java)
        showSheet(tr("Settings", "Réglages")) { dlg, col ->
            col.addView(Ui.sectionTitle(this, tr("This phone", "Ce téléphone")))
            col.addView(infoRow(tr("App version", "Version"), version()))
            col.addView(infoRow(tr("Device", "Appareil"), p.deviceName.ifEmpty { tr("not enrolled", "non inscrit") }))
            if (p.driverName.isNotEmpty()) col.addView(infoRow(tr("Driver", "Chauffeur"), p.driverName))
            if (p.vehicle.isNotEmpty()) col.addView(infoRow(tr("Vehicle", "Véhicule"), p.vehicle))
            col.addView(infoRow(tr("Management", "Gestion"),
                if (Policy.isOwner(this)) tr("Managed", "Géré") else tr("Not managed", "Non géré")))
            val offered = p.updateInfo.takeIf { it.isNotEmpty() }?.let { runCatching { org.json.JSONObject(it) }.getOrNull() }
            val mine = runCatching { packageManager.getPackageInfo(packageName, 0).longVersionCode }.getOrDefault(0L)
            if (offered != null && offered.optLong("versionCode", 0L) > mine) {
                actionRow(col, tr("Update to ${offered.optString("versionName")} now", "Mettre à jour vers ${offered.optString("versionName")}"), primary = true) {
                    dlg.dismiss(); AgentService.updateNow(this)
                    Toast.makeText(this, tr("Updating… the app restarts by itself.", "Mise à jour… l'application redémarre toute seule."), Toast.LENGTH_LONG).show()
                }
            } else if (p.enrolled) {
                actionRow(col, tr("Check for updates", "Rechercher une mise à jour")) {
                    dlg.dismiss(); AgentService.updateNow(this)
                    Toast.makeText(this, tr("Checking with the dashboard…", "Vérification auprès du tableau de bord…"), Toast.LENGTH_SHORT).show()
                }
            }
            if (p.lastError.startsWith("install ")) {
                val blocked = p.lastError.contains("VERIFICATION_FAILURE") || p.lastError.contains("Install not allowed")
                val text = if (blocked) tr("Update blocked by Samsung Auto Blocker. Switch it off: Settings › Security and privacy › Auto Blocker, then try again.",
                    "Mise à jour bloquée par Auto Blocker (Samsung). Désactivez-le : Paramètres › Sécurité et confidentialité › Auto Blocker, puis réessayez.") else p.lastError
                col.addView(Ui.text(this, text, 12f, Ui.muted).apply { setPadding(0, dp(4), 0, dp(4)) })
            }
            col.addView(infoRow(tr("Last check-in", "Dernière connexion"),
                if (p.lastCheckIn > 0) DateFormat.getTimeInstance(DateFormat.SHORT).format(Date(p.lastCheckIn)) else tr("never", "jamais")))
            col.addView(infoRow(tr("Network", "Réseau"), networkLabel()))
            col.addView(infoRow(tr("Data this month", "Données ce mois"),
                Ui.formatBytes(DeviceInfo.monthMobileBytes(p)) + (if (p.dataBudgetMb > 0) " / " + Ui.formatBytes(p.dataBudgetMb * 1024L * 1024L) else "")))

            col.addView(Ui.sectionTitle(this, tr("Adjust", "Régler")))
            if (p.driverWifi || !p.enrolled) {
                actionRow(col, tr("Wi-Fi networks", "Réseaux Wi-Fi")) { dlg.dismiss(); openWifiPanel() }
            }
            col.addView(slider(tr("Volume", "Volume"), audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC),
                audio.getStreamVolume(AudioManager.STREAM_MUSIC)) { v -> runCatching { audio.setStreamVolume(AudioManager.STREAM_MUSIC, v, 0) } })
            // System brightness (device owner), so it holds in the other apps too; auto-brightness is switched off.
            col.addView(slider(tr("Brightness", "Luminosité"), 100, Policy.brightnessPercent(this)) { v ->
                Policy.setBrightness(this, v, this)
            })
            col.addView(languageRow(dlg))
            col.addView(Ui.gap(this, 6))
            if (p.enrolled) {
                actionRow(col, tr("Report a problem", "Signaler un problème")) { dlg.dismiss(); reportDialog() }
            }
            if (p.pinHash.isNotEmpty()) {   // only when the dashboard enabled an exit PIN
                actionRow(col, tr("Administrator…", "Administrateur…")) { dlg.dismiss(); askPin { adminMenu() } }
            } else {
                col.addView(Ui.text(this, tr("This phone is managed from the dashboard.", "Ce téléphone est géré depuis le tableau de bord."), 12f, Ui.muted)
                    .apply { setPadding(0, dp(12), 0, 0) })
            }
            actionRow(col, tr("Close", "Fermer"), primary = true) { dlg.dismiss() }
        }
    }

    /** Free-text problem report (300 chars) sent to the dashboard as an alert. */
    private fun reportDialog() {
        val p = Prefs(this)
        showSheet(tr("Report a problem", "Signaler un problème")) { dlg, col ->
            col.addView(Ui.text(this, tr("Describe what is wrong; the dispatch team will see it in the dashboard.",
                "Décrivez le problème ; l'équipe de régulation le verra dans le tableau de bord."), 14f, Ui.muted)
                .apply { setPadding(0, 0, 0, dp(12)) })
            val input = field(tr("For example: the app closes by itself", "Par exemple : l'application se ferme toute seule"),
                InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES).apply {
                minLines = 4
                maxLines = 8
                gravity = Gravity.TOP or Gravity.START
                filters = arrayOf<InputFilter>(InputFilter.LengthFilter(300))
            }
            col.addView(input)
            col.addView(Ui.gap(this, 14))
            val send = Ui.primaryButton(this, tr("Send", "Envoyer")) {}
            send.setOnClickListener {
                val text = input.text.toString().trim()
                if (text.isEmpty()) {
                    Toast.makeText(this, tr("Please write a few words first", "Écrivez d'abord quelques mots"), Toast.LENGTH_SHORT).show()
                    return@setOnClickListener
                }
                send.isEnabled = false
                send.alpha = 0.6f
                thread(name = "kiosk-report", isDaemon = true) {
                    val result = runCatching { Api.report(p, "problem", text) }
                    runOnUiThread {
                        if (isFinishing || isDestroyed) return@runOnUiThread
                        result.onSuccess {
                            Toast.makeText(this, tr("Thank you, your report was sent", "Merci, votre signalement a été envoyé"), Toast.LENGTH_LONG).show()
                            dlg.dismiss()
                        }.onFailure { e ->
                            send.isEnabled = true
                            send.alpha = 1f
                            Toast.makeText(this, tr("Could not send: ${e.message}", "Envoi impossible : ${e.message}"), Toast.LENGTH_LONG).show()
                        }
                    }
                }
            }
            col.addView(send)
            actionRow(col, tr("Cancel", "Annuler")) { dlg.dismiss() }
        }
    }

    // ---------- Administrator (PIN) ----------

    /** Asks for the admin PIN. Five wrong attempts lock the prompt for a growing time. */
    private fun askPin(then: () -> Unit) {
        val p = Prefs(this)
        if (p.pinHash.isEmpty()) {
            Toast.makeText(this, tr("No admin PIN has been set in the dashboard", "Aucun code administrateur n'est défini dans le tableau de bord"), Toast.LENGTH_LONG).show()
            return
        }
        val wait = p.pinLockUntil - System.currentTimeMillis()
        if (wait > 0) {
            Toast.makeText(this, tr("Too many wrong attempts. Try again in ${(wait / 1000) + 1} s", "Trop d'essais. Réessayez dans ${(wait / 1000) + 1} s"), Toast.LENGTH_LONG).show()
            return
        }
        showSheet(tr("Administrator", "Administrateur")) { dlg, col ->
            val input = field(tr("Admin PIN", "Code administrateur"), InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD)
            col.addView(input)
            col.addView(Ui.gap(this, 14))
            col.addView(Ui.primaryButton(this, "OK") {
                if (Policy.checkPin(this, input.text.toString())) {
                    p.pinFails = 0
                    dlg.dismiss()
                    then()
                } else {
                    p.pinFails += 1
                    if (p.pinFails >= 5) {
                        val seconds = minOf(1800L, 60L shl (p.pinFails - 5).coerceAtMost(5))
                        p.pinLockUntil = System.currentTimeMillis() + seconds * 1000
                    }
                    Toast.makeText(this, tr("Wrong PIN", "Code incorrect"), Toast.LENGTH_SHORT).show()
                    input.setText("")
                }
            })
            actionRow(col, tr("Cancel", "Annuler")) { dlg.dismiss() }
        }
    }

    private fun adminMenu() {
        val p = Prefs(this)
        showSheet(tr("Administrator", "Administrateur")) { dlg, col ->
            if (p.lostMode) {
                actionRow(col, tr("Leave lost mode", "Quitter le mode perdu")) {
                    dlg.dismiss()
                    p.lostMode = false; p.lostMessage = ""; p.lostPhone = ""
                    AgentService.stopRing()
                    AgentService.retryNow(this)
                    render()
                }
            }
            actionRow(col, tr("Wi-Fi networks", "Réseaux Wi-Fi")) { dlg.dismiss(); openWifiPanel() }
            val usage = DeviceInfo.hasUsageAccess(this)
            actionRow(col, tr("Grant usage access", "Autoriser l'accès aux statistiques") + if (usage) " ✓" else "") {
                dlg.dismiss(); openUsageAccess()
            }
            actionRow(col, tr("Check for updates now", "Rechercher des mises à jour")) {
                AgentService.retryNow(this)
                Toast.makeText(this, tr("Checking with the server…", "Vérification auprès du serveur…"), Toast.LENGTH_SHORT).show()
            }
            actionRow(col, tr("Diagnostics", "Diagnostic")) { dlg.dismiss(); diagnostics() }
            if (p.released) {
                actionRow(col, tr("Re-lock kiosk", "Reverrouiller le kiosque")) {
                    dlg.dismiss(); Policy.relock(this); render(); ensureLockTask()
                }
                actionRow(col, tr("Open Android settings", "Ouvrir les réglages Android")) {
                    dlg.dismiss()
                    startActivity(Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                }
            } else {
                actionRow(col, tr("Release device (exit kiosk)", "Libérer l'appareil (quitter le kiosque)")) {
                    dlg.dismiss()
                    Policy.release(this)
                    runCatching { stopLockTask() }
                    startActivity(Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                }
            }
            actionRow(col, tr("Close", "Fermer"), primary = true) { dlg.dismiss() }
        }
    }

    /** Opens [intent] after temporarily allowing [packages] in the lock task; the lockdown is re-applied on resume. */
    private fun openTemporarily(intent: Intent, vararg packages: String, onFail: () -> Unit) {
        Policy.allowTemporarily(this, *packages)
        tempAllowed = true
        runCatching {
            startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }.onFailure {
            tempAllowed = false
            Policy.apply(this)
            onFail()
        }
    }

    /** Lets the system Wi-Fi panel open (the Settings app is otherwise blocked) and re-locks when we come back. */
    private fun openWifiPanel() {
        // The quick panel lives in different packages depending on the brand (Samsung ships its own Settings), so the
        // intent is resolved first and whichever package answers is allowed in the lock task for the time being.
        val candidates = listOf(Intent(Settings.Panel.ACTION_INTERNET_CONNECTIVITY), Intent(Settings.Panel.ACTION_WIFI), Intent(Settings.ACTION_WIFI_SETTINGS))
        val intent = candidates.firstOrNull { it.resolveActivity(packageManager) != null } ?: candidates.last()
        val pkgs = (listOfNotNull(intent.resolveActivity(packageManager)?.packageName) +
            listOf("com.android.settings", "com.samsung.android.app.settings", "com.android.settings.intelligence")).distinct().toTypedArray()
        openTemporarily(intent, *pkgs) {
            Toast.makeText(this, tr("Could not open Wi-Fi settings", "Impossible d'ouvrir les réglages Wi-Fi"), Toast.LENGTH_LONG).show()
        }
    }

    /** Usage-access screen (app activity statistics); only the administrator gets here. */
    private fun openUsageAccess() {
        openTemporarily(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS), "com.android.settings") {
            Toast.makeText(this, tr("Could not open usage access settings", "Impossible d'ouvrir les réglages d'accès aux statistiques"), Toast.LENGTH_LONG).show()
        }
    }

    /** Dials [number] through the default dialer, temporarily allowed in the lock task (dispatch / lost-mode owner). */
    private fun dial(number: String) {
        val clean = number.filter { it.isDigit() || it == '+' || it == '*' || it == '#' }
        if (clean.isEmpty()) return
        val dialer = Policy.defaultDialer(this)
        // The in-call screen is a separate package on Samsung (and on some AOSP builds), so allow those too.
        val pkgs = listOf(dialer, "com.samsung.android.dialer", "com.samsung.android.incallui", "com.android.dialer", "com.android.incallui")
            .filter { it.isNotBlank() }.distinct().toTypedArray()
        openTemporarily(Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + Uri.encode(clean))), *pkgs) {
            Toast.makeText(this, tr("Could not open the dialer", "Impossible d'ouvrir le composeur"), Toast.LENGTH_LONG).show()
        }
    }

    private fun diagnostics() {
        val p = Prefs(this)
        val s = DeviceInfo.status(this)
        showSheet(tr("Diagnostics", "Diagnostic")) { dlg, col ->
            col.addView(infoRow(tr("Version", "Version"), version()))
            col.addView(infoRow(tr("Server", "Serveur"), p.serverUrl.ifEmpty { "-" }))
            col.addView(infoRow(tr("Check-in path", "Canal de connexion"), if (p.hasRest) "REST" else "API"))
            col.addView(infoRow(tr("Device owner", "Propriétaire de l'appareil"), Policy.isOwner(this).toString()))
            col.addView(infoRow(tr("Push connected", "Canal temps réel"), if (PushClient.connected) tr("yes", "oui") else tr("no", "non")))
            col.addView(infoRow(tr("Battery", "Batterie"), "${s.optInt("battery")}%"))
            col.addView(infoRow(tr("Network", "Réseau"), s.optString("network")))
            col.addView(infoRow(tr("Signal", "Signal"), s.optInt("signal", -1).let { if (it < 0) "?" else "$it/4" }))
            col.addView(infoRow("IMEI", s.optString("imei").ifEmpty { "-" }))
            col.addView(infoRow(tr("SIM operator", "Opérateur SIM"), s.optString("simOperator").ifEmpty { "-" }))
            col.addView(infoRow(tr("Phone number", "Numéro"), s.optString("phoneNumber").ifEmpty { "-" }))
            col.addView(infoRow(tr("Security patch", "Correctif de sécurité"), s.optString("securityPatch").ifEmpty { "-" }))
            col.addView(infoRow(tr("Usage access", "Accès aux statistiques"), if (s.optBoolean("usageAccess")) tr("granted", "accordé") else tr("not granted", "non accordé")))
            col.addView(infoRow(tr("Free storage", "Stockage libre"), "${s.optLong("freeStorageMb")} MB"))
            col.addView(infoRow(tr("Last location", "Dernière position"), lastLocationLabel(p)))
            col.addView(infoRow(tr("Last problem", "Dernier problème"), p.lastError.ifEmpty { tr("none", "aucun") }))
            col.addView(infoRow(tr("Last crash", "Dernier plantage"), p.lastCrash.ifEmpty { tr("none", "aucun") }))
            actionRow(col, tr("Close", "Fermer"), primary = true) { dlg.dismiss() }
        }
    }

    private fun lastLocationLabel(p: Prefs): String {
        if (p.lastLocation.isEmpty()) return tr("none", "aucune")
        return runCatching {
            val o = org.json.JSONObject(p.lastLocation)
            val at = o.optLong("at", 0L)
            val time = if (at > 0) " · " + DateFormat.getTimeInstance(DateFormat.SHORT).format(Date(at)) else ""
            String.format(java.util.Locale.US, "%.5f, %.5f", o.optDouble("lat"), o.optDouble("lon")) + time
        }.getOrDefault("-")
    }
}
