package expo.modules.opagosafehttp

import java.net.Inet4Address
import java.net.Inet6Address
import java.net.InetAddress

/** Reject all special-use ranges. Fail closed on ambiguous or embedded IPv6 addresses. */
internal object PublicAddress {
  fun allowed(address: InetAddress): Boolean {
    if (address.isAnyLocalAddress || address.isLoopbackAddress || address.isLinkLocalAddress ||
      address.isSiteLocalAddress || address.isMulticastAddress) return false
    val bytes = address.address.map { it.toInt() and 0xff }
    if (address is Inet4Address) {
      val a = bytes[0]; val b = bytes[1]; val c = bytes[2]
      return when {
        a == 0 || a == 10 || a == 127 || a >= 224 -> false
        a == 100 && b in 64..127 -> false // carrier-grade NAT
        a == 169 && b == 254 -> false
        a == 172 && b in 16..31 -> false
        a == 192 && (b == 168 || b == 0 || b == 88) -> false
        a == 192 && b == 0 && c == 2 -> false
        a == 198 && (b == 18 || b == 19 || (b == 51 && c == 100)) -> false
        a == 203 && b == 0 && c == 113 -> false
        else -> true
      }
    }
    if (address !is Inet6Address || bytes.size != 16) return false
    // IPv4-mapped/compatible, ULA, link-local and multicast are outside 2000::/3.
    if ((bytes[0] and 0xe0) != 0x20) return false
    // Teredo, 6to4, ORCHID and documentation ranges can conceal non-public peers.
    if (bytes[0] == 0x20 && bytes[1] == 0x01) {
      if (bytes[2] <= 0x01) return false // IANA special-purpose 2001::/23
      if (bytes[2] == 0x0d && bytes[3] == 0xb8) return false // documentation
    }
    if (bytes[0] == 0x20 && bytes[1] == 0x02) return false // 6to4
    return true
  }
}
