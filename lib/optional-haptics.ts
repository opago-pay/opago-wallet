import * as Haptics from 'expo-haptics';

export async function notifyPaymentHaptics(type: Haptics.NotificationFeedbackType): Promise<void> {
  try {
    await Haptics.notificationAsync(type);
  } catch {
    // Optional device feedback must never change a payment result.
  }
}
