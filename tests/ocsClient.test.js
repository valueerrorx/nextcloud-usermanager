// S03 ocsClient: all 16 Abnahmekriterien from docs/steps/S03-ocs-client.md, driven against an
// injected fetchImpl. No real network access.
import { describe, it, expect, vi } from 'vitest';
import { createOcsClient } from '../src/main/ocs/client.js';

// Minimal but faithful fake Response: status, headers.get(), and text() (the client never calls json()).
function fakeResponse({ status = 200, body = '', headers = {} } = {}) {
  return {
    status,
    headers: { get: (name) => headers[name] ?? null },
    text: async () => body,
  };
}

function envelope(statuscode, data, extra = {}) {
  return JSON.stringify({ ocs: { meta: { status: statuscode === 100 ? 'ok' : 'failure', statuscode, ...extra }, data } });
}

// Explicit marker so a fetchImpl fixture can throw any value (string, plain object, Error) without
// guessing from its type - a plain {name:'TimeoutError'} object must throw just like a real Error.
function thrown(value) {
  return { __thrown: value };
}

function resolveItem(item) {
  if (item && typeof item === 'object' && '__thrown' in item) throw item.__thrown;
  return item;
}

// fetchImpl that returns one fixed response (or throws, via thrown()) on every call.
function singleFetch(responseOrThrown) {
  const calls = [];
  const fn = vi.fn(async (url, options) => {
    calls.push({ url, options });
    return resolveItem(responseOrThrown);
  });
  fn.calls = calls;
  return fn;
}

// fetchImpl that returns a different response/throw (via thrown()) per call, in order.
function sequenceFetch(items) {
  let i = 0;
  const calls = [];
  const fn = vi.fn(async (url, options) => {
    calls.push({ url, options });
    const item = items[Math.min(i, items.length - 1)];
    i += 1;
    return resolveItem(item);
  });
  fn.calls = calls;
  return fn;
}

const baseOpts = { baseUrl: 'https://h', adminUser: 'user', appPassword: 'passwort' };

describe('1. Header-Pflicht', () => {
  it('sendet OCS-APIRequest, Accept application/json und Basic-Auth auf jedem Request', async () => {
    const fetchImpl = singleFetch(fakeResponse({ status: 200, body: envelope(100, { id: 1 }) }));
    const client = createOcsClient({ ...baseOpts, fetchImpl, sleep: vi.fn() });
    await client.request({ method: 'GET', path: '/cloud/users' });
    const headers = fetchImpl.calls[0].options.headers;
    expect(headers['OCS-APIRequest']).toBe('true');
    expect(headers.Accept).toBe('application/json');
    expect(headers.Authorization).toMatch(/^Basic /);
    expect(fetchImpl.calls[0].options.signal).toBeInstanceOf(AbortSignal);
  });

  it('Basic-Auth dekodiert per UTF-8 zu genau user:passwort bei Doppelpunkt und Nicht-ASCII-Zeichen im Passwort', async () => {
    const fetchImpl = singleFetch(fakeResponse({ status: 200, body: envelope(100, { id: 1 }) }));
    const client = createOcsClient({
      baseUrl: 'https://h',
      adminUser: 'user',
      appPassword: 'pa:ß wort',
      fetchImpl,
      sleep: vi.fn(),
    });
    await client.request({ method: 'GET', path: '/cloud/users' });
    const headers = fetchImpl.calls[0].options.headers;
    const base64 = headers.Authorization.slice('Basic '.length);
    expect(Buffer.from(base64, 'base64').toString('utf8')).toBe('user:pa:ß wort');
  });
});

describe('2. Exakte URL', () => {
  it('baut genau https://h/ocs/v1.php/cloud/users?limit=1&format=json', async () => {
    const fetchImpl = singleFetch(fakeResponse({ status: 200, body: envelope(100, { id: 1 }) }));
    const client = createOcsClient({ ...baseOpts, fetchImpl, sleep: vi.fn() });
    await client.request({ method: 'GET', path: '/cloud/users', query: { limit: 1 } });
    expect(fetchImpl.calls[0].url).toBe('https://h/ocs/v1.php/cloud/users?limit=1&format=json');
  });

  it('überschreibt ein vom Aufrufer übergebenes format=xml mit format=json', async () => {
    const fetchImpl = singleFetch(fakeResponse({ status: 200, body: envelope(100, { id: 1 }) }));
    const client = createOcsClient({ ...baseOpts, fetchImpl, sleep: vi.fn() });
    await client.request({ method: 'GET', path: '/cloud/users', query: { limit: 1, format: 'xml' } });
    expect(fetchImpl.calls[0].url).toBe('https://h/ocs/v1.php/cloud/users?limit=1&format=json');
  });
});

