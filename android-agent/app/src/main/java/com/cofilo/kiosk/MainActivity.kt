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
import android.os.Bundle
import android.os.SystemClock
import android.provider.Settings
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
            setBackgroundColor(Ui.bg)
        }
        setContentView(root)
        window.statusBarColor = Ui.navy
        window.navigationBarColor = Ui.bg
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

    private fun dp(v: Int) = Ui.dp(this, v)
    private fun tr(en: String, fr: String) = Ui.tr(en, fr)

    private fun version(): String = runCatching {
        val i = packageManager.getPackageInfo(packageName, 0)
        "${i.versionName} (${i.longVersionCode})"
    }.getOrDefault("?")

    private fun render() {
        root.removeAllViews()
        val p = Prefs(this)
        root.addView(header(p))
        if (p.enrolled && !Policy.isOwner(this)) root.addView(unmanagedBanner())
        val body: View = when {
            !p.enrolled -> enrollView(p)
            p.allowedApps.isEmpty() -> emptyState(
                tr("No apps yet", "Aucune application"),
                tr("Your administrator has not assigned any apps to this phone.", "Votre administrateur n'a pas encore attribué d'applications à ce téléphone.")
            )
            else -> appGrid(p)
        }
        root.addView(body)
        root.addView(footer())
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
        val box = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            background = GradientDrawable().apply {
                setColor(Ui.navy)
                cornerRadii = floatArrayOf(0f, 0f, 0f, 0f, Ui.dpf(ctx, 28), Ui.dpf(ctx, 28), Ui.dpf(ctx, 28), Ui.dpf(ctx, 28))
            }
            setPadding(dp(22), dp(18), dp(22), dp(24))
        }
        val top = LinearLayout(ctx).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        top.addView(ImageView(ctx).apply {
            setImageResource(R.drawable.ic_logo_mark)
            setColorFilter(Color.WHITE)
        }, LinearLayout.LayoutParams(dp(30), dp(34)))
        top.addView(Ui.text(ctx, "CONFIANCE", 13f, Color.parseColor("#C9D3F5"), true).apply {
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
        box.addView(Ui.text(ctx, tr("Welcome", "Bienvenue"), 14f, Color.parseColor("#C9D3F5")).apply { setPadding(0, dp(22), 0, 0) })
        box.addView(Ui.text(ctx, if (p.deviceName.isNotEmpty()) p.deviceName else "Confiance Kiosk", 26f, Color.WHITE, true).apply {
            // Hidden shortcut to the administrator menu: tap the title 5 times quickly.
            setOnClickListener {
                val now = System.currentTimeMillis()
                adminTaps = if (now - lastTap < 2000) adminTaps + 1 else 1
                lastTap = now
                if (adminTaps >= 5) { adminTaps = 0; if (p.pinHash.isNotEmpty()) askPin { adminMenu() } }
            }
        })
        if (p.message.isNotBlank()) {
            box.addView(Ui.text(ctx, p.message, 14f, Color.parseColor("#FDE68A")).apply {
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

    /** Version label + settings button. Always visible so the installed version is easy to check. */
    private fun footer(): View {
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(22), dp(10), dp(16), dp(14))
        }
        row.addView(Ui.text(this, "Confiance Kiosk · v${version()}", 12f, Ui.muted),
            LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        row.addView(Ui.secondaryButton(this, tr("Settings", "Réglages")) { settingsDialog() }.apply {
            minHeight = dp(40); textSize = 14f
            setPadding(dp(18), dp(8), dp(18), dp(8))
        })
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

    private fun appGrid(p: Prefs): View {
        val columns = if (resources.displayMetrics.widthPixels / resources.displayMetrics.density > 600) 4 else 2
        val grid = GridLayout(this).apply {
            columnCount = columns
            setPadding(dp(12), dp(16), dp(12), dp(8))
        }
        val pm = packageManager
        p.allowedApps.forEach { (pkg, label) ->
            val launch = pm.getLaunchIntentForPackage(pkg)
            val tile = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER
                setPadding(dp(10), dp(20), dp(10), dp(18))
                background = Ui.tappable(this@MainActivity, Color.WHITE, 22, Ui.line)
                elevation = Ui.dpf(this@MainActivity, 1)
                alpha = if (launch == null) 0.5f else 1f
                isClickable = true; isFocusable = true
            }
            val icon = ImageView(this)
            runCatching { icon.setImageDrawable(pm.getApplicationIcon(pkg)) }
            tile.addView(icon, LinearLayout.LayoutParams(dp(64), dp(64)))
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

    // ---------- Settings (everyone) ----------

    private fun settingsDialog() {
        val p = Prefs(this)
        val audio = getSystemService(AudioManager::class.java)
        showSheet(tr("Settings", "Réglages")) { dlg, col ->
            col.addView(infoRow(tr("App version", "Version"), version()))
            col.addView(infoRow(tr("Device", "Appareil"), p.deviceName.ifEmpty { tr("not enrolled", "non inscrit") }))
            col.addView(infoRow(tr("Management", "Gestion"),
                if (Policy.isOwner(this)) tr("Managed", "Géré") else tr("Not managed", "Non géré")))
            col.addView(infoRow(tr("Last check-in", "Dernière connexion"),
                if (p.lastCheckIn > 0) DateFormat.getTimeInstance(DateFormat.SHORT).format(Date(p.lastCheckIn)) else tr("never", "jamais")))
            col.addView(infoRow(tr("Network", "Réseau"), DeviceInfo.status(this).optString("network", "none")))

            col.addView(slider(tr("Volume", "Volume"), audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC),
                audio.getStreamVolume(AudioManager.STREAM_MUSIC)) { v -> runCatching { audio.setStreamVolume(AudioManager.STREAM_MUSIC, v, 0) } })
            val cur = window.attributes.screenBrightness
            col.addView(slider(tr("Brightness", "Luminosité"), 100, if (cur < 0) 60 else (cur * 100).toInt()) { v ->
                val lp = window.attributes
                lp.screenBrightness = v.coerceAtLeast(5) / 100f
                window.attributes = lp
            })

            col.addView(Ui.gap(this, 6))
            actionRow(col, tr("Check for updates now", "Rechercher des mises à jour")) {
                AgentService.retryNow(this)
                Toast.makeText(this, tr("Checking with the server…", "Vérification auprès du serveur…"), Toast.LENGTH_SHORT).show()
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
            actionRow(col, tr("Wi-Fi networks", "Réseaux Wi-Fi")) { dlg.dismiss(); openWifiPanel() }
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
            Toast.makeText(this, tr("Could not open Wi-Fi settings", "Impossible d'ouvrir les réglages Wi-Fi"), Toast.LENGTH_LONG).show()
        }
    }

    private fun diagnostics() {
        val p = Prefs(this)
        val s = DeviceInfo.status(this)
        showSheet(tr("Diagnostics", "Diagnostic")) { dlg, col ->
            col.addView(infoRow(tr("Version", "Version"), version()))
            col.addView(infoRow(tr("Server", "Serveur"), p.serverUrl.ifEmpty { "-" }))
            col.addView(infoRow(tr("Device owner", "Propriétaire de l'appareil"), Policy.isOwner(this).toString()))
            col.addView(infoRow(tr("Battery", "Batterie"), "${s.optInt("battery")}%"))
            col.addView(infoRow(tr("Network", "Réseau"), s.optString("network")))
            col.addView(infoRow(tr("Free storage", "Stockage libre"), "${s.optLong("freeStorageMb")} MB"))
            col.addView(infoRow(tr("Last problem", "Dernier problème"), p.lastError.ifEmpty { tr("none", "aucun") }))
            col.addView(infoRow(tr("Last crash", "Dernier plantage"), p.lastCrash.ifEmpty { tr("none", "aucun") }))
            actionRow(col, tr("Close", "Fermer"), primary = true) { dlg.dismiss() }
        }
    }
}
