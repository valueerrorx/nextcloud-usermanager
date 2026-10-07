// S05 A5: listUserIds, listUserDetails, getUser - each with its own error map, path encoding.
import { describe, expect, it, vi } from 'vitest';
import { createOcsClient } from '../src/main/ocs/client.js';
import { listUserIds, listUserDetails, getUser } from '../src/main/ocs/users.js';

function fakeResponse({ status = 200, body = '' } = {}) {
  return { status, text: async () => body };
}

function envelope(statuscode, data) {
  return JSON.stringify({ ocs: { meta: { status: statuscode === 100 ? 'ok' : 'failure', statuscode }, data } });
}

function makeClient(fetchImpl) {
  return createOcsClient({ baseUrl: 'https://h', adminUser: 'admin', appPassword: 'geheim', fetchImpl, sleep: vi.fn() });
}

describe('listUserIds', () => {
  it('liefert data.users als Array von IDs', async () => {
    const fetchImpl = vi.fn(async () => fakeResponse({ body: envelope(100, { users: ['alice', 'Bob.w'] }) }));
    const result = await listUserIds(makeClient(fetchImpl));
    expect(result).toMatchObject({ ok: true, data: ['alice', 'Bob.w'] });
  });
});

describe('listUserDetails', () => {
  it('liefert data.users als rohes, nach userid gekeytes Objekt', async () => {
    const raw = { 'Aaron.w': { id: 'Aaron.w', enabled: true } };
    const fetchImpl = vi.fn(async () => fakeResponse({ body: envelope(100, { users: raw }) }));
    const result = await listUserDetails(makeClient(fetchImpl));
    expect(result).toMatchObject({ ok: true, data: raw });
  });
});

describe('getUser', () => {
  it('liefert den rohen Einzeluser als data', async () => {
    const raw = { id: 'bob', enabled: true, quota: { quota: -3 } };
    const fetchImpl = vi.fn(async () => fakeResponse({ body: envelope(100, raw) }));
    const result = await getUser(makeClient(fetchImpl), 'bob');
    expect(result).toMatchObject({ ok: true, data: raw });
  });

  it('OCS-Code 101 -> messageId user_nicht_gefunden', async () => {
    const fetchImpl = vi.fn(async () => fakeResponse({ body: envelope(101, null) }));
    const result = await getUser(makeClient(fetchImpl), 'unbekannt');
    expect(result).toMatchObject({ ok: false, messageId: 'user_nicht_gefunden' });
  });

  it('kodiert die userid im Pfad mit encodeURIComponent (Sonderzeichen "ab cd@x")', async () => {
    const fetchImpl = vi.fn(async () => fakeResponse({ body: envelope(100, { id: 'ab cd@x' }) }));
    await getUser(makeClient(fetchImpl), 'ab cd@x');
    const calledUrl = fetchImpl.mock.calls[0][0];
    expect(calledUrl).toContain(`/cloud/users/${encodeURIComponent('ab cd@x')}`);
    expect(calledUrl).not.toContain('/cloud/users/ab cd@x');
  });
});
