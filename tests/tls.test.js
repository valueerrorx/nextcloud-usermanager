import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { createTlsController } from '../src/main/tls.js';

function pemFromBytes(bytes) {
  return `-----BEGIN CERTIFICATE-----\n${bytes.toString('base64')}\n-----END CERTIFICATE-----`;
}

function fingerprintOf(bytes) {
  return createHash('sha256').update(bytes).digest('hex').toUpperCase().match(/.{2}/g).join(':');
}

function fakeCertificate(bytes) {
  return {
    data: pemFromBytes(bytes),
    subject: { commonName: 'host.example' },
    issuer: { commonName: 'Internal CA' },
    validExpiry: 1234567890,
  };
}

describe('createTlsController — setCertificateVerifyProc (ARCHITEKTURKORREKTUR)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('verificationResult === "net::OK" -> callback(-3), Chromiums Default übernehmen', () => {
    const controller = createTlsController({ sendPrompt: vi.fn() });
    const callback = vi.fn();
    const cert = fakeCertificate(Buffer.from('cert-a'));
    controller.verifyProc({ hostname: 'host', certificate: cert, verificationResult: 'net::OK' }, callback);
    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith(-3);
  });

  it('unbekanntes Zertifikat ohne vorhandene Ausnahme sendet einen Prompt mit Fingerprint in Doppelpunktgruppen', () => {
    const sendPrompt = vi.fn();
    const controller = createTlsController({ sendPrompt });
    const certBytes = Buffer.from('cert-b');
    const cert = fakeCertificate(certBytes);
    const callback = vi.fn();
    controller.verifyProc({ hostname: 'host-b', certificate: cert, verificationResult: 'CERT_UNTRUSTED' }, callback);

    expect(callback).not.toHaveBeenCalled();
    expect(sendPrompt).toHaveBeenCalledTimes(1);
    const prompt = sendPrompt.mock.calls[0][0];
    expect(prompt.host).toBe('host-b');
    expect(prompt.fingerprint).toBe(fingerprintOf(certBytes));
    expect(prompt.fingerprint).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
    expect(prompt.subject).toBe('host.example');
    expect(prompt.issuer).toBe('Internal CA');
    expect(typeof prompt.requestId).toBe('string');
  });

  it('Prompt-Timeout 120s -> callback(-2), requestId verfällt, getDecision liefert zeitueberschreitung', () => {
    const controller = createTlsController({ sendPrompt: vi.fn() });
    const callback = vi.fn();
    const cert = fakeCertificate(Buffer.from('cert-c'));
    controller.verifyProc({ hostname: 'host-c', certificate: cert, verificationResult: 'CERT_UNTRUSTED' }, callback);

    vi.advanceTimersByTime(119999);
    expect(callback).not.toHaveBeenCalled();
    expect(controller.getDecision('host-c')).toBeNull();
    vi.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith(-2);
    expect(controller.getDecision('host-c')).toBe('zeitueberschreitung');
  });

  it('akzeptierte Antwort setzt die Ausnahme und beantwortet den Callback mit 0', () => {
    const sendPrompt = vi.fn();
    const controller = createTlsController({ sendPrompt });
    const certBytes = Buffer.from('cert-d');
    const cert = fakeCertificate(certBytes);
    const callback = vi.fn();
    controller.verifyProc({ hostname: 'host-d', certificate: cert, verificationResult: 'CERT_UNTRUSTED' }, callback);
    const { requestId } = sendPrompt.mock.calls[0][0];

    const response = controller.respond({ requestId, akzeptiert: true });

    expect(response).toEqual({ ok: true });
    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith(0);
    expect(controller.getException()).toEqual({ host: 'host-d', fingerprint: fingerprintOf(certBytes) });
    expect(controller.getDecision('host-d')).toBe('akzeptiert');
  });

  it('eine passende Ausnahme beantwortet einen zweiten Request vom selben Host ohne neuen Prompt', () => {
    const sendPrompt = vi.fn();
    const controller = createTlsController({ sendPrompt });
    const certBytes = Buffer.from('cert-e');
    const cert = fakeCertificate(certBytes);
    controller.verifyProc({ hostname: 'host-e', certificate: cert, verificationResult: 'CERT_UNTRUSTED' }, vi.fn());
    const { requestId } = sendPrompt.mock.calls[0][0];
    controller.respond({ requestId, akzeptiert: true });

    const secondCallback = vi.fn();
    controller.verifyProc({ hostname: 'host-e', certificate: cert, verificationResult: 'CERT_UNTRUSTED' }, secondCallback);

    expect(sendPrompt).toHaveBeenCalledTimes(1); // no second prompt for the same host+fingerprint
    expect(secondCallback).toHaveBeenCalledOnce();
    expect(secondCallback).toHaveBeenCalledWith(0);
  });

  it('ein zweiter Host mit eigenem Zertifikat erzeugt einen eigenen Prompt', () => {
    const sendPrompt = vi.fn();
    const controller = createTlsController({ sendPrompt });
    const certA = fakeCertificate(Buffer.from('cert-f'));
    controller.verifyProc({ hostname: 'host-f', certificate: certA, verificationResult: 'CERT_UNTRUSTED' }, vi.fn());
    controller.respond({ requestId: sendPrompt.mock.calls[0][0].requestId, akzeptiert: true });

    const certG = fakeCertificate(Buffer.from('cert-g'));
    controller.verifyProc({ hostname: 'host-g', certificate: certG, verificationResult: 'CERT_UNTRUSTED' }, vi.fn());

    expect(sendPrompt).toHaveBeenCalledTimes(2);
  });

  it('abgelehnte Antwort beantwortet den Callback mit -2 und setzt keine Ausnahme', () => {
    const sendPrompt = vi.fn();
    const controller = createTlsController({ sendPrompt });
    const cert = fakeCertificate(Buffer.from('cert-h'));
    const callback = vi.fn();
    controller.verifyProc({ hostname: 'host-h', certificate: cert, verificationResult: 'CERT_UNTRUSTED' }, callback);
    const { requestId } = sendPrompt.mock.calls[0][0];

    controller.respond({ requestId, akzeptiert: false });

    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith(-2);
    expect(controller.getException()).toBeNull();
    expect(controller.getDecision('host-h')).toBe('abgelehnt');
  });

  it('ein werfendes sendPrompt entkommt nicht aus verifyProc - der Request löst trotzdem über den Timeout auf', () => {
    const sendPrompt = vi.fn(() => {
      throw new Error('broadcast failed, no window yet');
    });
    const controller = createTlsController({ sendPrompt });
    const callback = vi.fn();
    const cert = fakeCertificate(Buffer.from('cert-timeout-guard'));
    expect(() =>
      controller.verifyProc({ hostname: 'host-guard', certificate: cert, verificationResult: 'CERT_UNTRUSTED' }, callback),
    ).not.toThrow();

    vi.advanceTimersByTime(120000);
    expect(callback).toHaveBeenCalledWith(-2);
  });

  it('eine Antwort auf eine unbekannte oder abgelaufene requestId wird verworfen', () => {
    const controller = createTlsController({ sendPrompt: vi.fn() });
    const response = controller.respond({ requestId: 'nie-vergeben', akzeptiert: true });
    expect(response).toEqual({
      ok: false,
      messageId: 'zertifikat_anfrage_abgelaufen',
      message: 'Diese Zertifikatsanfrage ist abgelaufen oder unbekannt.',
    });
    expect(controller.getException()).toBeNull();
  });

  it('derselbe Host mit einem anderen Zertifikat (anderer Fingerprint) erzeugt einen neuen Prompt', () => {
    const sendPrompt = vi.fn();
    const controller = createTlsController({ sendPrompt });
    const certOld = fakeCertificate(Buffer.from('cert-i-old'));
    controller.verifyProc({ hostname: 'host-i', certificate: certOld, verificationResult: 'CERT_UNTRUSTED' }, vi.fn());
    controller.respond({ requestId: sendPrompt.mock.calls[0][0].requestId, akzeptiert: true });

    // Same hostname, but the server now presents a different certificate - the accepted
    // exception must not match on host alone (the security boundary this test guards).
    const certNew = fakeCertificate(Buffer.from('cert-i-new'));
    const secondCallback = vi.fn();
    controller.verifyProc({ hostname: 'host-i', certificate: certNew, verificationResult: 'CERT_UNTRUSTED' }, secondCallback);

    expect(sendPrompt).toHaveBeenCalledTimes(2);
    expect(secondCallback).not.toHaveBeenCalled();
  });

  it('ein zweiter Host überschreibt die einzige Ausnahme - der erste Host promptet danach wieder', () => {
    const sendPrompt = vi.fn();
    const controller = createTlsController({ sendPrompt });
    const certJ = fakeCertificate(Buffer.from('cert-j'));
    controller.verifyProc({ hostname: 'host-j', certificate: certJ, verificationResult: 'CERT_UNTRUSTED' }, vi.fn());
    controller.respond({ requestId: sendPrompt.mock.calls[0][0].requestId, akzeptiert: true });
    expect(controller.getException()).toEqual({ host: 'host-j', fingerprint: fingerprintOf(Buffer.from('cert-j')) });

    const certK = fakeCertificate(Buffer.from('cert-k'));
    controller.verifyProc({ hostname: 'host-k', certificate: certK, verificationResult: 'CERT_UNTRUSTED' }, vi.fn());
    controller.respond({ requestId: sendPrompt.mock.calls[1][0].requestId, akzeptiert: true });
    expect(controller.getException()).toEqual({ host: 'host-k', fingerprint: fingerprintOf(Buffer.from('cert-k')) });

    // host-j's exception is gone now - the same request must prompt again, not reuse it.
    const thirdCallback = vi.fn();
    controller.verifyProc({ hostname: 'host-j', certificate: certJ, verificationResult: 'CERT_UNTRUSTED' }, thirdCallback);
    expect(sendPrompt).toHaveBeenCalledTimes(3);
    expect(thirdCallback).not.toHaveBeenCalled();
  });
});
