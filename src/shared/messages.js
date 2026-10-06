// Single source of UI text. messageId -> German text. Append-only across steps.
export const MESSAGES = Object.freeze({
  username_leer: 'Bitte einen Benutzernamen eingeben.',
  username_nur_punkte: 'Ein Benutzername darf nicht nur aus Punkten bestehen.',
  username_zu_lang: 'Username ist auch nach Kürzen des Nachnamens zu lang.',
  username_zeichen: 'Der Benutzername enthält nicht erlaubte Zeichen.',
  username_reserviert: 'Dieser Username ist in Nextcloud reserviert.',
});
