import { walletSession, type WalletSession } from './wallet-session';

// Keep invoices out of navigation URLs. One scan can be consumed once, by the
// same unlocked session, and never authorizes submission by itself.
export class PaymentScanInbox {
  private pending: { key: string; value: string; expiresAt: number; assertSession(): void } | null = null;
  private sequence = 0;

  constructor(private session: WalletSession, private now: () => number = Date.now) {
    session.subscribe(() => { if (!session.isUnlocked()) this.pending = null; });
  }

  save(value: string): string {
    if (!value.trim() || value.length > 8_192) throw new Error('This QR code is not a supported payment request.');
    const key = String(this.now()) + '-' + (++this.sequence);
    this.pending = { key, value: value.trim(), expiresAt: this.now() + 60_000, assertSession: this.session.capture() };
    return key;
  }

  take(key: string): string | null {
    const pending = this.pending;
    if (!pending || pending.key !== key) return null;
    this.pending = null;
    if (pending.expiresAt <= this.now()) return null;
    try { pending.assertSession(); return pending.value; }
    catch { return null; }
  }
}

export const paymentScanInbox = new PaymentScanInbox(walletSession);
