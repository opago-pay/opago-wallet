import ExpoModulesCore
import Foundation
import Network
import Security

struct SafeRequest {
  let host: String
  let port: UInt16
  let maxBytes: Int
  let timeoutMs: Int
  let development: Bool
  let tlsEnabled: Bool
  let requestData: Data
  let requestId: String

  init(_ raw: [String: Any]) throws {
    guard let urlString = raw["url"] as? String, urlString.utf8.count <= 8192,
          let components = URLComponents(string: urlString),
          let scheme = components.scheme?.lowercased(),
          let rawHost = components.host, !rawHost.isEmpty,
          components.user == nil, components.password == nil, components.fragment == nil,
          let method = raw["method"] as? String, method == "GET" || method == "POST",
          let body = raw["body"] as? String,
          let headers = raw["headers"] as? [String: String],
          let requestId = raw["requestId"] as? String,
          !requestId.isEmpty, requestId.utf8.count <= 128,
          let maxBytes = Self.integer(raw["maxBytes"], min: 1, max: 8_000_000),
          let timeoutMs = Self.integer(raw["timeoutMs"], min: 1, max: 30_000) else {
      throw SafeHTTPFailure.rejected
    }
    let host = rawHost.hasPrefix("[") && rawHost.hasSuffix("]")
      ? String(rawHost.dropFirst().dropLast()) : rawHost
    guard host.range(of: "^[A-Za-z0-9.:-]+$", options: .regularExpression) != nil else {
      throw SafeHTTPFailure.rejected
    }
    #if DEBUG
    let development = raw["allowPrivateDevelopment"] as? Bool == true
    #else
    let development = false
    #endif
    guard scheme == "https" || (development && scheme == "http"),
          !(method == "GET" && !body.isEmpty) else { throw SafeHTTPFailure.rejected }
    let portNumber = components.port ?? (scheme == "https" ? 443 : 80)
    guard (1...65535).contains(portNumber) else { throw SafeHTTPFailure.rejected }
    let payload = Data(body.utf8)
    guard payload.count <= 1_048_576 else { throw SafeHTTPFailure.rejected }
    let path = components.percentEncodedPath.isEmpty ? "/" : components.percentEncodedPath
    let target = path + (components.percentEncodedQuery.map { "?" + $0 } ?? "")
    guard target.utf8.count <= 8192, !target.contains("\r"), !target.contains("\n") else {
      throw SafeHTTPFailure.rejected
    }
    let hostHeader = host.contains(":") ? "[\(host)]" : host
    let hostPort = portNumber == (scheme == "https" ? 443 : 80) ? "" : ":\(portNumber)"
    var lines = ["\(method) \(target) HTTP/1.1", "Host: \(hostHeader)\(hostPort)",
                 "Accept-Encoding: identity", "Connection: close"]
    var headerBytes = 0
    for (name, value) in headers {
      guard !name.isEmpty, name.utf8.allSatisfy({
        (65...90).contains($0) || (97...122).contains($0) || (48...57).contains($0) || $0 == 45
      }), value.utf8.count <= 8192, !value.contains("\r"), !value.contains("\n") else {
        throw SafeHTTPFailure.rejected
      }
      headerBytes += name.utf8.count + value.utf8.count + 4
      guard headerBytes <= 16_384 else { throw SafeHTTPFailure.rejected }
      if ["host", "accept-encoding", "connection", "content-length", "transfer-encoding"].contains(name.lowercased()) { continue }
      lines.append("\(name): \(value)")
    }
    if method == "POST" { lines.append("Content-Length: \(payload.count)") }
    guard let prefix = (lines.joined(separator: "\r\n") + "\r\n\r\n").data(using: .utf8) else {
      throw SafeHTTPFailure.rejected
    }
    self.host = host
    self.port = UInt16(portNumber)
    self.maxBytes = maxBytes
    self.timeoutMs = timeoutMs
    self.development = development
    self.tlsEnabled = scheme == "https"
    var requestData = prefix
    requestData.append(payload)
    self.requestData = requestData
    self.requestId = requestId
  }

  private static func integer(_ value: Any?, min: Int, max: Int) -> Int? {
    guard let number = value as? NSNumber else { return nil }
    let double = number.doubleValue
    guard double.isFinite, double.rounded(.towardZero) == double,
          double >= Double(min), double <= Double(max) else { return nil }
    return Int(double)
  }
}

final class SafeHTTPTask {
  private let request: SafeRequest
  private let completion: (Result<SafeHTTPResponse, Error>) -> Void
  private let queue = DispatchQueue(label: "com.opago.safe-http.request")
  private var connection: NWConnection?
  private var timer: DispatchSourceTimer?
  private var finished = false
  private var sent = false
  private var response: BoundedHTTPResponse

  init(_ request: SafeRequest, completion: @escaping (Result<SafeHTTPResponse, Error>) -> Void) {
    self.request = request
    self.completion = completion
    self.response = BoundedHTTPResponse(maxBytes: request.maxBytes)
  }

  func start() {
    queue.async {
      let timer = DispatchSource.makeTimerSource(queue: self.queue)
      timer.schedule(deadline: .now() + .milliseconds(self.request.timeoutMs))
      timer.setEventHandler { [weak self] in self?.finish(.failure(SafeHTTPFailure.rejected)) }
      self.timer = timer
      timer.resume()
      // getaddrinfo can block. A timed-out task is discarded before any
      // connection starts, even if DNS returns after the deadline.
      DispatchQueue.global(qos: .utility).async {
        let result = Result { try ScreenedResolver.resolve(self.request.host, development: self.request.development) }
        self.queue.async {
          guard !self.finished else { return }
          switch result {
          case .success(let address): self.connect(address)
          case .failure: self.finish(.failure(SafeHTTPFailure.rejected))
          }
        }
      }
    }
  }

