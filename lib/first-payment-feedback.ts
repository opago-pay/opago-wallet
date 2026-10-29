import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';
import * as StoreReview from 'expo-store-review';
import { createMilestoneGate, eligibleHistoryEvent } from './first-payment-milestones.cjs';
import { createReviewScheduler } from './first-payment-feedback-queue.cjs';
import type { PaymentHistoryItem } from './payment-details';

export type FirstPaymentKind = 'received' | 'sent';
const gate = createMilestoneGate(AsyncStorage);
const listeners = new Set<(event: { kind: FirstPaymentKind; id: number }) => void>();
let sequence = 0;

export function subscribeFirstPaymentFeedback(listener: (event: { kind: FirstPaymentKind; id: number }) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

async function requestNativeReviewOnce(wallet: string): Promise<boolean> {
  if (Platform.OS === 'web' || AppState.currentState !== 'active') return false;
  try {
    if (!(await StoreReview.isAvailableAsync())) return false;
    // Recheck foreground after the asynchronous store availability lookup.
    // Claim before asking: neither OS guarantees the prompt will be displayed.
    if (AppState.currentState !== 'active') return false;
    if (!(await gate.claim(wallet, 'review'))) return true;
    await StoreReview.requestReview();
    return true;
  } catch { /* A store failure must never affect a confirmed payment. */ return false; }
}

const reviews = createReviewScheduler({
  isActive: () => AppState.currentState === 'active',
  requestReview: requestNativeReviewOnce,
});
AppState.addEventListener('change', state => reviews.onAppStateChange(state));

export async function markFirstConfirmedPayment(wallet: string | null | undefined, kind: FirstPaymentKind) {
  if (!wallet || AppState.currentState !== 'active') return;
  try {
    const first = await gate.claim(wallet, kind);
    if (first) {
      const event = { kind, id: ++sequence };
      for (const notify of listeners) notify(event);
    }
    // Even if 'sent' was claimed before a background transition (or a process
    // restart), confirmed history can re-enqueue its still-unclaimed review.
    if (kind === 'sent') reviews.enqueue(wallet);
  } catch { /* Storage failures must not show repeatable milestone animations. */ }
}

export async function observeFirstConfirmedHistory(wallet: string | null | undefined, items: PaymentHistoryItem[]) {
  if (!wallet) return;
  const kinds = new Set<FirstPaymentKind>();
  for (const item of items) {
    const kind = eligibleHistoryEvent(item);
    if (kind) kinds.add(kind);
  }
  for (const kind of kinds) await markFirstConfirmedPayment(wallet, kind);
}
