package com.cofilo.kiosk

import android.app.Dialog
import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.InsetDrawable
import android.graphics.drawable.RippleDrawable
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.Window
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import java.util.Locale

/**
 * Design system of the kiosk app, in code (no resources, no AndroidX):
 *  - colours: Confiance navy/blue brand, neutral surfaces, semantic good/warn/bad pairs;
 *  - spacing on a 4 dp grid (s1 = 4 … s6 = 32), radii r1 = 12, r2 = 16, r3 = 24;
 *  - type: title 22/medium, body 15, label 13 muted, caption 12;
 *  - surfaces: cards on a tinted background, one bottom sheet for every secondary screen;
 *  - safe areas: the kiosk screen and the sheets pad themselves with the system-bar insets.
 */
object Ui {
    val navy = Color.parseColor("#081A51")
    val navyDeep = Color.parseColor("#050F33")
    val blue = Color.parseColor("#1E4FD8")
    val blueSoft = Color.parseColor("#E8EEFF")
    val bg = Color.parseColor("#F3F5FA")
    val surface2 = Color.parseColor("#EEF2FA")
    val handle = Color.parseColor("#CBD5E1")
    const val s1 = 4; const val s2 = 8; const val s3 = 12; const val s4 = 16; const val s5 = 24; const val s6 = 32
    const val r1 = 12; const val r2 = 16; const val r3 = 24
    /** Bottom inset (gesture / navigation bar) the activity measured; sheets pad their footer with it. */
    @Volatile var insetBottom = 0
    val card = Color.WHITE
    val ink = Color.parseColor("#0F172A")
    val muted = Color.parseColor("#64748B")
    val line = Color.parseColor("#E2E8F0")
    val good = Color.parseColor("#15803D")
    val goodBg = Color.parseColor("#DCFCE7")
    val warn = Color.parseColor("#B45309")
    val warnBg = Color.parseColor("#FEF3C7")
    val bad = Color.parseColor("#B91C1C")
    val badBg = Color.parseColor("#FEE2E2")

    /** In-app language override ("fr" / "en"); "" follows the device locale. Set from Prefs at startup and on change. */
    @Volatile var lang: String = ""

    val french: Boolean get() = when (lang) {
        "fr" -> true
        "en" -> false
        else -> Locale.getDefault().language == "fr"
    }

    /** English / French text by the override or the device language. */
    fun tr(en: String, fr: String) = if (french) fr else en

    /** "1,2 Go" / "1.2 GB" style, by language. */
    fun formatBytes(bytes: Long): String {
        val b = bytes.coerceAtLeast(0L).toDouble()
        val fr = french
        val (value, unit) = when {
            b >= 1024.0 * 1024 * 1024 -> b / (1024.0 * 1024 * 1024) to (if (fr) "Go" else "GB")
            b >= 1024.0 * 1024 -> b / (1024.0 * 1024) to (if (fr) "Mo" else "MB")
            else -> b / 1024.0 to (if (fr) "Ko" else "KB")
        }
        val s = if (value >= 100) String.format(Locale.US, "%.0f", value) else String.format(Locale.US, "%.1f", value)
        return (if (fr) s.replace('.', ',') else s) + " " + unit
    }

    fun dp(ctx: Context, v: Int) = (v * ctx.resources.displayMetrics.density).toInt()
    fun dpf(ctx: Context, v: Int) = v * ctx.resources.displayMetrics.density

    fun round(ctx: Context, color: Int, radius: Int, stroke: Int = 0): GradientDrawable = GradientDrawable().apply {
        setColor(color)
        cornerRadius = dpf(ctx, radius)
        if (stroke != 0) setStroke(dp(ctx, 1), stroke)
    }

    /** Rounded fill with a touch ripple. */
    fun tappable(ctx: Context, fill: Int, radius: Int, stroke: Int = 0, ripple: Int = Color.parseColor("#22081A51")) =
        RippleDrawable(ColorStateList.valueOf(ripple), round(ctx, fill, radius, stroke), round(ctx, Color.WHITE, radius))

    fun text(ctx: Context, s: CharSequence, size: Float, color: Int = ink, bold: Boolean = false) = TextView(ctx).apply {
        text = s
        textSize = size
        setTextColor(color)
        if (bold) typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
    }

    fun chip(ctx: Context, s: String, fg: Int, bgc: Int) = TextView(ctx).apply {
        text = s
        textSize = 12f
        setTextColor(fg)
        typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
        background = round(ctx, bgc, 20)
        setPadding(dp(ctx, 10), dp(ctx, 4), dp(ctx, 10), dp(ctx, 4))
    }

