import Foundation
import Security

private func urlBytes(_ raw: String) -> Data? {
  guard raw.count <= 50_000 else { return nil }
  var encoded = raw.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
  encoded += String(repeating: "=", count: (4 - encoded.count % 4) % 4)
  return Data(base64Encoded: encoded)
}
// ASN.1 encoding for SecKey's public PKCS#1 input. Signature verification is done by Security.
private func der(_ tag: UInt8, _ bytes: Data) -> Data {
  let length = bytes.count
  var prefix = Data([tag])
  if length < 128 { prefix.append(UInt8(length)) }
  else if length < 256 { prefix.append(contentsOf: [0x81, UInt8(length)]) }
  else { prefix.append(contentsOf: [0x82, UInt8(length >> 8), UInt8(length & 255)]) }
  prefix.append(bytes)
  return prefix
}
func verifyOidcRs256(n: String, e: String, message: String, signature: String) -> Bool {
  guard let modulus = urlBytes(n), (256...512).contains(modulus.count), let first = modulus.first, first >= 128,
        let exponent = urlBytes(e), (1...4).contains(exponent.count), exponent.first != 0,
        let last = exponent.last, last & 1 == 1, exponent.count > 1 || last >= 3,
        let data = urlBytes(message), data.count <= 32_768,
        let sig = urlBytes(signature), sig.count == modulus.count else { return false }
  var positive = Data([0]); positive.append(modulus)
  var positiveExponent = Data()
  if let first = exponent.first, first >= 128 { positiveExponent.append(0) }
  positiveExponent.append(exponent)
  var parts = der(0x02, positive); parts.append(der(0x02, positiveExponent))
  let attributes: [String: Any] = [kSecAttrKeyType as String: kSecAttrKeyTypeRSA,
    kSecAttrKeyClass as String: kSecAttrKeyClassPublic, kSecAttrKeySizeInBits as String: modulus.count * 8]
  guard let key = SecKeyCreateWithData(der(0x30, parts) as CFData, attributes as CFDictionary, nil),
        SecKeyIsAlgorithmSupported(key, .verify, .rsaSignatureMessagePKCS1v15SHA256) else { return false }
  return SecKeyVerifySignature(key, .rsaSignatureMessagePKCS1v15SHA256, data as CFData, sig as CFData, nil)
}
