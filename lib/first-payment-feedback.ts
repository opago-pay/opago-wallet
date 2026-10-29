import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';
import * as StoreReview from 'expo-store-review';
import { createMilestoneGate, eligibleHistoryEvent } from './first-payment-milestones.cjs';
import { attemptNativeReview, createReviewScheduler } from './first-payment-feedback-queue.cjs';
import type { PaymentHistoryItem } from './payment-details';

export type FirstPaymentKind = 'received' | 'sent';
const gate = createMilestoneGate(AsyncStorage);
const listeners = new Set<(event: { kind: FirstPaymentKind; id: number }) => void>();
let sequence = 0;

export function subscribeFirstPaymentFeedback(listener: (event: { kind: FirstPaymentKind; id: number }) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

let foregroundGeneration = 0;

async function requestNativeReviewOnce(wallet: string): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const generation = foregroundGeneration;
  const isCurrent = () => AppState.currentState === 'active' && generation === foregroundGeneration;
  try {
    return await attemptNativeReview(wallet, {
      isCurrent,
      hasClaim: key => gate.hasClaim(key, 'review'),
      isAvailable: () => StoreReview.isAvailableAsync(),
      requestReview: () => StoreReview.requestReview(),
      claim: key => gate.claim(key, 'review'),
    });
  } catch { /* Store or storage failure must never affect a payment. */ return false; }
}

const reviews = createReviewScheduler({
  isActive: () => AppState.currentState === 'active',
  requestReview: requestNativeReviewOnce,
});
AppState.addEventListener('change', state => {
  if (state !== 'active') foregroundGeneration++;
  reviews.onAppStateChange(state);
});

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
