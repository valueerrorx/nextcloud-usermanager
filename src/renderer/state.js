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
