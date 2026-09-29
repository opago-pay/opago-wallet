import Foundation
import Network
import Darwin

// RFC 6052 layouts. A prefix is learned from this network's ipv4only.arpa
// answer (RFC 7050); a hard-coded 64:ff9b::/96 would fail on NSP networks.
struct NAT64Prefix: Equatable {
  let length: Int
  let bytes: [UInt8]

  static let lengths = [96, 64, 56, 48, 40, 32]
  private static let discoveryAddresses: [[UInt8]] = [[192, 0, 0, 170], [192, 0, 0, 171]]

  static func embeddedIPv4(_ address: [UInt8], length: Int) -> [UInt8]? {
    guard address.count == 16, lengths.contains(length),
          length == 96 || address[8] == 0 else { return nil }
    let prefixLength = length / 8
    if length == 96 { return Array(address[12..<16]) }
    let beforeU = 8 - prefixLength
    return Array(address[prefixLength..<8]) + Array(address[9..<(9 + 4 - beforeU)])
  }

  static func discovered(_ address: [UInt8]) -> NAT64Prefix? {
    for length in lengths {
      guard let embedded = embeddedIPv4(address, length: length),
            discoveryAddresses.contains(embedded) else { continue }
      let prefixLength = length / 8
      // RFC 6052 synthesis has an empty suffix. Nonzero suffixes are not
      // interpreted as proof of a NAT64 prefix.
      let suffixStart = length == 96 ? 16 : 9 + 4 - (8 - prefixLength)
      guard address[suffixStart..<16].allSatisfy({ $0 == 0 }) else { continue }
      let prefix = Array(address[0..<prefixLength])
      let wellKnownPrefix = [0, 100, 255, 155] + Array(repeating: UInt8(0), count: 8)
      guard PublicAddress.publicIPv6Prefix(prefix) ||
            (length == 96 && prefix == wellKnownPrefix) else {
        continue
      }
      return NAT64Prefix(length: length, bytes: prefix)
    }
    return nil
  }

  func matches(_ address: [UInt8]) -> Bool {
    address.count == 16 && Array(address[0..<(length / 8)]) == bytes
  }
}

// The native endpoint is made from these bytes, never from the original DNS name.
enum PublicAddress {
  static func allowed(_ bytes: [UInt8], nat64Prefixes: [NAT64Prefix] = []) -> Bool {
    if bytes.count == 4 {
      let (a, b, c) = (bytes[0], bytes[1], bytes[2])
      if a == 0 || a == 10 || a == 127 || a >= 224 { return false }
      if a == 100 && (64...127).contains(b) { return false }
      if a == 169 && b == 254 { return false }
      if a == 172 && (16...31).contains(b) { return false }
      if a == 192 && (b == 168 || b == 0 || b == 88) { return false }
      if a == 192 && b == 0 && c == 2 { return false }
      if a == 198 && (b == 18 || b == 19 || (b == 51 && c == 100)) { return false }
      if a == 203 && b == 0 && c == 113 { return false }
      return true
    }
    guard bytes.count == 16 else { return false }
    // Treat the discovered NAT64 prefix before classifying a global-looking
    // IPv6 address. An NSP can embed 127/8 or RFC1918 while itself being GUA.
    for prefix in nat64Prefixes where prefix.matches(bytes) {
      guard let embedded = NAT64Prefix.embeddedIPv4(bytes, length: prefix.length) else { return false }
      return allowed(embedded)
    }
    // Even if discovery fails or a DNS answer is inconsistent, the WKP must
    // never provide a bypass to translated private IPv4 destinations.
    if Array(bytes[0..<12]) == [UInt8(0), 100, 255, 155] + Array(repeating: UInt8(0), count: 8) {
      return allowed(Array(bytes[12..<16]))
    }
    return publicIPv6Prefix(bytes)
  }

  static func publicIPv6Prefix(_ bytes: [UInt8]) -> Bool {
    guard bytes.count >= 4 else { return false }
    // Reject loopback, link-local, ULA, multicast, mapped/compatible and
    // IPv4-in-IPv6 tunnels outside the ordinary global unicast space.
    if bytes[0] & 0xe0 != 0x20 { return false }
    if bytes[0] == 0x20 && bytes[1] == 0x01 {
      if bytes[2] <= 0x01 { return false } // IANA special-purpose 2001::/23
      if bytes[2] == 0x0d && bytes[3] == 0xb8 { return false }
    }
    if bytes[0] == 0x20 && bytes[1] == 0x02 { return false } // 6to4
    return true
  }

  static func literal(_ host: String) -> (NWEndpoint.Host, [UInt8])? {
    if let ip = IPv4Address(host) { return (.ipv4(ip), Array(ip.rawValue)) }
    if let ip = IPv6Address(host) { return (.ipv6(ip), Array(ip.rawValue)) }
    return nil
  }

