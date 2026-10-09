// S15: CSV-Usernamenliste gegen die geladene Userliste. Pure, kein I/O.
const MAX_NAMEN_IN_TEXT = 10;

// Vergleich exakt, nicht case-insensitiv: Aaron.w und aaron.w können getrennte Konten sein
// (REVIEW-NOTES [S08]). Doppelte Namen in der Datei zählen einmal.
export function ordneUserliste(usernames, users) {
  const bekannt = new Set(users.map((u) => u.userid));
  const gefunden = [];
  const nichtGefunden = [];
  const gesehen = new Set();
  for (const name of usernames) {
    if (gesehen.has(name)) continue;
    gesehen.add(name);
    (bekannt.has(name) ? gefunden : nichtGefunden).push(name);
  }
  return { gefunden, nichtGefunden };
}

// Nach erfolgreichem Lesen ersetzt genau die gefundene Menge die Auswahl, auch wenn sie leer ist.
export function auswahlNachCsv({ gefunden }) {
  return [...gefunden];
}

export function userlisteRueckmeldung({ gefunden, nichtGefunden }) {
  const gelesen = gefunden.length + nichtGefunden.length;
  if (gelesen === 0) return 'Die Datei enthält keine Benutzernamen.';
  let text = `${gelesen} Benutzernamen gelesen, davon ${gefunden.length} in der Liste gefunden.`;
  if (nichtGefunden.length > 0) {
    const genannt = nichtGefunden.slice(0, MAX_NAMEN_IN_TEXT).join(', ');
    const rest = nichtGefunden.length - MAX_NAMEN_IN_TEXT;
    text += ` Nicht gefunden: ${genannt}${rest > 0 ? ` und ${rest} weitere` : ''}.`;
  }
  return text;
}
