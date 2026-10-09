// S07 A4/A5 Abnahme 5: Jobzustand laufend/beendet überlebt das Jobende, nur das Stop-Flag wird
// im finally freigegeben, actions.stop liefert gestoppt/bereits_beendet/unbekannt. Diese
// Zustandslogik gehört zu ipc.js/session.js (ARCHITECTURE §5 "Testzuordnung") - pipeline.js
// kennt session nicht und wird dafür nicht hier, sondern in pipeline.test.js geprüft.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const handlers = new Map();

vi.mock('electron', () => ({
  ipcMain: { handle: (channel, listener) => { handlers.set(channel, listener); } },
  app: { getVersion: () => '0.1.0' },
  net: { fetch: vi.fn() },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
}));

import { session } from '../src/main/session.js';

function connectFakeSession(request) {
  session.setConnected({
    client: { request },
    baseUrl: 'https://host',
    adminUser: 'admin',
    adminUserId: 'admin',
    appPassword: 'geheim',
    secretStorage: 'session',
  });
}

describe('actions.run / actions.stop - Jobzustand und Stop-Flag', () => {
  beforeEach(async () => {
    handlers.clear();
    session.resetForTests();
    const { registerIpcHandlers } = await import('../src/main/ipc.js');
    registerIpcHandlers();
  });

  it('actions.stop auf eine nie gesehene jobId -> unbekannt', async () => {
    const result = await handlers.get('actions.stop')(null, { jobId: 'nie-gesehen' });
    expect(result).toEqual({ ok: true, zustand: 'unbekannt' });
  });

  it('actions.stop auf einen laufenden Job -> gestoppt, und session.shouldStop wird true', async () => {
    let resolveRequest;
    connectFakeSession(vi.fn(() => new Promise((resolve) => { resolveRequest = resolve; })));

    const runPromise = handlers.get('actions.run')(null, { jobId: 'job1', action: 'user.enable', items: ['alice'], params: {} });
    await Promise.resolve();
    expect(session.getJobState('job1')).toBe('laufend');

    const stopResult = await handlers.get('actions.stop')(null, { jobId: 'job1' });
    expect(stopResult).toEqual({ ok: true, zustand: 'gestoppt' });
    expect(session.shouldStop('job1')).toBe(true);

    resolveRequest({ ok: true, data: null, httpStatus: 200, versuche: 1 });
    await runPromise;
  });

  it('actions.stop auf einen beendeten Job -> bereits_beendet, und danach ist das Stop-Flag frei, der Zustand aber bleibt', async () => {
    connectFakeSession(vi.fn(async () => ({ ok: true, data: null, httpStatus: 200, versuche: 1 })));
    await handlers.get('actions.run')(null, { jobId: 'job2', action: 'user.enable', items: ['alice'], params: {} });

    expect(session.shouldStop('job2')).toBe(false); // released in the finally, nothing had to stop it
    expect(session.getJobState('job2')).toBe('beendet'); // kept, so a second stop call can tell it apart from 'unbekannt'

    const result = await handlers.get('actions.stop')(null, { jobId: 'job2' });
    expect(result).toEqual({ ok: true, zustand: 'bereits_beendet' });
  });

  it('wirft runJob (unbekannte Action-ID), löst actions.run trotzdem auf (nie global fehlerhaft) und setzt den Jobzustand auf beendet, Stop-Flag frei', async () => {
    connectFakeSession(vi.fn());
    const result = await handlers.get('actions.run')(null, { jobId: 'job3', action: 'keine.solche.aktion', items: ['alice'], params: {} });

    expect(result).toEqual({ ok: false, messageId: 'unbekannte_aktion', message: expect.any(String) });
    expect(session.getJobState('job3')).toBe('beendet');
    expect(session.shouldStop('job3')).toBe(false);
  });
});

describe('session.disconnect', () => {
  it('leert Client und Zugangsdaten', () => {
    session.setConnected({
      client: {}, baseUrl: 'https://h', adminUser: 'a', adminUserId: 'a', appPassword: 'p', secretStorage: 'keyring',
    });
    session.disconnect();
    expect(session.connected).toBe(false);
    expect(session.baseUrl).toBeNull();
    expect(session.appPassword).toBeNull();
    expect(session.secretStorage).toBe('session');
    session.resetForTests();
  });
});
