// Action pipeline: runJob (ARCHITECTURE §5, S07-batch-kern.md A3). shouldStop is injected, same
// as ocs/client.js's credentials - this module never reads the session singleton.
import { runPool } from '../../shared/pool.js';
import { getSteps } from './operations.js';

// Runs an item's steps in order. The first failing step stops the item immediately - a second
// PUT for user.update must never fire once the first one failed (A3).
async function runSteps(client, steps) {
  if (steps.length === 0) {
    return { status: 'ok', grund: null, httpStatus: null, ocsCode: null };
  }

  const first = await steps[0].run(client);
  if (!first.ok) {
    // Single-step failure: grund is the step's own messageId (A3), not a custom sentence -
    // 429-after-retries lands here too, with its own messageId server_blockt_vorerst, and the
    // job keeps going because a single item's result never aborts the pool.
    return { status: 'fehler', grund: first.messageId, httpStatus: first.httpStatus, ocsCode: first.ocsCode };
  }
  if (steps.length === 1) {
    return { status: 'ok', grund: null, httpStatus: first.httpStatus, ocsCode: null };
  }

  const second = await steps[1].run(client);
  if (!second.ok) {
    // 'teilweise': grund names which sub-step failed (A3 example: "email konnte nicht gesetzt werden").
    return {
      status: 'teilweise',
      grund: `${steps[1].name} konnte nicht gesetzt werden`,
      httpStatus: second.httpStatus,
      ocsCode: second.ocsCode,
    };
  }
  return { status: 'ok', grund: null, httpStatus: second.httpStatus, ocsCode: null };
}

export async function runJob({ jobId, action, items, params, client, shouldStop, onProgress }) {
  const list = Array.isArray(items) ? items : [];

  // Fail fast, before any request fires, instead of letting an unknown action surface inside a
  // per-item result (A2: unknown action is a programming error, not a runtime case).
  if (list.length > 0) getSteps(action, list[0], params);

  let completed = 0; // monotonic 1..total, incremented synchronously - no await between
  // the increment and the onProgress call below, so concurrent workers never race on it.
  const total = list.length;

  // shouldStop is checked HERE, inside the worker, instead of being passed to runPool's own
  // shouldStop option. runPool's option bulk-fills the whole remaining tail the moment one lane
  // notices the stop, without ever calling worker for those items - that would make them
  // invisible to onProgress (the defect this fixes). Checking per item inside the worker means
  // every item, including stopped ones, reaches onProgress live, in completion order.
  const results = await runPool(
    list,
    async (userid) => {
      let outcome;
      if (shouldStop && shouldStop()) {
        outcome = { userid, aktion: action, status: 'nicht ausgeführt', grund: null, httpStatus: null, ocsCode: null };
      } else {
        const steps = getSteps(action, userid, params);
        outcome = { userid, aktion: action, ...(await runSteps(client, steps)) };
      }
      completed += 1;
      onProgress?.({ jobId, done: completed, total, result: outcome });
      return outcome;
    },
    { concurrency: 4 },
  );

  const summary = { ok: 0, fehler: 0, nichtAusgefuehrt: 0, teilweise: 0 };
  const STATUS_TO_SUMMARY_KEY = { ok: 'ok', fehler: 'fehler', 'nicht ausgeführt': 'nichtAusgefuehrt', teilweise: 'teilweise' };
  for (const result of results) {
    summary[STATUS_TO_SUMMARY_KEY[result.status]] += 1;
  }

  return { ok: true, results, summary };
}
