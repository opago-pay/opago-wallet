package expo.modules.opagowalletcrypto;

import java.security.GeneralSecurityException;
import java.util.Arrays;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;

/** BIP39's existing 2048-round HMAC-SHA512, with an empty passphrase. */
public final class Bip39Seed {
  private static final byte[] SALT = new byte[] {109, 110, 101, 109, 111, 110, 105, 99};

  private Bip39Seed() {}

  public static byte[] derive(String mnemonic) throws GeneralSecurityException {
    // JS validates the English word list and checksum before crossing the bridge.
    // Only canonical ASCII phrases are accepted, so UTF-8/NFKD is unambiguous.
    if (mnemonic == null || mnemonic.length() > 240 ||
        !mnemonic.matches("[a-z]+(?: [a-z]+){11}(?:(?: [a-z]+){3}){0,4}")) {
      throw new GeneralSecurityException("Invalid recovery phrase format.");
    }
    char[] password = mnemonic.toCharArray();
    PBEKeySpec spec = new PBEKeySpec(password, SALT, 2048, 512);
    try {
      return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA512").generateSecret(spec).getEncoded();
    } finally {
      spec.clearPassword();
      Arrays.fill(password, '\0');
    }
  }
}
