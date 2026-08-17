import * as Linking from 'expo-linking';
import { validateSolanaExplorerUrl } from './explorer';

export async function openSolanaExplorerUrl(rawUrl: string): Promise<void> {
  await Linking.openURL(validateSolanaExplorerUrl(rawUrl));
}