    fun primaryButton(ctx: Context, s: String, onClick: () -> Unit) = TextView(ctx).apply {
        text = s
        textSize = 15f
        gravity = Gravity.CENTER
        setTextColor(Color.WHITE)
        typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
        background = tappable(ctx, navy, 14, ripple = Color.parseColor("#55FFFFFF"))
        minHeight = dp(ctx, 48)
        setPadding(dp(ctx, 20), dp(ctx, 12), dp(ctx, 20), dp(ctx, 12))
        isClickable = true; isFocusable = true
        setOnClickListener { onClick() }
    }

    fun secondaryButton(ctx: Context, s: String, onClick: () -> Unit) = TextView(ctx).apply {
        text = s
        textSize = 15f
        gravity = Gravity.CENTER
        setTextColor(navy)
        typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
        background = tappable(ctx, Color.WHITE, 14, stroke = line)
        minHeight = dp(ctx, 48)
        setPadding(dp(ctx, 20), dp(ctx, 12), dp(ctx, 20), dp(ctx, 12))
        isClickable = true; isFocusable = true
        setOnClickListener { onClick() }
    }

    fun gap(ctx: Context, h: Int) = View(ctx).apply { layoutParams = LinearLayout.LayoutParams(1, dp(ctx, h)) }

    /** White rounded card that holds a vertical stack. */
    fun cardBox(ctx: Context, pad: Int = 18) = LinearLayout(ctx).apply {
        orientation = LinearLayout.VERTICAL
        background = round(ctx, card, 20, line)
        setPadding(dp(ctx, pad), dp(ctx, pad), dp(ctx, pad), dp(ctx, pad))
        elevation = dpf(ctx, 1)
    }

    /** Small upper-case label that opens a group of rows in a sheet. */
    fun sectionTitle(ctx: Context, s: String) = TextView(ctx).apply {
        text = s.uppercase(Locale.getDefault())
        textSize = 12f
        setTextColor(muted)
        letterSpacing = 0.08f
        typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
        setPadding(0, dp(ctx, 16), 0, dp(ctx, 4))
    }

    /**
     * Bottom sheet: full width, rounded top corners, grab handle, title, scrollable content capped at 86% of the
     * screen, footer padded with the navigation-bar inset, slides up. Returns the dialog and the column to fill.
     */
    fun sheet(ctx: Context, title: String, onDismiss: () -> Unit = {}): Pair<Dialog, LinearLayout> {
        val dlg = Dialog(ctx)
        dlg.requestWindowFeature(Window.FEATURE_NO_TITLE)
        val metrics = ctx.resources.displayMetrics
        val maxH = (metrics.heightPixels * 0.86f).toInt()
        val sheetBg = GradientDrawable().apply {
            setColor(Color.WHITE)
            val r = dpf(ctx, 28)
            cornerRadii = floatArrayOf(r, r, r, r, 0f, 0f, 0f, 0f)
        }
        val outer = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            background = sheetBg
            setPadding(0, dp(ctx, s2), 0, dp(ctx, s4) + insetBottom)
        }
        // grab handle
        outer.addView(View(ctx).apply { background = round(ctx, handle, 4) },
            LinearLayout.LayoutParams(dp(ctx, 40), dp(ctx, 4)).apply { gravity = Gravity.CENTER_HORIZONTAL; bottomMargin = dp(ctx, s3) })
        outer.addView(text(ctx, title, 22f, ink, true).apply { setPadding(dp(ctx, s5), 0, dp(ctx, s5), dp(ctx, s2)) })
        val col = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(ctx, s5), 0, dp(ctx, s5), dp(ctx, s2))
        }
        val scroll = object : ScrollView(ctx) {
            override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
                super.onMeasure(widthMeasureSpec, android.view.View.MeasureSpec.makeMeasureSpec(maxH - dp(ctx, 96) - insetBottom, android.view.View.MeasureSpec.AT_MOST))
            }
        }.apply {
            overScrollMode = View.OVER_SCROLL_NEVER
            isVerticalScrollBarEnabled = false
            addView(col, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        }
        outer.addView(scroll, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        dlg.setContentView(outer)
        dlg.window?.apply {
            setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
            setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
            setGravity(Gravity.BOTTOM)
            setDimAmount(0.45f)
            attributes = attributes.apply { windowAnimations = android.R.style.Animation_InputMethod }
            if (android.os.Build.VERSION.SDK_INT >= 30) {
                setDecorFitsSystemWindows(false)
                navigationBarColor = Color.TRANSPARENT
            }
        }
        dlg.setOnDismissListener { onDismiss() }
        return dlg to col
    }
}
