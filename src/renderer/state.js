import { reactive, ref } from 'vue';

export const activeView = ref('dashboard');

// True once the startup status check (and auto-connect) has finished; until then the app shows
// "Verbindung wird geprüft…". connecting is true during any connect attempt (sidebar dot).
export const startupGeprueft = ref(false);
export const connecting = ref(false);

// Mirrors connection.status (ARCHITECTURE §3); connected gates Dashboard/Benutzer/Gruppen/Import.
export const connection = reactive({
  connected: false,
  baseUrl: null,
  adminUserId: null,
  secretStorage: 'session',
  certException: null,
  hasSaved: false,
  savedBaseUrl: null,
  savedAdminUser: null,
});

// Active TLS exception for App.vue's permanent banner; set directly on accept so the banner
// updates without waiting for the next connection.status poll.
export const certException = ref(null);

// Set by App.vue when a certificate prompt is declined/expired or auto-connect failed; the
// connection popup surfaces it as its error so a rejection is never silently dropped (REVIEW-NOTES [S04]).
export const connectError = ref(null);

// Userliste (ARCHITECTURE §4/§7). UsersView.vue lädt bei jedem Betreten neu, kein Cache-Treffer
// über Views hinweg - users.list hat bewusst keinen refresh-Parameter (ARCHITECTURE §3).
export const users = ref([]);
// 'details' | 'fallback' | null (noch nicht geladen) - informativ, memoisiert ohnehin in session.js.
export const usersMode = ref(null);
// Zeitstempel (Date.now()) des zuletzt erfolgreich geladenen Stands, für die "Stand:"-Anzeige.
export const usersFetchedAt = ref(null);
// 'laedt' | 'leer' | 'fehler' | 'bereit' - treibt StateBlock.vue direkt an.
export const usersLadezustand = ref('laedt');
// Deutscher Fehlertext aus messages.js, nur gesetzt wenn usersLadezustand === 'fehler'.
export const usersFehler = ref(null);
// Anzahl der im N+1-Fallback fehlgeschlagenen Einzelabfragen (fehlen in `users`).
export const usersUebersprungen = ref(0);

// Suche/Filter/Sortierung der Usertabelle (S06, ARCHITECTURE §4.1) - rein clientseitig, kein
// Request. Die eigentliche Logik steckt in shared/filters.js, nicht hier.
export const filterSuche = ref('');
export const filterGruppe = ref(null); // null = alle Gruppen
export const filterStatus = ref('alle'); // 'alle' | 'aktiv' | 'deaktiviert'
export const filterQuotaStufe = ref(null); // null = alle Stufen
export const sortFeld = ref('userid'); // 'userid' | 'displayname' | 'quota' | 'lastSeen'
export const sortRichtung = ref('aufsteigend'); // 'aufsteigend' | 'absteigend'
export const seitenGroesse = ref(100); // 100 | 150 | 200 | 400, display only
export const seitenNummer = ref(1);
// Set von userid-Strings, keine Objektreferenzen - nach "Neu laden" sind die User-Objekte neu.
export const auswahl = ref(new Set());

// Batch-Aktions-Job (S08, ARCHITECTURE §5) - gemeinsamer Zustand von ActionBar.vue (startet den
// Job über actions.run) und JobProgress.vue (zeigt Fortschritt und Bericht). Kein Store, nur
// reaktive refs wie der Rest dieser Datei.
export const jobLaeuft = ref(false);
export const jobQuelle = ref(null); // 'users' | 'groups' | 'import' | null — which view owns the report
export const jobId = ref(null);
export const jobFortschritt = ref(null); // { done, total } | null
export const jobResults = ref([]); // ItemResult[] aus actions.run
export const jobSummary = ref(null); // { ok, fehler, nichtAusgefuehrt, teilweise } | null
export const dryRunPlan = ref(null); // letzter bestätigter planActions()-Output

// Job-Historie der laufenden Sitzung (S13, DECISIONS "Dashboard Batch-Job-Historie"): letzte 5,
// neueste zuerst, keine Persistenz, keine Dry-Runs. Eintrag: { zeitpunkt, aktion, summary }.
// aktion ist bereits das deutsche Label (ActionBar.vue kennt es ohnehin), damit DashboardView.vue
// keine Action-ID -> Label-Zuordnung braucht. Kappung/Reihenfolge laufen über
// shared/dashboard.js#pushJobHistorie, nicht hier.
export const jobHistorie = ref([]);

// Gruppenliste (S12, ARCHITECTURE §4) - Mitglieder und memberCount werden clientseitig aus
// `users` abgeleitet (shared/groups.js), nicht hier und nicht per eigenem Request.
export const groups = ref([]); // { id, displayname }[] aus groups.list, Server-Reihenfolge
export const groupsLadezustand = ref('laedt'); // 'laedt' | 'leer' | 'fehler' | 'bereit'
export const groupsFehler = ref(null);
export const freiplatz = ref(null); // server.freeSpace result | null (S18), independent of the dashboard load state
export const ausgewaehlteGruppe = ref(null); // groupId | null

// Importvorschau (S10, ARCHITECTURE §3.1/§6) - CSV, Optionen und Vorschau-Status von
// ImportView.vue. buildImportPlan läuft rein im Renderer (shared/importPlan.js), kein Kanal nötig.
export const importDatei = ref(null); // { path, zeilenAnzahl } | null
export const importRows = ref([]); // RawRow[] aus parseImportCsv
export const importPlanRows = ref([]); // PreviewRow[] aus buildImportPlan
export const importSummary = ref(null); // { neu, kollisionAufgeloest, fehler } | null
export const importPrefix = ref('');
export const importOrder = ref('givenFirst'); // 'givenFirst' | 'surnameFirst'
export const importGruppen = ref([]); // ausgewählte Zielgruppen, groupId-Strings
export const importQuota = ref(null); // QUOTA_PRESETS-id | null, Kontingent für neue User
export const importFehler = ref(null); // deutscher Dateifehlertext, nur bei ungültiger Datei gesetzt

// Ein erfolgreicher (re)connect kann eine ANDERE Instanz sein (REVIEW-NOTES [S13] CRITICAL: ohne
// Reset zeigt das Dashboard weiter Zahlen/Zeitstempel der vorherigen Instanz). users/groups/
// jobHistorie gehören zur alten Verbindung und müssen weg; die Importvorschau trägt zusätzlich
// Initialpasswörter (ARCHITECTURE §6) und die Auswahl zeigt auf User-Objekte, die es auf der
// neuen Instanz so nicht gibt. Aufgerufen von connectFlow.js nach erfolgreichem connect/connectSaved
// und nach Logout - kein Store, nur ein gebündelter Reset derselben Refs wie oben.
export function resetOnConnect() {
  users.value = [];
  usersMode.value = null;
  usersFetchedAt.value = null;
  usersLadezustand.value = 'laedt';
  usersFehler.value = null;
  usersUebersprungen.value = 0;
  auswahl.value = new Set();

  groups.value = [];
  groupsLadezustand.value = 'laedt';
  groupsFehler.value = null;
  ausgewaehlteGruppe.value = null;

  jobHistorie.value = [];
  freiplatz.value = null;

  importDatei.value = null;
  importRows.value = [];
  importPlanRows.value = [];
  importSummary.value = null;
  importPrefix.value = '';
  importGruppen.value = [];
  importQuota.value = null;
  importFehler.value = null;
}
