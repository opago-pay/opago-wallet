package expo.modules.opagosafehttp

import java.net.InetAddress
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class PublicAddressTest {
  @Test fun blocksSpecialUseIpv4AndIpv6() {
    val cases = mapOf(
      "127.0.0.1" to false, "10.1.2.3" to false, "172.20.1.1" to false,
      "192.168.1.1" to false, "169.254.1.1" to false, "100.64.1.1" to false,
      "192.0.2.1" to false, "198.18.0.1" to false, "198.51.100.1" to false,
      "203.0.113.1" to false, "224.0.0.1" to false,
      "::1" to false, "::ffff:127.0.0.1" to false, "fe80::1" to false,
      "fc00::1" to false, "ff02::1" to false, "2001:db8::1" to false,
      "2002:0a00:0001::1" to false, "2001:0000::1" to false,
      "1.1.1.1" to true, "8.8.8.8" to true, "2606:4700:4700::1111" to true,
      "2001:4860:4860::8888" to true,
    )
    for ((text, expected) in cases) {
      assertEquals(text, expected, PublicAddress.allowed(InetAddress.getByName(text)))
    }
  }

  @Test fun acceptsIntegralBridgeDoublesButRejectsOverflowAndFractions() {
    assertEquals(2_097_152, boundedBridgeInteger(2_097_152.0, 1, 8_000_000))
    assertEquals(12_000, boundedBridgeInteger(12_000, 1, 30_000))
    for (value in listOf(0, -1, 8_000_001, 4_294_967_396.0, 2.5, Double.NaN,
      Double.POSITIVE_INFINITY, "100")) {
      assertThrows(java.io.IOException::class.java) {
        boundedBridgeInteger(value, 1, 8_000_000)
      }
    }
  }
}
