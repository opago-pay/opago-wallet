package expo.modules.opagosafehttp

import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction

/** Signed peer replies must round-trip without replacement characters or normalization. */
internal fun strictUtf8(bytes: ByteArray): String = Charsets.UTF_8.newDecoder()
  .onMalformedInput(CodingErrorAction.REPORT)
  .onUnmappableCharacter(CodingErrorAction.REPORT)
  .decode(ByteBuffer.wrap(bytes))
  .toString()
