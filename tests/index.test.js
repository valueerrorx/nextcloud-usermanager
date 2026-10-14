import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// src/main/index.js runs its bootstrap (requestSingleInstanceLock, app.on, whenReady) at import
// time, so every test needs a fresh module graph (vi.resetModules) and a fresh electron mock
// (vi.doMock, not hoisted) to observe the second-instance listener in isolation.
describe('src/main/index.js second-instance guard', () => {
  const originalDevServerUrl = process.env.VITE_DEV_SERVER_URL;

  beforeEach(() => {
    vi.resetModules();
    delete process.env.VITE_DEV_SERVER_URL;
  });

  afterEach(() => {
    if (originalDevServerUrl === undefined) {
      delete process.env.VITE_DEV_SERVER_URL;
    } else {
      process.env.VITE_DEV_SERVER_URL = originalDevServerUrl;
    }
  });

  function fakeBrowserWindow() {
    return {
      once: vi.fn(),
      show: vi.fn(),
      loadFile: vi.fn().mockResolvedValue(undefined),
      loadURL: vi.fn().mockResolvedValue(undefined),
      isDestroyed: vi.fn(() => false),
      isMinimized: vi.fn(() => false),
      restore: vi.fn(),
      focus: vi.fn(),
      webContents: {
        on: vi.fn(),
        setWindowOpenHandler: vi.fn(),
        getURL: vi.fn(() => 'file:///app/dist/renderer/index.html'),
      },
    };
  }

  async function bootWithMockedElectron(browserWindowInstance) {
    const appListeners = new Map();
    const defaultSession = { setCertificateVerifyProc: vi.fn() };
    vi.doMock('electron', () => ({
      app: {
        requestSingleInstanceLock: () => true,
        quit: vi.fn(),
        exit: vi.fn(),
        getVersion: () => '0.1.0',
        whenReady: () => Promise.resolve(),
        on: (event, listener) => {
          appListeners.set(event, listener);
        },
      },
      // plain arrow fn can't be used with `new`; a regular function returning an object can
      BrowserWindow: vi.fn(function BrowserWindow() {
        return browserWindowInstance;
      }),
      ipcMain: { handle: vi.fn() },
      Menu: { setApplicationMenu: vi.fn() },
      screen: { getPrimaryDisplay: () => ({ workAreaSize: { width: 1366, height: 728 } }) },
      session: { defaultSession },
    }));

    await import('../src/main/index.js');
    // whenReady().then(async () => { registerIpcHandlers(); await createWindow(); }) needs a few
    // microtask turns before mainWindow is assigned; wait for the observable end of createWindow.
    await vi.waitFor(() => {
      expect(browserWindowInstance.loadFile).toHaveBeenCalled();
    });

    const { Menu, BrowserWindow } = await import('electron');
    return { appListeners, defaultSession, Menu, BrowserWindow };
  }

  it('fokussiert und stellt ein minimiertes Fenster bei second-instance wieder her', async () => {
    const browserWindowInstance = fakeBrowserWindow();
    browserWindowInstance.isMinimized = vi.fn(() => true);
    const { appListeners } = await bootWithMockedElectron(browserWindowInstance);

    appListeners.get('second-instance')();

    expect(browserWindowInstance.restore).toHaveBeenCalledOnce();
    expect(browserWindowInstance.focus).toHaveBeenCalledOnce();
  });

  it('fokussiert ein nicht minimiertes Fenster bei second-instance ohne restore', async () => {
    const browserWindowInstance = fakeBrowserWindow();
    const { appListeners } = await bootWithMockedElectron(browserWindowInstance);

    appListeners.get('second-instance')();

    expect(browserWindowInstance.restore).not.toHaveBeenCalled();
    expect(browserWindowInstance.focus).toHaveBeenCalledOnce();
  });

  it('tut nichts bei second-instance, wenn das Fenster bereits zerstört ist', async () => {
    const browserWindowInstance = fakeBrowserWindow();
    browserWindowInstance.isDestroyed = vi.fn(() => true);
    const { appListeners } = await bootWithMockedElectron(browserWindowInstance);

    appListeners.get('second-instance')();

    expect(browserWindowInstance.restore).not.toHaveBeenCalled();
    expect(browserWindowInstance.focus).not.toHaveBeenCalled();
  });

  it('installiert den Zertifikatsverifier auf session.defaultSession beim Start (sonst toter Code, siehe REVIEW-NOTES)', async () => {
    const browserWindowInstance = fakeBrowserWindow();
    const { defaultSession } = await bootWithMockedElectron(browserWindowInstance);

    expect(defaultSession.setCertificateVerifyProc).toHaveBeenCalledOnce();
    expect(typeof defaultSession.setCertificateVerifyProc.mock.calls[0][0]).toBe('function');
  });

  it('entfernt das Standardmenü File/Edit/View/Window vor dem Fenster', async () => {
    const browserWindowInstance = fakeBrowserWindow();
    const { Menu } = await bootWithMockedElectron(browserWindowInstance);

    expect(Menu.setApplicationMenu).toHaveBeenCalledOnce();
    expect(Menu.setApplicationMenu).toHaveBeenCalledWith(null);
    expect(Menu.setApplicationMenu.mock.invocationCallOrder[0])
      .toBeLessThan(browserWindowInstance.loadFile.mock.invocationCallOrder[0]);
  });

  it('übergibt die auf die Arbeitsfläche geklemmte Größe samt Security-Flags an new BrowserWindow', async () => {
    const browserWindowInstance = fakeBrowserWindow();
    const { BrowserWindow } = await bootWithMockedElectron(browserWindowInstance);

    expect(BrowserWindow).toHaveBeenCalledOnce();
    const options = BrowserWindow.mock.calls[0][0];
    expect(options.width).toBe(1366);
    expect(options.height).toBe(728);
    expect(options.webPreferences).toMatchObject({
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    });
  });
});
