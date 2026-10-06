import { describe, expect, it, vi, beforeEach } from 'vitest';

const handlers = new Map();
const fakeApp = { getVersion: () => '0.1.0' };

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel, listener) => {
      handlers.set(channel, listener);
    },
  },
  app: fakeApp,
}));

describe('registerIpcHandlers', () => {
  beforeEach(() => {
    handlers.clear();
  });

  it('registriert genau einen Kanal: app.version', async () => {
    const { registerIpcHandlers } = await import('../src/main/ipc.js');
    registerIpcHandlers();
    expect([...handlers.keys()]).toEqual(['app.version']);
  });

  it('der Handler liefert { ok: true, version: <App-Version> }', async () => {
    const { registerIpcHandlers } = await import('../src/main/ipc.js');
    registerIpcHandlers();
    const result = handlers.get('app.version')();
    expect(result).toEqual({ ok: true, version: fakeApp.getVersion() });
  });
});
