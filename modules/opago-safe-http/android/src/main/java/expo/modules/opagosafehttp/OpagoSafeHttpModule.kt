package expo.modules.opagosafehttp

import android.content.pm.ApplicationInfo
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.net.InetAddress
import java.net.Proxy
import java.net.URI
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import okhttp3.Call
import okhttp3.Callback
import okhttp3.Connection
import okhttp3.ConnectionPool
import okhttp3.Dns
import okhttp3.EventListener
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response

internal fun boundedBridgeInteger(value: Any?, min: Int, max: Int): Int {
  val number = value as? Number ?: throw IOException("Invalid secure request limit.")
  val parsed = number.toDouble()
  if (!parsed.isFinite() || parsed % 1.0 != 0.0 || parsed < min || parsed > max) {
    throw IOException("Invalid secure request limit.")
  }
  return parsed.toInt()
}

class OpagoSafeHttpModule : Module() {
  private val active = ConcurrentHashMap<String, Call>()

  override fun definition() = ModuleDefinition {
    Name("OpagoSafeHttp")

    AsyncFunction("cancel") { requestId: String -> active[requestId]?.cancel() }

    AsyncFunction("request") { options: Map<String, Any?>, promise: Promise ->
      try {
        val url = options["url"] as? String ?: throw IOException("Invalid URL.")
        val method = options["method"] as? String ?: throw IOException("Invalid method.")
        val body = options["body"] as? String ?: throw IOException("Invalid body.")
        // React Native's generic map bridge may represent a JS integer as Double.
        val maxBytes = boundedBridgeInteger(options["maxBytes"], 1, 8_000_000)
        val timeoutMs = boundedBridgeInteger(options["timeoutMs"], 1, 30_000)
        val allowPrivateDevelopment = options["allowPrivateDevelopment"] as? Boolean ?: false
        val requestId = options["requestId"] as? String ?: throw IOException("Invalid request ID.")
        val headers = (options["headers"] as? Map<*, *>)?.entries?.associate { entry ->
          (entry.key as? String ?: throw IOException("Invalid header.")) to
            (entry.value as? String ?: throw IOException("Invalid header."))
        } ?: throw IOException("Invalid headers.")
        val uri = URI(url)
        val development = allowPrivateDevelopment &&
          ((appContext.reactContext?.applicationInfo?.flags ?: 0) and ApplicationInfo.FLAG_DEBUGGABLE) != 0
        if (uri.host.isNullOrBlank() || uri.userInfo != null ||
          (uri.scheme != "https" && !(development && uri.scheme == "http")) ||
          method !in setOf("GET", "POST") || requestId.isBlank()) {
          throw IOException("Invalid secure request.")
        }
        // OkHttp does not call Dns for an IP literal. Reject it before connect.
        if (!development && (uri.host.contains(':') || uri.host.matches(Regex("[0-9.]+"))) &&
          !PublicAddress.allowed(InetAddress.getByName(uri.host))) {
          throw IOException("Destination is unavailable.")
        }
        // A fresh client has no reusable connection. OkHttp connects only to the
        // addresses returned by this DNS implementation; no separate DNS preflight.
        val client = OkHttpClient.Builder()
          .dns(object : Dns {
            override fun lookup(hostname: String): List<InetAddress> {
              val addresses = InetAddress.getAllByName(hostname).toList()
              if (addresses.isEmpty() || (!development && addresses.any { !PublicAddress.allowed(it) })) {
                throw IOException("Destination is unavailable.")
              }
              return addresses
            }
          })
          .proxy(Proxy.NO_PROXY)
          .followRedirects(false)
          .followSslRedirects(false)
          .retryOnConnectionFailure(false)
          .connectionPool(ConnectionPool(0, 1, TimeUnit.SECONDS))
          .eventListener(object : EventListener() {
            override fun connectionAcquired(call: Call, connection: Connection) {
              if (!development && !PublicAddress.allowed(connection.socket().inetAddress)) {
                call.cancel()
                throw IOException("Destination is unavailable.")
              }
            }
          })
          .callTimeout(timeoutMs.toLong(), TimeUnit.MILLISECONDS)
          .connectTimeout(timeoutMs.toLong(), TimeUnit.MILLISECONDS)
          .readTimeout(timeoutMs.toLong(), TimeUnit.MILLISECONDS)
          .build()
        val builder = Request.Builder().url(url)
        for ((name, value) in headers) {
          if (name.equals("host", true) || name.equals("accept-encoding", true) ||
            name.equals("connection", true) || name.equals("content-length", true)) continue
          builder.header(name, value)
        }
        val requestBody = if (method == "POST") {
          body.toRequestBody(headers.entries.firstOrNull { it.key.equals("content-type", true) }
            ?.value?.toMediaTypeOrNull())
        } else null
        val call = client.newCall(builder.method(method, requestBody).build())
        if (active.putIfAbsent(requestId, call) != null) throw IOException("Duplicate secure request.")
        call.enqueue(object : Callback {
          override fun onFailure(call: Call, e: IOException) {
            active.remove(requestId, call)
            client.connectionPool.evictAll()
            promise.reject("ERR_SAFE_NETWORK", "Secure network request failed.", null)
          }
          override fun onResponse(call: Call, response: Response) {
            try {
              response.use {
                if (response.code in 300..399) throw IOException("Redirect blocked.")
                val responseBody = response.body ?: throw IOException("Empty secure response.")
                if (response.header("Content-Encoding")?.lowercase() !in setOf(null, "identity")) {
                  // OkHttp transparently decompresses ordinary gzip before this point.
                  throw IOException("Unsupported response encoding.")
                }
                if (responseBody.contentLength() > maxBytes) throw IOException("Response exceeds limit.")
                val output = ByteArrayOutputStream(minOf(maxBytes, 8192))
                responseBody.byteStream().use { input ->
                  val chunk = ByteArray(8192)
                  while (true) {
                    val count = input.read(chunk)
                    if (count < 0) break
                    if (output.size() + count > maxBytes) throw IOException("Response exceeds limit.")
                    output.write(chunk, 0, count)
                  }
                }
                promise.resolve(mapOf(
                  "status" to response.code,
                  "contentType" to (response.header("Content-Type") ?: ""),
                  "body" to output.toString(Charsets.UTF_8.name()),
                ))
              }
            } catch (_: Exception) {
              promise.reject("ERR_SAFE_NETWORK", "Secure network request failed.", null)
            } finally {
              active.remove(requestId, call)
              client.connectionPool.evictAll()
            }
          }
        })
      } catch (_: Exception) {
        // Neither URLs, bodies nor provider exception details belong in bridge logs.
        promise.reject("ERR_SAFE_NETWORK", "Secure network request failed.", null)
      }
    }
  }
}