describe('3. Erfolg', () => {
  it('HTTP 200 + statuscode 100 -> ok:true, data deep-equals ein verschachteltes Fixture, data ist nicht json.ocs oder json', async () => {
    const nested = { users: { a: { id: 'a', groups: ['x', 'y'] } } };
    const body = envelope(100, nested);
    const fetchImpl = singleFetch(fakeResponse({ status: 200, body }));
    const client = createOcsClient({ ...baseOpts, fetchImpl, sleep: vi.fn() });
    const result = await client.request({ method: 'GET', path: '/cloud/users/details' });
    const json = JSON.parse(body);
    expect(result.ok).toBe(true);
    expect(result.data).toEqual(nested);
    expect(result.data).not.toBe(json.ocs);
    expect(result.data).not.toBe(json);
  });

  it('fehlendes ocs.data -> data ist genau null', async () => {
    const body = JSON.stringify({ ocs: { meta: { status: 'ok', statuscode: 100 } } });
    const fetchImpl = singleFetch(fakeResponse({ status: 200, body }));
    const client = createOcsClient({ ...baseOpts, fetchImpl, sleep: vi.fn() });
    const result = await client.request({ method: 'GET', path: '/cloud/users' });
    expect(result.ok).toBe(true);
    expect(result.data).toBeNull();
  });
});

describe('4. Erfolg verlangt beides (HTTP-Status UND statuscode)', () => {
  it('HTTP 200 + statuscode 101 -> ok:false, kind: ocs', async () => {
    const fetchImpl = singleFetch(fakeResponse({ status: 200, body: envelope(101, null) }));
    const client = createOcsClient({ ...baseOpts, fetchImpl, sleep: vi.fn() });
    const result = await client.request({ method: 'POST', path: '/cloud/users' });
    expect(result.ok).toBe(false);
    expect(result.kind).toBe('ocs');
  });

  it('HTTP 500 + statuscode 100 -> ok:false, kind: http', async () => {
    const fetchImpl = singleFetch(fakeResponse({ status: 500, body: envelope(100, null) }));
    const client = createOcsClient({ ...baseOpts, fetchImpl, sleep: vi.fn() });
    const result = await client.request({ method: 'POST', path: '/cloud/users' });
    expect(result.ok).toBe(false);
    expect(result.kind).toBe('http');
  });
});

describe('5. v2-Falle', () => {
  it('statuscode 200 (v2-Erfolgs-Code) -> ok:false, kind: ocs, ocsCode: 200', async () => {
    const fetchImpl = singleFetch(fakeResponse({ status: 200, body: envelope(200, { x: 1 }) }));
    const client = createOcsClient({ ...baseOpts, fetchImpl, sleep: vi.fn() });
    const result = await client.request({ method: 'GET', path: '/cloud/users/details' });
    expect(result.ok).toBe(false);
    expect(result.kind).toBe('ocs');
    expect(result.ocsCode).toBe(200);
  });
});

