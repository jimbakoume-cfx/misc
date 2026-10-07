package com.cofilo.kiosk

import android.content.Context
import android.os.Build
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

/** Reports setup steps to the dashboard's Activity log so a phone that stalls during QR setup can be traced. */
object Beacon {
    private const val DEFAULT_SERVER = "https://confiance-kiosk.netlify.app"

    fun send(ctx: Context, step: String, detail: String = "") {
        val app = ctx.applicationContext
        thread(name = "kiosk-beacon", isDaemon = true) {
            runCatching {
                val base = Prefs(app).serverUrl.ifEmpty { DEFAULT_SERVER }.trimEnd('/')
                if (!base.startsWith("https://")) return@runCatching
                val conn = URL("$base/api/setup-beacon").openConnection() as HttpURLConnection
                try {
                    conn.requestMethod = "POST"
                    conn.connectTimeout = 5000
                    conn.readTimeout = 5000
                    conn.doOutput = true
                    conn.setRequestProperty("Content-Type", "application/json")
                    val body = JSONObject().put("step", step).put("detail", detail)
                        .put("model", "${Build.MANUFACTURER} ${Build.MODEL}")
                    conn.outputStream.use { it.write(body.toString().toByteArray()) }
                    conn.responseCode
                } finally { conn.disconnect() }
            }
        }
    }
}
