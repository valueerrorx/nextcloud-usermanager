// Action pipeline: runJob (ARCHITECTURE §5, S07-batch-kern.md A3). shouldStop is injected, same
// as ocs/client.js's credentials - this module never reads the session singleton.
import { runPool } from '../../shared/pool.js';
import { getSteps } from './operations.js';

// Default wording for a failed non-first step, same sentence S07 already shipped for
// user.update's email step. A step can override it (S11: user.create's group steps name the
// group, not "gruppe-x", and use "zugewiesen" instead of "gesetzt").
function teilfehlerGrund(step) {
  return step.teilfehlerGrund ?? `${step.name} konnte nicht gesetzt werden`;
}

// Runs an item's steps in order. The first step is a precondition for every later one: if it
// fails, the item is 'fehler' and no later step ever runs (A3/S11 A2 - a failed create must
// never fire the group-assignment requests). Steps after the first are independent of each other
// (S11 A2: no rollback, each addUserToGroup is its own request) and all run regardless of an
// earlier one failing; the FIRST failure among them names the 'teilweise' reason.
// Removals do not depend on each other: one failed group must not skip the remaining ones.
async function runIndependent(client, steps) {
  let okCount = 0;
  let failure = null;
  let lastHttpStatus = null;
  for (const step of steps) {
    const result = await step.run(client);
    if (result.ok) {
      okCount += 1;
      lastHttpStatus = result.httpStatus;
    } else if (!failure) {
      failure = { step, result };
    }
  }
  if (!failure) return { status: 'ok', grund: null, httpStatus: lastHttpStatus, ocsCode: null };
  if (okCount === 0) {
    return {
      status: 'fehler',
      grund: failure.result.hinweis || failure.result.messageId,
      httpStatus: failure.result.httpStatus,
      ocsCode: failure.result.ocsCode,
    };
  }
  return {
    status: 'teilweise',
    grund: teilfehlerGrund(failure.step),
    httpStatus: failure.result.httpStatus,
    ocsCode: failure.result.ocsCode,
  };
}

async function runSteps(client, steps) {
  if (steps.length === 0) {
    return { status: 'ok', grund: null, httpStatus: null, ocsCode: null };
  }
  if (steps.every((step) => step.independent)) return runIndependent(client, steps);

  const first = await steps[0].run(client);
  if (!first.ok) {
    // Single-step failure: grund is the step's own messageId (A3), not a custom sentence -
    // 429-after-retries lands here too, with its own messageId server_blockt_vorerst, and the
    // job keeps going because a single item's result never aborts the pool.
    return {
      status: 'fehler',
      grund: first.hinweis || first.messageId,
      httpStatus: first.httpStatus,
      ocsCode: first.ocsCode,
    };
  }
  if (steps.length === 1) {
    return { status: 'ok', grund: null, httpStatus: first.httpStatus, ocsCode: null };
  }

  let lastHttpStatus = first.httpStatus;
  let failure = null; // first failing later step, kept even if a subsequent step succeeds
  for (let i = 1; i < steps.length; i += 1) {
    const result = await steps[i].run(client);
    if (result.ok) {
      lastHttpStatus = result.httpStatus;
    } else if (!failure) {
      failure = { step: steps[i], result };
    }
  }

  if (failure) {
    // 'teilweise': grund names which sub-step failed (A3 example: "email konnte nicht gesetzt werden").
    return {
      status: 'teilweise',
      grund: teilfehlerGrund(failure.step),
      httpStatus: failure.result.httpStatus,
      ocsCode: failure.result.ocsCode,
    };
  }
  return { status: 'ok', grund: null, httpStatus: lastHttpStatus, ocsCode: null };
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
