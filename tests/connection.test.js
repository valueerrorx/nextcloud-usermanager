import { describe, expect, it, vi } from 'vitest';
import { checkConnection } from '../src/main/ocs/connection.js';

function fakeResponse({ status = 200, body = '' } = {}) {
  return { status, text: async () => body };
}

function envelope(statuscode, data = []) {
  return JSON.stringify({ ocs: { meta: { status: statuscode === 100 ? 'ok' : 'failure', statuscode }, data } });
}

const base = { baseUrl: 'https://host', adminUser: 'Admin', appPassword: 'geheim' };

describe('checkConnection — GET /cloud/users?limit=1, keine zweite Fehlertabelle (REVIEW-NOTES 3)', () => {
  it('Erfolg: ok true, adminUserId ist der eingegebene Loginname (nicht aus der Antwort)', async () => {
    const fetchImpl = vi.fn(async () => fakeResponse({ status: 200, body: envelope(100, [{ id: 'anderer-name' }]) }));
    const result = await checkConnection({ ...base, fetchImpl });
    expect(result.ok).toBe(true);
    expect(result.adminUserId).toBe('Admin');
  });

  it('adminUserId bleibt der eingegebene Name auch bei anderer Groß-/Kleinschreibung in der Antwort', async () => {
    const fetchImpl = vi.fn(async () => fakeResponse({ status: 200, body: envelope(100, []) }));
    const result = await checkConnection({ ...base, adminUser: 'AdMiN', fetchImpl });
    expect(result.adminUserId).toBe('AdMiN');
  });

  it('401 -> messageId aus dem Client (falsche_zugangsdaten), keine eigene Tabelle', async () => {
    const fetchImpl = vi.fn(async () => fakeResponse({ status: 401 }));
    const result = await checkConnection({ ...base, fetchImpl });
    expect(result).toMatchObject({ ok: false, kind: 'auth', messageId: 'falsche_zugangsdaten' });
  });

  it('403 -> kein_admin', async () => {
    const fetchImpl = vi.fn(async () => fakeResponse({ status: 403 }));
    const result = await checkConnection({ ...base, fetchImpl });
    expect(result).toMatchObject({ ok: false, kind: 'forbidden', messageId: 'kein_admin' });
  });

  it('429 -> server_blockt_vorerst', async () => {
    const fetchImpl = vi.fn(async () => fakeResponse({ status: 429 }));
    const result = await checkConnection({ ...base, fetchImpl, retryDelaysMs: [], sleep: vi.fn() });
    expect(result).toMatchObject({ ok: false, kind: 'ratelimit', messageId: 'server_blockt_vorerst' });
  });

  it('HTML-Antwort -> falscher_basispfad (notOcs)', async () => {
    const fetchImpl = vi.fn(async () => fakeResponse({ status: 200, body: '<html>nope</html>' }));
    const result = await checkConnection({ ...base, fetchImpl });
    expect(result).toMatchObject({ ok: false, kind: 'notOcs', messageId: 'falscher_basispfad' });
  });

  it('Netzfehler -> server_nicht_erreichbar', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('connect failed');
    });
    const result = await checkConnection({ ...base, fetchImpl });
    expect(result).toMatchObject({ ok: false, kind: 'network', messageId: 'server_nicht_erreichbar' });
  });
});
