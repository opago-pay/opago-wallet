import { useLocalSearchParams } from 'expo-router';
import ReceiveScreen from './(tabs)/receive';

export default function ReceiveFlow() {
  const { account } = useLocalSearchParams<{account?:string}>();
  return <ReceiveScreen modal initialNetwork={account === 'bitcoin_onchain' ? 'onchain' : account === 'hedera' ? 'hedera' : 'lightning'} />;
}
