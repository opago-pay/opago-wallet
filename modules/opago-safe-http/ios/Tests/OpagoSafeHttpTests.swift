import Foundation
import Network
import XCTest
@testable import OpagoSafeHttp

final class OpagoSafeHttpTests: XCTestCase {
  func testPublicAddressClassificationAndMixedDNS() throws {
    for address in ["127.0.0.1", "10.0.0.4", "192.168.1.1", "169.254.1.1",
                    "100.64.0.1", "198.51.100.4", "::1", "fe80::1",
                    "fc00::1", "::ffff:127.0.0.1", "64:ff9b::127.0.0.1",
                    "2001:db8::1", "2002:c0a8:0101::1"] {
      let candidate = try XCTUnwrap(PublicAddress.literal(address))
      XCTAssertFalse(PublicAddress.allowed(candidate.1), address)
      XCTAssertThrowsError(try ScreenedResolver.screen([candidate], development: false))
    }
    let publicAddress = try XCTUnwrap(PublicAddress.literal("8.8.8.8"))
    let privateAddress = try XCTUnwrap(PublicAddress.literal("127.0.0.1"))
    XCTAssertTrue(PublicAddress.allowed(publicAddress.1))
    XCTAssertThrowsError(try ScreenedResolver.screen([publicAddress, privateAddress], development: false))
    XCTAssertThrowsError(try ScreenedResolver.screen([privateAddress, publicAddress], development: false))
    _ = try ScreenedResolver.screen([publicAddress], development: false)
  }

  func testNAT64PrefixesAndTranslatedAddressPolicy() throws {
    let publicIPv6 = try XCTUnwrap(PublicAddress.literal("2606:4700:4700::1111"))
    XCTAssertTrue(PublicAddress.allowed(publicIPv6.1))
    let samplePrefix: [UInt8] = [0x20, 0x01, 0x48, 0x60, 0x48, 0x64,
                                0, 0, 0, 0, 0, 0]
    for length in NAT64Prefix.lengths {
      let prefixLength = length / 8
      func translated(_ ipv4: [UInt8]) -> [UInt8] {
        var bytes = [UInt8](repeating: 0, count: 16)
        for i in 0..<prefixLength { bytes[i] = samplePrefix[i] }
        if length == 96 {
          for i in 0..<4 { bytes[12 + i] = ipv4[i] }
        } else {
          let beforeU = 8 - prefixLength
          for i in 0..<beforeU { bytes[prefixLength + i] = ipv4[i] }
          for i in beforeU..<4 { bytes[9 + i - beforeU] = ipv4[i] }
        }
        return bytes
      }
      let prefix = try XCTUnwrap(NAT64Prefix.discovered(translated([192, 0, 0, 170])))
      XCTAssertEqual(prefix.length, length)
      XCTAssertTrue(PublicAddress.allowed(translated([8, 8, 8, 8]), nat64Prefixes: [prefix]))
      XCTAssertFalse(PublicAddress.allowed(translated([10, 0, 0, 1]), nat64Prefixes: [prefix]))
      XCTAssertFalse(PublicAddress.allowed(translated([127, 0, 0, 1]), nat64Prefixes: [prefix]))
      XCTAssertFalse(PublicAddress.allowed(translated([169, 254, 1, 1]), nat64Prefixes: [prefix]))
      let safe = try XCTUnwrap(IPv6Address(Data(translated([8, 8, 8, 8]))))
      let privateIP = try XCTUnwrap(IPv6Address(Data(translated([10, 0, 0, 1]))))
      let originalIPv4 = try XCTUnwrap(PublicAddress.literal("8.8.8.8"))
      XCTAssertEqual(try ScreenedResolver.screen([originalIPv4,
        (.ipv6(safe), translated([8, 8, 8, 8]))],
        development: false, nat64Prefixes: [prefix]), .ipv6(safe))
      XCTAssertThrowsError(try ScreenedResolver.screen([(.ipv6(safe), translated([8, 8, 8, 8])),
                                                       (.ipv6(privateIP), translated([10, 0, 0, 1]))],
                                                      development: false, nat64Prefixes: [prefix]))
    }
    let wellKnown = try XCTUnwrap(PublicAddress.literal("64:ff9b::8.8.8.8"))
    let wellKnownPrivate = try XCTUnwrap(PublicAddress.literal("64:ff9b::10.0.0.1"))
    XCTAssertTrue(PublicAddress.allowed(wellKnown.1))
    XCTAssertFalse(PublicAddress.allowed(wellKnownPrivate.1))
  }

