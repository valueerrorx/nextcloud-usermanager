// S05 A6 Abnahme 6-9: details-Probe, die fünf Fallback-Trigger, Identitätsgleichheit, Session-Memo,
// tolerante Einzelfehler im Fallback. Plus Review-Fix: nur die fünf Trigger lösen den Fallback
// aus, jeder andere Fehler-kind wird unverändert durchgereicht und nicht memoisiert.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createOcsClient } from '../src/main/ocs/client.js';
import { fetchAllUsers } from '../src/main/ocs/userList.js';
import { session } from '../src/main/session.js';

function envelope(statuscode, data) {
  return JSON.stringify({ ocs: { meta: { status: statuscode === 100 ? 'ok' : 'failure', statuscode }, data } });
}

function makeClient(fetchImpl) {
  return createOcsClient({ baseUrl: 'https://h', adminUser: 'admin', appPassword: 'geheim', fetchImpl, sleep: vi.fn() });
}

// Router fake: dispatches by URL shape. `userResponses` maps a userid to a raw body string;
// missing ids fall back to a trivially valid single-user envelope.
function makeRouter({ detailsStatus = 200, detailsBody, ids = ['bob'], userResponses = {} }) {
  const calls = { details: 0, idsList: 0, singleUser: 0 };
  const fn = vi.fn(async (url) => {
    if (url.includes('/cloud/users/details')) {
      calls.details += 1;
      return { status: detailsStatus, text: async () => detailsBody };
    }
    const idMatch = /\/cloud\/users\/([^/?]+)\?/.exec(url);
    if (idMatch) {
      calls.singleUser += 1;
      const id = decodeURIComponent(idMatch[1]);
      const body = userResponses[id] ?? envelope(100, { id, enabled: true, groups: [] });
      return { status: 200, text: async () => body };
    }
    if (url.includes('/cloud/users?')) {
      calls.idsList += 1;
      return { status: 200, text: async () => envelope(100, { users: ids }) };
    }
    throw new Error(`unerwartete URL im Test: ${url}`);
  });
  fn.calls = calls;
  return fn;
}

beforeEach(() => {
  session.resetForTests();
});

describe('fetchAllUsers — Probe-Erfolg', () => {
  it('gültige details-Antwort -> mode details, Users gemappt', async () => {
    const fetchImpl = makeRouter({ detailsBody: envelope(100, { users: { bob: { id: 'bob', enabled: true, groups: [] } } }) });
    const result = await fetchAllUsers({ client: makeClient(fetchImpl), adminUserId: 'admin' });
    expect(result.mode).toBe('details');
    expect(result.users.map((u) => u.userid)).toEqual(['bob']);
  });
});

