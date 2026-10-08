package com.cofilo.kiosk

import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/**
 * Minimal JSON-over-HTTP client (no third-party dependencies).
 * Two server shapes: the function API at `serverUrl` (Bearer device token) and, since 1.4.0, the Supabase REST
 * RPCs at `rest.url` (`apikey` header, token inside the body). [rpc] is the REST form; callers fall back to
 * [post] on `serverUrl` when the REST path is unavailable.
 */
object Api {
    class ApiException(val code: Int, message: String) : Exception(message)

    fun post(
        base: String, path: String, body: JSONObject, deviceToken: String? = null,
        headers: Map<String, String> = emptyMap()
    ): JSONObject {
        if (!base.startsWith("https://")) throw ApiException(0, "Server address must start with https://")
        val conn = URL(base.trimEnd('/') + path).openConnection() as HttpURLConnection
        try {
            conn.requestMethod = "POST"
            conn.connectTimeout = 15_000
            conn.readTimeout = 30_000
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "application/json")
            conn.setRequestProperty("Accept", "application/json")
            if (deviceToken != null) conn.setRequestProperty("Authorization", "Bearer $deviceToken")
            headers.forEach { (k, v) -> conn.setRequestProperty(k, v) }
            conn.outputStream.use { it.write(body.toString().toByteArray()) }
            val code = conn.responseCode
            val text = (if (code in 200..299) conn.inputStream else conn.errorStream)
                ?.bufferedReader()?.use { it.readText() } ?: ""
            if (code !in 200..299) {
                // Our API answers {error}, PostgREST answers {message, details, hint}.
                val msg = runCatching {
                    val o = JSONObject(text)
                    o.optString("error", "").ifEmpty { o.optString("message", "") }
                }.getOrDefault("")
                throw ApiException(code, msg.ifEmpty { text.take(120).ifEmpty { "HTTP $code" } })
            }
            return if (text.isBlank()) JSONObject() else JSONObject(text)
        } finally {
            conn.disconnect()
        }
    }

    /** `POST {restUrl}/rpc/{fn}` with the Supabase publishable key. PostgREST returns the function's jsonb as the body. */
    fun rpc(restUrl: String, fn: String, body: JSONObject, apiKey: String): JSONObject =
        post(restUrl, "/rpc/$fn", body, headers = mapOf("apikey" to apiKey))

    /**
     * True when a REST failure should make the caller retry on `serverUrl`: an unreachable/misconfigured REST
     * endpoint (401/403/404, 5xx, no HTTP code) or any transport/parse error. Other 4xx are real answers.
     */
    fun shouldFallBack(t: Throwable): Boolean =
        t !is ApiException || t.code == 0 || t.code == 401 || t.code == 403 || t.code == 404 || t.code >= 500

    /** Driver's "Report a problem": REST first, then the function API. */
    fun report(prefs: Prefs, kind: String, text: String) {
        val body = JSONObject().put("kind", kind).put("text", text.take(300))
        if (prefs.hasRest) {
            try {
                rpc(prefs.restUrl, "kiosk_report", JSONObject(body.toString()).put("token", prefs.deviceToken), prefs.restKey)
                return
            } catch (t: Throwable) {
                if (!shouldFallBack(t)) throw t
            }
        }
        post(prefs.serverUrl, "/api/device/report", body, prefs.deviceToken)
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
