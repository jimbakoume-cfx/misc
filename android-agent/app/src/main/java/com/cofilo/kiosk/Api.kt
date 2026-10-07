package com.cofilo.kiosk

import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/** Minimal JSON-over-HTTP client (no third-party dependencies). */
object Api {
    class ApiException(val code: Int, message: String) : Exception(message)

    fun post(base: String, path: String, body: JSONObject, deviceToken: String? = null): JSONObject {
        val conn = URL(base.trimEnd('/') + path).openConnection() as HttpURLConnection
        try {
            conn.requestMethod = "POST"
            conn.connectTimeout = 15_000
            conn.readTimeout = 30_000
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "application/json")
            if (deviceToken != null) conn.setRequestProperty("Authorization", "Bearer $deviceToken")
            conn.outputStream.use { it.write(body.toString().toByteArray()) }
            val code = conn.responseCode
            val text = (if (code in 200..299) conn.inputStream else conn.errorStream)
                ?.bufferedReader()?.use { it.readText() } ?: ""
            if (code !in 200..299) {
                val msg = runCatching { JSONObject(text).optString("error", "") }.getOrDefault("")
                throw ApiException(code, msg.ifEmpty { text.take(120).ifEmpty { "HTTP $code" } })
            }
            return if (text.isBlank()) JSONObject() else JSONObject(text)
        } finally {
            conn.disconnect()
        }
    }

    /** Downloads [url] to [dest] and returns its lowercase hex SHA-256. */
    fun download(url: String, dest: File): String {
        val conn = URL(url).openConnection() as HttpURLConnection
        try {
            conn.connectTimeout = 15_000
            conn.readTimeout = 60_000
            if (conn.responseCode !in 200..299) throw ApiException(conn.responseCode, "download failed")
            val md = MessageDigest.getInstance("SHA-256")
            conn.inputStream.use { input ->
                dest.outputStream().use { out ->
                    val buf = ByteArray(64 * 1024)
                    while (true) {
                        val n = input.read(buf)
                        if (n < 0) break
                        md.update(buf, 0, n)
                        out.write(buf, 0, n)
                    }
                }
            }
            return md.digest().joinToString("") { "%02x".format(it) }
        } finally {
            conn.disconnect()
        }
    }
}