describe('6. Klassifikationstabelle', () => {
  const rows = [
    {
      name: '401',
      response: fakeResponse({ status: 401, body: '' }),
      expected: { kind: 'auth', messageId: 'falsche_zugangsdaten', httpStatus: 401, ocsCode: null, versuche: 1 },
    },
    {
      name: '403',
      response: fakeResponse({ status: 403, body: '' }),
      expected: { kind: 'forbidden', messageId: 'kein_admin', httpStatus: 403, ocsCode: null, versuche: 1 },
    },
    {
      name: '429',
      response: fakeResponse({ status: 429, body: '' }),
      expected: { kind: 'ratelimit', messageId: 'server_blockt_vorerst', httpStatus: 429, ocsCode: null, versuche: 3 },
      method: 'GET',
    },
    {
      name: '997-im-Envelope',
      response: fakeResponse({ status: 200, body: envelope(997, null) }),
      expected: { kind: 'forbidden', messageId: 'kein_admin', httpStatus: 200, ocsCode: 997, versuche: 1 },
    },
    {
      name: 'HTML 200',
      response: fakeResponse({ status: 200, body: '<html>not ocs</html>' }),
      expected: { kind: 'notOcs', messageId: 'falscher_basispfad', httpStatus: 200, ocsCode: null, versuche: 1 },
    },
    {
      name: '204 ohne Body',
      response: fakeResponse({ status: 204, body: '' }),
      expected: { kind: 'notOcs', messageId: 'falscher_basispfad', httpStatus: 204, ocsCode: null, versuche: 1 },
    },
    {
      name: 'ocs ohne meta',
      response: fakeResponse({ status: 200, body: JSON.stringify({ ocs: { data: {} } }) }),
      expected: { kind: 'notOcs', messageId: 'falscher_basispfad', httpStatus: 200, ocsCode: null, versuche: 1 },
    },
    {
      name: 'statuscode als String',
      response: fakeResponse({ status: 200, body: JSON.stringify({ ocs: { meta: { status: 'ok', statuscode: '100' }, data: {} } }) }),
      expected: { kind: 'notOcs', messageId: 'falscher_basispfad', httpStatus: 200, ocsCode: null, versuche: 1 },
    },
    {
      name: '500 mit gültigem Envelope (statuscode 100)',
      response: fakeResponse({ status: 500, body: envelope(100, null) }),
      expected: { kind: 'http', messageId: 'unerwarteter_serverfehler', httpStatus: 500, ocsCode: 100, versuche: 2 },
      method: 'GET',
    },
    {
      // Retry keys on the HTTP status, not on `kind`: a 500 with a valid ocs-error envelope
      // still gets the GET/5xx retry, even though its kind is 'ocs' and not a transport error.
      name: '500 mit statuscode 101 (kind: ocs, Retry folgt trotzdem dem HTTP-Status)',
      response: fakeResponse({ status: 500, body: envelope(101, null) }),
      expected: { kind: 'ocs', messageId: 'ocs_fehler', httpStatus: 500, ocsCode: 101, versuche: 2 },
      method: 'GET',
    },
  ];

  for (const row of rows) {
    it(`${row.name} -> kind=${row.expected.kind}, messageId=${row.expected.messageId}, httpStatus=${row.expected.httpStatus}, ocsCode=${row.expected.ocsCode}, versuche=${row.expected.versuche}`, async () => {
      const fetchImpl = singleFetch(row.response);
      const sleep = vi.fn();
      const client = createOcsClient({ ...baseOpts, fetchImpl, sleep });
      const result = await client.request({ method: row.method ?? 'GET', path: '/cloud/users' });
      expect(result.kind).toBe(row.expected.kind);
      expect(result.messageId).toBe(row.expected.messageId);
      expect(result.httpStatus).toBe(row.expected.httpStatus);
      expect(result.ocsCode).toBe(row.expected.ocsCode);
      expect(result.versuche).toBe(row.expected.versuche);
    });
  }
});

describe('6b. 401/403/429 lesen den Body nicht', () => {
  for (const status of [401, 403, 429]) {
    it(`HTTP ${status} -> response.text() wird nie aufgerufen`, async () => {
      const text = vi.fn(async () => '');
      const response = { status, headers: { get: () => null }, text };
      const fetchImpl = singleFetch(response);
      const client = createOcsClient({ ...baseOpts, fetchImpl, sleep: vi.fn() });
      await client.request({ method: 'GET', path: '/cloud/users' });
      expect(text).not.toHaveBeenCalled();
    });
  }
});

describe('7. Exception-Pfade: drei Timeout-Varianten', () => {
  it('DOMException-artig mit name TimeoutError -> kind: timeout', async () => {
    const err = { name: 'TimeoutError', message: 'timed out' };
    const fetchImpl = singleFetch(thrown(err));
    const client = createOcsClient({ ...baseOpts, fetchImpl, sleep: vi.fn() });
    const result = await client.request({ method: 'GET', path: '/cloud/users' });
    expect(result.kind).toBe('timeout');
  });

  it('Fehler mit name AbortError -> kind: timeout', async () => {
    const err = new Error('aborted');
    err.name = 'AbortError';
    const fetchImpl = singleFetch(thrown(err));
    const client = createOcsClient({ ...baseOpts, fetchImpl, sleep: vi.fn() });
    const result = await client.request({ method: 'GET', path: '/cloud/users' });
    expect(result.kind).toBe('timeout');
  });

  it('TypeError mit cause.name TimeoutError (undici-Body-Read) -> kind: timeout', async () => {
    const err = new TypeError('terminated');
    err.cause = { name: 'TimeoutError' };
    const fetchImpl = singleFetch(thrown(err));
    const client = createOcsClient({ ...baseOpts, fetchImpl, sleep: vi.fn() });
    const result = await client.request({ method: 'GET', path: '/cloud/users' });
    expect(result.kind).toBe('timeout');
  });
});

