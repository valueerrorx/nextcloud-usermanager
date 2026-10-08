import { beforeEach, describe, expect, it, vi } from 'vitest';

const handlers = new Map();
const { fakeApp } = vi.hoisted(() => ({
  fakeApp: { getVersion: () => '0.1.0', getPath: () => '/fake/userData' },
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel, listener) => {
      handlers.set(channel, listener);
    },
  },
  app: fakeApp,
  net: { fetch: vi.fn() },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
  dialog: { showSaveDialog: vi.fn() },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => false),
    getSelectedStorageBackend: vi.fn(() => 'basic_text'),
    encryptString: vi.fn((s) => Buffer.from(`enc:${s}`)),
    decryptString: vi.fn((buf) => buf.toString('utf8').replace(/^enc:/, '')),
  },
}));

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn().mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
  writeFile: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
}));

import { BrowserWindow, dialog, net, safeStorage } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import { session } from '../src/main/session.js';

function fakeResponse({ status = 200, body = '' } = {}) {
  return { status, text: async () => body };
}

function envelope(statuscode, data = []) {
  return JSON.stringify({ ocs: { meta: { status: statuscode === 100 ? 'ok' : 'failure', statuscode }, data } });
}

const okResponse = () => fakeResponse({ status: 200, body: envelope(100, []) });

