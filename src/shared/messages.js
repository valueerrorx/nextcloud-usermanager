// Single source of UI text. messageId -> German text. Append-only across steps.
export const MESSAGES = Object.freeze({
  username_leer: 'Bitte einen Benutzernamen eingeben.',
  username_nur_punkte: 'Ein Benutzername darf nicht nur aus Punkten bestehen.',
  username_zu_lang: 'Username ist auch nach Kürzen des Nachnamens zu lang.',
  username_zeichen: 'Der Benutzername enthält nicht erlaubte Zeichen.',
  username_reserviert: 'Dieser Username ist in Nextcloud reserviert.',
  falsche_zugangsdaten: 'Benutzername oder App-Passwort ist falsch.',
  kein_admin: 'Dieses Konto hat keine Administratorrechte.',
  server_blockt_vorerst: 'Der Server blockt Anfragen vorübergehend. Bitte einige Minuten warten.',
  falscher_basispfad: 'Keine Nextcloud-API unter dieser Adresse gefunden. Bitte die Server-URL prüfen.',
  server_nicht_erreichbar: 'Server nicht erreichbar. Bitte Adresse und Netzwerk prüfen.',
  zeitueberschreitung: 'Der Server hat nicht rechtzeitig geantwortet.',
  zertifikat_nicht_vertraut: 'Das Zertifikat des Servers ist nicht vertrauenswürdig.',
  unerwarteter_serverfehler: 'Unerwartete Antwort des Servers.',
  ocs_fehler: 'Der Server hat die Anfrage abgelehnt.',
});
