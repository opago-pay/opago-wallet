import type { AppLanguage } from './language';
const rows = [
  ["Bitcoin Only", "Bitcoin Only", "Bitcoin Only", "Bitcoin Only", "Bitcoin Only"],
  ["Setting not saved", "Einstellung nicht gespeichert", "Réglage non enregistré", "Ajuste no guardado", "Impostazione non salvata"],
  ["Show only Bitcoin and Lightning balances and payment options. All activity stays visible.", "Nur Bitcoin- und Lightning-Guthaben sowie Zahlungsoptionen anzeigen. Alle Aktivitäten bleiben sichtbar.", "Afficher uniquement les soldes et options de paiement Bitcoin et Lightning. Toute l’activité reste visible.", "Mostrar solo saldos y opciones de pago de Bitcoin y Lightning. Toda la actividad sigue visible.", "Mostra solo saldi e opzioni di pagamento Bitcoin e Lightning. Tutte le attività restano visibili."],
  ["Turn off Bitcoin Only in Settings to use other coins.", "Deaktiviere Bitcoin Only in den Einstellungen, um andere Coins zu verwenden.", "Désactivez Bitcoin Only dans les réglages pour utiliser d’autres cryptomonnaies.", "Desactiva Bitcoin Only en Ajustes para usar otras monedas.", "Disattiva Bitcoin Only nelle impostazioni per usare altre monete."],
  ["Not available in this build", "In dieser Version noch nicht verfügbar", "Pas encore disponible dans cette version", "Aún no disponible en esta versión", "Non ancora disponibile in questa versione"],
  ["Onchain receiving is not available yet", "Onchain-Empfang noch nicht verfügbar", "Réception on-chain pas encore disponible", "Recepción on-chain aún no disponible", "Ricezione on-chain non ancora disponibile"],
  ["Onchain receiving is not enabled in this build. Use Lightning to receive Bitcoin.", "Der Onchain-Empfang ist in dieser Version noch nicht freigeschaltet. Du kannst Bitcoin über Lightning empfangen.", "La réception on-chain n’est pas activée dans cette version. Vous pouvez recevoir des bitcoins via Lightning.", "La recepción on-chain no está habilitada en esta versión. Puedes recibir bitcoin por Lightning.", "La ricezione on-chain non è abilitata in questa versione. Puoi ricevere bitcoin tramite Lightning."],
  ["Receive with Lightning", "Über Lightning empfangen", "Recevoir via Lightning", "Recibir por Lightning", "Ricevi tramite Lightning"],

  ['Onchain activity reports','Onchain-Aktivitätsmeldungen','Rapports d’activité on-chain','Informes de actividad on-chain','Rapporti attività on-chain'],
  ['Insufficient onchain balance. Leave enough Bitcoin for the network fee.', 'Nicht genug Onchain-Guthaben. Berücksichtige auch die Bitcoin-Netzwerkgebühr.', 'Solde on-chain insuffisant. Prévoyez aussi les frais du réseau Bitcoin.', 'Saldo on-chain insuficiente. Deja suficiente bitcoin para la comisión de red.', 'Saldo on-chain insufficiente. Considera anche la commissione di rete Bitcoin.'],
  ['Bitcoin operation could not be completed. Check the saved payment status before trying again.', 'Der Bitcoin-Vorgang konnte nicht abgeschlossen werden. Prüfe vor einem erneuten Versuch den gespeicherten Zahlungsstatus.', 'L’opération Bitcoin n’a pas pu être terminée. Vérifiez le statut enregistré avant de réessayer.', 'No se pudo completar la operación Bitcoin. Comprueba el estado guardado antes de intentarlo de nuevo.', 'Impossibile completare l’operazione Bitcoin. Controlla lo stato salvato prima di riprovare.'],
  ['Bitcoin onchain mainnet has not been enabled for this build.', 'Bitcoin Onchain im Mainnet ist in dieser Version noch nicht freigeschaltet.', 'Bitcoin on-chain sur le mainnet n’est pas activé dans cette version.', 'Bitcoin on-chain en mainnet aún no está habilitado en esta versión.', 'Bitcoin on-chain su mainnet non è ancora abilitato in questa versione.'],

  ['Moving Bitcoin to Lightning has fees and needs Bitcoin confirmation. Review this payment again afterwards.', 'Die Übertragung zu Lightning kostet Gebühren und benötigt eine Bitcoin-Bestätigung. Prüfe diese Zahlung anschließend erneut.', 'Le transfert vers Lightning entraîne des frais et nécessite une confirmation Bitcoin. Vérifiez ensuite à nouveau ce paiement.', 'Transferir a Lightning tiene comisiones y requiere confirmación de Bitcoin. Revisa este pago de nuevo después.', 'Il trasferimento a Lightning comporta commissioni e richiede una conferma Bitcoin. Verifica di nuovo il pagamento in seguito.'],
  [
    "Onchain",
    "Onchain",
    "On-chain",
    "On-chain",
    "On-chain"
  ],
  [
    "Transfer in progress · balances updating",
    "Übertragung läuft · Guthaben werden aktualisiert",
    "Transfert en cours · mise à jour des soldes",
    "Transferencia en curso · actualizando saldos",
    "Trasferimento in corso · aggiornamento saldi"
  ],
  [
    "Lightning fee approval required",
    "Lightning-Gebühr bitte freigeben",
    "Frais Lightning à approuver",
    "Aprueba la comisión de Lightning",
    "Approva la commissione Lightning"
  ],
  [
    "Checking transfer",
    "Übertragung wird geprüft",
    "Vérification du transfert",
    "Comprobando transferencia",
    "Verifica del trasferimento"
  ],
  [
    "Available: {amount} SAT",
    "Verfügbar: {amount} SAT",
    "Disponible : {amount} SAT",
    "Disponible: {amount} SAT",
    "Disponibile: {amount} SAT"
  ],
  [
    "Internal transfer",
    "Interne Übertragung",
    "Transfert interne",
    "Transferencia interna",
    "Trasferimento interno"
  ],
  [
    "Bitcoin stays in your onchain balance. You choose when to send it or move it to Lightning.",
    "Bitcoin bleibt in deinem Onchain-Guthaben. Du entscheidest, wann du es sendest oder zu Lightning überträgst.",
    "Les bitcoins restent dans votre solde on-chain. Vous choisissez quand les envoyer ou les transférer vers Lightning.",
    "Bitcoin permanece en tu saldo on-chain. Tú decides cuándo enviarlo o transferirlo a Lightning.",
    "I bitcoin restano nel saldo on-chain. Scegli tu quando inviarli o trasferirli a Lightning."
  ],
  [
    "Previous Lightning deposits",
    "Einzahlungen auf bisherige Bitcoin-Adresse",
    "Dépôts sur l’ancienne adresse Bitcoin",
    "Depósitos en la dirección Bitcoin anterior",
    "Depositi sul precedente indirizzo Bitcoin"
  ],
  [
    "Move Bitcoin",
    "Bitcoin übertragen",
    "Transférer des bitcoins",
    "Transferir bitcoin",
    "Trasferisci bitcoin"
  ],
  [
    "Confirm transfer",
    "Übertragung bestätigen",
    "Confirmer le transfert",
    "Confirmar transferencia",
    "Conferma trasferimento"
  ],
  [
    "Check amount and fees",
    "Betrag und Gebühren prüfen",
    "Vérifier le montant et les frais",
    "Revisar importe y comisiones",
    "Verifica importo e commissioni"
  ],
  [
    "Move Bitcoin between your balances. Fees apply.",
    "Bitcoin zwischen deinen Guthaben übertragen. Es fallen Gebühren an.",
    "Transférez des bitcoins entre vos soldes. Des frais s’appliquent.",
    "Transfiere bitcoin entre tus saldos. Se aplican comisiones.",
    "Trasferisci bitcoin tra i tuoi saldi. Si applicano commissioni."
  ],
  [
    "Change direction",
    "Richtung wechseln",
    "Changer de sens",
    "Cambiar dirección",
    "Inverti direzione"
  ],
  [
    "Deposit for Lightning",
    "Für Lightning einzahlen",
    "Déposer pour Lightning",
    "Depositar para Lightning",
    "Deposita per Lightning"
  ],
  [
    "Receive on-chain",
    "Onchain erhalten",
    "Recevoir on-chain",
    "Recibir on-chain",
    "Ricevi on-chain"
  ],
  [
    "Total deducted",
    "Gesamte Abbuchung",
    "Total débité",
    "Total descontado",
    "Totale addebitato"
  ],
  [
    "After Bitcoin confirmation, you review the fee for your Lightning balance. The final Lightning credit is not yet known.",
    "Nach der Bitcoin-Bestätigung prüfst du die Gebühr für die Lightning-Gutschrift. Der endgültige Gutschriftsbetrag steht noch nicht fest.",
    "Après confirmation Bitcoin, vous vérifiez les frais du crédit Lightning. Le montant final crédité n’est pas encore connu.",
    "Tras la confirmación de Bitcoin, revisarás la comisión del abono Lightning. El importe final aún no se conoce.",
    "Dopo la conferma Bitcoin, verifichi la commissione per l’accredito Lightning. L’importo finale non è ancora noto."
  ],
  [
    "Your receiving address",
    "Deine Empfangsadresse",
    "Votre adresse de réception",
    "Tu dirección de recepción",
    "Il tuo indirizzo di ricezione"
  ],
  [
    "Your transaction is saved. Closing this screen does not cancel it.",
    "Dein Auftrag ist gespeichert. Das Schließen dieser Ansicht bricht ihn nicht ab.",
    "Votre transaction est enregistrée. Fermer cet écran ne l’annule pas.",
    "Tu transacción está guardada. Cerrar esta pantalla no la cancela.",
    "La transazione è salvata. Chiudere questa schermata non la annulla."
  ],
  [
    "Network and service fees",
    "Netzwerk- und Servicegebühren",
    "Frais de réseau et de service",
    "Comisiones de red y de servicio",
    "Commissioni di rete e di servizio"
  ],
  [
    "Lightning claim fee",
    "Gebühr für Lightning-Gutschrift",
    "Frais du crédit Lightning",
    "Comisión del abono Lightning",
    "Commissione per l’accredito Lightning"
  ],
  [
    "Check and resend saved transaction",
    "Gespeicherte Transaktion prüfen und erneut übertragen",
    "Vérifier et renvoyer la transaction enregistrée",
    "Comprobar y reenviar la transacción guardada",
    "Verifica e reinvia la transazione salvata"
  ],
  [
    "Cancel preparation",
    "Vorbereitung abbrechen",
    "Annuler la préparation",
    "Cancelar preparación",
    "Annulla preparazione"
  ],
  [
    "Review Lightning fee",
    "Lightning-Gebühr prüfen",
    "Vérifier les frais Lightning",
    "Revisar comisión Lightning",
    "Verifica commissione Lightning"
  ],
  [
    "Return to on-chain",
    "Onchain zurückholen",
    "Récupérer on-chain",
    "Devolver a on-chain",
    "Riporta on-chain"
  ],
  [
    "Deposit",
    "Einzahlung",
    "Dépôt",
    "Depósito",
    "Deposito"
  ],
  [
    "Lightning receives",
    "Lightning erhält",
    "Lightning reçoit",
    "Lightning recibe",
    "Lightning riceve"
  ],
  [
    "Confirm Lightning credit",
    "Lightning-Gutschrift bestätigen",
    "Confirmer le crédit Lightning",
    "Confirmar abono Lightning",
    "Conferma accredito Lightning"
  ],
  [
    "Continue later",
    "Später fortsetzen",
    "Continuer plus tard",
    "Continuar más tarde",
    "Continua più tardi"
  ],
  [
    "The original Bitcoin fee has already been paid. This return has an additional network fee.",
    "Die ursprüngliche Bitcoin-Gebühr wurde bereits bezahlt. Für diese Rückholung fällt eine weitere Netzwerkgebühr an.",
    "Les frais Bitcoin initiaux ont déjà été payés. Ce retour entraîne des frais de réseau supplémentaires.",
    "La comisión original de Bitcoin ya se pagó. Esta devolución tiene una comisión de red adicional.",
    "La commissione Bitcoin originale è già stata pagata. Il ritorno comporta un’ulteriore commissione di rete."
  ],
  [
    "Confirm return",
    "Rückholung bestätigen",
    "Confirmer le retour",
    "Confirmar devolución",
    "Conferma ritorno"
  ],
  [
    "Resume saved refund",
    "Gespeicherte Rückholung fortsetzen",
    "Reprendre le retour enregistré",
    "Reanudar devolución guardada",
    "Riprendi il ritorno salvato"
  ],
  [
    "Returned to on-chain",
    "Onchain zurückgeholt",
    "Récupéré on-chain",
    "Devuelto a on-chain",
    "Riportato on-chain"
  ],
  [
    "Sent Bitcoin",
    "Bitcoin gesendet",
    "Bitcoins envoyés",
    "Bitcoin enviado",
    "Bitcoin inviati"
  ],
  [
    "Payment not sent",
    "Zahlung nicht gesendet",
    "Paiement non envoyé",
    "Pago no enviado",
    "Pagamento non inviato"
  ],
  [
    "Bitcoin confirmation pending",
    "Bitcoin-Bestätigung ausstehend",
    "Confirmation Bitcoin en attente",
    "Confirmación de Bitcoin pendiente",
    "Conferma Bitcoin in attesa"
  ],
  [
    "Received Bitcoin",
    "Bitcoin empfangen",
    "Bitcoins reçus",
    "Bitcoin recibido",
    "Bitcoin ricevuti"
  ],
  [
    "Check amount and fee",
    "Betrag und Gebühr prüfen",
    "Vérifier le montant et les frais",
    "Revisar importe y comisión",
    "Verifica importo e commissione"
  ],
  [
    "Recipient address",
    "Empfängeradresse",
    "Adresse du destinataire",
    "Dirección del destinatario",
    "Indirizzo del destinatario"
  ],
  [
    "Send from Lightning balance",
    "Aus Lightning-Guthaben senden",
    "Envoyer depuis le solde Lightning",
    "Enviar desde el saldo Lightning",
    "Invia dal saldo Lightning"
  ],
  [
    "No transaction has been broadcast. You can cancel this preparation.",
    "Es wurde keine Transaktion übertragen. Du kannst die Vorbereitung abbrechen.",
    "Aucune transaction n’a été diffusée. Vous pouvez annuler cette préparation.",
    "No se ha transmitido ninguna transacción. Puedes cancelar esta preparación.",
    "Nessuna transazione è stata trasmessa. Puoi annullare questa preparazione."
  ],
  [
    "From Lightning balance",
    "Aus Lightning-Guthaben",
    "Depuis le solde Lightning",
    "Desde el saldo Lightning",
    "Dal saldo Lightning"
  ],
  [
    "Two Bitcoin balances",
    "Zwei Bitcoin-Guthaben",
    "Deux soldes Bitcoin",
    "Dos saldos de Bitcoin",
    "Due saldi Bitcoin"
  ],
  [
    "Bitcoin on-chain and Lightning have separate balances. Move Bitcoin between them when needed. You review fees before each transfer. Lightning uses Spark; learn about its dependencies in wallet details.",
    "Bitcoin Onchain und Lightning haben getrennte Guthaben. Du kannst Bitcoin bei Bedarf übertragen und prüfst davor die Gebühren. Lightning nutzt Spark; Einzelheiten findest du in den Wallet-Details.",
    "Bitcoin on-chain et Lightning ont des soldes distincts. Transférez des bitcoins au besoin, après vérification des frais. Lightning utilise Spark ; ses dépendances sont décrites dans les détails du portefeuille.",
    "Bitcoin on-chain y Lightning tienen saldos separados. Transfiere bitcoin cuando lo necesites y revisa las comisiones antes. Lightning utiliza Spark; consulta sus dependencias en los detalles de la cartera.",
    "Bitcoin on-chain e Lightning hanno saldi separati. Trasferisci bitcoin quando serve, verificando prima le commissioni. Lightning usa Spark; trovi le sue dipendenze nei dettagli del portafoglio."
  ],
  [
    "Lightning",
    "Lightning",
    "Lightning",
    "Lightning",
    "Lightning"
  ],
  [
    "Your Lightning balance uses Spark. Bitcoin stays here until you send it or move it to on-chain.",
    "Dein Lightning-Guthaben nutzt Spark. Bitcoin bleibt hier, bis du es sendest oder onchain überträgst.",
    "Votre solde Lightning utilise Spark. Les bitcoins y restent jusqu’à leur envoi ou leur transfert on-chain.",
    "Tu saldo Lightning utiliza Spark. Bitcoin permanece aquí hasta que lo envíes o lo transfieras a on-chain.",
    "Il saldo Lightning usa Spark. I bitcoin restano qui finché non li invii o trasferisci on-chain."
  ],
  [
    "Move to Lightning",
    "Zu Lightning übertragen",
    "Transférer vers Lightning",
    "Transferir a Lightning",
    "Trasferisci a Lightning"
  ],
  [
    "Move to on-chain",
    "Onchain übertragen",
    "Transférer on-chain",
    "Transferir a on-chain",
    "Trasferisci on-chain"
  ],
  [
    "Checking Lightning credit",
    "Lightning-Gutschrift wird geprüft",
    "Vérification du crédit Lightning",
    "Comprobando abono Lightning",
    "Verifica accredito Lightning"
  ],
  [
    "Checking refund",
    "Rückholung wird geprüft",
    "Vérification du retour",
    "Comprobando devolución",
    "Verifica ritorno"
  ],
  [
    "Both Bitcoin balances must be available.",
    "Beide Bitcoin-Guthaben müssen verfügbar sein.",
    "Les deux soldes Bitcoin doivent être disponibles.",
    "Ambos saldos de Bitcoin deben estar disponibles.",
    "Entrambi i saldi Bitcoin devono essere disponibili."
  ],
  [
    "Bitcoin on-chain is being prepared. Mainnet support is not available in this build.",
    "Bitcoin Onchain wird vorbereitet. Mainnet ist in dieser Version noch nicht verfügbar.",
    "Bitcoin on-chain est en préparation. Le mainnet n’est pas disponible dans cette version.",
    "Bitcoin on-chain está en preparación. Mainnet no está disponible en esta versión.",
    "Bitcoin on-chain è in preparazione. Mainnet non è disponibile in questa versione."
  ],
  [
    "Transfer could not be loaded.",
    "Die Übertragung konnte nicht geladen werden.",
    "Le transfert n’a pas pu être chargé.",
    "No se pudo cargar la transferencia.",
    "Impossibile caricare il trasferimento."
  ],
  [
    "Payment could not be loaded.",
    "Die Zahlung konnte nicht geladen werden.",
    "Le paiement n’a pas pu être chargé.",
    "No se pudo cargar el pago.",
    "Impossibile caricare il pagamento."
  ]
] as const;
export function onchainMessages(language: Exclude<AppLanguage,'en'>): Record<string,string> {
  const index={de:1,fr:2,es:3,it:4}[language];
  return Object.fromEntries(rows.map(row=>[row[0],row[index]]));
}
