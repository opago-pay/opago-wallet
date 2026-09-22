import { useRouter } from 'expo-router';
import { PaymentScanner } from '@/components/send/payment-scanner';
import { paymentScanInbox } from '@/lib/payment-scan';

export default function ScanScreen() {
  const router = useRouter();
  return <PaymentScanner
    onCancel={() => { if (router.canGoBack()) router.back(); else router.replace('/(tabs)'); }}
    onDetected={value => {
      const scanResultKey = paymentScanInbox.save(value);
      router.replace({ pathname: '/(tabs)/send', params: { scanResultKey } });
    }}
  />;
}
