import { SparkWallet, type ConfigOptions, type InitWalletResponse } from '@buildonspark/spark-sdk';
import { sats } from './bitcoin/amount';
import { installSparkLeafSelection } from './spark-leaf-selection';
import { PaymentScopedSparkSigner } from './spark-signer-cache';
import { installSparkHtlcPreparation } from './spark-htlc-preparation';
import { installSparkLightningPipeline } from './spark-lightning-pipeline';
import type { WalletAuthChallenge, WalletAuthIntent } from './wallet-auth-proof';

/** Bitcoin payment reads must not wait for unrelated Spark-token services. */
export class BitcoinSparkWallet extends SparkWallet {
  private readonly lightningPipeline: { close(): void };
  constructor(...args: ConstructorParameters<typeof SparkWallet>) {
    super(...args);
    installSparkLeafSelection(this.leafManager);
    installSparkHtlcPreparation(this.signingService, this.config?.signer);
    this.lightningPipeline = installSparkLightningPipeline(this.transferService, this.lightningService);
  }

  protected override async initWallet(
    mnemonicOrSeed?: Uint8Array | string,
    accountNumber?: number,
    options: ConfigOptions = {},
  ): Promise<InitWalletResponse<this>> {
    try {
      return await super.initWallet(mnemonicOrSeed, accountNumber, options);
    } catch (cause) {
      // The pinned SDK starts native polling before its final sync. Its static
      // initialize() does not return the instance after a failed sync, so the
      // caller cannot dispose it. This subclass still owns it at this point.
      await this.cleanupConnections().catch(() => undefined);
      throw cause;
    }
  }

  override async payLightningInvoice(input: Parameters<SparkWallet['payLightningInvoice']>[0]) {
    const signer = this.config.signer;
    return signer instanceof PaymentScopedSparkSigner
      ? signer.withSendKeyCache(() => super.payLightningInvoice(input))
      : super.payLightningInvoice(input);
  }

  /** Sign only a challenge that exactly matches the requested F3 login or account binding. */
  async signOpagoWalletChallenge(
    challenge: WalletAuthChallenge,
    intent: WalletAuthIntent,
    network: 'mainnet' | 'regtest',
    installationId: string,
  ) {
    // Keep F3-only code out of existing wallet startup and payment paths.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { signWalletAuthChallenge } = require('./wallet-auth-proof') as typeof import('./wallet-auth-proof');
    return signWalletAuthChallenge(this.config.signer, challenge, intent, network, installationId);
  }

  override async cleanupConnections() {
    this.lightningPipeline.close();
    const signer = this.config.signer;
    if (signer instanceof PaymentScopedSparkSigner) signer.clearSendKeyCache();
    return super.cleanupConnections();
  }

  async getBitcoinBalance() {
    // Follow pinned SDK 0.7.12 getBalance's fresh AVAILABLE-leaf path, including
    // key validation/recovery and cache eviction. Never use the display cache
    // or sum owned/incoming leaves as spendable funds.
    const freshLeaves = await this.getLeaves(true);
    const available = BigInt(sats(freshLeaves.reduce(
      (sum, leaf) => sum + BigInt(sats(leaf.value)), 0n,
    )));
    await this.leafManager.addLeaves(freshLeaves);
    await this.leafManager.evictStaleAvailable(new Set(freshLeaves.map(leaf => leaf.id)));
    return {
      balance: available,
      satsBalance: {
        available,
        owned: BigInt(this.leafManager.getOwnedBalance()),
        incoming: BigInt(this.leafManager.getIncomingBalance()),
      },
    };
  }
}
