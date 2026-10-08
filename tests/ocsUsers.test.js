// S05 A5 + S07 A1: listUserIds, listUserDetails, getUser, and the six batch endpoints - each
// with its own error map, path encoding.
import { describe, expect, it, vi } from 'vitest';
import { createOcsClient } from '../src/main/ocs/client.js';
import {
  listUserIds,
  listUserDetails,
  getUser,
  enableUser,
  disableUser,
  deleteUser,
  setUserField,
  addUserToGroup,
  removeUserFromGroup,
} from '../src/main/ocs/users.js';

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

// S07 A1: the six batch endpoints, each with PUT/POST/DELETE, path and form fields verified via
// the mock, plus their own local error-code maps (S07-batch-kern.md A1).
describe('enableUser / disableUser / deleteUser', () => {
  it('enableUser: PUT /cloud/users/{id}/enable', async () => {
    const fetchImpl = vi.fn(async () => fakeResponse({ body: envelope(100, null) }));
    const result = await enableUser(makeClient(fetchImpl), 'alice');
    expect(result.ok).toBe(true);
    expect(fetchImpl.mock.calls[0][0]).toContain('/cloud/users/alice/enable');
    expect(fetchImpl.mock.calls[0][1].method).toBe('PUT');
  });

  it('disableUser: PUT /cloud/users/{id}/disable', async () => {
    const fetchImpl = vi.fn(async () => fakeResponse({ body: envelope(100, null) }));
    const result = await disableUser(makeClient(fetchImpl), 'alice');
    expect(result.ok).toBe(true);
    expect(fetchImpl.mock.calls[0][0]).toContain('/cloud/users/alice/disable');
    expect(fetchImpl.mock.calls[0][1].method).toBe('PUT');
  });

  it('deleteUser: DELETE /cloud/users/{id}', async () => {
    const fetchImpl = vi.fn(async () => fakeResponse({ body: envelope(100, null) }));
    const result = await deleteUser(makeClient(fetchImpl), 'alice');
    expect(result.ok).toBe(true);
    expect(fetchImpl.mock.calls[0][0]).toContain('/cloud/users/alice');
    expect(fetchImpl.mock.calls[0][1].method).toBe('DELETE');
  });

  it('kodiert die userid im Pfad mit encodeURIComponent (Sonderzeichen "ab cd@x")', async () => {
    const fetchImpl = vi.fn(async () => fakeResponse({ body: envelope(100, null) }));
    await disableUser(makeClient(fetchImpl), 'ab cd@x');
    const calledUrl = fetchImpl.mock.calls[0][0];
    expect(calledUrl).toContain(`/cloud/users/${encodeURIComponent('ab cd@x')}/disable`);
    expect(calledUrl).not.toContain('/cloud/users/ab cd@x/disable');
  });
});

describe('setUserField', () => {
  it('PUT /cloud/users/{id} mit key/value im Form-Body', async () => {
    const fetchImpl = vi.fn(async () => fakeResponse({ body: envelope(100, null) }));
    const result = await setUserField(makeClient(fetchImpl), 'alice', 'quota', '5 GB');
    expect(result.ok).toBe(true);
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toContain('/cloud/users/alice');
    expect(options.method).toBe('PUT');
    expect(options.body).toBe('key=quota&value=5+GB');
  });

  it('OCS-Code 113 -> messageId feld_nicht_editierbar', async () => {
    const fetchImpl = vi.fn(async () => fakeResponse({ body: envelope(113, null) }));
    const result = await setUserField(makeClient(fetchImpl), 'alice', 'quota', '5 GB');
    expect(result).toMatchObject({ ok: false, messageId: 'feld_nicht_editierbar' });
  });

  it('OCS-Code 107 -> messageId passwort_policy', async () => {
    const fetchImpl = vi.fn(async () => fakeResponse({ body: envelope(107, null) }));
    const result = await setUserField(makeClient(fetchImpl), 'alice', 'password', 'x');
    expect(result).toMatchObject({ ok: false, messageId: 'passwort_policy' });
  });

  it('kind auth behält seine messageId, die Endpunkt-Map wird dafür nicht befragt', async () => {
    const fetchImpl = vi.fn(async () => fakeResponse({ status: 401 }));
    const result = await setUserField(makeClient(fetchImpl), 'alice', 'quota', '5 GB');
    expect(result).toMatchObject({ ok: false, kind: 'auth', messageId: 'falsche_zugangsdaten' });
  });
});

describe('addUserToGroup / removeUserFromGroup', () => {
  it('addUserToGroup: POST /cloud/users/{id}/groups mit groupid im Form-Body', async () => {
    const fetchImpl = vi.fn(async () => fakeResponse({ body: envelope(100, null) }));
    const result = await addUserToGroup(makeClient(fetchImpl), 'alice', 'admins');
    expect(result.ok).toBe(true);
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toContain('/cloud/users/alice/groups');
    expect(options.method).toBe('POST');
    expect(options.body).toBe('groupid=admins');
  });

  it('removeUserFromGroup: DELETE /cloud/users/{id}/groups mit groupid im Form-Body', async () => {
    const fetchImpl = vi.fn(async () => fakeResponse({ body: envelope(100, null) }));
    const result = await removeUserFromGroup(makeClient(fetchImpl), 'alice', 'admins');
    expect(result.ok).toBe(true);
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toContain('/cloud/users/alice/groups');
    expect(options.method).toBe('DELETE');
    expect(options.body).toBe('groupid=admins');
  });

  it('addUserToGroup: OCS-Code 102 -> messageId gruppe_existiert_nicht', async () => {
    const fetchImpl = vi.fn(async () => fakeResponse({ body: envelope(102, null) }));
    const result = await addUserToGroup(makeClient(fetchImpl), 'alice', 'unbekannt');
    expect(result).toMatchObject({ ok: false, messageId: 'gruppe_existiert_nicht' });
  });

  it('addUserToGroup: OCS-Code 103 -> messageId kein_recht_fuer_gruppe', async () => {
    const fetchImpl = vi.fn(async () => fakeResponse({ body: envelope(103, null) }));
    const result = await addUserToGroup(makeClient(fetchImpl), 'alice', 'admins');
    expect(result).toMatchObject({ ok: false, messageId: 'kein_recht_fuer_gruppe' });
  });
});
