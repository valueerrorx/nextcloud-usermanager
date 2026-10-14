// S07 A3: runJob - 50 items/7 errors/one exhausted 429/abort at item 20, concurrency 4,
// 'teilweise' for user.update, a single item failure never aborts the job, shouldStop is
// injected (pipeline.js never reads the session singleton - that's why there is no electron
// mock anywhere in this file).
import { describe, expect, it, vi } from 'vitest';
import { runJob } from '../src/main/actions/pipeline.js';

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('runJob - der Lastfall (Abnahme 1)', () => {
  const ERROR_INDICES = new Set([1, 3, 5, 7, 9, 11, 13]); // 7 generic failures, all before the abort
  const RATE_LIMIT_INDEX = 15; // exhausted 429, also before the abort

  it('50 Items, 7 Fehler, ein erschöpftes 429, Abbruch bei Item 20', async () => {
    const items = Array.from({ length: 50 }, (_, i) => `user${i}`);
    let dispatched = 0;
    const shouldStop = () => dispatched >= 20;

    const client = {
      request: vi.fn(async ({ path }) => {
        dispatched += 1;
        await delay(1); // forces round-robin claiming in index order instead of same-tick ordering (as in pool.test.js)
        const [, userid] = path.match(/\/cloud\/users\/(user\d+)\/enable/);
        const index = Number(userid.replace('user', ''));
        if (index === RATE_LIMIT_INDEX) {
          return { ok: false, kind: 'ratelimit', httpStatus: 429, ocsCode: null, messageId: 'server_blockt_vorerst', versuche: 3 };
        }
        if (ERROR_INDICES.has(index)) {
          return { ok: false, kind: 'ocs', httpStatus: 200, ocsCode: 101, messageId: 'aktion_fehlgeschlagen', versuche: 1 };
        }
        return { ok: true, data: null, httpStatus: 200, versuche: 1 };
      }),
    };

    const { ok, results, summary } = await runJob({
      jobId: 'lastfall',
      action: 'user.enable',
      items,
      params: {},
      client,
      shouldStop,
    });

    expect(ok).toBe(true);
    expect(results).toHaveLength(50);
    // Jedes Item erscheint genau einmal.
    expect(results.map((r) => r.userid)).toEqual(items);

    // Items ab dem Abbruch: nicht ausgeführt, kein Request ausgelöst.
    for (const r of results.slice(20)) {
      expect(r).toMatchObject({ status: 'nicht ausgeführt', grund: null, httpStatus: null, ocsCode: null });
    }
    // Kein Request für Items ab dem Abbruch - geprüft über die tatsächliche Aufrufzahl, nicht
    // nur über den status-Wert (der könnte gesetzt sein, während doch ein Request rausging).
    expect(client.request).toHaveBeenCalledTimes(20);
    const requestedUserids = client.request.mock.calls.map(([{ path }]) => path.match(/users\/(user\d+)\//)[1]);
    for (const r of results.slice(20)) {
      expect(requestedUserids).not.toContain(r.userid);
    }

    // Das 429-Item ist ein normaler Item-Fehler mit eigener Begründung.
    expect(results[RATE_LIMIT_INDEX]).toMatchObject({ status: 'fehler', grund: 'server_blockt_vorerst' });

    expect(summary.ok + summary.fehler + summary.nichtAusgefuehrt + summary.teilweise).toBe(50);
    expect(summary.nichtAusgefuehrt).toBe(30);
    expect(summary.fehler).toBe(8); // 7 generic + 1 rate-limit
    expect(summary.ok).toBe(12);
    expect(summary.teilweise).toBe(0);
  });
});

describe('runJob - Parallelität 4 (Abnahme 2)', () => {
  it('hat nie mehr als 4 Worker gleichzeitig in Flug', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const items = Array.from({ length: 12 }, (_, i) => `user${i}`);
    const client = {
      request: vi.fn(async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await delay(10);
        inFlight -= 1;
        return { ok: true, data: null, httpStatus: 200, versuche: 1 };
      }),
    };

    await runJob({ jobId: 'conc', action: 'user.enable', items, params: {}, client, shouldStop: () => false });
    expect(maxInFlight).toBeLessThanOrEqual(4);
    expect(maxInFlight).toBe(4);
  });
});

