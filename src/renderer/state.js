import { reactive, ref } from 'vue';

export const activeView = ref('connect');

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

// Set by App.vue when a certificate prompt is declined/expired; ConnectView surfaces it as its
// form error so a rejection is never silently dropped (REVIEW-NOTES [S04]).
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