  func testScreenedEndpointRemainsPinnedAfterDnsChanges() throws {
    let first = try XCTUnwrap(PublicAddress.literal("2606:4700:4700::1111"))
    let later = try XCTUnwrap(PublicAddress.literal("fd00::1"))
    let selected = try ScreenedResolver.screen([first], development: false)
    XCTAssertEqual(selected, first.0)
    XCTAssertThrowsError(try ScreenedResolver.screen([later], development: false))
  }

  func testJSONTextChunkingAndBoundaries() throws {
    let json = BoundedHTTPResponse(maxBytes: 40)
    XCTAssertNil(try json.append(Data("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 8\r\n\r\n{\"ok\"".utf8)))
    XCTAssertNil(try json.append(Data(":1}".utf8)))
    XCTAssertEqual(try json.endOfStream().body, "{\"ok\":1}")

    let text = BoundedHTTPResponse(maxBytes: 5)
    XCTAssertNil(try text.append(Data("HTTP/1.1 202 Accepted\r\nContent-Type: text/plain\r\nTransfer-Encoding: chunked\r\n\r\n".utf8)))
    XCTAssertNil(try text.append(Data("5\r\nCafé\r\n0\r\n\r\n".utf8)))
    XCTAssertEqual(try text.endOfStream().body, "Café")

    let tooLarge = BoundedHTTPResponse(maxBytes: 3)
    XCTAssertThrowsError(try tooLarge.append(Data("HTTP/1.1 200 OK\r\nContent-Length: 4\r\n\r\n".utf8)))
    let unknownLength = BoundedHTTPResponse(maxBytes: 3)
    XCTAssertThrowsError(try unknownLength.append(Data("HTTP/1.1 200 OK\r\n\r\nabcd".utf8)))
    let falseLength = BoundedHTTPResponse(maxBytes: 32)
    XCTAssertNil(try falseLength.append(Data("HTTP/1.1 200 OK\r\nContent-Length: 1\r\n\r\na".utf8)))
    XCTAssertThrowsError(try falseLength.append(Data("b".utf8)))
    let invalidUTF8 = BoundedHTTPResponse(maxBytes: 3)
    var invalid = Data("HTTP/1.1 200 OK\r\nContent-Length: 1\r\n\r\n".utf8)
    invalid.append(Data([0xff]))
    XCTAssertNil(try invalidUTF8.append(invalid))
    XCTAssertThrowsError(try invalidUTF8.endOfStream())
  }

  func testRedirectCompressionAmbiguityAndMalformedResponsesFailClosed() throws {
    for bytes in [
      "HTTP/1.1 302 Found\r\nLocation: https://example.com\r\n\r\n",
      "HTTP/1.1 200 OK\r\nContent-Encoding: gzip\r\n\r\n",
      "HTTP/1.1 200 OK\r\nContent-Length: 1\r\nContent-Length: 1\r\n\r\n",
      "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\nContent-Length: 1\r\n\r\n",
      "HTTP/1.1 200 OK\r\n Folded: bad\r\n\r\n",
    ] {
      XCTAssertThrowsError(try BoundedHTTPResponse(maxBytes: 100).append(Data(bytes.utf8)))
    }
    let truncated = BoundedHTTPResponse(maxBytes: 100)
    XCTAssertNil(try truncated.append(Data("HTTP/1.1 200 OK\r\nContent-Length: 4\r\n\r\na".utf8)))
    XCTAssertThrowsError(try truncated.endOfStream())
  }

  func testMalformedRequestCannotReachTransport() {
    let base: [String: Any] = [
      "url": "https://example.com/", "method": "GET", "headers": [String: String](),
      "body": "", "maxBytes": 1024, "timeoutMs": 2000, "requestId": "test-1",
    ]
    var injected = base
    injected["headers"] = ["X-Test": "ok\r\nHost: internal"]
    XCTAssertThrowsError(try SafeRequest(injected))
    var oversized = base
    oversized["maxBytes"] = 8_000_001
    XCTAssertThrowsError(try SafeRequest(oversized))
    var unsafeURL = base
    unsafeURL["url"] = "https://user:pass@example.com/"
    XCTAssertThrowsError(try SafeRequest(unsafeURL))
  }
}

