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
  dialog: { showSaveDialog: vi.fn(), showOpenDialog: vi.fn() },
  shell: { openExternal: vi.fn().mockResolvedValue(undefined) },
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

import { BrowserWindow, dialog, net, safeStorage, shell } from 'electron';
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

  it('connectSaved: abgelehntes gespeichertes Passwort löscht den gespeicherten Zugang', async () => {
    const { unlink } = await import('node:fs/promises');
    readFile.mockResolvedValue(JSON.stringify({ baseUrl: 'https://host', adminUser: 'admin', secret: 'ZW5jOmdlaGVpbQ==' }));
    net.fetch.mockResolvedValue(fakeResponse({ status: 401 }));
    await handlers.get('connection.connectSaved')();
    expect(unlink).toHaveBeenCalledTimes(1);
  });

  it('connectSaved: scheitert das Löschen des abgelehnten Zugangs, wird es ohne Geheimnis geloggt', async () => {
    const { unlink } = await import('node:fs/promises');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    unlink.mockRejectedValueOnce(Object.assign(new Error('EPERM'), { code: 'EPERM' }));
    readFile.mockResolvedValue(JSON.stringify({ baseUrl: 'https://host', adminUser: 'admin', secret: 'ZW5jOmdlaGVpbQ==' }));
    net.fetch.mockResolvedValue(fakeResponse({ status: 401 }));
    const result = await handlers.get('connection.connectSaved')();
    expect(result.messageId).toBe('gespeichertes_passwort_abgelehnt');
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('not removed'), 'zugang_loeschen_fehlgeschlagen');
    spy.mockRestore();
  });

  it('connectSaved: Netzwerkfehler löscht den gespeicherten Zugang nicht', async () => {
    const { unlink } = await import('node:fs/promises');
    readFile.mockResolvedValue(JSON.stringify({ baseUrl: 'https://host', adminUser: 'admin', secret: 'ZW5jOmdlaGVpbQ==' }));
    net.fetch.mockRejectedValue(new Error('net::ERR_CONNECTION_REFUSED'));
    const result = await handlers.get('connection.connectSaved')();
    expect(result.ok).toBe(false);
    expect(unlink).not.toHaveBeenCalled();
  });

  it('connection.status: wirft credentials.peek, liefert trotzdem einen Status ohne gespeicherten Zugang', async () => {
    readFile.mockRejectedValue(Object.assign(new Error('EIO'), { code: 'EIO' }));
    const status = await handlers.get('connection.status')();
    expect(status).toMatchObject({ connected: false, hasSaved: false, savedBaseUrl: null, savedAdminUser: null });
  });

  it('app.openExternal erlaubt den Host des verbundenen Servers, aber nicht ohne Verbindung', async () => {
    const url = 'https://cloud.example.org/';
    expect((await handlers.get('app.openExternal')(null, { url })).ok).toBe(false);
    expect(shell.openExternal).not.toHaveBeenCalled();
    await handlers.get('connection.connect')(null, { baseUrl: 'https://cloud.example.org', adminUser: 'admin', appPassword: 'x' });
    expect(await handlers.get('app.openExternal')(null, { url })).toEqual({ ok: true });
    expect(shell.openExternal).toHaveBeenCalledWith(url);
    expect((await handlers.get('app.openExternal')(null, { url: 'https://evil.example/' })).ok).toBe(false);
  });

  it('connectSaved: Erfolg füllt die Session mit secretStorage keyring', async () => {
    readFile.mockResolvedValue(JSON.stringify({ baseUrl: 'https://host', adminUser: 'admin', secret: 'ZW5jOmdlaGVpbQ==' }));
    const result = await handlers.get('connection.connectSaved')();
    expect(result.ok).toBe(true);
    expect(session.connected).toBe(true);
    expect(session.secretStorage).toBe('keyring');
  });

  it('connection.forgetSaved ist kein Kanal mehr (nur noch hinter logout)', () => {
    expect([...handlers.keys()]).not.toContain('connection.forgetSaved');
  });

  it('logout trennt die Sitzung und löscht den gespeicherten Zugang', async () => {
    await handlers.get('connection.connect')(null, { baseUrl: 'https://host', adminUser: 'admin', appPassword: 'geheim', remember: false });
    expect(session.connected).toBe(true);
    const { unlink } = await import('node:fs/promises');
    const result = await handlers.get('connection.logout')();
    expect(result).toEqual({ ok: true });
    expect(session.connected).toBe(false);
    expect(unlink).toHaveBeenCalledTimes(1);
  });

  it('logout liefert bei Löschfehler ok:false mit Text, die Sitzung ist trotzdem getrennt', async () => {
    await handlers.get('connection.connect')(null, { baseUrl: 'https://host', adminUser: 'admin', appPassword: 'geheim', remember: false });
    const { unlink } = await import('node:fs/promises');
    unlink.mockRejectedValueOnce(Object.assign(new Error('EACCES'), { code: 'EACCES' }));
    const result = await handlers.get('connection.logout')();
    expect(result.ok).toBe(false);
    expect(result.message).toEqual(expect.any(String));
    expect(session.connected).toBe(false);
  });

  it('app.openExternal öffnet die erlaubte https-URL', async () => {
    const result = await handlers.get('app.openExternal')(null, { url: 'https://xapient.solutions/' });
    expect(result).toEqual({ ok: true });
    expect(shell.openExternal).toHaveBeenCalledWith('https://xapient.solutions/');
  });

  it('app.openExternal lehnt fremde Hosts, http und file: ab, ohne shell aufzurufen', async () => {
    for (const url of ['https://evil.example/', 'http://xapient.solutions/', 'file:///etc/passwd', 'https://xapient.solutions.evil.example/', 'javascript:alert(1)']) {
      const result = await handlers.get('app.openExternal')(null, { url });
      expect(result.ok).toBe(false);
      expect(result.messageId).toBe('link_nicht_erlaubt');
    }
    expect(shell.openExternal).not.toHaveBeenCalled();
  });

  it('connect: eine unerwartete Exception wird geloggt (ohne Passwort) und als Result gemeldet', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const setConnected = vi.spyOn(session, 'setConnected').mockImplementation(() => { throw new Error('kaputt geheim123 Basic Z2VoZWltOjEyMw=='); });
    const result = await handlers.get('connection.connect')(null, { baseUrl: 'https://host', adminUser: 'admin', appPassword: 'geheim123', remember: false });
    expect(result.ok).toBe(false);
    const logged = JSON.stringify(spy.mock.calls);
    expect(spy).toHaveBeenCalled();
    expect(logged).not.toContain('geheim123');
    expect(logged).not.toContain('Z2VoZWltOjEyMw==');
    spy.mockRestore();
    setConnected.mockRestore();
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

// S10 A3: groups.list / groups.create / files.openCsv — neue Kanäle, namentlich im Preload,
// dieselbe nicht_verbunden-Wächter wie users.list/actions.run.
describe('groups.list / groups.create / files.openCsv', () => {
  beforeEach(async () => {
    handlers.clear();
    session.resetForTests();
    vi.clearAllMocks();
    net.fetch.mockResolvedValue(okResponse());
    readFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    const { registerIpcHandlers } = await import('../src/main/ipc.js');
    registerIpcHandlers();
  });

  it('registriert die drei neuen Kanäle', () => {
    const channels = [...handlers.keys()];
    expect(channels).toContain('groups.list');
    expect(channels).toContain('groups.create');
    expect(channels).toContain('files.openCsv');
  });

  it('groups.list ohne Verbindung -> { ok: false, messageId: nicht_verbunden }', async () => {
    const result = await handlers.get('groups.list')();
    expect(result).toMatchObject({ ok: false, messageId: 'nicht_verbunden' });
  });

  it('groups.create ohne Verbindung -> { ok: false, messageId: nicht_verbunden }', async () => {
    const result = await handlers.get('groups.create')(null, { groupid: 'admins' });
    expect(result).toMatchObject({ ok: false, messageId: 'nicht_verbunden' });
  });

  it('groups.list verbunden liefert { ok: true, groups }', async () => {
    net.fetch.mockImplementation(async (url) => {
      if (url.includes('/cloud/groups')) return fakeResponse({ status: 200, body: envelope(100, { groups: ['admins'] }) });
      return okResponse();
    });
    await handlers.get('connection.connect')(null, { baseUrl: 'https://host', adminUser: 'admin', appPassword: 'geheim' });

    const result = await handlers.get('groups.list')();
    expect(result).toEqual({ ok: true, groups: ['admins'] });
  });

  it('groups.create verbunden ruft POST /cloud/groups und liefert { ok: true }', async () => {
    net.fetch.mockImplementation(async (url, options) => {
      if (url.includes('/cloud/groups') && options.method === 'POST') return fakeResponse({ status: 200, body: envelope(100, null) });
      return okResponse();
    });
    await handlers.get('connection.connect')(null, { baseUrl: 'https://host', adminUser: 'admin', appPassword: 'geheim' });

    const result = await handlers.get('groups.create')(null, { groupid: 'neu' });
    expect(result).toEqual({ ok: true });
  });

  it('files.openCsv delegiert an dialog.showOpenDialog, wirft nicht bei einem Dialogfehler', async () => {
    dialog.showOpenDialog.mockRejectedValue(new Error('dialog kaputt'));

    const result = await handlers.get('files.openCsv')(null, { zweck: 'import' });

    expect(result).toEqual({ ok: false, messageId: 'datei_lesen_fehlgeschlagen', message: expect.any(String) });
  });

  // MINOR-Fix S10-Review 2: ein leerer/nur-Leerzeichen-Name darf POST /cloud/groups nie erreichen -
  // Validierung gehört in Main, nicht nur in die View.
  it('groups.create mit leerem/Leerzeichen-Namen -> gruppe_anlegen_fehlgeschlagen, kein Request', async () => {
    await handlers.get('connection.connect')(null, { baseUrl: 'https://host', adminUser: 'admin', appPassword: 'geheim' });
    net.fetch.mockClear();

    const result = await handlers.get('groups.create')(null, { groupid: '   ' });

    expect(result).toMatchObject({ ok: false, messageId: 'gruppe_anlegen_fehlgeschlagen' });
    expect(net.fetch).not.toHaveBeenCalled();
  });
});

// S12 A3: groups.delete - gleiche nicht_verbunden-Wächter, eigene Leerstring- und
// admin-Schutz-Ablehnung, jeweils ohne Request (REVIEW-NOTES [S07] - am Request-Zähler messen).
describe('groups.delete', () => {
  beforeEach(async () => {
    handlers.clear();
    session.resetForTests();
    vi.clearAllMocks();
    net.fetch.mockResolvedValue(okResponse());
    readFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    const { registerIpcHandlers } = await import('../src/main/ipc.js');
    registerIpcHandlers();
  });

  it('ist registriert', () => {
    expect([...handlers.keys()]).toContain('groups.delete');
  });

  it('ohne Verbindung -> { ok: false, messageId: nicht_verbunden }', async () => {
    const result = await handlers.get('groups.delete')(null, { groupid: 'admins' });
    expect(result).toMatchObject({ ok: false, messageId: 'nicht_verbunden' });
  });

  it('verbunden ruft DELETE /cloud/groups/{groupid} und liefert { ok: true }', async () => {
    net.fetch.mockImplementation(async (url, options) => {
      if (url.includes('/cloud/groups/lehrer') && options.method === 'DELETE') {
        return fakeResponse({ status: 200, body: envelope(100, null) });
      }
      return okResponse();
    });
    await handlers.get('connection.connect')(null, { baseUrl: 'https://host', adminUser: 'admin', appPassword: 'geheim' });

    const result = await handlers.get('groups.delete')(null, { groupid: 'lehrer' });
    expect(result).toEqual({ ok: true });
  });

  it('leerer/Leerzeichen-Name -> gruppenname_leer, kein Request', async () => {
    await handlers.get('connection.connect')(null, { baseUrl: 'https://host', adminUser: 'admin', appPassword: 'geheim' });
    net.fetch.mockClear();

    const result = await handlers.get('groups.delete')(null, { groupid: '   ' });

    expect(result).toMatchObject({ ok: false, messageId: 'gruppenname_leer' });
    expect(net.fetch).not.toHaveBeenCalled();
  });

  // Der admin-Schutz sitzt in shared/groups.js#istGruppeLoeschbar (S12 "Die Lehre aus S10") -
  // dieser Test belegt, dass ipc.js ihn tatsächlich befragt, bevor irgendein Request geht.
  it("groupid 'admin' -> gruppe_admin_geschuetzt, kein Request", async () => {
    await handlers.get('connection.connect')(null, { baseUrl: 'https://host', adminUser: 'admin', appPassword: 'geheim' });
    net.fetch.mockClear();

    const result = await handlers.get('groups.delete')(null, { groupid: 'admin' });

    expect(result).toMatchObject({ ok: false, messageId: 'gruppe_admin_geschuetzt' });
    expect(net.fetch).not.toHaveBeenCalled();
  });
});

// S18: groups.members und server.freeSpace.
describe('groups.members / server.freeSpace', () => {
  beforeEach(async () => {
    handlers.clear();
    session.resetForTests();
    vi.clearAllMocks();
    net.fetch.mockResolvedValue(okResponse());
    readFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    const { registerIpcHandlers } = await import('../src/main/ipc.js');
    registerIpcHandlers();
  });

  const verbinden = () => handlers.get('connection.connect')(null, { baseUrl: 'https://host', adminUser: 'admin', appPassword: 'geheim' });

  it('nicht verbunden -> nicht_verbunden, kein Request', async () => {
    net.fetch.mockClear();
    expect(await handlers.get('groups.members')(null, { groupid: 'a' })).toMatchObject({ ok: false, messageId: 'nicht_verbunden' });
    expect(await handlers.get('server.freeSpace')()).toMatchObject({ ok: false, messageId: 'nicht_verbunden' });
    expect(net.fetch).not.toHaveBeenCalled();
  });

  it('groups.members verbunden ohne Argument -> ok:false statt Reject, leerer Name -> gruppenname_leer', async () => {
    await verbinden();
    net.fetch.mockClear();
    expect(await handlers.get('groups.members')()).toMatchObject({ ok: false });
    expect(await handlers.get('groups.members')(null, { groupid: ' ' })).toMatchObject({ ok: false, messageId: 'gruppenname_leer' });
    expect(net.fetch).not.toHaveBeenCalled();
  });

  it('groups.members liefert data.users von GET /cloud/groups/{gid}', async () => {
    await verbinden();
    net.fetch.mockImplementation(async (url) => {
      expect(url).toContain('/cloud/groups/Jahr%201');
      return fakeResponse({ status: 200, body: envelope(100, { users: ['a', 'b'] }) });
    });
    expect(await handlers.get('groups.members')(null, { groupid: 'Jahr 1' })).toEqual({ ok: true, members: ['a', 'b'] });
  });

  it('server.freeSpace liefert freeBytes; Fehler bleibt ein Result (kein Wurf)', async () => {
    await verbinden();
    net.fetch.mockResolvedValue(fakeResponse({ status: 200, body: envelope(100, { nextcloud: { system: { freespace: 12345 } } }) }));
    const ok = await handlers.get('server.freeSpace')();
    expect(ok).toEqual({ ok: true, freeBytes: 12345 });
    expect(net.fetch.mock.calls.at(-1)[0]).toContain('/ocs/v1.php/apps/serverinfo/api/v1/info');
    net.fetch.mockResolvedValue(fakeResponse({ status: 401 }));
    expect(await handlers.get('server.freeSpace')()).toMatchObject({ ok: false, messageId: 'falsche_zugangsdaten' });
  });
});

// CRITICAL-Fix (REVIEW-NOTES [S13], wiederholt aus S08/S09a/S10): fünf Handler destrukturierten
// bisher in der Funktionssignatur - window.api.connect() ohne Argument liess das als TypeError
// über die IPC-Grenze platzen statt ein Result zu liefern (ARCHITECTURE §3 "Alle invoke-Kanäle
// werfen nie"). Die Kanalliste kommt aus der Registrierungs-Map selbst (nicht aus einer
// abgeschriebenen Liste), damit ein künftig neu registrierter Kanal automatisch mitgeprüft wird.
describe('registerIpcHandlers — jeder Kanal löst auch ohne Argument auf (nie reject)', () => {
  beforeEach(async () => {
    handlers.clear();
    session.resetForTests();
    vi.clearAllMocks();
    net.fetch.mockResolvedValue(okResponse());
    readFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    dialog.showSaveDialog.mockResolvedValue({ canceled: true, filePath: undefined });
    dialog.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
    const { registerIpcHandlers } = await import('../src/main/ipc.js');
    registerIpcHandlers();
  });

  it('registriert mindestens einen Kanal (Gegenprobe gegen eine leere Map)', () => {
    expect([...handlers.keys()].length).toBeGreaterThan(0);
  });

  // connection.status ist laut ARCHITECTURE §3 die einzige Ausnahme vom { ok, ... }-Result: es
  // liefert direkt das Status-Objekt (connected, baseUrl, ...) ohne ok-Feld. Für diesen einen
  // Kanal wird nur "löst auf" geprüft, für alle anderen zusätzlich das ok-Feld.
  const OHNE_OK_FELD = new Set(['connection.status']);

  for (const channel of [
    'app.version', 'connection.connect', 'connection.connectSaved', 'connection.status',
    'connection.logout', 'app.openExternal', 'users.list', 'actions.run', 'actions.stop', 'groups.list',
    'groups.create', 'groups.delete', 'groups.members', 'server.freeSpace', 'files.saveCsv', 'files.openCsv', 'tls.respondCertificate',
  ]) {
    // Kanalnamen oben nur zur lesbaren Testbezeichnung je Kanal - geprüft wird unten über die
    // tatsächliche Registrierungs-Map, nicht über diese Liste (siehe Test darunter für den Teil,
    // der auch einen VERGESSENEN Eintrag hier findet).
    it(`${channel} löst ohne Argument auf, statt die invoke-Promise abzulehnen`, async () => {
      const listener = handlers.get(channel);
      expect(listener).toBeTypeOf('function');
      let result;
      let hatGeworfen = false;
      try {
        result = await listener();
      } catch {
        hatGeworfen = true;
      }
      expect(hatGeworfen).toBe(false);
      expect(result).toBeTypeOf('object');
      if (!OHNE_OK_FELD.has(channel)) {
        expect(result).toHaveProperty('ok');
      }
    });
  }

  // Aufzählung direkt aus der Map (REVIEW-NOTES [S13] "Enumerate the handlers from the
  // registration map so the test cannot go stale") - läuft zusätzlich zur obigen, lesbar
  // benannten Liste über jeden Kanal, den registerIpcHandlers tatsächlich registriert hat.
  it('jeder tatsächlich registrierte Kanal löst ohne Argument auf (Map als Quelle, nicht die Liste oben)', async () => {
    for (const [channel, listener] of handlers) {
      let result;
      let hatGeworfen = false;
      try {
        result = await listener();
      } catch {
        hatGeworfen = true;
      }
      expect(hatGeworfen, `${channel} hat geworfen statt aufzulösen`).toBe(false);
      expect(result, channel).toBeTypeOf('object');
      if (!OHNE_OK_FELD.has(channel)) {
        expect(result, channel).toHaveProperty('ok');
      }
    }
  });
});
