import Foundation

struct SafeHTTPResponse {
  let status: Int
  let contentType: String
  let body: String

  var bridgeValue: [String: Any] {
    ["status": status, "contentType": contentType, "body": body]
  }
}

// HTTP/1.1 only. The wire buffer is bounded before it reaches JS, including
// chunk framing and responses with no Content-Length. Compression is refused;
// the request asks for identity so a compressed bomb is never decompressed.
final class BoundedHTTPResponse {
  private let maxBytes: Int
  private var wire = Data()
  private var headerEnd: Int?
  private var status: Int?
  private var contentType = ""
  private var contentLength: Int?
  private var chunked = false
  private let headerLimit = 16_384
  private let framingAllowance = 65_536

  init(maxBytes: Int) { self.maxBytes = maxBytes }

  func append(_ data: Data) throws -> SafeHTTPResponse? {
    guard data.count <= maxBytes + headerLimit + framingAllowance - wire.count else {
      throw SafeHTTPFailure.rejected
    }
    wire.append(data)
    if headerEnd == nil { try parseHeaderIfAvailable() }
    guard let headerEnd else { return nil }
    let bodyCount = wire.count - headerEnd
    guard bodyCount <= maxBytes + framingAllowance else { throw SafeHTTPFailure.rejected }
    if let contentLength {
      guard bodyCount <= contentLength else { throw SafeHTTPFailure.rejected }
    } else if chunked {
      // Wait for EOF before accepting a terminal chunk, so extra bytes after
      // it or a falsely short Content-Length cannot be silently ignored.
    } else if !chunked && bodyCount > maxBytes {
      throw SafeHTTPFailure.rejected
    }
    return nil
  }

  func endOfStream() throws -> SafeHTTPResponse {
    guard let headerEnd else { throw SafeHTTPFailure.rejected }
    let body = Data(wire[headerEnd...])
    if let contentLength {
      guard body.count == contentLength else { throw SafeHTTPFailure.rejected }
      return try result(body)
    }
    return try result(chunked ? decodeChunks(body) : body)
  }

  private func parseHeaderIfAvailable() throws {
    let marker = Data([13, 10, 13, 10])
    guard let markerRange = wire.range(of: marker) else {
      if wire.count > headerLimit { throw SafeHTTPFailure.rejected }
      return
    }
    guard markerRange.lowerBound <= headerLimit,
          let header = String(data: wire[..<markerRange.lowerBound], encoding: .isoLatin1) else {
      throw SafeHTTPFailure.rejected
    }
    let lines = header.components(separatedBy: "\r\n")
    guard let first = lines.first else { throw SafeHTTPFailure.rejected }
    let parts = first.split(separator: " ", omittingEmptySubsequences: true)
    guard parts.count >= 2, (parts[0] == "HTTP/1.1" || parts[0] == "HTTP/1.0"),
          let code = Int(parts[1]), (200...599).contains(code), !(300...399).contains(code) else {
      throw SafeHTTPFailure.rejected
    }
    status = code
    var lengths: [Int] = []
    var transfers: [String] = []
    var encodings: [String] = []
    var seenContentType = false
    for line in lines.dropFirst() {
      guard let colon = line.firstIndex(of: ":"), !line.hasPrefix(" "), !line.hasPrefix("\t") else {
        throw SafeHTTPFailure.rejected
      }
      let name = line[..<colon].lowercased()
      let value = line[line.index(after: colon)...].trimmingCharacters(in: .whitespaces)
      guard !name.isEmpty, name.utf8.allSatisfy({
        (97...122).contains($0) || (48...57).contains($0) || $0 == 45
      }), !value.contains("\r"), !value.contains("\n") else {
        throw SafeHTTPFailure.rejected
      }
      switch name {
      case "content-length":
        guard let parsed = Int(value), parsed >= 0 else { throw SafeHTTPFailure.rejected }
        lengths.append(parsed)
      case "transfer-encoding": transfers.append(value.lowercased())
      case "content-encoding": encodings.append(value.lowercased())
      case "content-type":
        guard !seenContentType else { throw SafeHTTPFailure.rejected }
        seenContentType = true
        contentType = value
      default: break
      }
    }
    guard lengths.count <= 1, transfers.count <= 1, encodings.count <= 1,
          encodings.allSatisfy({ $0 == "identity" }),
          (transfers.isEmpty || (transfers == ["chunked"] && lengths.isEmpty)) else {
      throw SafeHTTPFailure.rejected
    }
    contentLength = lengths.first
    if let length = contentLength, length > maxBytes { throw SafeHTTPFailure.rejected }
    chunked = !transfers.isEmpty
    headerEnd = markerRange.upperBound
  }

  private func decodeChunks(_ data: Data) throws -> Data {
    var output = Data()
    let bytes = [UInt8](data)
    var cursor = 0
    while cursor < bytes.count {
      var lineEnd = cursor
      while lineEnd + 1 < bytes.count && !(bytes[lineEnd] == 13 && bytes[lineEnd + 1] == 10) {
        lineEnd += 1
        if lineEnd - cursor > 128 { throw SafeHTTPFailure.rejected }
      }
      guard lineEnd + 1 < bytes.count,
            let line = String(data: Data(bytes[cursor..<lineEnd]), encoding: .ascii),
            let token = line.split(separator: ";", maxSplits: 1).first,
            let size = Int(token, radix: 16),
            size >= 0, size <= maxBytes - output.count else { throw SafeHTTPFailure.rejected }
      cursor = lineEnd + 2
      if size == 0 {
        // Reject trailers rather than interpreting a second header block.
        guard bytes.count - cursor == 2, bytes[cursor] == 13, bytes[cursor + 1] == 10 else {
          throw SafeHTTPFailure.rejected
        }
        return output
      }
      guard size <= bytes.count - cursor - 2,
            bytes[cursor + size] == 13, bytes[cursor + size + 1] == 10 else {
        throw SafeHTTPFailure.rejected
      }
      output.append(Data(bytes[cursor..<(cursor + size)]))
      cursor += size + 2
    }
    throw SafeHTTPFailure.rejected
  }

  private func result(_ bytes: Data) throws -> SafeHTTPResponse {
    guard bytes.count <= maxBytes, let status,
          let text = String(data: bytes, encoding: .utf8) else { throw SafeHTTPFailure.rejected }
    return SafeHTTPResponse(status: status, contentType: contentType, body: text)
  }
}