describe('fetchAllUsers — die fünf Fallback-Trigger', () => {
  it('HTTP 404 auf /users/details löst den Fallback aus', async () => {
    const fetchImpl = makeRouter({ detailsStatus: 404, detailsBody: envelope(100, { users: { bob: {} } }) });
    const result = await fetchAllUsers({ client: makeClient(fetchImpl), adminUserId: 'admin' });
    expect(result.mode).toBe('fallback');
  });

  it('kind notOcs (HTML-Antwort) löst den Fallback aus', async () => {
    const fetchImpl = makeRouter({ detailsBody: '<html>nope</html>' });
    const result = await fetchAllUsers({ client: makeClient(fetchImpl), adminUserId: 'admin' });
    expect(result.mode).toBe('fallback');
  });

  it('statuscode !== 100 löst den Fallback aus', async () => {
    const fetchImpl = makeRouter({ detailsBody: envelope(400, null) });
    const result = await fetchAllUsers({ client: makeClient(fetchImpl), adminUserId: 'admin' });
    expect(result.mode).toBe('fallback');
  });

  it('fehlendes data.users löst den Fallback aus', async () => {
    const fetchImpl = makeRouter({ detailsBody: envelope(100, {}) });
    const result = await fetchAllUsers({ client: makeClient(fetchImpl), adminUserId: 'admin' });
    expect(result.mode).toBe('fallback');
  });

  // Nicht-negotiable (Abnahme 6): ein Array wäre auch ein "Objekt" in JS - die Probe muss das
  // trotzdem als Fallback-Trigger behandeln, sonst hielte sie die ID-Liste für Details.
  // Das erste Element ist hier absichtlich ein VOLLSTÄNDIGES User-Objekt (enabled + quota), damit
  // der fünfte Trigger ("erster Eintrag ohne enabled/quota") nicht greift und ausschließlich der
  // Array-Check diesen Test tragen kann (per Mutationstest verifiziert, siehe Schrittbericht).
  it('data.users als Array mit vollständigem erstem Objekt löst den Fallback aus', async () => {
    const fetchImpl = makeRouter({
      detailsBody: envelope(100, { users: [{ id: 'bob', enabled: true, quota: { quota: -3 } }] }),
    });
    const result = await fetchAllUsers({ client: makeClient(fetchImpl), adminUserId: 'admin' });
    expect(result.mode).toBe('fallback');
  });

  // Fixture ist ein Array von ID-Strings: das erste Element ('bob') ist gar kein Objekt, trifft
  // also denselben Trigger wie unten ("erster Eintrag ohne enabled/quota"), nicht den Array-Check
  // selbst - deshalb hier korrekt als Trigger-5-Fall benannt statt als Array-Check.
  it('data.users als Array von ID-Strings löst den Fallback aus (Trigger 5: erster Eintrag kein Objekt)', async () => {
    const fetchImpl = makeRouter({ detailsBody: envelope(100, { users: ['bob'] }) });
    const result = await fetchAllUsers({ client: makeClient(fetchImpl), adminUserId: 'admin' });
    expect(result.mode).toBe('fallback');
  });

  it('erster Eintrag ohne enabled und ohne quota löst den Fallback aus', async () => {
    const fetchImpl = makeRouter({ detailsBody: envelope(100, { users: { bob: { id: 'bob', displayname: 'Bob' } } }) });
    const result = await fetchAllUsers({ client: makeClient(fetchImpl), adminUserId: 'admin' });
    expect(result.mode).toBe('fallback');
  });
});

describe('fetchAllUsers — Identitätsfelder gleich auf beiden Lesewegen', () => {
  // Zwei wirklich unterschiedliche Rohobjekte (RESEARCH-OCS: details-Eintrag ohne die
  // Einzeluser-exklusiven Felder phone/address/website/twitter, Einzeluser-Antwort mit ihnen und
  // anderer Schlüsselreihenfolge) - nicht dasselbe Literal zweimal, sonst kann der Test nicht
  // unterscheiden, ob toUserView wirklich auf dem jeweiligen Leseweg lief.
  const detailsEntryRaw = {
    enabled: true,
    id: 'Carol',
    quota: { free: 1013296222, used: 60445602, total: 1073741824, relative: 5.63, quota: 1073741824 },
    email: 'carol@example.com',
    displayname: 'Carol X',
    groups: ['g1'],
  };
  const singleUserRaw = {
    id: 'Carol',
    displayname: 'Carol X',
    email: 'carol@example.com',
    enabled: true,
    phone: '',
    address: '',
    website: '',
    twitter: '',
    groups: ['g1'],
    quota: { quota: 1073741824, free: 1013296222, total: 1073741824, used: 60445602, relative: 5.63 },
  };

  it('derselbe User über Details und über den Fallback ergibt gleiche userid/displayname/email/enabled/groups', async () => {
    const detailsFetch = makeRouter({ detailsBody: envelope(100, { users: { Carol: detailsEntryRaw } }) });
    const detailsResult = await fetchAllUsers({ client: makeClient(detailsFetch), adminUserId: 'admin' });

    session.resetForTests();
    const fallbackFetch = makeRouter({ detailsStatus: 404, detailsBody: '', ids: ['Carol'], userResponses: { Carol: envelope(100, singleUserRaw) } });
    const fallbackResult = await fetchAllUsers({ client: makeClient(fallbackFetch), adminUserId: 'admin' });

    const detailsUser = detailsResult.users.find((u) => u.userid === 'Carol');
    const fallbackUser = fallbackResult.users.find((u) => u.userid === 'Carol');
    const identity = (u) => ({ userid: u.userid, displayname: u.displayname, email: u.email, enabled: u.enabled, groups: u.groups });
    expect(identity(fallbackUser)).toEqual(identity(detailsUser));
  });
});

