// Release scope: HBAR and Bitcoin/Lightning. Unreviewed integrations stay off.
export const productCapabilities = Object.freeze({ swaps: false, identityPayments: false });

export function requireIdentityPayments(): void {
  if (!productCapabilities.identityPayments) {
    throw new Error('Payments requiring identity information are not supported in this release.');
  }
}
