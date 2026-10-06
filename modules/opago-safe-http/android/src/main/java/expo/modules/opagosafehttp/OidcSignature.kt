package expo.modules.opagosafehttp

import java.math.BigInteger
import java.security.KeyFactory
import java.security.Signature
import java.security.spec.RSAPublicKeySpec

// Platform cryptography; verification only, no private keys in the app.
internal fun verifyOidcRs256(n: ByteArray, e: ByteArray, message: ByteArray, signature: ByteArray): Boolean {
  if (n.size !in 256..512 || (n[0].toInt() and 0xff) < 128 || e.isEmpty() || e.size > 4 ||
    signature.size != n.size || message.size > 32_768) return false
  val exponent = BigInteger(1, e)
  if (exponent < BigInteger.valueOf(3) || !exponent.testBit(0)) return false
  val key = KeyFactory.getInstance("RSA").generatePublic(RSAPublicKeySpec(BigInteger(1, n), exponent))
  val verifier = Signature.getInstance("SHA256withRSA")
  verifier.initVerify(key)
  verifier.update(message)
  return verifier.verify(signature)
}
