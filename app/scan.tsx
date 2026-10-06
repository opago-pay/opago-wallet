import { useRouter } from 'expo-router';
import { PaymentScanner } from '@/components/send/payment-scanner';
import { paymentScanInbox } from '@/lib/payment-scan';
import { isPosLinkQr } from '@/lib/opago/pos-qr-native';

export default function ScanScreen() {
  const router = useRouter();
  return <PaymentScanner
    onOtherCode={value => {
      if (!isPosLinkQr(value)) return false;
      router.replace({ pathname: '/pos-link', params: { scanResultKey: paymentScanInbox.save(value) } }); return true;
    }}
    onCancel={() => { if (router.canGoBack()) router.back(); else router.replace('/(tabs)'); }}
    onDetected={value => {
      const scanResultKey = paymentScanInbox.save(value);
      router.replace({ pathname: '/(tabs)/send', params: { scanResultKey } });
    }}
  />;
}
