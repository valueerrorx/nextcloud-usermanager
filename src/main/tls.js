import { createHash, randomUUID } from 'node:crypto';
import { MESSAGES } from '../shared/messages.js';

// app.on('certificate-error') only fires for webContents, not for net.fetch (ARCHITEKTURKORREKTUR
// 2026-10-07). This module is wired to session.defaultSession.setCertificateVerifyProc instead.
const PROMPT_TIMEOUT_MS = 120000;

// Electron's certificate.fingerprint is "sha256/<base64>" and useless for a human to compare.
// SHA-256 hex in colon groups, computed from the PEM in certificate.data with node:crypto.
function fingerprintFromPem(pem) {
  const der = pem.replace(/-----(BEGIN|END) CERTIFICATE-----/g, '').replace(/\s+/g, '');
  const digest = createHash('sha256').update(Buffer.from(der, 'base64')).digest('hex').toUpperCase();
  return digest.match(/.{2}/g).join(':');
}

// Returns { verifyProc, respond } - verifyProc is passed to setCertificateVerifyProc, respond
// handles the tls.respondCertificate IPC channel. sendPrompt is injected (tls.onCertificatePrompt
// push), same pattern as pipeline.js's injected shouldStop - keeps this module testable without
// Electron.
export function createTlsController({ sendPrompt, timeoutMs = PROMPT_TIMEOUT_MS }) {
  let exception = null; // { host, fingerprint } | null - session-only, never written to disk
  const pending = new Map(); // requestId -> { callback, host, fingerprint, timer }
  // Last certificate decision per host (ARCHITECTURE/REVIEW-NOTES [S04]: the verifier is the
  // authority on certificate outcomes) - consulted by connection.connect to tell a declined or
  // timed-out certificate apart from a genuine network failure instead of parsing fetch errors.
  const lastDecisionByHost = new Map(); // host -> 'akzeptiert' | 'abgelehnt' | 'zeitueberschreitung'

  function clearPending(requestId) {
    const entry = pending.get(requestId);
    if (!entry) return;
    clearTimeout(entry.timer);
    pending.delete(requestId);
  }

  function verifyProc(request, callback) {
    const { hostname, certificate, verificationResult } = request;
    if (verificationResult === 'net::OK') {
      callback(-3); // Chromium's own verdict - a blanket callback(0) is forbidden
      return;
    }

    const fingerprint = fingerprintFromPem(certificate.data);
    if (exception && exception.host === hostname && exception.fingerprint === fingerprint) {
      callback(0);
      return;
    }

    const requestId = randomUUID();
    const timer = setTimeout(() => {
      // Hanging callback would block the request stack - timeout rejects and lets the id expire.
      pending.delete(requestId);
      lastDecisionByHost.set(hostname, 'zeitueberschreitung');
      callback(-2);
    }, timeoutMs);
    pending.set(requestId, { callback, host: hostname, fingerprint, timer });

    try {
      sendPrompt({
        requestId,
        host: hostname,
        fingerprint,
        subject: certificate.subject?.commonName ?? certificate.subjectName,
        issuer: certificate.issuer?.commonName ?? certificate.issuerName,
        validTo: certificate.validExpiry,
      });
    } catch (err) {
      // A broken broadcast must not throw out of a native Electron callback (that would stall the
      // request for the full timeout with no diagnosis) - the pending entry is already armed, so
      // the request still resolves via the timeout above.
      console.error('tls.js: sendPrompt failed', err);
    }
  }

  // Unknown or expired requestId is discarded (A5) - there is no callback left to answer.
  function respond({ requestId, akzeptiert }) {
    const entry = pending.get(requestId);
    if (!entry) {
      return { ok: false, messageId: 'zertifikat_anfrage_abgelaufen', message: MESSAGES.zertifikat_anfrage_abgelaufen };
    }
    clearPending(requestId);
    if (akzeptiert) {
      // Exactly ONE exception in total, not one per host (A5 correction) - the app connects to
      // exactly one server; a different host overwrites this and the first host prompts again.
      exception = { host: entry.host, fingerprint: entry.fingerprint };
      lastDecisionByHost.set(entry.host, 'akzeptiert');
      entry.callback(0);
      return { ok: true };
    }
    lastDecisionByHost.set(entry.host, 'abgelehnt');
    entry.callback(-2);
    return { ok: true, messageId: 'zertifikat_abgelehnt' };
  }

  return {
    verifyProc,
    respond,
    getException: () => exception,
    getDecision: (host) => lastDecisionByHost.get(host) ?? null,
  };
}

// Thin wiring helper for the real app (called from the Electron bootstrap, not from tests):
// installs the controller's proc on a given Electron session.
export function installCertificateVerifier(targetSession, controller) {
  targetSession.setCertificateVerifyProc(controller.verifyProc);
}