describe('fetchAllUsers — Nicht-Trigger-Fehler lösen keinen Fallback aus (CRITICAL-Fix)', () => {
  it('ratelimit (429) bleibt unverändert: kein Fallback, kein listUserIds-Aufruf, kein Memo', async () => {
    const fetchImpl = makeRouter({ detailsStatus: 429, detailsBody: '' });
    const result = await fetchAllUsers({ client: makeClient(fetchImpl), adminUserId: 'admin' });
    expect(result.ok).toBe(false);
    expect(result.kind).toBe('ratelimit');
    expect(fetchImpl.calls.idsList).toBe(0);
    expect(session.userListMode).toBeNull();
  });

  it('auth (401) bleibt unverändert: kein Fallback, kein listUserIds-Aufruf, kein Memo', async () => {
    const fetchImpl = makeRouter({ detailsStatus: 401, detailsBody: '' });
    const result = await fetchAllUsers({ client: makeClient(fetchImpl), adminUserId: 'admin' });
    expect(result.ok).toBe(false);
    expect(result.kind).toBe('auth');
    expect(fetchImpl.calls.idsList).toBe(0);
    expect(session.userListMode).toBeNull();
  });

  it('timeout bleibt unverändert: kein Fallback, kein zweiter Request, kein Memo', async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (url.includes('/cloud/users/details')) {
        const err = new Error('timeout');
        err.name = 'TimeoutError';
        throw err;
      }
      throw new Error(`unerwartete URL im Test: ${url}`);
    });
    const result = await fetchAllUsers({ client: makeClient(fetchImpl), adminUserId: 'admin' });
    expect(result.ok).toBe(false);
    expect(result.kind).toBe('timeout');
    expect(fetchImpl).toHaveBeenCalledTimes(1); // no second request (no listUserIds)
    expect(session.userListMode).toBeNull();
  });
});

describe('fetchAllUsers — fehlerhafte Einträge werden übersprungen statt den Ladevorgang abzubrechen (MINOR 6)', () => {
  it('getUser mit data: null im Fallback wird übersprungen, kein Absturz', async () => {
    const fetchImpl = makeRouter({
      detailsStatus: 404,
      detailsBody: '',
      ids: ['bob', 'leer'],
      userResponses: { leer: envelope(100, null) },
    });
    const result = await fetchAllUsers({ client: makeClient(fetchImpl), adminUserId: 'admin' });
    expect(result.users.map((u) => u.userid)).toEqual(['bob']);
    expect(result.uebersprungen).toBe(1);
  });

  it('ein Eintrag ohne id in der details-Antwort wird übersprungen statt zu werfen', async () => {
    const fetchImpl = makeRouter({
      detailsBody: envelope(100, {
        users: { bob: { id: 'bob', enabled: true, groups: [] }, kaputt: { enabled: true } },
      }),
    });
    const result = await fetchAllUsers({ client: makeClient(fetchImpl), adminUserId: 'admin' });
    expect(result.users.map((u) => u.userid)).toEqual(['bob']);
    expect(result.uebersprungen).toBe(1);
  });
});

describe('fetchAllUsers — memoisierter details-Modus degradiert zu Fehler statt zu werfen (MINOR 7)', () => {
  it('ungültige Form im memoisierten details-Modus liefert einen Fehler, keine erneute Probe, kein Fallback', async () => {
    const validBody = envelope(100, { users: { bob: { id: 'bob', enabled: true, groups: [] } } });
    const invalidBody = envelope(100, { users: ['bob'] }); // array shape surfaces on a later call
    let call = 0;
    const fetchImpl = vi.fn(async (url) => {
      if (url.includes('/cloud/users/details')) {
        call += 1;
        return { status: 200, text: async () => (call === 1 ? validBody : invalidBody) };
      }
      throw new Error(`unerwartete URL im Test: ${url}`);
    });
    const client = makeClient(fetchImpl);

    const first = await fetchAllUsers({ client, adminUserId: 'admin' });
    expect(first.mode).toBe('details');
    expect(session.userListMode).toBe('details');

    const second = await fetchAllUsers({ client, adminUserId: 'admin' });
    expect(second.ok).toBe(false);
    expect(second.messageId).toBe('userliste_fehlgeschlagen');
    expect(session.userListMode).toBe('details'); // unchanged - no re-probe, no fallback switch
    expect(fetchImpl).toHaveBeenCalledTimes(2); // only the two details calls
  });
});

