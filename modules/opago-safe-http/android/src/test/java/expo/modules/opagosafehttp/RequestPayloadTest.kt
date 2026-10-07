package expo.modules.opagosafehttp

import org.junit.Assert.*
import org.junit.Test
import okio.ByteString.Companion.toByteString

class RequestPayloadTest {
  private val path = "/api/v2/onboarding/kyc/00000000-0000-4000-8000-000000000001/documents"
  private fun decode(body: String, method: String = "POST", route: String = path, scheme: String = "https",
    type: String = "application/octet-stream", header: Boolean = true): ByteArray = requestPayload(body,"base64",method,route,scheme,type,header)
  @Test fun binaryCiphertextUsesExactBytesAndContractLimits() {
    val bytes = ByteArray(29) { it.toByte() }; assertArrayEquals(bytes,decode(bytes.toByteString().base64()))
    val maximum = ByteArray(10_485_788); assertEquals(maximum.size,decode(maximum.toByteString().base64()).size)
    assertThrows(Exception::class.java) { decode(ByteArray(10_485_789).toByteString().base64()) }
    assertThrows(Exception::class.java) { decode(ByteArray(28).toByteString().base64()) }
  }
  @Test fun photoCannotRelaxOrdinaryJSONReadOrArbitraryEndpointRules() {
    val body = ByteArray(29).toByteString().base64()
    assertThrows(Exception::class.java) { decode(body,method="GET") }
    assertThrows(Exception::class.java) { decode(body,route="/arbitrary") }
    assertThrows(Exception::class.java) { decode(body,scheme="http") }
    assertThrows(Exception::class.java) { decode(body,type="application/json") }
    assertThrows(Exception::class.java) { decode(body,header=false) }
    assertThrows(Exception::class.java) { decode(body.trimEnd('=')) }
    assertThrows(Exception::class.java) { requestPayload(body,"other","POST",path,"https","application/octet-stream",true) }
    assertThrows(Exception::class.java) { requestPayload("x".repeat(1_048_577),null,"POST","/api","https","application/json",false) }
    assertArrayEquals("{}".toByteArray(),requestPayload("{}",null,"POST","/api","https","application/json",false))
  }
}
