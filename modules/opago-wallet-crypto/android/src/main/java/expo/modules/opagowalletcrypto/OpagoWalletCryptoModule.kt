package expo.modules.opagowalletcrypto

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class OpagoWalletCryptoModule : Module() {
  // Fail closed if this device's provider does not reproduce a public BIP39 vector.
  private val providerVerified by lazy {
    val seed = Bip39Seed.derive("abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about")
    try {
      val expected = "5eb00bbddcf069084889a8ab9155568165f5c453ccb85e70811aaed6f6da5fc19a5ac40b389cd370d086206dec8aa6c43daea6690f20ad3d8d48b2d2ce9e38e4"
      seed.joinToString("") { "%02x".format(it.toInt() and 0xff) } == expected
    } finally {
      seed.fill(0)
    }
  }

  override fun definition() = ModuleDefinition {
    Name("OpagoWalletCrypto")

    // Expo AsyncFunction runs on its module queue, not the UI/JavaScript thread.
    AsyncFunction("deriveSeed") { mnemonic: String ->
      try {
        check(providerVerified)
        val seed = Bip39Seed.derive(mnemonic)
        try {
          seed.map { it.toInt() and 0xff }
        } finally {
          seed.fill(0)
        }
      } catch (_: Exception) {
        // Neither input nor provider exception details may enter bridge errors/logs.
        throw IllegalStateException("Wallet key derivation failed.")
      }
    }
  }
}
