package expo.modules.opagosafehttp

import java.security.KeyPairGenerator
import java.security.Signature
import java.security.interfaces.RSAPublicKey
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class OidcSignatureTest {
  @Test fun rs256VerifiesPublicKeyAndRejectsChangedMessageSignatureAndWeakKey() {
    val generator = KeyPairGenerator.getInstance("RSA")
    generator.initialize(2048)
    val keys = generator.generateKeyPair()
    val public = keys.public as RSAPublicKey
    val n = public.modulus.toByteArray().dropWhile { it == 0.toByte() }.toByteArray()
    val e = public.publicExponent.toByteArray()
    val message = "synthetic-header.synthetic-claims".toByteArray(Charsets.UTF_8)
    val signer = Signature.getInstance("SHA256withRSA")
    signer.initSign(keys.private)
    signer.update(message)
    val signature = signer.sign()
    assertTrue(verifyOidcRs256(n, e, message, signature))
    assertFalse(verifyOidcRs256(n, e, "changed".toByteArray(), signature))
    val tampered = signature.clone()
    tampered[0] = (tampered[0].toInt() xor 1).toByte()
    assertFalse(verifyOidcRs256(n, e, message, tampered))
    assertFalse(verifyOidcRs256(ByteArray(128), e, message, signature))
    assertFalse(verifyOidcRs256(n, byteArrayOf(2), message, signature))
  }
}
