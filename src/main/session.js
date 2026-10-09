// In-memory session state only, never persisted (ARCHITECTURE §2 "session.js"). The plaintext
// app password lives exclusively in this closure and must never leave via an IPC return value.
const state = {
  client: null,
  baseUrl: null,
  adminUser: null,
  adminUserId: null,
  appPassword: null,
  secretStorage: 'session',
  certException: null,
  userListMode: null,
};

const jobStates = new Map(); // jobId -> 'laufend' | 'beendet'
const stopFlags = new Set(); // jobId currently flagged to stop

export const session = {
  get connected() {
    return state.client !== null;
  },
  get client() {
    return state.client;
  },
  get baseUrl() {
    return state.baseUrl;
  },
  get adminUser() {
    return state.adminUser;
  },
  get adminUserId() {
    return state.adminUserId;
  },
  get appPassword() {
    return state.appPassword;
  },
  get secretStorage() {
    return state.secretStorage;
  },
  get certException() {
    return state.certException;
  },
  get userListMode() {
    return state.userListMode;
  },

  // Written only after a successful connection check (A6) - a failed attempt leaves this untouched.
  // userListMode is reset to null on every (re)connect (S05 A7) so a server change re-probes.
  setConnected({ client, baseUrl, adminUser, adminUserId, appPassword, secretStorage }) {
    state.client = client;
    state.baseUrl = baseUrl;
    state.adminUser = adminUser;
    state.adminUserId = adminUserId;
    state.appPassword = appPassword;
    state.secretStorage = secretStorage;
    state.userListMode = null;
  },

  // Logout: drops client and credentials; the TLS exception belongs to the TLS controller and stays.
  disconnect() {
    state.client = null;
    state.baseUrl = null;
    state.adminUser = null;
    state.adminUserId = null;
    state.appPassword = null;
    state.secretStorage = 'session';
    state.userListMode = null;
  },

  setSecretStorage(secretStorage) {
    state.secretStorage = secretStorage;
  },

  setCertException(exception) {
    state.certException = exception;
  },

  setUserListMode(mode) {
    state.userListMode = mode;
  },

  setJobState(jobId, zustand) {
    jobStates.set(jobId, zustand);
  },

  getJobState(jobId) {
    return jobStates.get(jobId) ?? null;
  },

  setStopFlag(jobId) {
    stopFlags.add(jobId);
  },

  clearStopFlag(jobId) {
    stopFlags.delete(jobId);
  },

  shouldStop(jobId) {
    return stopFlags.has(jobId);
  },

  // Test-only: resets the singleton between tests so state never leaks across suites.
  resetForTests() {
    state.client = null;
    state.baseUrl = null;
    state.adminUser = null;
    state.adminUserId = null;
    state.appPassword = null;
    state.secretStorage = 'session';
    state.certException = null;
    state.userListMode = null;
    jobStates.clear();
    stopFlags.clear();
  },
};
