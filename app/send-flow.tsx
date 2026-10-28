import { useLocalSearchParams } from 'expo-router';
import SendScreen from './(tabs)/send';
import OnchainSendFlow from './onchain-send';

export default function SendFlow() {
  const { account } = useLocalSearchParams<{account?:string}>();
  return account === 'bitcoin_onchain' ? <OnchainSendFlow/> : <SendScreen modal initialAccount={account === 'hedera' ? 'hedera' : 'bitcoin_spark'} />;
}
