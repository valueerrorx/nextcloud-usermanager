import { MESSAGES } from '../../shared/messages.js';
import { describeError } from '../../shared/logSafe.js';

// Explicit set, not a prefix match (REVIEW-NOTES, S03 spec §4.A.2) - a 'CERT_'-prefix match would
// miss the two most common internal-CA codes and report a reachable server as unreachable.
const CERT_CODES = new Set([
  'SELF_SIGNED_CERT_IN_CHAIN',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'UNABLE_TO_GET_ISSUER_CERT',
  'CERT_HAS_EXPIRED',
  'CERT_NOT_YET_VALID',
  'CERT_UNTRUSTED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'HOSTNAME_MISMATCH',
]);

// Kinds that are never retried, regardless of HTTP status (a false password must not be retried).
const NEVER_RETRY_KINDS = new Set(['auth', 'forbidden', 'notOcs', 'timeout', 'cert']);

const USELESS_SERVER_TEXT = new Set(['failure', 'error', 'bad request', 'forbidden', 'ok']);

// Drops secrets the server may echo, then keeps a short text (only used for OCS 107).
function sanitizeServerText(text, secrets) {
  if (typeof text !== 'string') return null;
  let out = text;
  for (const secret of secrets) {
    if (typeof secret !== 'string' || secret.length < 4) continue;
    if (out.includes(secret)) out = out.split(secret).join('');
  }
  out = out.replace(/\s+/g, ' ').trim();
  if (out === '' || USELESS_SERVER_TEXT.has(out.toLowerCase())) return null;
  if (out.length > 240) out = `${out.slice(0, 240)}…`;
  return out;
}

function collectSecrets(form, appPassword, adminUser) {
  const secrets = [appPassword, Buffer.from(`${adminUser}:${appPassword}`, 'utf8').toString('base64')];
  if (typeof form?.password === 'string') secrets.push(form.password);
  if (form?.key === 'password' && typeof form.value === 'string') secrets.push(form.value);
  return secrets;
}

// The password a request sets (create form or PUT key=password), else null.
function settingPassword(form) {
  const pw = form?.key === 'password' ? form.value : form?.password;
  return typeof pw === 'string' ? pw : null;
}

function makeFailure(kind, httpStatus, ocsCode, messageId, serverText = null) {
  const failure = { ok: false, kind, httpStatus, ocsCode, messageId, message: MESSAGES[messageId] };
  if (typeof serverText === 'string') failure.serverText = serverText;
  return failure;
}

// Classifies a thrown error (fetchImpl itself, or the body read - undici's timeout-while-reading
// surfaces here too). The typeof guard is mandatory: a bare .startsWith on undefined would throw
// inside the catch and turn a network error into an unhandled rejection.
function classifyThrown(err) {
  // Real disjunction, not ??: a TypeError (undici body-read timeout) already has its own
  // name, so err.cause.name must still be checked, not skipped.
  const isTimeoutOrAbort = (n) => n === 'TimeoutError' || n === 'AbortError';
  if (isTimeoutOrAbort(err?.name) || isTimeoutOrAbort(err?.cause?.name)) {
    return makeFailure('timeout', null, null, 'zeitueberschreitung');
  }
  const causeCode = err?.cause?.code;
  if (typeof causeCode === 'string' && CERT_CODES.has(causeCode)) {
    return makeFailure('cert', null, null, 'zertifikat_nicht_vertraut');
  }
  // Cheap safety net for Electron's net.fetch (Chromium), which throws net::ERR_CERT_* instead of
  // the OpenSSL codes above (REVIEW-NOTES [S04]) - checked on both the error and its cause message,
  // since fetchImpl is injectable and the exact wrapping is not guaranteed. The TLS controller
  // (tls.js) stays the primary authority for certificate outcomes; this only prevents a cert error
  // from falling through to "server unreachable" when fetchImpl is net.fetch.
  const thrownText = [err?.message, err?.cause?.message].filter((s) => typeof s === 'string').join(' ');
  if (thrownText.includes('ERR_CERT')) {
    return makeFailure('cert', null, null, 'zertifikat_nicht_vertraut');
  }
  return makeFailure('network', null, null, 'server_nicht_erreichbar');
}

function buildUrl(baseUrl, path, query) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    params.set(key, String(value));
  }
  params.set('format', 'json'); // always present, overrides a caller-supplied format
  return `${baseUrl}/ocs/v1.php${path}?${params.toString()}`;
}

function buildHeaders(adminUser, appPassword, hasForm) {
  const basic = Buffer.from(`${adminUser}:${appPassword}`, 'utf8').toString('base64'); // UTF-8, not latin1
  const headers = {
    'OCS-APIRequest': 'true',
    Accept: 'application/json',
    Authorization: `Basic ${basic}`,
  };
  if (hasForm) headers['Content-Type'] = 'application/x-www-form-urlencoded';
  return headers;
}

// Arrays become repeated key[] entries; undefined/null values are omitted, not sent as "undefined".
function buildFormBody(form) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(form)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) params.append(`${key}[]`, item);
    } else {
      params.append(key, value);
    }
  }
  return params.toString();
}

