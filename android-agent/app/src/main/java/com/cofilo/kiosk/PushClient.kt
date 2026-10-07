package com.cofilo.kiosk

import android.util.Log
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit

/**
 * Keeps one live connection to Supabase Realtime and calls [onWake] whenever the dashboard pings this phone's private
 * channel. The ping carries no data: the phone then checks in over the normal authenticated API.
 * If the connection drops it reconnects with back-off; the normal check-in interval is the safety net.
 */
class PushClient(private val onWake: () -> Unit) {
    companion object {
        private const val TAG = "KioskPush"
        /** True while the channel is joined. Reported to the dashboard as "live". */
        @Volatile var connected = false
    }

    private val http = OkHttpClient.Builder().readTimeout(0, TimeUnit.MILLISECONDS).build()
    private val scheduler = Executors.newSingleThreadScheduledExecutor { r -> Thread(r, "kiosk-push").apply { isDaemon = true } }

    private var url = ""; private var key = ""; private var channel = ""
    private var socket: WebSocket? = null
    private var heartbeat: ScheduledFuture<*>? = null
    private var reconnect: ScheduledFuture<*>? = null
    private var backoffSec = 2L
    private var ref = 1
    private var lastReplyAt = 0L
    @Volatile private var generation = 0     // ignores callbacks from sockets we already replaced

    /** Starts, or restarts when the settings changed. Safe to call on every check-in. */
    @Synchronized fun configure(url: String, key: String, channel: String) {
        if (url == this.url && key == this.key && channel == this.channel && (socket != null || reconnect != null)) return
        this.url = url; this.key = key; this.channel = channel
        close()
        backoffSec = 2
        scheduler.execute { open() }
    }

    @Synchronized fun stop() {
        url = ""; key = ""; channel = ""
        close()
    }

    @Synchronized private fun close() {
        generation++
        connected = false
        heartbeat?.cancel(false); heartbeat = null
        reconnect?.cancel(false); reconnect = null
        runCatching { socket?.close(1000, "bye") }
        socket = null
    }

    @Synchronized private fun open() {
        if (url.isEmpty() || !url.startsWith("https://")) return
        val gen = ++generation
        val wsUrl = url.trimEnd('/').replaceFirst("https://", "wss://") +
            "/realtime/v1/websocket?apikey=" + java.net.URLEncoder.encode(key, "UTF-8") + "&vsn=1.0.0"
        val topic = "realtime:$channel"
        socket = http.newWebSocket(Request.Builder().url(wsUrl).build(), object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                if (gen != generation) return
                lastReplyAt = System.currentTimeMillis()
                webSocket.send(JSONObject()
                    .put("topic", topic).put("event", "phx_join").put("ref", (ref++).toString()).put("join_ref", "1")
                    .put("payload", JSONObject().put("config", JSONObject()
                        .put("broadcast", JSONObject().put("self", false).put("ack", false))
                        .put("presence", JSONObject().put("enabled", false))
                        .put("private", false)))
                    .toString())
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                if (gen != generation) return
                lastReplyAt = System.currentTimeMillis()
                val m = runCatching { JSONObject(text) }.getOrNull() ?: return
                when (m.optString("event")) {
                    "phx_reply" -> if (m.optString("topic") == topic) {
                        val ok = m.optJSONObject("payload")?.optString("status") == "ok"
                        if (ok) { connected = true; backoffSec = 2; Log.i(TAG, "live"); onWake() } // catch up on anything missed while offline
                        else { Log.w(TAG, "join refused: $text"); failed(gen) }
                    }
                    "broadcast" -> if (m.optJSONObject("payload")?.optString("event") == "wake") onWake()
                    "phx_close", "phx_error" -> if (m.optString("topic") == topic) failed(gen)
                }
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) = failed(gen)
            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                Log.w(TAG, "socket failure: ${t.message}")
                failed(gen)
            }
        })
        // Phoenix keep-alive; if the server stops answering the link is dead, so reconnect.
        heartbeat = scheduler.scheduleWithFixedDelay({
            if (gen != generation) return@scheduleWithFixedDelay
            if (System.currentTimeMillis() - lastReplyAt > 70_000) { failed(gen); return@scheduleWithFixedDelay }
            socket?.send(JSONObject().put("topic", "phoenix").put("event", "heartbeat").put("payload", JSONObject())
                .put("ref", (ref++).toString()).toString())
        }, 25, 25, TimeUnit.SECONDS)
    }

    @Synchronized private fun failed(gen: Int) {
        if (gen != generation) return
        close()
        if (url.isEmpty()) return
        val wait = backoffSec
        backoffSec = (backoffSec * 2).coerceAtMost(60)
        reconnect = scheduler.schedule({ open() }, wait, TimeUnit.SECONDS)
    }
}