describe('8. Zertifikat', () => {
  it('cause.code UNABLE_TO_VERIFY_LEAF_SIGNATURE -> kind: cert', async () => {
    const err = new Error('self signed certificate in certificate chain');
    err.cause = { code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' };
    const fetchImpl = singleFetch(thrown(err));
    const client = createOcsClient({ ...baseOpts, fetchImpl, sleep: vi.fn() });
    const result = await client.request({ method: 'GET', path: '/cloud/users' });
    expect(result.kind).toBe('cert');
  });

  it('cause.code DEPTH_ZERO_SELF_SIGNED_CERT -> kind: cert', async () => {
    const err = new Error('depth zero self signed cert');
    err.cause = { code: 'DEPTH_ZERO_SELF_SIGNED_CERT' };
    const fetchImpl = singleFetch(thrown(err));
    const client = createOcsClient({ ...baseOpts, fetchImpl, sleep: vi.fn() });
    const result = await client.request({ method: 'GET', path: '/cloud/users' });
    expect(result.kind).toBe('cert');
  });

  it('Chromium net::ERR_CERT_AUTHORITY_INVALID (kein OpenSSL-Code, nur die Fehlermeldung) -> kind: cert', async () => {
    // net.fetch (Electron/Chromium) throws net::ERR_CERT_* instead of the OpenSSL codes above
    // (REVIEW-NOTES [S04]) - the cheap safety net checks the message/cause text, not err.cause.code.
    const err = new Error('net::ERR_CERT_AUTHORITY_INVALID');
    const fetchImpl = singleFetch(thrown(err));
    const client = createOcsClient({ ...baseOpts, fetchImpl, sleep: vi.fn() });
    const result = await client.request({ method: 'GET', path: '/cloud/users' });
    expect(result.kind).toBe('cert');
  });

  it('geworfener Fehler ohne cause -> kind: network (belegt den typeof-Guard)', async () => {
    const err = new Error('fetch failed');
    const fetchImpl = singleFetch(thrown(err));
    const client = createOcsClient({ ...baseOpts, fetchImpl, sleep: vi.fn() });
    const result = await client.request({ method: 'GET', path: '/cloud/users' });
    expect(result.kind).toBe('network');
  });
});

describe('9. Nicht-Error geworfen', () => {
  it('fetchImpl wirft einen String -> kind: network, request wirft nicht nach außen', async () => {
    const fetchImpl = singleFetch(thrown('boom'));
    const client = createOcsClient({ ...baseOpts, fetchImpl, sleep: vi.fn() });
    const result = await client.request({ method: 'GET', path: '/cloud/users' });
    expect(result.kind).toBe('network');
  });
});

describe('10. Retry, exakte Aufrufliste', () => {
  it('429 dreimal -> versuche 3 und sleep.mock.calls deep-equals [[2000],[6000]]', async () => {
    const fetchImpl = singleFetch(fakeResponse({ status: 429, body: '' }));
    const sleep = vi.fn();
    const client = createOcsClient({ ...baseOpts, fetchImpl, sleep });
    const result = await client.request({ method: 'GET', path: '/cloud/users' });
    expect(result.versuche).toBe(3);
    expect(sleep.mock.calls).toEqual([[2000], [6000]]);
  });

  it('Erfolg nach einem 429 -> ok:true, versuche 2', async () => {
    const fetchImpl = sequenceFetch([
      fakeResponse({ status: 429, body: '' }),
      fakeResponse({ status: 200, body: envelope(100, {}) }),
    ]);
    const client = createOcsClient({ ...baseOpts, fetchImpl, sleep: vi.fn() });
    const result = await client.request({ method: 'GET', path: '/cloud/users' });
    expect(result.ok).toBe(true);
    expect(result.versuche).toBe(2);
  });

  it('auth (401) -> versuche 1, sleep nie aufgerufen', async () => {
    const fetchImpl = singleFetch(fakeResponse({ status: 401, body: '' }));
    const sleep = vi.fn();
    const client = createOcsClient({ ...baseOpts, fetchImpl, sleep });
    const result = await client.request({ method: 'GET', path: '/cloud/users' });
    expect(result.versuche).toBe(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('GET mit durchgehend HTTP 500 -> versuche 2 (die Methodenunterscheidung, GET-Hälfte)', async () => {
    const fetchImpl = singleFetch(fakeResponse({ status: 500, body: envelope(100, null) }));
    const client = createOcsClient({ ...baseOpts, fetchImpl, sleep: vi.fn() });
    const result = await client.request({ method: 'GET', path: '/cloud/users' });
    expect(result.versuche).toBe(2);
  });

  it('POST mit durchgehend HTTP 500 -> versuche 1 (die Methodenunterscheidung, POST-Hälfte)', async () => {
    const fetchImpl = singleFetch(fakeResponse({ status: 500, body: envelope(100, null) }));
    const client = createOcsClient({ ...baseOpts, fetchImpl, sleep: vi.fn() });
    const result = await client.request({ method: 'POST', path: '/cloud/users' });
    expect(result.versuche).toBe(1);
  });

  it('GET mit HTTP 500 und unparsebarem HTML-Body -> kind: notOcs, versuche 2 (der HTTP-Status gewinnt über kind)', async () => {
    const fetchImpl = singleFetch(fakeResponse({ status: 500, body: '<html>bad gateway</html>' }));
    const client = createOcsClient({ ...baseOpts, fetchImpl, sleep: vi.fn() });
    const result = await client.request({ method: 'GET', path: '/cloud/users' });
    expect(result.kind).toBe('notOcs');
    expect(result.versuche).toBe(2);
  });

  it('POST mit HTTP 500 und unparsebarem HTML-Body -> versuche 1 (5xx-Retry bleibt auf GET/HEAD beschränkt)', async () => {
    const fetchImpl = singleFetch(fakeResponse({ status: 500, body: '<html>bad gateway</html>' }));
    const client = createOcsClient({ ...baseOpts, fetchImpl, sleep: vi.fn() });
    const result = await client.request({ method: 'POST', path: '/cloud/users' });
    expect(result.versuche).toBe(1);
  });

  it('POST mit 429 -> versuche 3 (429 wird für alle Methoden wiederholt)', async () => {
    const fetchImpl = singleFetch(fakeResponse({ status: 429, body: '' }));
    const client = createOcsClient({ ...baseOpts, fetchImpl, sleep: vi.fn() });
    const result = await client.request({ method: 'POST', path: '/cloud/users' });
    expect(result.versuche).toBe(3);
  });

  it('retryDelaysMs: [] mit 429 -> versuche 1 (kein konfigurierter Delay -> kein weiterer Retry)', async () => {
    const fetchImpl = singleFetch(fakeResponse({ status: 429, body: '' }));
    const client = createOcsClient({ ...baseOpts, fetchImpl, sleep: vi.fn(), retryDelaysMs: [] });
    const result = await client.request({ method: 'GET', path: '/cloud/users' });
    expect(result.versuche).toBe(1);
  });

  it('Folge 429 -> network -> 429 -> versuche <= 3 (globale Obergrenze gegen Zyklen)', async () => {
    const fetchImpl = sequenceFetch([
      fakeResponse({ status: 429, body: '' }),
      thrown(new Error('fetch failed')),
      fakeResponse({ status: 429, body: '' }),
    ]);
    const client = createOcsClient({ ...baseOpts, fetchImpl, sleep: vi.fn() });
    const result = await client.request({ method: 'GET', path: '/cloud/users' });
    expect(result.versuche).toBeLessThanOrEqual(3);
  });
});

describe('11. Kein Secret-Leak', () => {
  it('fetchImpl wirft einen Error, dessen message den Basic-Header mit Passwort enthält -> weder Klartext noch Base64-Form in JSON.stringify(result), result.message oder result.messageId', async () => {
    const secretPassword = 'geheimesPasswort123';
    const basic = Buffer.from(`user:${secretPassword}`, 'utf8').toString('base64');
    const err = new Error(`connect ECONNREFUSED 127.0.0.1:443, header was Basic ${basic}`);
    const fetchImpl = singleFetch(thrown(err));
    const client = createOcsClient({ baseUrl: 'https://h', adminUser: 'user', appPassword: secretPassword, fetchImpl, sleep: vi.fn() });
    const result = await client.request({ method: 'GET', path: '/cloud/users' });
    expect(JSON.stringify(result)).not.toContain(secretPassword);
    expect(result.message).not.toContain(secretPassword);
    expect(result.messageId).not.toContain(secretPassword);
    // base64 form (the Authorization header) must not leak either - partial masking is still a leak.
    expect(JSON.stringify(result)).not.toContain(basic);
    expect(result.message).not.toContain(basic);
    expect(result.messageId).not.toContain(basic);
  });

  it('Server-Antwort mit ocs.meta.message, das das Passwort enthält -> weder Klartext noch Base64-Form in JSON.stringify(result), result.message oder result.messageId', async () => {
    const secretPassword = 'geheimesPasswort123';
    const basic = Buffer.from(`user:${secretPassword}`, 'utf8').toString('base64');
    const body = envelope(101, null, { message: `Fehler für Passwort ${secretPassword}` });
    const fetchImpl = singleFetch(fakeResponse({ status: 200, body }));
    const client = createOcsClient({ baseUrl: 'https://h', adminUser: 'user', appPassword: secretPassword, fetchImpl, sleep: vi.fn() });
    const result = await client.request({ method: 'POST', path: '/cloud/users' });
    expect(JSON.stringify(result)).not.toContain(secretPassword);
    expect(result.message).not.toContain(secretPassword);
    expect(result.messageId).not.toContain(secretPassword);
    expect(JSON.stringify(result)).not.toContain(basic);
    expect(result.message).not.toContain(basic);
    expect(result.messageId).not.toContain(basic);
    expect(result).not.toHaveProperty('serverText');
  });

  it('OCS 107 ohne Geheimnis reicht den Servertext als serverText durch', async () => {
    const body = envelope(107, null, { message: 'Das Passwort muss mindestens 10 Zeichen lang sein.' });
    const fetchImpl = singleFetch(fakeResponse({ status: 200, body }));
    const client = createOcsClient({ ...baseOpts, fetchImpl, sleep: vi.fn() });
    const result = await client.request({ method: 'POST', path: '/cloud/users', form: { userid: 'a', password: 'kurz' } });
    expect(result.serverText).toBe('Das Passwort muss mindestens 10 Zeichen lang sein.');
    expect(result.messageId).toBe('ocs_fehler');
  });

  it('OCS 107 ohne Passwort-Form (PUT key=quota, Gruppen-Request) trägt keinen serverText', async () => {
    const body = envelope(107, null, { message: 'Servertext-quota' });
    const client = createOcsClient({ ...baseOpts, fetchImpl: () => Promise.resolve(fakeResponse({ status: 200, body })), sleep: vi.fn() });
    const quota = await client.request({ method: 'PUT', path: '/cloud/users/a', form: { key: 'quota', value: '1 GB' } });
    const groups = await client.request({ method: 'GET', path: '/cloud/groups' });
    expect(quota.ocsCode).toBe(107);
    expect(quota).not.toHaveProperty('serverText');
    expect(groups).not.toHaveProperty('serverText');
  });

  it('HTTP-Fehler mit gültigem Envelope trägt keinen Servertext', async () => {
    const body = envelope(100, { message: 'User creation failed' }, { message: 'OK' });
    const fetchImpl = singleFetch(fakeResponse({ status: 500, body }));
    const client = createOcsClient({ ...baseOpts, fetchImpl, sleep: vi.fn() });
    const result = await client.request({ method: 'POST', path: '/cloud/users', form: { userid: 'a', password: 'x' } });
    expect(result.messageId).toBe('unerwarteter_serverfehler');
    expect(result).not.toHaveProperty('serverText');
    expect(JSON.stringify(result)).not.toContain('User creation failed');
  });

  it('HTTP-Fehler ohne Servertext hat kein Textfeld und keinen HTTP-Fallback', async () => {
    const fetchImpl = singleFetch(fakeResponse({ status: 500, body: envelope(100, null) }));
    const client = createOcsClient({ ...baseOpts, fetchImpl, sleep: vi.fn() });
    const result = await client.request({ method: 'POST', path: '/cloud/users' });
    expect(result).not.toHaveProperty('serverText');
    expect(JSON.stringify(result)).not.toContain('HTTP 500');
  });

  it('das angelegte Passwort wird aus dem Servertext entfernt', async () => {
    const body = envelope(107, { message: 'Abgelehnt: kurz1234 ist zu kurz' }, { message: 'Failure' });
    const fetchImpl = singleFetch(fakeResponse({ status: 200, body }));
    const client = createOcsClient({ ...baseOpts, fetchImpl, sleep: vi.fn() });
    const result = await client.request({
      method: 'POST', path: '/cloud/users', form: { userid: 'a', password: 'kurz1234' },
    });
    expect(result.serverText).toBe('Abgelehnt: ist zu kurz');
    expect(JSON.stringify(result)).not.toContain('kurz1234');
  });
});

describe('12. Form-Encoding', () => {
  it('form mit Array, Leerzeichen-Wert, undefined und null ergibt genau groups%5B%5D=a&groups%5B%5D=b&quota=1+GB und Content-Type urlencoded', async () => {
    const fetchImpl = singleFetch(fakeResponse({ status: 200, body: envelope(100, {}) }));
    const client = createOcsClient({ ...baseOpts, fetchImpl, sleep: vi.fn() });
    await client.request({
      method: 'POST',
      path: '/cloud/users',
      form: { groups: ['a', 'b'], quota: '1 GB', leer: undefined, nix: null },
    });
    const { options } = fetchImpl.calls[0];
    expect(options.body).toBe('groups%5B%5D=a&groups%5B%5D=b&quota=1+GB');
    expect(options.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
  });

  it('ohne form: kein Body, kein Content-Type-Header', async () => {
    const fetchImpl = singleFetch(fakeResponse({ status: 200, body: envelope(100, {}) }));
    const client = createOcsClient({ ...baseOpts, fetchImpl, sleep: vi.fn() });
    await client.request({ method: 'GET', path: '/cloud/users' });
    const { options } = fetchImpl.calls[0];
    expect(options.body).toBeUndefined();
    expect(options.headers['Content-Type']).toBeUndefined();
  });
});

describe('13. Parallelität', () => {
  it('vier gleichzeitige request-Aufrufe über eine Instanz liefern unabhängige Results und versuche-Werte, inkl. einem 429-Retry (belegt, dass der Retry-Zähler nicht geteilt wird)', async () => {
    // Keyed by URL, not by a shared call counter: request 2 retries internally (three fetchImpl
    // calls), which would corrupt a call-order-based fixture for the other three requests.
    const fetchImpl = vi.fn(async (url) => {
      if (url.includes('/cloud/users/1')) return fakeResponse({ status: 200, body: envelope(100, { who: 1 }) });
      if (url.includes('/cloud/users/2')) return fakeResponse({ status: 429, body: '' });
      if (url.includes('/cloud/users/3')) return fakeResponse({ status: 200, body: envelope(100, { who: 3 }) });
      return fakeResponse({ status: 403, body: '' });
    });
    const client = createOcsClient({ ...baseOpts, fetchImpl, sleep: vi.fn() });
    const [r1, r2, r3, r4] = await Promise.all([
      client.request({ method: 'GET', path: '/cloud/users/1' }),
      client.request({ method: 'GET', path: '/cloud/users/2' }),
      client.request({ method: 'GET', path: '/cloud/users/3' }),
      client.request({ method: 'GET', path: '/cloud/users/4' }),
    ]);
    expect(r1).toMatchObject({ ok: true, data: { who: 1 }, versuche: 1 });
    expect(r2).toMatchObject({ ok: false, kind: 'ratelimit', versuche: 3 });
    expect(r3).toMatchObject({ ok: true, data: { who: 3 }, versuche: 1 });
    expect(r4).toMatchObject({ ok: false, kind: 'forbidden', versuche: 1 });
  });
});

describe('14. fetchImpl fehlt', () => {
  it('createOcsClient wirft beim Erzeugen, wenn fetchImpl fehlt', () => {
    expect(() => createOcsClient({ baseUrl: 'https://h', adminUser: 'u', appPassword: 'p' })).toThrow();
  });
});

// Criterion 15 (the 9 new messageIds, driven through request) lives in tests/messages.test.js
// per the S03 spec's file layout, not here.