  static func fromSockaddr(_ address: UnsafePointer<sockaddr>) -> (NWEndpoint.Host, [UInt8])? {
    if Int32(address.pointee.sa_family) == AF_INET {
      let ipv4 = address.withMemoryRebound(to: sockaddr_in.self, capacity: 1) { $0.pointee.sin_addr }
      let bytes = withUnsafeBytes(of: ipv4) { Array($0) }
      guard let ip = IPv4Address(Data(bytes)) else { return nil }
      return (.ipv4(ip), bytes)
    }
    if Int32(address.pointee.sa_family) == AF_INET6 {
      let ipv6 = address.withMemoryRebound(to: sockaddr_in6.self, capacity: 1) { $0.pointee.sin6_addr }
      let bytes = withUnsafeBytes(of: ipv6) { Array($0) }
      guard let ip = IPv6Address(Data(bytes)) else { return nil }
      return (.ipv6(ip), bytes)
    }
    return nil
  }
}

enum SafeHTTPFailure: Error { case rejected }

enum ScreenedResolver {
  static func screen(_ candidates: [(NWEndpoint.Host, [UInt8])], development: Bool,
                     nat64Prefixes: [NAT64Prefix] = []) throws -> NWEndpoint.Host {
    guard let first = candidates.first,
          development || candidates.allSatisfy({ PublicAddress.allowed($0.1, nat64Prefixes: nat64Prefixes) }) else {
      throw SafeHTTPFailure.rejected
    }
    // On an IPv6-only path a resolver can still include an A answer. Prefer
    // its checked, synthesized AAAA endpoint when an active Pref64 exists.
    if !nat64Prefixes.isEmpty,
       let translated = candidates.first(where: { candidate in
         nat64Prefixes.contains(where: { $0.matches(candidate.1) })
       }) {
      return translated.0
    }
    return first.0
  }

  static func resolve(_ host: String, development: Bool) throws -> NWEndpoint.Host {
    if let literal = PublicAddress.literal(host) {
      var prefixes: [NAT64Prefix] = []
      if literal.1.count == 16 && !development { prefixes = try discoverNAT64Prefixes() }
      return try screen([literal], development: development, nat64Prefixes: prefixes)
    }
    // Reject scoped addresses and ambiguous numeric syntax. Ordinary DNS
    // names are resolved once; NWConnection receives only the screened IP.
    guard !host.contains("%"), !host.isEmpty, host.utf8.count <= 253 else { throw SafeHTTPFailure.rejected }
    let candidates = try addresses(host)
    var prefixes: [NAT64Prefix] = []
    if candidates.contains(where: { $0.1.count == 16 }) && !development {
      prefixes = try discoverNAT64Prefixes()
    }
    return try screen(candidates, development: development, nat64Prefixes: prefixes)
  }

  static func discoverNAT64Prefixes() throws -> [NAT64Prefix] {
    // A network with native IPv6 but no DNS64 can legitimately return no
    // AAAA for this name. Other resolver failures remain fail-closed.
    let answers = try addresses("ipv4only.arpa", allowNoName: true)
    var prefixes: [NAT64Prefix] = []
    for (_, bytes) in answers where bytes.count == 16 {
      guard let prefix = NAT64Prefix.discovered(bytes) else { throw SafeHTTPFailure.rejected }
      if !prefixes.contains(prefix) { prefixes.append(prefix) }
    }
    return prefixes
  }

  private static func addresses(_ host: String, allowNoName: Bool = false) throws -> [(NWEndpoint.Host, [UInt8])] {
    var hints = addrinfo()
    hints.ai_family = AF_UNSPEC
    hints.ai_socktype = SOCK_STREAM
    var head: UnsafeMutablePointer<addrinfo>?
    let result = host.withCString { getaddrinfo($0, nil, &hints, &head) }
    if allowNoName && result == EAI_NONAME { return [] }
    guard result == 0, let first = head else { throw SafeHTTPFailure.rejected }
    defer { freeaddrinfo(first) }
    var cursor: UnsafeMutablePointer<addrinfo>? = first
    var candidates: [(NWEndpoint.Host, [UInt8])] = []
    while let current = cursor {
      if candidates.count >= 32 { throw SafeHTTPFailure.rejected }
      guard let address = current.pointee.ai_addr,
            let candidate = PublicAddress.fromSockaddr(address) else {
        throw SafeHTTPFailure.rejected // mixed answers fail closed
      }
      candidates.append(candidate)
      cursor = current.pointee.ai_next
    }
    guard !candidates.isEmpty else { throw SafeHTTPFailure.rejected }
    return candidates
  }
}