// Run this only with a separately identified test-app and controlled DNS/TLS
// fixtures. Every URL must be synthetic; no wallet data or payments are used.
final class OpagoSafeHttpControlledIntegrationTests: XCTestCase {
  private func fixtures() throws -> [String: String] {
    let bundle = Bundle(for: type(of: self))
    guard let file = bundle.url(forResource: "Fixtures", withExtension: "json"),
          let data = try? Data(contentsOf: file),
          let urls = try? JSONDecoder().decode([String: String].self, from: data),
          Set(Self.requiredFixtures).isSubset(of: Set(urls.keys)),
          urls.values.allSatisfy({ $0.hasPrefix("https://") }) else {
      XCTFail("Controlled HTTPS fixtures are missing or incomplete; test run is not accepted.")
      throw SafeHTTPFailure.rejected
    }
    return urls
  }

  private static let requiredFixtures = ["json", "text", "rebinding", "private", "mixed",
    "redirect", "invalidCertificate", "gzip", "oversizedNoLength", "oversizedFalseLength",
    "malformedLength", "timeout", "slow", "proxyOnly", "nat64Public", "nat64Private",
    "nat64Mixed", "nat64DnsChange"]

  private func run(_ url: String, maxBytes: Int = 1024, timeoutMs: Int = 3000,
                   cancelAfterMs: Int? = nil) throws -> Result<SafeHTTPResponse, Error> {
    let request = try SafeRequest([
      "url": url, "method": "GET", "headers": [String: String](), "body": "",
      "maxBytes": maxBytes, "timeoutMs": timeoutMs, "requestId": UUID().uuidString,
    ])
    let completed = expectation(description: "native request settled")
    var result: Result<SafeHTTPResponse, Error>?
    let task = SafeHTTPTask(request) { value in result = value; completed.fulfill() }
    task.start()
    if let cancelAfterMs {
      DispatchQueue.global().asyncAfter(deadline: .now() + .milliseconds(cancelAfterMs)) { task.cancel() }
    }
    wait(for: [completed], timeout: Double(timeoutMs) / 1000 + 3)
    return try XCTUnwrap(result)
  }

  func testControlledHTTPSMatrix() throws {
    let urls = try fixtures()
    // This suite must execute on a controlled IPv6-only/DNS64 network. A
    // dual-stack run that happens to succeed via IPv4 is not NAT64 evidence.
    let prefixes = try ScreenedResolver.discoverNAT64Prefixes()
    XCTAssertFalse(prefixes.isEmpty, "No active system-discovered NAT64 prefix")
    let nat64Host = try XCTUnwrap(URLComponents(string: XCTUnwrap(urls["nat64Public"]))?.host)
    let pinnedNAT64 = try ScreenedResolver.resolve(nat64Host, development: false)
    guard case .ipv6(let ipv6) = pinnedNAT64 else {
      return XCTFail("NAT64 fixture did not resolve to a synthesized IPv6 endpoint")
    }
    XCTAssertTrue(prefixes.contains(where: { $0.matches(Array(ipv6.rawValue)) }),
                  "NAT64 fixture did not use the active network prefix")
    for name in ["json", "text", "rebinding", "nat64Public", "nat64DnsChange"] {
      let value = try run(XCTUnwrap(urls[name]))
      guard case .success(let response) = value else { return XCTFail("Expected safe \(name) response") }
      XCTAssertEqual(response.status, 200)
      XCTAssertFalse(response.body.isEmpty)
    }
    for name in ["private", "mixed", "redirect", "invalidCertificate",
                 "gzip", "oversizedNoLength", "oversizedFalseLength", "malformedLength", "timeout",
                 "nat64Private", "nat64Mixed"] {
      let limit = name.hasPrefix("oversized") ? 32 : 1024
      let timeout = name == "timeout" ? 500 : 3000
      let value = try run(XCTUnwrap(urls[name]), maxBytes: limit, timeoutMs: timeout)
      guard case .failure = value else { return XCTFail("Expected \(name) to fail closed") }
    }
    let cancelled = try run(XCTUnwrap(urls["slow"]), cancelAfterMs: 50)
    guard case .failure = cancelled else { return XCTFail("Cancelled response was accepted") }
  }

  func testProxyOnlyRouteFailsClosed() throws {
    let url = try XCTUnwrap(fixtures()["proxyOnly"])
    let value = try run(url)
    guard case .failure = value else { return XCTFail("A proxied request was accepted") }
  }
}
