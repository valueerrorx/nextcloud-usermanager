// S10 A2: listGroups, createGroup - each with its own local error-code map (RESEARCH-OCS §5, V4).
import { describe, expect, it, vi } from 'vitest';
import { createOcsClient } from '../src/main/ocs/client.js';
import { listGroups, createGroup } from '../src/main/ocs/groups.js';

function fakeResponse({ status = 200, body = '' } = {}) {
  return { status, text: async () => body };
}

function envelope(statuscode, data) {
  return JSON.stringify({ ocs: { meta: { status: statuscode === 100 ? 'ok' : 'failure', statuscode }, data } });
}

function makeClient(fetchImpl) {
  return createOcsClient({ baseUrl: 'https://h', adminUser: 'admin', appPassword: 'geheim', fetchImpl, sleep: vi.fn() });
}

describe('listGroups', () => {
  it('liefert data.groups als Array (RESEARCH-OCS V4)', async () => {
    const fetchImpl = vi.fn(async () => fakeResponse({ body: envelope(100, { groups: ['admins', '2026-1C'] }) }));
    const result = await listGroups(makeClient(fetchImpl));
    expect(result).toMatchObject({ ok: true, data: ['admins', '2026-1C'] });
    expect(fetchImpl.mock.calls[0][0]).toContain('/cloud/groups');
    expect(fetchImpl.mock.calls[0][1].method).toBe('GET');
  });

  it('kind auth behält seine messageId, die Endpunkt-Map wird dafür nicht befragt', async () => {
    const fetchImpl = vi.fn(async () => fakeResponse({ status: 401 }));
    const result = await listGroups(makeClient(fetchImpl));
    expect(result).toMatchObject({ ok: false, kind: 'auth', messageId: 'falsche_zugangsdaten' });
  });

  // Testlücke S10-Review MINOR 1: result.data?.groups liefert undefined durch, wenn data.groups
  // fehlt oder kein Array ist - ImportView würde serverGruppen.length darauf werfen.
  it('data.groups fehlt -> liefert ein leeres Array, nie undefined', async () => {
    const fetchImpl = vi.fn(async () => fakeResponse({ body: envelope(100, {}) }));
    const result = await listGroups(makeClient(fetchImpl));
    expect(result).toMatchObject({ ok: true, data: [] });
  });

  it('data.groups ist kein Array -> liefert ein leeres Array, nie den Rohwert', async () => {
    const fetchImpl = vi.fn(async () => fakeResponse({ body: envelope(100, { groups: 'keine-liste' }) }));
    const result = await listGroups(makeClient(fetchImpl));
    expect(result).toMatchObject({ ok: true, data: [] });
  });
});

describe('createGroup', () => {
  it('POST /cloud/groups mit groupid im Form-Body', async () => {
    const fetchImpl = vi.fn(async () => fakeResponse({ body: envelope(100, null) }));
    const result = await createGroup(makeClient(fetchImpl), 'neue-gruppe');
    expect(result.ok).toBe(true);
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toContain('/cloud/groups');
    expect(options.method).toBe('POST');
    expect(options.body).toBe('groupid=neue-gruppe');
  });

  it('kodiert Sonderzeichen im groupid-Form-Feld ("Jahr 2026/1C & mehr")', async () => {
    const fetchImpl = vi.fn(async () => fakeResponse({ body: envelope(100, null) }));
    await createGroup(makeClient(fetchImpl), 'Jahr 2026/1C & mehr');
    const options = fetchImpl.mock.calls[0][1];
    expect(options.body).toBe(`groupid=${encodeURIComponent('Jahr 2026/1C & mehr').replace(/%20/g, '+')}`);
  });

  it('OCS-Code 102 -> messageId gruppe_existiert', async () => {
    const fetchImpl = vi.fn(async () => fakeResponse({ body: envelope(102, null) }));
    const result = await createGroup(makeClient(fetchImpl), 'admins');
    expect(result).toMatchObject({ ok: false, messageId: 'gruppe_existiert' });
  });

  // Nicht-leerer Name (S10-Review Testlücke 10): '' las wie ein Beweis für die Ablehnung leerer
  // Namen, prüfte aber nur die Code-Map. Die Leerstring-Ablehnung selbst sitzt in ipc.js
  // (MINOR 2, tests/ipc.test.js), createGroup bekommt den Namen nur unverändert durchgereicht.
  it('OCS-Code 101 -> messageId gruppe_anlegen_fehlgeschlagen', async () => {
    const fetchImpl = vi.fn(async () => fakeResponse({ body: envelope(101, null) }));
    const result = await createGroup(makeClient(fetchImpl), 'ungueltiger name');
    expect(result).toMatchObject({ ok: false, messageId: 'gruppe_anlegen_fehlgeschlagen' });
  });

  it('OCS-Code 103 -> messageId gruppe_anlegen_fehlgeschlagen', async () => {
    const fetchImpl = vi.fn(async () => fakeResponse({ body: envelope(103, null) }));
    const result = await createGroup(makeClient(fetchImpl), 'admins');
    expect(result).toMatchObject({ ok: false, messageId: 'gruppe_anlegen_fehlgeschlagen' });
  });
});
