import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';
import * as StoreReview from 'expo-store-review';
import { createMilestoneGate, eligibleHistoryEvent } from './first-payment-milestones.cjs';
import type { PaymentHistoryItem } from './payment-details';

export type FirstPaymentKind = 'received' | 'sent';
const gate = createMilestoneGate(AsyncStorage);
const listeners = new Set<(event: { kind: FirstPaymentKind; id: number }) => void>();
let sequence = 0;

export function subscribeFirstPaymentFeedback(listener: (event: { kind: FirstPaymentKind; id: number }) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

async function requestNativeReviewOnce(wallet: string) {
  if (Platform.OS === 'web' || AppState.currentState !== 'active') return;
  try {
    if (!(await StoreReview.isAvailableAsync())) return;
    // Claim before asking: neither OS guarantees the prompt will be displayed.
    if (!(await gate.claim(wallet, 'review'))) return;
    await StoreReview.requestReview();
  } catch { /* A store failure must never affect a confirmed payment. */ }
}

export async function markFirstConfirmedPayment(wallet: string | null | undefined, kind: FirstPaymentKind) {
  if (!wallet || AppState.currentState !== 'active') return;
  try {
    if (!(await gate.claim(wallet, kind))) return;
    const event = { kind, id: ++sequence };
    for (const notify of listeners) notify(event);
    if (kind === 'sent') {
      // Give the success screen and celebration a moment before the system sheet.
      setTimeout(() => { void requestNativeReviewOnce(wallet); }, 1800);
    }
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
