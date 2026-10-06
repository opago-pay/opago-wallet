package expo.modules.opagosafehttp

import java.nio.charset.CharacterCodingException
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.fail
import org.junit.Test

class StrictUtf8Test {
  @Test fun preservesSignedResponseBytes() {
    val text = "\uFEFF{\"name\":\"Café € 🐈\",\"decomposed\":\"e\u0301\"}\r\n"
    val bytes = text.toByteArray(Charsets.UTF_8)
    assertEquals(text, strictUtf8(bytes))
    assertArrayEquals(bytes, strictUtf8(bytes).toByteArray(Charsets.UTF_8))
  }

  @Test fun rejectsMalformedUtf8InsteadOfReplacingIt() {
    val invalid = listOf(
      byteArrayOf(0xC3.toByte(), 0x28), // bad continuation
      byteArrayOf(0xE2.toByte(), 0x82.toByte()), // truncated sequence
      byteArrayOf(0xC0.toByte(), 0xAF.toByte()), // overlong encoding
      byteArrayOf(0xED.toByte(), 0xA0.toByte(), 0x80.toByte()), // surrogate
      byteArrayOf(0xF4.toByte(), 0x90.toByte(), 0x80.toByte(), 0x80.toByte()) // outside Unicode
    )
    for (bytes in invalid) {
      try { strictUtf8(bytes); fail("Malformed UTF-8 accepted") }
      catch (_: CharacterCodingException) { /* expected */ }
    }
  }
}
