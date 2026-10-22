import type { AppLanguage } from './language';
const messages: Record<string, string[]> = {
  "Sign in or register": ["Anmelden oder registrieren", "Se connecter ou s’inscrire", "Iniciar sesión o registrarse", "Accedi o registrati"],
  "After confirming your email, return to the browser sign-in. If the wallet locks, unlock it and start sign-in again.": ["Kehre nach der E-Mail-Bestätigung zur Anmeldung im Browser zurück. Falls sich die Wallet sperrt, entsperre sie und starte die Anmeldung erneut.", "Après avoir confirmé votre e-mail, revenez à la connexion dans le navigateur. Si le portefeuille se verrouille, déverrouillez-le et recommencez la connexion.", "Tras confirmar tu correo, vuelve al inicio de sesión del navegador. Si la cartera se bloquea, desbloquéala e inicia sesión de nuevo.", "Dopo aver confermato l’e-mail, torna all’accesso nel browser. Se il wallet si blocca, sbloccalo e riavvia l’accesso."],
  "Please sign in again.": ["Bitte melde dich erneut an.", "Veuillez vous reconnecter.", "Vuelve a iniciar sesión.", "Accedi di nuovo."],
  "Sign out of OPAGO": ["Bei OPAGO abmelden", "Se déconnecter d’OPAGO", "Cerrar sesión en OPAGO", "Esci da OPAGO"],
  "Signed in to OPAGO.": ["Bei OPAGO angemeldet.","Connecté à OPAGO.","Sesión iniciada en OPAGO.","Accesso a OPAGO effettuato."],
  "Signed out of this wallet.": ["Aus dieser Wallet abgemeldet.","Déconnecté de ce portefeuille.","Sesión cerrada en esta cartera.","Disconnesso da questo wallet."],
  "Wallet sign-out could not be confirmed. Please retry.": ["Die Wallet-Abmeldung konnte nicht bestätigt werden. Bitte erneut versuchen.","La déconnexion du portefeuille n’a pas pu être confirmée. Réessayez.","No se pudo confirmar el cierre de sesión de la cartera. Inténtalo de nuevo.","Impossibile confermare la disconnessione dal wallet. Riprova."],
  "Registration from the wallet is not available yet.": ["Die Registrierung aus der Wallet ist noch nicht verfügbar.","L’inscription depuis le portefeuille n’est pas encore disponible.","El registro desde la cartera aún no está disponible.","La registrazione dal wallet non è ancora disponibile."],
  "Your account is signed in. Linking this wallet is a separate step.": ["Du bist bei deinem Konto angemeldet. Die Verknüpfung dieser Wallet erfolgt separat.","Votre compte est connecté. L’association de ce portefeuille est une étape distincte.","Has iniciado sesión en tu cuenta. Vincular esta cartera es un paso aparte.","Hai effettuato l’accesso al tuo account. Il collegamento di questo wallet è un passaggio separato."],
  "Sign in": ["Anmelden","Se connecter","Iniciar sesión","Accedi"],
  "Create account": ["Konto erstellen","Créer un compte","Crear cuenta","Crea account"],
  "Check again": ["Erneut prüfen","Vérifier à nouveau","Comprobar de nuevo","Controlla di nuovo"],
  "Cancel sign-in": ["Anmeldung abbrechen","Annuler la connexion","Cancelar inicio de sesión","Annulla accesso"],
  "Sign in or create your account on the OPAGO website. Your browser handles your password and security checks.": ["Melde dich auf der OPAGO-Website an oder erstelle dort dein Konto. Passwort und Sicherheitsprüfung erfolgen im Browser.","Connectez-vous ou créez votre compte sur le site OPAGO. Le mot de passe et les contrôles de sécurité sont gérés dans le navigateur.","Inicia sesión o crea tu cuenta en el sitio de OPAGO. La contraseña y los controles de seguridad se gestionan en el navegador.","Accedi o crea il tuo account sul sito OPAGO. Password e controlli di sicurezza vengono gestiti nel browser."],
  "OPAGO sign-in is temporarily unavailable. Please check again later. Your local wallet remains available.": ["Die OPAGO-Anmeldung ist vorübergehend nicht verfügbar. Bitte prüfe es später erneut. Deine lokale Wallet bleibt nutzbar.","La connexion OPAGO est temporairement indisponible. Réessayez plus tard. Votre portefeuille local reste disponible.","El acceso a OPAGO no está disponible temporalmente. Compruébalo más tarde. Tu cartera local sigue disponible.","L’accesso a OPAGO è temporaneamente indisponibile. Riprova più tardi. Il wallet locale resta disponibile."],
  "You have returned to your wallet. Sign-in has not been completed.": ["Du bist zurück in deiner Wallet. Die Anmeldung wurde nicht abgeschlossen.","Vous êtes de retour dans votre portefeuille. La connexion n’a pas été finalisée.","Has vuelto a tu cartera. El inicio de sesión no se ha completado.","Sei tornato al wallet. L’accesso non è stato completato."],
  "Sign in securely with your OPAGO email address and password.": ["Melde dich sicher mit deiner OPAGO-E-Mail-Adresse und deinem Passwort an.","Connectez-vous avec votre adresse e-mail OPAGO et votre mot de passe.","Inicia sesión de forma segura con tu correo OPAGO y contraseña.","Accedi in sicurezza con e-mail e password OPAGO."],
  "OPAGO account services are temporarily unavailable. Your local wallet remains available.": ["Die OPAGO-Kontodienste sind vorübergehend nicht verfügbar. Deine lokale Wallet bleibt nutzbar.","Les services de compte OPAGO sont temporairement indisponibles. Votre portefeuille local reste accessible.","Los servicios de cuenta OPAGO no están disponibles temporalmente. Tu cartera local sigue disponible.","I servizi dell’account OPAGO sono temporaneamente indisponibili. Il wallet locale resta disponibile."],
  "Sign-in was not accepted. Check your details or contact OPAGO support.": ["Die Anmeldung wurde nicht akzeptiert. Prüfe deine Angaben oder kontaktiere den OPAGO-Support.","La connexion n’a pas été acceptée. Vérifiez vos données ou contactez l’assistance OPAGO.","No se aceptó el inicio de sesión. Revisa tus datos o contacta con soporte OPAGO.","Accesso non accettato. Controlla i dati o contatta l’assistenza OPAGO."],
  "Enter your email address and password.": ["Gib deine E-Mail-Adresse und dein Passwort ein.","Saisissez votre adresse e-mail et votre mot de passe.","Introduce tu correo electrónico y contraseña.","Inserisci e-mail e password."],
  "Too many attempts. Please wait before signing in again.": ["Zu viele Versuche. Bitte warte, bevor du dich erneut anmeldest.","Trop de tentatives. Patientez avant de réessayer.","Demasiados intentos. Espera antes de volver a iniciar sesión.","Troppi tentativi. Attendi prima di accedere di nuovo."],
  "Sign-in cancelled.": ["Anmeldung abgebrochen.","Connexion annulée.","Inicio de sesión cancelado.","Accesso annullato."],
  "If this account can receive a password reset, an email will be sent.": ["Wenn für dieses Konto eine Passwort-Zurücksetzung möglich ist, wird eine E-Mail versendet.","Si ce compte peut recevoir une réinitialisation du mot de passe, un e-mail sera envoyé.","Si esta cuenta puede restablecer la contraseña, se enviará un correo.","Se questo account può reimpostare la password, verrà inviata un’e-mail."],
  "Reset password": ["Passwort zurücksetzen","Réinitialiser le mot de passe","Restablecer contraseña","Reimposta password"],
  "Wallet linking and personal Lightning addresses are not available yet. Your local wallet remains available.": ["Wallet-Verknüpfung und persönliche Lightning-Adressen sind noch nicht verfügbar. Deine lokale Wallet bleibt nutzbar.","La liaison du portefeuille et les adresses Lightning personnelles ne sont pas encore disponibles. Votre portefeuille local reste accessible.","La vinculación de la cartera y las direcciones Lightning personales aún no están disponibles. Tu cartera local sigue disponible.","Il collegamento del wallet e gli indirizzi Lightning personali non sono ancora disponibili. Il wallet locale resta disponibile."],
  "You are signed in. Confirm your email before linking this wallet, then refresh your account details.": ["Du bist angemeldet. Bestätige deine E-Mail, bevor du diese Wallet verknüpfst, und aktualisiere danach deine Kontodaten.", "Vous êtes connecté. Confirmez votre e-mail avant de lier ce portefeuille, puis actualisez les informations du compte.", "Has iniciado sesión. Confirma tu correo antes de vincular esta cartera y después actualiza los datos de tu cuenta.", "Hai effettuato l’accesso. Conferma l’e-mail prima di collegare questo wallet, poi aggiorna i dati dell’account."],
  "Refresh account details": ["Kontodaten aktualisieren", "Actualiser les informations du compte", "Actualizar datos de la cuenta", "Aggiorna i dati dell’account"],
  "Check your email, international phone number and password. The password must meet the account service requirements.": ["Prüfe E-Mail, internationale Telefonnummer und Passwort. Das Passwort muss die Anforderungen des Kontodienstes erfüllen.","Vérifiez l’e-mail, le numéro international et le mot de passe. Le mot de passe doit respecter les exigences du service de compte.","Revisa el correo, el número internacional y la contraseña. La contraseña debe cumplir los requisitos del servicio de cuentas.","Controlla e-mail, numero internazionale e password. La password deve rispettare i requisiti del servizio account."],
  "Registration is currently closed. You can sign in to an existing account or continue using your wallet.": ["Die Registrierung ist derzeit geschlossen. Du kannst dich bei einem bestehenden Konto anmelden oder deine Wallet weiter nutzen.","Les inscriptions sont actuellement fermées. Vous pouvez vous connecter à un compte existant ou continuer à utiliser votre portefeuille.","El registro está cerrado por ahora. Puedes iniciar sesión en una cuenta existente o seguir usando tu cartera.","Le registrazioni sono attualmente chiuse. Puoi accedere a un account esistente o continuare a usare il wallet."],
  "Registration could not be completed with these details. Try signing in or use password recovery in the sign-in window.": ["Die Registrierung konnte mit diesen Angaben nicht abgeschlossen werden. Versuche dich anzumelden oder nutze die Passwort-Wiederherstellung im Anmeldefenster.","L’inscription n’a pas pu être finalisée avec ces données. Essayez de vous connecter ou utilisez la récupération du mot de passe dans la fenêtre de connexion.","No se pudo completar el registro con estos datos. Intenta iniciar sesión o recuperar la contraseña en la ventana de acceso.","Non è stato possibile completare la registrazione con questi dati. Prova ad accedere o usa il recupero password nella finestra di accesso."],
  "Too many attempts. Wait before continuing your registration.": ["Zu viele Versuche. Warte, bevor du die Registrierung fortsetzt.","Trop de tentatives. Patientez avant de poursuivre l’inscription.","Demasiados intentos. Espera antes de continuar el registro.","Troppi tentativi. Attendi prima di continuare la registrazione."],
  "Registration is temporarily unavailable. Your account may already have been partly created.": ["Die Registrierung ist vorübergehend nicht verfügbar. Dein Konto wurde möglicherweise bereits teilweise angelegt.","L’inscription est temporairement indisponible. Votre compte a peut-être déjà été partiellement créé.","El registro no está disponible temporalmente. Es posible que tu cuenta ya se haya creado parcialmente.","La registrazione è temporaneamente indisponibile. Il tuo account potrebbe essere già stato creato in parte."],
  "The registration result is unknown. Your account may already have been created.": ["Das Ergebnis der Registrierung ist unbekannt. Dein Konto wurde möglicherweise bereits angelegt.","Le résultat de l’inscription est inconnu. Votre compte a peut-être déjà été créé.","Se desconoce el resultado del registro. Es posible que tu cuenta ya se haya creado.","L’esito della registrazione è sconosciuto. Il tuo account potrebbe essere già stato creato."],
  "Registration complete": ["Registrierung abgeschlossen","Inscription terminée","Registro completado","Registrazione completata"],
  "Your private account has been created and is active.": ["Dein Privatkonto wurde erstellt und ist aktiv.","Votre compte particulier a été créé et est actif.","Tu cuenta particular se ha creado y está activa.","Il tuo account privato è stato creato ed è attivo."],
  "Your registration has been resumed and your account is active.": ["Deine Registrierung wurde fortgesetzt und dein Konto ist aktiv.","Votre inscription a été reprise et votre compte est actif.","Se ha retomado tu registro y tu cuenta está activa.","La registrazione è stata ripresa e il tuo account è attivo."],
  "Email confirmation is pending. Follow the link in your email. You can sign in now.": ["Die E-Mail-Bestätigung steht noch aus. Folge dem Link in deiner E-Mail. Du kannst dich bereits anmelden.","La confirmation de l’e-mail est en attente. Suivez le lien reçu par e-mail. Vous pouvez déjà vous connecter.","La confirmación del correo está pendiente. Sigue el enlace del correo. Ya puedes iniciar sesión.","La conferma dell’e-mail è in sospeso. Segui il link nell’e-mail. Puoi già accedere."],
  "Your email address is confirmed. You can sign in now.": ["Deine E-Mail-Adresse ist bestätigt. Du kannst dich jetzt anmelden.","Votre adresse e-mail est confirmée. Vous pouvez vous connecter.","Tu dirección de correo está confirmada. Ya puedes iniciar sesión.","Il tuo indirizzo e-mail è confermato. Ora puoi accedere."],
  "Email confirmation is not required for this account. You can sign in now.": ["Für dieses Konto ist keine E-Mail-Bestätigung erforderlich. Du kannst dich jetzt anmelden.","Ce compte ne nécessite pas de confirmation de l’e-mail. Vous pouvez vous connecter.","Esta cuenta no requiere confirmación del correo. Ya puedes iniciar sesión.","Per questo account non è richiesta la conferma dell’e-mail. Ora puoi accedere."],
  "Registration does not sign you in, link your wallet or verify your identity.": ["Die Registrierung meldet dich nicht an, verknüpft deine Wallet nicht und bestätigt nicht deine Identität.","L’inscription ne vous connecte pas, ne lie pas votre portefeuille et ne vérifie pas votre identité.","El registro no inicia sesión, no vincula tu cartera ni verifica tu identidad.","La registrazione non effettua l’accesso, non collega il wallet e non verifica la tua identità."],
  "Try signing in first. To continue registration, enter the same password and use the same email and phone as before. This does not reset your password.": ["Versuche zuerst, dich anzumelden. Gib zum Fortsetzen dasselbe Passwort ein und verwende dieselbe E-Mail und Telefonnummer wie zuvor. Dein Passwort wird dabei nicht zurückgesetzt.","Essayez d’abord de vous connecter. Pour poursuivre, saisissez le même mot de passe et utilisez les mêmes e-mail et numéro qu’avant. Cela ne réinitialise pas votre mot de passe.","Intenta iniciar sesión primero. Para continuar, introduce la misma contraseña y usa el mismo correo y teléfono de antes. Esto no restablece tu contraseña.","Prova prima ad accedere. Per continuare, inserisci la stessa password e usa la stessa e-mail e lo stesso telefono di prima. La password non viene reimpostata."],
  "Please wait before trying again.": ["Bitte warte, bevor du es erneut versuchst.","Veuillez patienter avant de réessayer.","Espera antes de volver a intentarlo.","Attendi prima di riprovare."],
  "Continue registration with the same details": ["Registrierung mit denselben Angaben fortsetzen","Poursuivre avec les mêmes données","Continuar con los mismos datos","Continua con gli stessi dati"],
  "If an earlier registration was interrupted, try signing in or continue with exactly the same email, phone and password. Registration is never retried automatically.": ["Wurde eine frühere Registrierung unterbrochen, versuche dich anzumelden oder setze sie mit genau derselben E-Mail, Telefonnummer und demselben Passwort fort. Die Registrierung wird nie automatisch wiederholt.","Si une inscription précédente a été interrompue, essayez de vous connecter ou reprenez avec exactement les mêmes e-mail, téléphone et mot de passe. L’inscription n’est jamais répétée automatiquement.","Si se interrumpió un registro anterior, intenta iniciar sesión o continúa con exactamente el mismo correo, teléfono y contraseña. El registro nunca se reintenta automáticamente.","Se una registrazione precedente è stata interrotta, prova ad accedere o continua con la stessa e-mail, lo stesso telefono e la stessa password. La registrazione non viene mai ripetuta automaticamente."],
  "Sign in to your existing account in the OPAGO browser window.": ["Melde dich im OPAGO-Browserfenster bei deinem bestehenden Konto an.", "Connectez-vous à votre compte existant dans la fenêtre OPAGO.", "Inicia sesión en tu cuenta existente en la ventana de OPAGO.", "Accedi al tuo account esistente nella finestra OPAGO."],
  "Sign in to OPAGO": ["Bei OPAGO anmelden", "Se connecter à OPAGO", "Iniciar sesión en OPAGO", "Accedi a OPAGO"],
  "Create an OPAGO account": [
    "OPAGO-Konto erstellen",
    "Créer un compte OPAGO",
    "Crear una cuenta OPAGO",
    "Crea un account OPAGO"
  ],
  "Account details": [
    "Kontodaten",
    "Informations du compte",
    "Datos de la cuenta",
    "Dati account"
  ],
  "Email address": [
    "E-Mail-Adresse",
    "Adresse e-mail",
    "Correo electrónico",
    "Indirizzo e-mail"
  ],
  "Mobile number": [
    "Handynummer",
    "Numéro de portable",
    "Número de móvil",
    "Numero di cellulare"
  ],
  "Password": [
    "Passwort",
    "Mot de passe",
    "Contraseña",
    "Password"
  ],
  "Create private account": [
    "Privatkonto erstellen",
    "Créer un compte privé",
    "Crear cuenta privada",
    "Crea account privato"
  ],
  "Already have an account? Sign in": [
    "Schon ein Konto? Anmelden",
    "Déjà un compte ? Se connecter",
    "¿Ya tienes cuenta? Inicia sesión",
    "Hai già un account? Accedi"
  ],
  "Continue using my wallet": [
    "Wallet weiter nutzen",
    "Continuer à utiliser mon portefeuille",
    "Seguir usando mi cartera",
    "Continua a usare il wallet"
  ],
  "Enter a valid email address.": [
    "Bitte eine gültige E-Mail-Adresse eingeben.",
    "Saisissez une adresse e-mail valide.",
    "Introduce un correo electrónico válido.",
    "Inserisci un indirizzo e-mail valido."
  ],
  "Enter your mobile number.": [
    "Bitte deine Handynummer eingeben.",
    "Saisissez votre numéro de portable.",
    "Introduce tu número de móvil.",
    "Inserisci il tuo numero di cellulare."
  ],
  "Enter your mobile number with + and country code, using digits only.": [
    "Gib deine Handynummer mit + und Ländervorwahl ein, danach nur Ziffern.",
    "Saisissez votre numéro avec + et l’indicatif du pays, puis uniquement des chiffres.",
    "Introduce tu móvil con + y el código de país, seguido solo de dígitos.",
    "Inserisci il numero con + e prefisso internazionale, seguito solo da cifre."
  ],
  "Use at least 8 characters for your password.": [
    "Verwende mindestens 8 Zeichen für dein Passwort.",
    "Utilisez au moins 8 caractères pour votre mot de passe.",
    "Usa al menos 8 caracteres para tu contraseña.",
    "Usa almeno 8 caratteri per la password."
  ],
  "Your OPAGO account is a private customer account. Registration uses your email, mobile number and password. No identity photos are required.": [
    "Dein OPAGO-Konto ist ein Privatkundenkonto. Zur Registrierung brauchst du E-Mail, Handynummer und Passwort. Ausweisfotos sind nicht erforderlich.",
    "Votre compte OPAGO est un compte particulier. L’inscription utilise votre e-mail, numéro de portable et mot de passe. Aucune photo d’identité n’est requise.",
    "Tu cuenta OPAGO es una cuenta particular. El registro utiliza tu correo, móvil y contraseña. No se requieren fotos de identidad.",
    "Il tuo account OPAGO è un account privato. Per registrarti servono e-mail, cellulare e password. Non sono richieste foto dei documenti."
  ],
  "Registration is not available yet. This form does not send or save your details and cannot create an account.": [
    "Die Registrierung ist noch nicht verfügbar. Dieses Formular versendet oder speichert deine Angaben nicht und kann kein Konto erstellen.",
    "L’inscription n’est pas encore disponible. Ce formulaire n’envoie ni n’enregistre vos données et ne peut pas créer de compte.",
    "El registro aún no está disponible. Este formulario no envía ni guarda tus datos y no puede crear una cuenta.",
    "La registrazione non è ancora disponibile. Questo modulo non invia né salva i tuoi dati e non può creare un account."
  ],
  "Use + and the country code for your mobile number. Entering it does not verify it. No SMS confirmation is required in this release; email confirmation will use an email link.": [
    "Gib deine Handynummer mit + und Ländervorwahl an. Die Eingabe bestätigt sie nicht. In dieser Version ist keine SMS-Bestätigung nötig; die E-Mail-Adresse wird über einen E-Mail-Link bestätigt.",
    "Utilisez + et l’indicatif du pays. La saisie ne vérifie pas le numéro. Aucune confirmation SMS n’est requise dans cette version ; l’e-mail sera confirmé par un lien.",
    "Usa + y el código de país. Introducir el número no lo verifica. Esta versión no requiere confirmación SMS; el correo se confirmará mediante un enlace.",
    "Usa + e il prefisso internazionale. L’inserimento non verifica il numero. Questa versione non richiede conferma SMS; l’e-mail sarà confermata tramite un link."
  ],
  "If you already submitted a registration and its result is unknown, do not submit it again. Try signing in or contact support.": [
    "Wenn du eine Registrierung bereits abgesendet hast und das Ergebnis unklar ist, sende sie nicht erneut ab. Versuche dich anzumelden oder kontaktiere den Support.",
    "Si vous avez déjà envoyé une inscription sans résultat connu, ne la renvoyez pas. Essayez de vous connecter ou contactez l’assistance.",
    "Si ya enviaste un registro y desconoces el resultado, no lo repitas. Intenta iniciar sesión o contacta con soporte.",
    "Se hai già inviato una registrazione e non ne conosci l’esito, non inviarla di nuovo. Prova ad accedere o contatta l’assistenza."
  ],
  "Your wallet, balances, recovery words and existing account links remain unchanged. An OPAGO account is optional for your local wallet.": [
    "Deine Wallet, Guthaben, Wiederherstellungswörter und bestehenden Kontoverknüpfungen bleiben erhalten. Für deine lokale Wallet ist ein OPAGO-Konto optional.",
    "Votre portefeuille, vos soldes, mots de récupération et liens de compte existants restent inchangés. Un compte OPAGO est facultatif pour votre portefeuille local.",
    "Tu cartera, saldos, palabras de recuperación y vínculos existentes no cambian. La cuenta OPAGO es opcional para tu cartera local.",
    "Wallet, saldi, parole di recupero e collegamenti esistenti restano invariati. Un account OPAGO è facoltativo per il wallet locale."
  ],
  "This address service is not available for your account yet. Registration does not automatically activate it. Your local wallet remains available.": [
    "Dieser Adressdienst ist für dein Konto noch nicht verfügbar. Eine Registrierung aktiviert ihn nicht automatisch. Deine lokale Wallet bleibt verfügbar.",
    "Ce service d’adresse n’est pas encore disponible pour votre compte. L’inscription ne l’active pas automatiquement. Votre portefeuille local reste disponible.",
    "Este servicio de dirección aún no está disponible para tu cuenta. El registro no lo activa automáticamente. Tu cartera local sigue disponible.",
    "Questo servizio di indirizzo non è ancora disponibile per il tuo account. La registrazione non lo attiva automaticamente. Il wallet locale resta disponibile."
  ],
  "This service is not enabled for your account. Contact support; no identity photos are required in MVP registration.": [
    "Dieser Dienst ist für dein Konto nicht freigeschaltet. Kontaktiere den Support. Für die MVP-Registrierung sind keine Ausweisfotos erforderlich.",
    "Ce service n’est pas activé pour votre compte. Contactez l’assistance ; aucune photo d’identité n’est requise pour l’inscription MVP.",
    "Este servicio no está habilitado para tu cuenta. Contacta con soporte; el registro MVP no requiere fotos de identidad.",
    "Questo servizio non è abilitato per il tuo account. Contatta l’assistenza; la registrazione MVP non richiede foto dei documenti."
  ]
} ;
export function signupMessages(language: Exclude<AppLanguage, 'en'>): Record<string, string> {
  const index = ['de', 'fr', 'es', 'it'].indexOf(language);
  return Object.fromEntries(Object.entries(messages).map(([key, values]) => [key, values[index]]));
}