  func cancel() { queue.async { self.finish(.failure(SafeHTTPFailure.rejected)) } }

  private func connect(_ address: NWEndpoint.Host) {
    let parameters: NWParameters
    if !request.tlsEnabled {
      parameters = .tcp
    } else {
      let tls = NWProtocolTLS.Options()
      sec_protocol_options_set_min_tls_protocol_version(tls.securityProtocolOptions, .TLSv12)
      sec_protocol_options_set_tls_resumption_enabled(tls.securityProtocolOptions, false)
      request.host.withCString { sec_protocol_options_set_tls_server_name(tls.securityProtocolOptions, $0) }
      sec_protocol_options_add_tls_application_protocol(tls.securityProtocolOptions, "http/1.1")
      let hostname = request.host
      sec_protocol_options_set_verify_block(tls.securityProtocolOptions, { _, trust, complete in
        let systemTrust = sec_trust_copy_ref(trust).takeRetainedValue()
        let policy = SecPolicyCreateSSL(true, hostname as CFString)
        guard SecTrustSetPolicies(systemTrust, policy) == errSecSuccess else {
          complete(false)
          return
        }
        var error: CFError?
        complete(SecTrustEvaluateWithError(systemTrust, &error))
      }, DispatchQueue.global(qos: .utility))
      parameters = NWParameters(tls: tls, tcp: NWProtocolTCP.Options())
    }
    // Prefer a direct route. The establishment report is checked before any
    // HTTP bytes are sent; a proxy or unavailable report fails closed.
    parameters.preferNoProxies = true
    parameters.allowFastOpen = false
    guard let port = NWEndpoint.Port(rawValue: request.port) else {
      finish(.failure(SafeHTTPFailure.rejected))
      return
    }
    let connection = NWConnection(to: .hostPort(host: address, port: port), using: parameters)
    self.connection = connection
    connection.stateUpdateHandler = { [weak self] state in
      guard let self, !self.finished else { return }
      switch state {
      case .ready:
        guard !self.sent else { return }
        self.sent = true
        connection.requestEstablishmentReport(queue: self.queue) { report in
          guard !self.finished else { return }
          guard let report, !report.usedProxy else {
            self.finish(.failure(SafeHTTPFailure.rejected))
            return
          }
          self.send()
        }
      case .failed, .cancelled: self.finish(.failure(SafeHTTPFailure.rejected))
      default: break
      }
    }
    connection.start(queue: queue)
  }

  private func send() {
    guard let connection, !finished else { return }
    connection.send(content: request.requestData, completion: .contentProcessed { [weak self] error in
      guard let self, !self.finished else { return }
      if error != nil { self.finish(.failure(SafeHTTPFailure.rejected)) }
      else { self.receive() }
    })
  }

  private func receive() {
    guard let connection, !finished else { return }
    connection.receive(minimumIncompleteLength: 1, maximumLength: 16_384) { [weak self] data, _, complete, error in
      guard let self, !self.finished else { return }
      do {
        if error != nil { throw SafeHTTPFailure.rejected }
        if let data, let value = try self.response.append(data) {
          self.finish(.success(value))
        } else if complete {
          self.finish(.success(try self.response.endOfStream()))
        } else {
          self.receive()
        }
      } catch {
        self.finish(.failure(SafeHTTPFailure.rejected))
      }
    }
  }

  private func finish(_ result: Result<SafeHTTPResponse, Error>) {
    guard !finished else { return }
    finished = true
    timer?.cancel()
    timer = nil
    connection?.stateUpdateHandler = nil
    connection?.cancel()
    connection = nil
    completion(result)
  }
}

public class OpagoSafeHttpModule: Module {
  private let lock = NSLock()
  private var active: [String: SafeHTTPTask] = [:]
  private var cancelledBeforeRegistration = Set<String>()

  public func definition() -> ModuleDefinition {
    Name("OpagoSafeHttp")

    AsyncFunction("cancel") { (requestId: String) in
      self.lock.lock()
      let task = self.active[requestId]
      if task == nil && self.cancelledBeforeRegistration.count < 1024 {
        self.cancelledBeforeRegistration.insert(requestId)
      }
      self.lock.unlock()
      task?.cancel()
    }

    AsyncFunction("request") { (options: [String: Any], promise: Promise) in
      do {
        let request = try SafeRequest(options)
        let task = SafeHTTPTask(request) { [weak self] result in
          self?.lock.lock()
          self?.active.removeValue(forKey: request.requestId)
          self?.lock.unlock()
          switch result {
          case .success(let value): promise.resolve(value.bridgeValue)
          case .failure: promise.reject("ERR_SAFE_NETWORK", "Secure network request failed.")
          }
        }
        self.lock.lock()
        let cancelled = self.cancelledBeforeRegistration.remove(request.requestId) != nil
        let duplicate = self.active[request.requestId] != nil
        if !cancelled && !duplicate { self.active[request.requestId] = task }
        self.lock.unlock()
        guard !cancelled && !duplicate else { throw SafeHTTPFailure.rejected }
        task.start()
      } catch {
        promise.reject("ERR_SAFE_NETWORK", "Secure network request failed.")
      }
    }

    OnDestroy {
      self.lock.lock()
      let tasks = Array(self.active.values)
      self.active.removeAll()
      self.cancelledBeforeRegistration.removeAll()
      self.lock.unlock()
      tasks.forEach { $0.cancel() }
    }
  }
}