describe('fetchAllUsers — Fortschritt und Abbruch im Fallback (Abnahme 3)', () => {
  it('onProgress feuert genau einmal pro Item', async () => {
    const fetchImpl = makeRouter({ detailsStatus: 404, detailsBody: '', ids: ['a', 'b', 'c'] });
    const onProgress = vi.fn();
    const result = await fetchAllUsers({ client: makeClient(fetchImpl), adminUserId: 'admin', onProgress });
    expect(onProgress).toHaveBeenCalledTimes(3);
    expect(result.users.length).toBe(3);
  });

  it('ein per shouldStop übersprungenes Item wird korrekt als uebersprungen gezählt', async () => {
    const fetchImpl = makeRouter({ detailsStatus: 404, detailsBody: '', ids: ['a', 'b', 'c'] });
    let calls = 0;
    const shouldStop = () => {
      calls += 1;
      return calls > 1; // let the first dispatch through, stop every lane after that
    };
    const result = await fetchAllUsers({ client: makeClient(fetchImpl), adminUserId: 'admin', shouldStop });
    expect(result.users.map((u) => u.userid)).toEqual(['a']);
    expect(result.uebersprungen).toBe(2);
  });
});

describe('fetchAllUsers — Session-Memo', () => {
  it('zweiter Aufruf probt nicht erneut: /users/details wird im memoisierten Fallback-Modus kein zweites Mal gerufen', async () => {
    const fetchImpl = makeRouter({ detailsStatus: 404, detailsBody: '' });
    const client = makeClient(fetchImpl);

    const first = await fetchAllUsers({ client, adminUserId: 'admin' });
    expect(first.mode).toBe('fallback');
    expect(fetchImpl.calls.details).toBe(1);

    const second = await fetchAllUsers({ client, adminUserId: 'admin' });
    expect(second.mode).toBe('fallback');
    expect(fetchImpl.calls.details).toBe(1); // still exactly one probe call across both invocations
    expect(fetchImpl.calls.idsList).toBe(2); // but the fallback itself re-runs every call
  });

  it('nach einem Reset (wie bei connect) wird die Probe neu bestimmt', async () => {
    const fallbackFetch = makeRouter({ detailsStatus: 404, detailsBody: '' });
    await fetchAllUsers({ client: makeClient(fallbackFetch), adminUserId: 'admin' });
    expect(session.userListMode).toBe('fallback');

    session.setUserListMode(null); // what connect does (S05 A7)
    const detailsFetch = makeRouter({ detailsBody: envelope(100, { users: { bob: { id: 'bob', enabled: true, groups: [] } } }) });
    const result = await fetchAllUsers({ client: makeClient(detailsFetch), adminUserId: 'admin' });
    expect(result.mode).toBe('details');
  });
});

describe('fetchAllUsers — tolerante Einzelfehler im Fallback', () => {
  it('ein fehlgeschlagener getUser-Aufruf fehlt in der Liste, uebersprungen === 1', async () => {
    const fetchImpl = makeRouter({
      detailsStatus: 404,
      detailsBody: '',
      ids: ['bob', 'broken'],
      userResponses: { broken: envelope(101, null) },
    });
    const result = await fetchAllUsers({ client: makeClient(fetchImpl), adminUserId: 'admin' });
    expect(result.mode).toBe('fallback');
    expect(result.users.map((u) => u.userid)).toEqual(['bob']);
    expect(result.uebersprungen).toBe(1);
  });
});
