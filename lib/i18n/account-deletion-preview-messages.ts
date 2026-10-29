import type { AppLanguage } from './language';
const rows = [
['Account deletion preview is disabled.','Die Vorschau zur Kontolöschung ist deaktiviert.','L’aperçu de suppression est désactivé.','La vista previa de eliminación está desactivada.','L’anteprima di eliminazione è disattivata.'],
['Mock only: This deletes account-scoped preview data, not a real OPAGO account.','Nur Mock: Es werden kontoabhängige Vorschaudaten gelöscht, kein echtes OPAGO-Konto.','Simulation : seules les données du compte de démonstration sont supprimées.','Simulación: solo se eliminan datos de prueba, no la cuenta real.','Simulazione: elimina solo dati di prova, non un account reale.'],
['Deleting your OPAGO account does not delete your self-custody wallet or recovery phrase. Keep your recovery words safe. Backend data retention depends on the service policy.','Die Kontolöschung entfernt weder deine Self-Custody-Wallet noch die Wiederherstellungswörter. Bewahre diese sicher auf. Die Aufbewahrung von Backend-Daten richtet sich nach den geltenden Regeln.','La suppression du compte ne supprime ni le portefeuille autonome ni la phrase de récupération. Conservez-la. La rétention dépend des règles du service.','Eliminar la cuenta no elimina la cartera de autocustodia ni la frase de recuperación. Consérvala. La retención depende de la política del servicio.','Eliminare l’account non elimina il portafoglio autonomo né le parole di recupero. Conservale. La conservazione dipende dalle regole del servizio.'],
['Account deletion confirmed (mock).','Kontolöschung bestätigt (Mock).','Suppression confirmée (simulation).','Eliminación confirmada (simulación).','Eliminazione confermata (simulazione).'],
['Account deletion pending (mock).','Kontolöschung ausstehend (Mock).','Suppression en attente (simulation).','Eliminación pendiente (simulación).','Eliminazione in attesa (simulazione).'],
['Account deletion failed','Kontolöschung fehlgeschlagen','Échec de la suppression','Error al eliminar la cuenta','Eliminazione account non riuscita'],
['Delete account','Account löschen','Supprimer le compte','Eliminar cuenta','Elimina account'],
['Delete OPAGO account?','OPAGO-Konto löschen?','Supprimer le compte OPAGO ?','¿Eliminar cuenta OPAGO?','Eliminare account OPAGO?'],
['Your account access and associated account data may be removed by the backend. Your wallet seed remains on this device. This cannot be undone.','Das Backend kann deinen Kontozugang und zugehörige Daten entfernen. Dein Wallet-Seed bleibt auf dem Gerät. Dies kann nicht rückgängig gemacht werden.','Le serveur peut supprimer l’accès et les données du compte. La graine du portefeuille reste sur cet appareil. Action irréversible.','El servidor puede eliminar el acceso y los datos de la cuenta. La semilla permanece en este dispositivo. Acción irreversible.','Il server può eliminare accesso e dati dell’account. Il seed resta su questo dispositivo. Azione irreversibile.'],
['Confirm account deletion','Kontolöschung bestätigen','Confirmer la suppression','Confirmar eliminación','Conferma eliminazione'],
] as const;
export function accountDeletionPreviewMessages(language: Exclude<AppLanguage,'en'>): Record<string,string> {
 const i = {de:1,fr:2,es:3,it:4}[language];
 return Object.fromEntries(rows.map(row=>[row[0],row[i]]));
}
