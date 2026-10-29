import type { AppLanguage } from './language';
const rows = [
['Account linking preview is disabled.','Die Vorschau zur Kontoverknüpfung ist deaktiviert.','L’aperçu de liaison du compte est désactivé.','La vista previa de vinculación está desactivada.','L’anteprima del collegamento è disattivata.'],
['OPAGO account and wallet linking','OPAGO-Konto und Wallet verknüpfen','Lier le compte OPAGO au portefeuille','Vincular cuenta OPAGO y cartera','Collega account OPAGO e portafoglio'],
['Mock preview only. No real account or wallet changes are made.','Nur Mock-Vorschau. Echte Konten und Wallets bleiben unverändert.','Aperçu simulé uniquement. Aucun changement réel.','Solo vista simulada. No se realizan cambios reales.','Solo anteprima simulata. Nessuna modifica reale.'],
['Signed in (mock)','Angemeldet (Mock)','Connecté (simulation)','Sesión iniciada (simulada)','Accesso effettuato (simulazione)'],
['Not signed in','Nicht angemeldet','Non connecté','Sesión no iniciada','Accesso non effettuato'],
['Wallet linked','Wallet verknüpft','Portefeuille lié','Cartera vinculada','Portafoglio collegato'],
['Wallet not linked','Wallet nicht verknüpft','Portefeuille non lié','Cartera no vinculada','Portafoglio non collegato'],
['Sign in to OPAGO (mock)','Bei OPAGO anmelden (Mock)','Se connecter à OPAGO (simulation)','Iniciar sesión en OPAGO (simulación)','Accedi a OPAGO (simulazione)'],
['Refresh linking status','Verknüpfungsstatus aktualisieren','Actualiser le statut de liaison','Actualizar estado del vínculo','Aggiorna stato collegamento'],
['Link wallet (Spark signature required)','Wallet verknüpfen (Spark-Signatur erforderlich)','Lier le portefeuille (signature Spark requise)','Vincular cartera (requiere firma Spark)','Collega portafoglio (firma Spark richiesta)'],
['Proof unavailable','Besitznachweis nicht verfügbar','Preuve indisponible','Prueba no disponible','Prova non disponibile'],
['Connect the existing Spark Identity Key signer before enabling this preview. No signature was created.','Vor Freischaltung den vorhandenen Spark-Identity-Key-Signer anbinden. Es wurde keine Signatur erstellt.','Connectez le signataire Spark existant avant activation. Aucune signature créée.','Conecta el firmante Spark existente antes de activarlo. No se creó ninguna firma.','Collega il firmatario Spark esistente prima di attivare. Nessuna firma creata.'],
['Unlink wallet','Wallet trennen','Dissocier le portefeuille','Desvincular cartera','Scollega portafoglio'],
['Unlink wallet?','Wallet-Verknüpfung aufheben?','Dissocier le portefeuille ?','¿Desvincular cartera?','Scollegare portafoglio?'],
['This does not delete your local wallet.','Deine lokale Wallet wird nicht gelöscht.','Votre portefeuille local ne sera pas supprimé.','No se eliminará tu cartera local.','Il portafoglio locale non verrà eliminato.'],
['Unlink','Trennen','Dissocier','Desvincular','Scollega'],
['Sign out','Abmelden','Se déconnecter','Cerrar sesión','Esci'],
['Wallet is linked to another account.','Wallet ist mit einem anderen Konto verknüpft.','Le portefeuille est lié à un autre compte.','La cartera está vinculada a otra cuenta.','Il portafoglio è collegato a un altro account.'],
['Challenge expired. Please try again.','Challenge abgelaufen. Bitte erneut versuchen.','Défi expiré. Réessayez.','Desafío caducado. Inténtalo de nuevo.','Sfida scaduta. Riprova.'],
['Network error. Please retry.','Netzwerkfehler. Bitte erneut versuchen.','Erreur réseau. Réessayez.','Error de red. Vuelve a intentarlo.','Errore di rete. Riprova.'],
['Action cancelled.','Aktion abgebrochen.','Action annulée.','Acción cancelada.','Azione annullata.'],
] as const;
export function accountLinkPreviewMessages(language: Exclude<AppLanguage, 'en'>): Record<string,string> {
const index = {de:1,fr:2,es:3,it:4}[language];
return Object.fromEntries(rows.map(row=>[row[0],row[index]]));
}
