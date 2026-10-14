/** Evidence gates, changed only with linked review/build/E2E results. Environment
 * switches alone cannot enable unfinished mainnet payment paths. */
export const onchainReleaseEvidence = Object.freeze({
  androidDeviceRecovery: false,
  iosDeviceRecovery: false,
  regtestTransferAndRefund: false,
  liveAccountSync: false,
});
export function assertOnchainRelease(network: string): void {
  if (network === 'mainnet' && !Object.values(onchainReleaseEvidence).every(Boolean)) {
    throw new Error('Bitcoin on-chain is being prepared. Mainnet support is not available in this build.');
  }
}