describe("runJob - 'teilweise' bei user.update (Abnahme 3)", () => {
  it('erster Schritt ok, zweiter (email) scheitert -> teilweise, grund benennt den Teilschritt', async () => {
    const client = {
      request: vi.fn(async ({ form }) => {
        if (form.key === 'email') {
          return { ok: false, kind: 'ocs', httpStatus: 200, ocsCode: 113, messageId: 'feld_nicht_editierbar', versuche: 1 };
        }
        return { ok: true, data: null, httpStatus: 200, versuche: 1 };
      }),
    };

    const { results } = await runJob({
      jobId: 'teilweise',
      action: 'user.update',
      items: ['alice'],
      params: { displayname: 'Alice A.', email: 'alice@example.com' },
      client,
      shouldStop: () => false,
    });

    expect(results[0].status).toBe('teilweise');
    expect(results[0].grund).toBe('email konnte nicht gesetzt werden');
    expect(client.request).toHaveBeenCalledTimes(2);
  });

  it('scheitert der erste Schritt (displayname), ist der Status fehler und der zweite Request wird nicht gesendet', async () => {
    const client = {
      request: vi.fn(async ({ form }) => {
        if (form.key === 'displayname') {
          return { ok: false, kind: 'ocs', httpStatus: 200, ocsCode: 113, messageId: 'feld_nicht_editierbar', versuche: 1 };
        }
        return { ok: true, data: null, httpStatus: 200, versuche: 1 };
      }),
    };

    const { results } = await runJob({
      jobId: 'teilweise-erster-schritt',
      action: 'user.update',
      items: ['alice'],
      params: { displayname: 'Alice A.', email: 'alice@example.com' },
      client,
      shouldStop: () => false,
    });

    expect(results[0].status).toBe('fehler');
    expect(results[0].grund).toBe('feld_nicht_editierbar');
    expect(client.request).toHaveBeenCalledTimes(1); // the email PUT never fired
  });
});

describe('runJob - ein Einzelfehler bricht den Job nie ab (Abnahme 4)', () => {
  it('Item 1 scheitert, Items 2-5 laufen trotzdem', async () => {
    const client = {
      request: vi.fn(async ({ path }) => {
        if (path.includes('/cloud/users/user0/')) {
          return { ok: false, kind: 'ocs', httpStatus: 200, ocsCode: 101, messageId: 'aktion_fehlgeschlagen', versuche: 1 };
        }
        return { ok: true, data: null, httpStatus: 200, versuche: 1 };
      }),
    };
    const items = ['user0', 'user1', 'user2', 'user3', 'user4'];

    const { ok, results } = await runJob({ jobId: 'kein-abbruch', action: 'user.enable', items, params: {}, client, shouldStop: () => false });

    expect(ok).toBe(true);
    expect(results[0].status).toBe('fehler');
    expect(results.slice(1).every((r) => r.status === 'ok')).toBe(true);
  });
});