describe('registerIpcHandlers — connection.* und tls.respondCertificate', () => {
  beforeEach(async () => {
    handlers.clear();
    session.resetForTests();
    vi.clearAllMocks();
    net.fetch.mockResolvedValue(okResponse());
    readFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    writeFile.mockResolvedValue(undefined);
    safeStorage.isEncryptionAvailable.mockReturnValue(false);
    const { registerIpcHandlers } = await import('../src/main/ipc.js');
    registerIpcHandlers();
  });

  // Verbotenes aufzählen, nicht Erlaubtes (REVIEW-NOTES [S01]) - eine exakte Allowlist wird planmäßig
  // rot, sobald S05 weitere Kanäle registriert. Verbotene/entfallene Kanäle dürfen nie auftauchen.
  it('registriert kein generisches invoke und keine entfallenen Kanäle (connection.test/connection.disconnect)', () => {
    const channels = [...handlers.keys()];
    expect(channels).not.toContain('invoke');
    expect(channels).not.toContain('connection.test');
    expect(channels).not.toContain('connection.disconnect');
  });

  it('app.version liefert weiterhin { ok: true, version }', () => {
    expect(handlers.get('app.version')()).toEqual({ ok: true, version: fakeApp.getVersion() });
  });

  it('connect: ungültige URL -> ok false, Session bleibt unverändert', async () => {
    const result = await handlers.get('connection.connect')(null, { baseUrl: '', adminUser: 'admin', appPassword: 'x' });
    expect(result).toEqual({ ok: false, messageId: 'url_leer', message: expect.any(String) });
    expect(session.connected).toBe(false);
  });

  it('connect: 401 -> session.connected bleibt false und session.client bleibt null (Abnahme 4)', async () => {
    net.fetch.mockResolvedValue(fakeResponse({ status: 401 }));
    const result = await handlers.get('connection.connect')(null, { baseUrl: 'https://host', adminUser: 'admin', appPassword: 'falsch' });
    expect(result.ok).toBe(false);
    expect(result.messageId).toBe('falsche_zugangsdaten');
    expect(session.connected).toBe(false);
    expect(session.client).toBeNull();
  });

  it('connect: Erfolg ohne remember füllt die Session und schreibt keine Datei', async () => {
    const result = await handlers.get('connection.connect')(null, { baseUrl: 'https://host', adminUser: 'Admin', appPassword: 'geheim', remember: false });
    expect(result.ok).toBe(true);
    expect(result.status.connected).toBe(true);
    expect(result.status.adminUserId).toBe('Admin');
    expect(session.connected).toBe(true);
    expect(session.client).not.toBeNull();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('connect: Erfolg liefert weder eine Client-Instanz noch das Passwort in der Rückgabe', async () => {
    const result = await handlers.get('connection.connect')(null, { baseUrl: 'https://host', adminUser: 'Admin', appPassword: 'geheim', remember: false });
    expect(result.status.client).toBeUndefined();
    expect(result.status.appPassword).toBeUndefined();
    expect(Object.keys(result.status)).toEqual(['connected', 'baseUrl', 'adminUserId', 'secretStorage', 'certException']);
  });

  it('connect: Erfolg mit remember und Keyring speichert die Datei und setzt secretStorage keyring', async () => {
    safeStorage.isEncryptionAvailable.mockReturnValue(true);
    safeStorage.getSelectedStorageBackend.mockReturnValue('gnome_libsecret');
    const result = await handlers.get('connection.connect')(null, { baseUrl: 'https://host', adminUser: 'admin', appPassword: 'geheim', remember: true });
    expect(result.ok).toBe(true);
    expect(result.status.secretStorage).toBe('keyring');
    expect(writeFile).toHaveBeenCalledTimes(1);
  });

  it('connect: Erfolg mit remember ohne Keyring meldet kein_keyring_nur_sitzung und schreibt nichts', async () => {
    const result = await handlers.get('connection.connect')(null, { baseUrl: 'https://host', adminUser: 'admin', appPassword: 'geheim', remember: true });
    expect(result.ok).toBe(true);
    expect(result.messageId).toBe('kein_keyring_nur_sitzung');
    expect(result.status.secretStorage).toBe('session');
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('connectSaved: kein gespeicherter Zugang -> ok false, kein_gespeicherter_zugang', async () => {
    const result = await handlers.get('connection.connectSaved')();
    expect(result).toEqual({ ok: false, messageId: 'kein_gespeicherter_zugang', message: expect.any(String) });
  });

  it('connectSaved: abgelehntes gespeichertes Passwort -> gespeichertes_passwort_abgelehnt, Dialog-Resttext', async () => {
    readFile.mockResolvedValue(JSON.stringify({ baseUrl: 'https://host', adminUser: 'admin', secret: 'ZW5jOmdlaGVpbQ==' }));
    net.fetch.mockResolvedValue(fakeResponse({ status: 401 }));
    const result = await handlers.get('connection.connectSaved')();
    expect(result.ok).toBe(false);
    expect(result.messageId).toBe('gespeichertes_passwort_abgelehnt');
    expect(session.connected).toBe(false);
  });

  it('connectSaved: Erfolg füllt die Session mit secretStorage keyring', async () => {
    readFile.mockResolvedValue(JSON.stringify({ baseUrl: 'https://host', adminUser: 'admin', secret: 'ZW5jOmdlaGVpbQ==' }));
    const result = await handlers.get('connection.connectSaved')();
    expect(result.ok).toBe(true);
    expect(session.connected).toBe(true);
    expect(session.secretStorage).toBe('keyring');
  });

  it('forgetSaved ruft credentials.forget auf', async () => {
    const result = await handlers.get('connection.forgetSaved')();
    expect(result).toEqual({ ok: true });
  });

  it('tls.respondCertificate delegiert an den TlsController und liefert ok:false für eine unbekannte requestId', async () => {
    const result = await handlers.get('tls.respondCertificate')(null, { requestId: 'nie-vergeben', akzeptiert: true });
    expect(result.ok).toBe(false);
    expect(result.messageId).toBe('zertifikat_anfrage_abgelaufen');
  });
});

// CRITICAL 1 (S04-Review): die akzeptierte Zertifikatsausnahme lag nur in der Controller-Closure,
// connection.status.certException war immer null und das Warnbanner verschwand im Hauptablauf.
// CRITICAL 2 (S04-Review): ein abgelehntes/zeitüberschrittenes Zertifikat wurde als
// "Server nicht erreichbar" gemeldet statt als Zertifikatsfehler.
describe('tls.respondCertificate / connection.connect — Zertifikat-Entscheidung als Autorität', () => {
  let capturedPayload;
  const fakeWindow = {
    isDestroyed: () => false,
    webContents: { send: (channel, payload) => { capturedPayload = payload; } },
  };

  function fakeCertificate() {
    return { data: '-----BEGIN CERTIFICATE-----\nAA==\n-----END CERTIFICATE-----', subject: {}, issuer: {} };
  }

  beforeEach(async () => {
    handlers.clear();
    session.resetForTests();
    vi.clearAllMocks();
    capturedPayload = undefined;
    BrowserWindow.getAllWindows.mockReturnValue([fakeWindow]);
    net.fetch.mockResolvedValue(okResponse());
    readFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
  });

  it('ein zerstörtes Fenster wird bei der Prompt-Zustellung übersprungen, kein Throw', async () => {
    const destroyedWindow = { isDestroyed: () => true, webContents: { send: vi.fn() } };
    BrowserWindow.getAllWindows.mockReturnValue([destroyedWindow]);
    const { registerIpcHandlers, tlsController } = await import('../src/main/ipc.js');
    registerIpcHandlers();

    vi.useFakeTimers();
    try {
      const callback = vi.fn();
      expect(() =>
        tlsController.verifyProc({ hostname: 'destroyed-window-host', certificate: fakeCertificate(), verificationResult: 'CERT_UNTRUSTED' }, callback),
      ).not.toThrow();
      expect(destroyedWindow.webContents.send).not.toHaveBeenCalled();
      vi.advanceTimersByTime(120000); // clears the still-pending request instead of leaking a real timer
      expect(callback).toHaveBeenCalledWith(-2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('nach akzeptiertem Prompt zeigt connection.status.certException Host und Fingerprint', async () => {
    const { registerIpcHandlers, tlsController } = await import('../src/main/ipc.js');
    registerIpcHandlers();

    tlsController.verifyProc({ hostname: 'host', certificate: fakeCertificate(), verificationResult: 'CERT_UNTRUSTED' }, vi.fn());
    const { requestId } = capturedPayload;
    await handlers.get('tls.respondCertificate')(null, { requestId, akzeptiert: true });

    const status = await handlers.get('connection.status')();
    expect(status.certException).toEqual({ host: 'host', fingerprint: expect.any(String) });
  });

  it('eine abgelehnte Zertifikatsausnahme beendet connect mit einer Zertifikatsmeldung, nicht server_nicht_erreichbar', async () => {
    const { registerIpcHandlers, tlsController } = await import('../src/main/ipc.js');
    registerIpcHandlers();

    // Own hostname, distinct from the other test in this block - the tlsController module
    // singleton persists across tests in this file, and a matching exception from another test
    // would answer verifyProc without ever sending a prompt.
    tlsController.verifyProc({ hostname: 'reject-host', certificate: fakeCertificate(), verificationResult: 'CERT_UNTRUSTED' }, vi.fn());
    const { requestId } = capturedPayload;
    await handlers.get('tls.respondCertificate')(null, { requestId, akzeptiert: false });

    // Generic network error (not ERR_CERT) - proves the override comes from the TLS controller's
    // recorded decision, not from string-matching the error (client.js's cheap safety net has its
    // own dedicated test in ocsClient.test.js).
    net.fetch.mockRejectedValue(new Error('fetch failed'));
    vi.useFakeTimers();
    try {
      const resultPromise = handlers.get('connection.connect')(null, { baseUrl: 'https://reject-host', adminUser: 'admin', appPassword: 'x' });
      await vi.runAllTimersAsync(); // flushes the client's retry backoff (2s/6s)
      const result = await resultPromise;

      expect(result.ok).toBe(false);
      expect(result.messageId).toBe('zertifikat_abgelehnt');
      expect(result.messageId).not.toBe('server_nicht_erreichbar');
    } finally {
      vi.useRealTimers();
    }
  });
});

// Secret-Grenze (S04 Abnahme 5): connection.status serialisiert nie das Passwort, auch nicht als
// base64. Der Mutationsbeweis dafür ist eine Entwicklungs-Tätigkeit, kein Suite-Test
// (REVIEW-NOTES [S04]) - verifiziert: appPassword ins Rückgabeobjekt aufnehmen macht die
// Assertion unten rot.
// S05 A7: users.list ohne Verbindung, connect setzt userListMode zurück, Fallback-Verdrahtung
// inklusive users.onLoadProgress-Broadcast (REVIEW-NOTES "Verdrahtung wird getestet").
describe('users.list / users.onLoadProgress', () => {
  const fakeWindow = { isDestroyed: () => false, webContents: { send: vi.fn() } };

  beforeEach(async () => {
    handlers.clear();
    session.resetForTests();
    vi.clearAllMocks();
    BrowserWindow.getAllWindows.mockReturnValue([fakeWindow]);
    net.fetch.mockResolvedValue(okResponse());
    readFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    const { registerIpcHandlers } = await import('../src/main/ipc.js');
    registerIpcHandlers();
  });

  it('ohne Verbindung -> { ok: false, messageId: nicht_verbunden }', async () => {
    const result = await handlers.get('users.list')();
    expect(result).toMatchObject({ ok: false, messageId: 'nicht_verbunden' });
  });

  it('connect setzt session.userListMode zurück auf null', async () => {
    net.fetch.mockImplementation(async (url) => {
      if (url.includes('/cloud/users/details')) return fakeResponse({ status: 404 });
      return okResponse();
    });
    await handlers.get('connection.connect')(null, { baseUrl: 'https://host', adminUser: 'admin', appPassword: 'geheim' });
    await handlers.get('users.list')(); // sets userListMode to 'fallback'
    expect(session.userListMode).not.toBeNull();

    await handlers.get('connection.connect')(null, { baseUrl: 'https://host', adminUser: 'admin', appPassword: 'geheim' });
    expect(session.userListMode).toBeNull();
  });

  it('Fallback-Modus: ok true mit mode/uebersprungen/fetchedAt, und sendet users.onLoadProgress', async () => {
    net.fetch.mockImplementation(async (url) => {
      if (url.includes('/cloud/users/details')) return fakeResponse({ status: 404 });
      if (/\/cloud\/users\/[^/?]+\?/.test(url)) return fakeResponse({ status: 200, body: envelope(100, { id: 'bob', enabled: true, groups: [] }) });
      if (url.includes('/cloud/users?')) return fakeResponse({ status: 200, body: envelope(100, { users: ['bob'] }) });
      return okResponse();
    });
    await handlers.get('connection.connect')(null, { baseUrl: 'https://host', adminUser: 'admin', appPassword: 'geheim' });

    const result = await handlers.get('users.list')();
    expect(result.ok).toBe(true);
    expect(result.mode).toBe('fallback');
    expect(result.uebersprungen).toBe(0);
    expect(typeof result.fetchedAt).toBe('number');
    expect(result.users.map((u) => u.userid)).toEqual(['bob']);

    expect(fakeWindow.webContents.send).toHaveBeenCalledWith('users.onLoadProgress', { geladen: 1, gesamt: 1 });
  });
});

// S07 A5 Abnahme 9: actions.run ist nie global fehlerhaft, außer wenn keine Verbindung besteht.
describe('actions.run — ohne Verbindung', () => {
  beforeEach(async () => {
    handlers.clear();
    session.resetForTests();
    vi.clearAllMocks();
    const { registerIpcHandlers } = await import('../src/main/ipc.js');
    registerIpcHandlers();
  });

  it('ohne Verbindung -> { ok: false, messageId: nicht_verbunden }', async () => {
    const result = await handlers.get('actions.run')(null, { jobId: 'job', action: 'user.enable', items: ['alice'], params: {} });
    expect(result).toEqual({ ok: false, messageId: 'nicht_verbunden', message: expect.any(String) });
  });
});

// Defect fix: eine unbekannte Action-ID wirft innerhalb von operations.js#getSteps (gewollt, A2),
// aber actions.run darf dadurch nie zu einem abgelehnten invoke werden (ARCHITECTURE §3).
describe('actions.run — unbekannte Aktion', () => {
  beforeEach(async () => {
    handlers.clear();
    session.resetForTests();
    vi.clearAllMocks();
    net.fetch.mockResolvedValue(okResponse());
    readFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    const { registerIpcHandlers } = await import('../src/main/ipc.js');
    registerIpcHandlers();
    await handlers.get('connection.connect')(null, { baseUrl: 'https://host', adminUser: 'admin', appPassword: 'geheim', remember: false });
  });

  it('löst auf statt abzulehnen und liefert { ok: false, messageId: unbekannte_aktion }', async () => {
    await expect(
      handlers.get('actions.run')(null, { jobId: 'job-unbekannt', action: 'user.doesNotExist', items: ['alice'], params: {} }),
    ).resolves.toEqual({ ok: false, messageId: 'unbekannte_aktion', message: expect.any(String) });
  });
});

describe('connection.status — kein Secret im Rückgabewert', () => {
  beforeEach(async () => {
    handlers.clear();
    session.resetForTests();
    vi.clearAllMocks();
    net.fetch.mockResolvedValue(okResponse());
    readFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    const { registerIpcHandlers } = await import('../src/main/ipc.js');
    registerIpcHandlers();
    await handlers.get('connection.connect')(null, { baseUrl: 'https://host', adminUser: 'admin', appPassword: 'super-geheimes-passwort', remember: false });
  });

  it('weder das Klartextpasswort noch seine base64-Form stehen in JSON.stringify(status)', async () => {
    const status = await handlers.get('connection.status')();
    const serialized = JSON.stringify(status);
    expect(serialized).not.toContain('super-geheimes-passwort');
    expect(serialized).not.toContain(Buffer.from('super-geheimes-passwort').toString('base64'));
  });
});

// S08 A4: files.saveCsv delegiert an src/main/files.js#saveCsv (Verdrahtung, nicht nur Logik).
describe('files.saveCsv', () => {
  beforeEach(async () => {
    handlers.clear();
    session.resetForTests();
    vi.clearAllMocks();
    const { registerIpcHandlers } = await import('../src/main/ipc.js');
    registerIpcHandlers();
  });

  it('leitet das Argument an dialog.showSaveDialog weiter und liefert { ok: true, path } bei Erfolg', async () => {
    dialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: '/home/user/ergebnis.csv' });
    writeFile.mockResolvedValue(undefined);

    const result = await handlers.get('files.saveCsv')(null, { vorschlag: 'ergebnis.csv', inhalt: 'userid;aktion\r\n' });

    expect(dialog.showSaveDialog).toHaveBeenCalledWith({ defaultPath: 'ergebnis.csv' });
    expect(result).toEqual({ ok: true, path: '/home/user/ergebnis.csv' });
  });

  it('Abbruch im Dialog -> { ok: false, messageId: abgebrochen }', async () => {
    dialog.showSaveDialog.mockResolvedValue({ canceled: true, filePath: undefined });

    const result = await handlers.get('files.saveCsv')(null, { vorschlag: 'ergebnis.csv', inhalt: 'x' });

    expect(result).toEqual({ ok: false, messageId: 'abgebrochen', message: expect.any(String) });
  });
});
