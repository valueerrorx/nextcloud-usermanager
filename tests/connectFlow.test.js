import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('sweetalert2', () => ({ default: { fire: vi.fn().mockResolvedValue({}), mixin: () => ({ fire: vi.fn().mockResolvedValue({}) }) } }));

import Swal from 'sweetalert2';
import { connectWith, logout, startup } from '../src/renderer/connectFlow.js';
import {
  activeView, connectError, connecting, connection, jobLaeuft, resetOnConnect, startupGeprueft, users,
} from '../src/renderer/state.js';

const status = (extra = {}) => ({
  connected: true, baseUrl: 'https://h', adminUserId: 'admin', secretStorage: 'keyring', certException: null, ...extra,
});
const offline = (extra = {}) => ({ ...status({ connected: false, baseUrl: null }), hasSaved: false, savedBaseUrl: null, savedAdminUser: null, ...extra });

let api;
beforeEach(() => {
  resetOnConnect();
  Object.assign(connection, offline());
  connecting.value = false;
  startupGeprueft.value = false;
  connectError.value = null;
  jobLaeuft.value = false;
  activeView.value = 'users';
  Swal.fire.mockClear();
  api = {
    connectionStatus: vi.fn().mockResolvedValue(offline()),
    connectSaved: vi.fn(),
    connect: vi.fn(),
    logout: vi.fn(),
  };
  globalThis.window = { api };
});

describe('startup', () => {
  it('abgelehnter gespeicherter Zugang: genau ein connectSaved, Fehler im Popup', async () => {
    api.connectionStatus.mockResolvedValue(offline({ hasSaved: true }));
    api.connectSaved.mockResolvedValue({ ok: false, message: 'abgelehnt' });
    await startup();
    expect(api.connectSaved).toHaveBeenCalledTimes(1);
    expect(connectError.value).toBe('abgelehnt');
    expect(connection.connected).toBe(false);
    expect(startupGeprueft.value).toBe(true);
    expect(connecting.value).toBe(false);
  });

  it('kein gespeicherter Zugang: kein connectSaved', async () => {
    await startup();
    expect(api.connectSaved).not.toHaveBeenCalled();
    expect(startupGeprueft.value).toBe(true);
  });
});

describe('connectWith', () => {
  it('ablehnendes connect setzt connecting zurück und liefert eine Meldung', async () => {
    api.connect.mockRejectedValue(new Error('boom'));
    const result = await connectWith({ baseUrl: 'x', adminUser: 'a', appPassword: 'p', remember: false });
    expect(result.ok).toBe(false);
    expect(result.message).toEqual(expect.any(String));
    expect(connecting.value).toBe(false);
  });

  it('Keyring-Hinweis wird gezeigt, bevor connected gesetzt wird', async () => {
    let verbundenBeimHinweis = null;
    Swal.fire.mockImplementationOnce(async () => { verbundenBeimHinweis = connection.connected; return {}; });
    api.connect.mockResolvedValue({ ok: true, status: status(), messageId: 'kein_keyring_nur_sitzung', message: 'nur Sitzung' });
    api.connectionStatus.mockResolvedValue(status());
    const result = await connectWith({ baseUrl: 'x', adminUser: 'a', appPassword: 'p', remember: true });
    expect(result.ok).toBe(true);
    expect(Swal.fire).toHaveBeenCalledTimes(1);
    expect(verbundenBeimHinweis).toBe(false);
    expect(connection.connected).toBe(true);
  });
});

describe('logout', () => {
  it('ok:false beendet die Sitzung trotzdem und setzt Daten zurück', async () => {
    Object.assign(connection, status());
    users.value = [{ userid: 'alt' }];
    api.logout.mockResolvedValue({ ok: false, message: 'Zugang nicht gelöscht' });
    api.connectionStatus.mockResolvedValue(status());
    await logout();
    expect(connection.connected).toBe(false);
    expect(users.value).toEqual([]);
    expect(activeView.value).toBe('dashboard');
  });

  it('wird bei laufendem Job blockiert', async () => {
    Object.assign(connection, status());
    jobLaeuft.value = true;
    await logout();
    expect(api.logout).not.toHaveBeenCalled();
    expect(connection.connected).toBe(true);
  });
});
