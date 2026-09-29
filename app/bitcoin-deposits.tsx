import { BitcoinDepositScreen } from '@/components/bitcoin/deposit-screen';
import { useWalletAuth } from '@/hooks/useWalletAuth';
import { useRouter } from 'expo-router';

export default function BitcoinDepositsRoute() {
  const { sparkWallet } = useWalletAuth();
  const router = useRouter();
  return <BitcoinDepositScreen wallet={sparkWallet} onBack={() => router.back()} />;
}
