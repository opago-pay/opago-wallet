import type { AppLanguage } from './language';
const rows: [string, string, string][] = [
['Account deletion preview is disabled.', 'Die Vorschau zur Kontolöschung ist deaktiviert.', 'Account deletion preview is disabled.'],
['Mock only: no live account request is made.', 'Nur Mock: Es wird keine echte Kontoanfrage gesendet.', 'Mock only: no live account request is made.'],
['Deleting your OPAGO account immediately blocks account access and automatically detaches linked wallets. Your self-custody wallet and keys remain on your device. Final deletion is scheduled after 30 days; you can cancel during this grace period.', 'Mit der Kontolöschung wird dein Zugang sofort gesperrt und verknüpfte Wallets werden automatisch getrennt. Deine Self-Custody-Wallet und Schlüssel bleiben lokal bei dir. Die endgültige Löschung erfolgt nach 30 Tagen; bis dahin kannst du den Vorgang abbrechen.', 'Deleting your OPAGO account immediately blocks account access and automatically detaches linked wallets. Your self-custody wallet and keys remain on your device. Final deletion is scheduled after 30 days; you can cancel during this grace period.'],
['Request account deletion (mock)', 'Kontolöschung anfordern (Mock)', 'Request account deletion (mock)'],
['Deletion requested (mock)', 'Löschung angefordert (Mock)', 'Deletion requested (mock)'],
['Cancel scheduled deletion (mock)', 'Geplante Löschung abbrechen (Mock)', 'Cancel scheduled deletion (mock)'],
['Deletion cancelled (mock)', 'Löschung abgebrochen (Mock)', 'Deletion cancelled (mock)'],
['Wallet detach preview is disabled.', 'Die Vorschau zum Trennen der Wallet ist deaktiviert.', 'Wallet detach preview is disabled.'],
['Mock only: no live wallet request is made.', 'Nur Mock: Es wird keine echte Wallet-Anfrage gesendet.', 'Mock only: no live wallet request is made.'],
['Detaching disables inbound and outbound payments and your OPAGO Lightning address. Open invoices remain valid until they expire. Your wallet and keys stay on this device. Re-linking creates a new binding. No recovery or support exception is available.', 'Nach dem Trennen sind eingehende und ausgehende Zahlungen sowie deine OPAGO-Lightning-Adresse deaktiviert. Offene Rechnungen bleiben bis zum Ablauf gültig. Wallet und Schlüssel bleiben lokal. Erneutes Verknüpfen ist eine neue Bindung. Es gibt keine Recovery- oder Support-Ausnahme.', 'Detaching disables inbound and outbound payments and your OPAGO Lightning address. Open invoices remain valid until they expire. Your wallet and keys stay on this device. Re-linking creates a new binding. No recovery or support exception is available.'],
['Detach wallet (mock)', 'Wallet trennen (Mock)', 'Detach wallet (mock)'],
['Wallet detached (mock). Payments are disabled.', 'Wallet getrennt (Mock). Zahlungen sind deaktiviert.', 'Wallet detached (mock). Payments are disabled.'],
];
export function accountWalletLifecycleMessages(language: AppLanguage): Record<string, string> {
  const index = language === 'de' ? 1 : 2;
  return Object.fromEntries(rows.map(row => [row[0], row[index]]));
}