// S11 Abnahme 2-5: user.create als zweistufiger Vorgang innerhalb von runJob - teilweise bei
// einer scheiternden Gruppe, fehler bei scheiterndem create ohne Gruppen-Request, und ein
// Teilfehler bricht den Import nicht ab (GOAL-Abnahme-Pflichttest).
describe('runJob - user.create (S11 Abnahme 2-5)', () => {
  function paramsFor(usernames, groups = ['lehrer', 'schueler']) {
    const byUserid = {};
    for (const u of usernames) byUserid[u] = { password: `${u}-pw`, displayName: u };
    return { byUserid, groups, quota: '5 GB' };
  }

  it('zwei Zielgruppen, zweite scheitert -> teilweise, grund nennt die Gruppe', async () => {
    const client = {
      request: vi.fn(async ({ method, path, form }) => {
        if (method === 'POST' && path === '/cloud/users') {
          return { ok: true, data: { id: 'alice' }, httpStatus: 200, versuche: 1 };
        }
        if (form?.groupid === 'schueler') {
          return { ok: false, kind: 'ocs', httpStatus: 200, ocsCode: 102, messageId: 'gruppe_existiert_nicht', versuche: 1 };
        }
        return { ok: true, data: null, httpStatus: 200, versuche: 1 };
      }),
    };

    const { results } = await runJob({
      jobId: 'create-teilweise',
      action: 'user.create',
      items: ['alice'],
      params: paramsFor(['alice']),
      client,
      shouldStop: () => false,
    });

    expect(results[0].status).toBe('teilweise');
    expect(results[0].grund).toBe('Gruppe "schueler" konnte nicht zugewiesen werden');
    expect(client.request).toHaveBeenCalledTimes(3); // create + beide Gruppen-Requests laufen beide
  });

  it('erster Schritt (create) scheitert -> fehler, und es wird kein Gruppen-Request gesendet', async () => {
    const client = {
      request: vi.fn(async ({ method, path }) => {
        if (method === 'POST' && path === '/cloud/users') {
          return { ok: false, kind: 'ocs', httpStatus: 200, ocsCode: 102, messageId: 'benutzer_existiert_bereits', versuche: 1 };
        }
        return { ok: true, data: null, httpStatus: 200, versuche: 1 };
      }),
    };

    const { results } = await runJob({
      jobId: 'create-fehler',
      action: 'user.create',
      items: ['alice'],
      params: paramsFor(['alice']),
      client,
      shouldStop: () => false,
    });

    expect(results[0].status).toBe('fehler');
    expect(results[0].grund).toBe('benutzer_existiert_bereits');
    // Am Request-Zähler gemessen, nicht am Status (REVIEW-NOTES [S07]): nur der create-POST lief.
    expect(client.request).toHaveBeenCalledTimes(1);
    expect(client.request.mock.calls[0][0]).toMatchObject({ method: 'POST', path: '/cloud/users' });
  });

  it('Zeile 3 scheitert beim Anlegen, Zeilen 1, 2, 4, 5 werden trotzdem angelegt (GOAL-Abnahme)', async () => {
    const items = ['user1', 'user2', 'user3', 'user4', 'user5'];
    const client = {
      request: vi.fn(async ({ method, path, form }) => {
        if (method === 'POST' && path === '/cloud/users') {
          if (form.userid === 'user3') {
            return { ok: false, kind: 'ocs', httpStatus: 200, ocsCode: 102, messageId: 'benutzer_existiert_bereits', versuche: 1 };
          }
          return { ok: true, data: { id: form.userid }, httpStatus: 200, versuche: 1 };
        }
        return { ok: true, data: null, httpStatus: 200, versuche: 1 };
      }),
    };

    const { results } = await runJob({
      jobId: 'create-teilfehler-kein-abbruch',
      action: 'user.create',
      items,
      params: paramsFor(items, []),
      client,
      shouldStop: () => false,
    });

    expect(results.map((r) => r.userid)).toEqual(items);
    expect(results[2]).toMatchObject({ userid: 'user3', status: 'fehler' });
    for (const r of [results[0], results[1], results[3], results[4]]) {
      expect(r.status).toBe('ok');
    }
  });
});

describe('runJob - shouldStop ist injiziert, kein session-Zugriff', () => {
  it('zwei Aufrufe mit derselben jobId, aber unterschiedlichem injiziertem shouldStop, verhalten sich unabhängig', async () => {
    const client = { request: vi.fn(async () => ({ ok: true, data: null, httpStatus: 200, versuche: 1 })) };
    const items = ['alice', 'bob'];

    const stopped = await runJob({ jobId: 'gleiche-id', action: 'user.enable', items, params: {}, client, shouldStop: () => true });
    expect(stopped.results.every((r) => r.status === 'nicht ausgeführt')).toBe(true);

    const ran = await runJob({ jobId: 'gleiche-id', action: 'user.enable', items, params: {}, client, shouldStop: () => false });
    expect(ran.results.every((r) => r.status === 'ok')).toBe(true);
  });
});

describe('runJob - onProgress (ARCHITECTURE §5)', () => {
  it('wird nach jedem Item mit jobId/done/total/result aufgerufen', async () => {
    const client = { request: vi.fn(async () => ({ ok: true, data: null, httpStatus: 200, versuche: 1 })) };
    const items = ['alice', 'bob', 'carol'];
    const progressCalls = [];

    await runJob({
      jobId: 'progress-job',
      action: 'user.enable',
      items,
      params: {},
      client,
      shouldStop: () => false,
      onProgress: (payload) => progressCalls.push(payload),
    });

    expect(progressCalls).toHaveLength(3);
    expect(progressCalls.map((p) => p.done)).toEqual([1, 2, 3]);
    for (const payload of progressCalls) {
      expect(payload.jobId).toBe('progress-job');
      expect(payload.total).toBe(3);
      expect(payload.result.userid).toBeDefined();
    }
  });
});