// Which retry budget (if any) this failure belongs to. 429 retries for every method; 5xx and
// network retry only for GET/HEAD, because a retried POST/DELETE can report a false failure for
// an operation that actually succeeded.
// The HTTP status wins over `kind`: a real 502/504 from a reverse proxy returns an HTML body
// (kind notOcs), and without checking the status first that case - the one the 5xx/GET rule was
// written for - would be unreachable (S03 review). notOcs with a 2xx status still never retries.
function retryCategory(result, method) {
  if (result.httpStatus === 429) return 'ratelimit';
  const isGetHead = method === 'GET' || method === 'HEAD';
  if (!isGetHead) return null;
  if (typeof result.httpStatus === 'number' && result.httpStatus >= 500 && result.httpStatus < 600) {
    return 'other';
  }
  if (NEVER_RETRY_KINDS.has(result.kind)) return null;
  if (result.kind === 'network') return 'other';
  return null;
}

export function createOcsClient({
  baseUrl,
  adminUser,
  appPassword,
  fetchImpl,
  timeoutMs = 30000,
  retryDelaysMs = [2000, 6000],
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  // No default on purpose: app.on('certificate-error') only fires for Chromium requests, so
  // fetchImpl must never be globalThis.fetch. S04 wires Electron's net.fetch. Throw at creation,
  // not on the first request.
  if (typeof fetchImpl !== 'function') {
    throw new Error('createOcsClient: fetchImpl is required');
  }

  async function performAttempt({ method, path, query, form }) {
    const url = buildUrl(baseUrl, path, query);
    const headers = buildHeaders(adminUser, appPassword, Boolean(form));
    const options = { method, headers, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) };
    if (form) options.body = buildFormBody(form);

    let response;
    try {
      response = await fetchImpl(url, options);
    } catch (err) {
      return classifyThrown(err);
    }

    const httpStatus = response.status;
    // HTTP status before the envelope: 401/403/429 often arrive without a valid OCS body.
    if (httpStatus === 401) return makeFailure('auth', httpStatus, null, 'falsche_zugangsdaten');
    if (httpStatus === 403) return makeFailure('forbidden', httpStatus, null, 'kein_admin');
    if (httpStatus === 429) return makeFailure('ratelimit', httpStatus, null, 'server_blockt_vorerst');

    let text;
    try {
      text = await response.text();
    } catch (err) {
      // undici rejects reading the body as TypeError: terminated, cause.name === 'TimeoutError'.
      return classifyThrown(err);
    }

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined; // unparseable body (also covers 204 / empty body) -> notOcs below
    }

    const ocs = json?.ocs;
    const meta = ocs?.meta;
    if (
      typeof ocs !== 'object' ||
      ocs === null ||
      typeof meta !== 'object' ||
      meta === null ||
      typeof meta.statuscode !== 'number'
    ) {
      return makeFailure('notOcs', httpStatus, null, 'falscher_basispfad');
    }

    if (meta.statuscode === 997) {
      return makeFailure('forbidden', httpStatus, 997, 'kein_admin');
    }

    if (meta.statuscode !== 100) {
      // Server text only for 107 on password-setting requests with a password >= 4 chars (secrets can't be stripped reliably below).
      let serverText = null;
      if (meta.statuscode === 107 && (settingPassword(form)?.length ?? 0) >= 4) {
        const secrets = collectSecrets(form, appPassword, adminUser);
        serverText = sanitizeServerText(meta.message, secrets)
          ?? sanitizeServerText(ocs.data?.message, secrets);
      }
      return makeFailure('ocs', httpStatus, meta.statuscode, 'ocs_fehler', serverText);
    }

    if (httpStatus < 200 || httpStatus >= 300) {
      return makeFailure('http', httpStatus, meta.statuscode, 'unerwarteter_serverfehler');
    }

    return { ok: true, data: ocs.data ?? null, httpStatus };
  }

  async function request({ method, path, query, form }) {
    let versuche = 0;
    let retriesUsedRatelimit = 0;
    let retriesUsedOther = 0;
    let result;
    for (;;) {
      versuche += 1;
      result = await performAttempt({ method, path, query, form });
      if (result.ok) break;
      if (versuche >= 3) break; // global cap, prevents a 429 -> network -> 429 cycle

      const category = retryCategory(result, method);
      if (category === 'ratelimit' && retriesUsedRatelimit < 2) {
        retriesUsedRatelimit += 1;
      } else if (category === 'other' && retriesUsedOther < 1) {
        retriesUsedOther += 1;
      } else {
        break;
      }

      const delay = retryDelaysMs[versuche - 1];
      if (delay === undefined) break; // no configured delay for this retry -> stop retrying
      await sleep(delay);
    }
    return { ...result, versuche };
  }

  // Same credentials as OCS. Used for the admin system page, which is not an OCS route.
  // Never follows redirects, so Basic-Auth stays on our origin; the body is read on 2xx only.
  async function fetchText(path) {
    const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const headers = { ...buildHeaders(adminUser, appPassword, false), Accept: 'text/html' };
    try {
      const response = await fetchImpl(url, {
        method: 'GET', headers, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.status < 200 || response.status >= 300) {
        try {
          await response.body?.cancel?.(); // release the unread body
        } catch { /* cancel failure must not change the status */ }
        return { ok: false, status: response.status };
      }
      const text = await response.text();
      return { ok: true, status: response.status, text };
    } catch (error) {
      console.error('fetchText failed:', describeError(error, [appPassword]));
      return { ok: false, status: null };
    }
  }

  return { request, fetchText };
}
