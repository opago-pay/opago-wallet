package expo.modules.opagosafehttp

import java.io.IOException
import okio.ByteString.Companion.decodeBase64

internal fun requestPayload(body: String, encoding: Any?, method: String, path: String?, scheme: String?,
  contentType: String?, hasEnvelope: Boolean): ByteArray {
  if (encoding == null) {
    val bytes = body.toByteArray(Charsets.UTF_8)
    if (bytes.size > 1_048_576 || (method in setOf("GET", "DELETE") && bytes.isNotEmpty())) throw IOException("Invalid request size.")
    return bytes
  }
  if (encoding != "base64" || method != "POST" || scheme != "https" ||
    path?.matches(Regex("/api/v2/onboarding/kyc/[0-9a-f-]{36}/documents")) != true ||
    contentType != "application/octet-stream" || !hasEnvelope || body.length > 13_981_056 ||
    !body.matches(Regex("[A-Za-z0-9+/]+={0,2}"))) throw IOException("Invalid photo body.")
  val decoded = body.decodeBase64() ?: throw IOException("Invalid photo encoding.")
  if (decoded.size < 29 || decoded.size > 10_485_788 || decoded.base64() != body) throw IOException("Invalid photo size.")
  return decoded.toByteArray()
}
