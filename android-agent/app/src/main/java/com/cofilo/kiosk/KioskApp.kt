package com.cofilo.kiosk

import android.app.Application
import java.io.PrintWriter
import java.io.StringWriter
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Records the last crash so it can be shown on the device and in the dashboard. */
class KioskApp : Application() {
    override fun onCreate() {
        super.onCreate()
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, error ->
            runCatching {
                val trace = StringWriter().also { error.printStackTrace(PrintWriter(it)) }.toString()
                    .lineSequence().take(8).joinToString("\n")
                val at = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(Date())
                Prefs(this).lastCrash = "$at [${thread.name}]\n$trace".take(900)
            }
            previous?.uncaughtException(thread, error)
        }
    }
}
