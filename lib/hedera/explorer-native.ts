import * as Linking from 'expo-linking';
import { validateHederaExplorerUrl } from './explorer';

export async function openHederaExplorerUrl(rawUrl: string): Promise<void> {
  await Linking.openURL(validateHederaExplorerUrl(rawUrl));
}
