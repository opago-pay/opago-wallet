import type { AppLanguage } from './language';
const messages: Record<string, string[]> = {
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