// Defect fix: onProgress must fire as each item completes (live), not all at once after runPool
// resolves. done is a monotonic completion count, not the input index - completion order can
// differ from input order under concurrency, and that is correct.
describe('runJob - Fortschritt feuert live, nicht erst nach Jobende', () => {
  it('10 Items mit durcheinander abgeschlossener Reihenfolge: 10 Events, done lückenlos 1..10, letztes Event done===total, mindestens ein Event vor Jobende', async () => {
    const items = Array.from({ length: 10 }, (_, i) => `user${i}`);
    // Item 0 ist am langsamsten, Item 9 am schnellsten - erzwingt eine Abschlussreihenfolge,
    // die der Eingabereihenfolge entgegengesetzt ist.
    const delays = items.map((_, i) => (10 - i) * 5);
    const client = {
      request: vi.fn(async ({ path }) => {
        const [, userid] = path.match(/\/cloud\/users\/(user\d+)\//);
        const index = Number(userid.replace('user', ''));
        await delay(delays[index]);
        return { ok: true, data: null, httpStatus: 200, versuche: 1 };
      }),
    };

    const progressCalls = [];
    let resolveFirstProgress;
    const firstProgressSeen = new Promise((resolve) => {
      resolveFirstProgress = resolve;
    });
    let jobResolved = false;

    const jobPromise = runJob({
      jobId: 'live-progress',
      action: 'user.enable',
      items,
      params: {},
      client,
      shouldStop: () => false,
      onProgress: (payload) => {
        progressCalls.push(payload);
        if (progressCalls.length === 1) resolveFirstProgress();
      },
    }).then((result) => {
      jobResolved = true;
      return result;
    });

    // Der ganze Punkt der Live-Anzeige: mindestens ein Event, bevor runJob überhaupt fertig ist.
    await firstProgressSeen;
    expect(jobResolved).toBe(false);

    await jobPromise;

    expect(progressCalls).toHaveLength(10);
    expect(progressCalls.map((p) => p.done)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(progressCalls.at(-1).done).toBe(10);
    expect(progressCalls.at(-1).total).toBe(10);
    // Abschlussreihenfolge ist NICHT die Eingabereihenfolge - das ist die Korrektur, nicht nur
    // Zufall: die Ergebnisliste selbst bleibt in Eingabereihenfolge (runPool-Garantie).
    const completionUserids = progressCalls.map((p) => p.result.userid);
    expect(completionUserids).not.toEqual(items);

    const { results } = await jobPromise;
    expect(results.map((r) => r.userid)).toEqual(items);
  });
});

describe('runJob - Serverhinweis statt messageId', () => {
  it('user.enable reicht den Hinweis als Begründung durch', async () => {
    const client = {
      request: vi.fn(async () => ({
        ok: false,
        kind: 'ocs',
        httpStatus: 200,
        ocsCode: 107,
        messageId: 'ocs_fehler',
        hinweis: 'Das Passwort muss mindestens 10 Zeichen lang sein.',
        versuche: 1,
      })),
    };
    const { results } = await runJob({
      jobId: 'hinweis', action: 'user.enable', items: ['alice'], params: {}, client,
    });
    expect(results[0].grund).toBe('Das Passwort muss mindestens 10 Zeichen lang sein.');
  });
});

describe('runJob - user.removeFromGroup mit mehreren Gruppen', () => {
  it('eine scheiternde Gruppe bricht die übrigen Entfernungen nicht ab', async () => {
    const client = {
      request: vi.fn(async ({ form }) => {
        if (form?.groupid === 'lehrer') {
          return { ok: false, kind: 'ocs', httpStatus: 200, ocsCode: 103, messageId: 'kein_recht_fuer_gruppe', versuche: 1 };
        }
        return { ok: true, data: null, httpStatus: 200, versuche: 1 };
      }),
    };
    const { results } = await runJob({
      jobId: 'remove-mehrere',
      action: 'user.removeFromGroup',
      items: ['alice'],
      params: { groupidsByUserid: { alice: ['lehrer', 'schueler'] } },
      client,
      shouldStop: () => false,
    });
    expect(client.request).toHaveBeenCalledTimes(2);
    expect(results[0].status).toBe('teilweise');
    expect(results[0].grund).toBe('Entfernen aus Gruppe "lehrer" fehlgeschlagen');
  });
});
