import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const viteConfigFile = path.join(root, 'vite.config.js');

// builds the renderer into a scratch directory so the test run never empties dist/ (the artifact from Abnahme 7a)
let scratchOutDir;

beforeAll(async () => {
  scratchOutDir = mkdtempSync(path.join(tmpdir(), 'nc-usermanager-vite-'));
  await build({ configFile: viteConfigFile, build: { outDir: scratchOutDir, emptyOutDir: true } });
}, 30000);

afterAll(() => {
  rmSync(scratchOutDir, { recursive: true, force: true });
});

describe('package.json', () => {
  it('ist ein ESM-Projekt mit main auf src/main/index.js', () => {
    expect(pkg.type).toBe('module');
    expect(pkg.main).toBe('src/main/index.js');
  });

  it('hat genau die vier verbindlichen Script-Kommandos', () => {
    expect(pkg.scripts.dev).toBe('node scripts/dev.mjs');
    expect(pkg.scripts.test).toBe('vitest run');
    expect(pkg.scripts.lint).toBe('eslint .');
    expect(pkg.scripts.build).toBe('vite build && electron-builder --linux AppImage');
  });

  it('pinnt Electron ohne Caret', () => {
    expect(pkg.devDependencies.electron).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('enthält keine der in S01 verbotenen devDependencies', () => {
    const forbidden = ['concurrently', 'electron-vite', 'vue-router', 'pinia', '@sweetalert2/theme-dark'];
    const present = Object.keys(pkg.devDependencies ?? {});
    for (const name of forbidden) {
      expect(present).not.toContain(name);
    }
  });

  it('hat als Runtime-Dependencies ausschließlich vue und sweetalert2', () => {
    expect(Object.keys(pkg.dependencies).sort()).toEqual(['sweetalert2', 'vue']);
  });
});

describe('vite.config.js', () => {
  it('setzt base auf ./ für file:// aus dem gepackten Fenster', async () => {
    const viteConfig = (await import('../vite.config.js')).default;
    expect(viteConfig.base).toBe('./');
  });
});

describe('dist/renderer/index.html (Scratch-Build, nicht das echte dist/)', () => {
  it('existiert nach einem Build', () => {
    const distIndex = path.join(scratchOutDir, 'index.html');
    expect(existsSync(distIndex)).toBe(true);
  });

  it('referenziert Assets ausschließlich relativ, kein führender Slash (Nachweis für base: "./")', () => {
    const distIndex = path.join(scratchOutDir, 'index.html');
    const html = readFileSync(distIndex, 'utf8');
    const srcHrefAttrs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
    expect(srcHrefAttrs.length).toBeGreaterThan(0);
    for (const attr of srcHrefAttrs) {
      expect(attr.startsWith('/')).toBe(false);
    }
  });

  // Nachweis, dass ein künftiger Vite- oder HTML-Transform-Schritt das CSP-Meta nicht stillschweigend entfernt
  it('behält das Content-Security-Policy-Meta-Tag nach dem Vite-Build', () => {
    const distIndex = path.join(scratchOutDir, 'index.html');
    const html = readFileSync(distIndex, 'utf8');
    const cspMatch = html.match(/<meta[^>]*http-equiv="Content-Security-Policy"[^>]*content="([^"]+)"/);
    expect(cspMatch).not.toBeNull();
    expect(cspMatch[1]).toContain("default-src 'self'");
  });
});

// behaviour-based preload test: regex checks on source text proved ineffective (REVIEW-NOTES, Reviews)
describe('src/preload/index.cjs', () => {
  const preloadPath = path.join(root, 'src', 'preload', 'index.cjs');
  const requireFromPreload = createRequire(preloadPath);
  const electronPath = requireFromPreload.resolve('electron');

  function loadPreloadWithStubbedElectron() {
    const invokeCalls = [];
    const onCalls = [];
    const removeListenerCalls = [];
    let exposedApi = null;
    let exposedWorldName = null;
    const stubbedElectron = {
      contextBridge: {
        exposeInMainWorld: (name, api) => {
          exposedWorldName = name;
          exposedApi = api;
        },
      },
      ipcRenderer: {
        invoke: (channel, ...args) => {
          invokeCalls.push({ channel, args });
          return Promise.resolve({ ok: true });
        },
        on: (channel, listener) => {
          onCalls.push({ channel, listener });
        },
        removeListener: (channel, listener) => {
          removeListenerCalls.push({ channel, listener });
        },
      },
    };

    // swap real 'electron' module in the require cache for the stub, clear preload cache for a fresh load
    delete requireFromPreload.cache[electronPath];
    delete requireFromPreload.cache[preloadPath];
    requireFromPreload.cache[electronPath] = {
      id: electronPath,
      filename: electronPath,
      loaded: true,
      exports: stubbedElectron,
    };

    requireFromPreload(preloadPath);

    delete requireFromPreload.cache[electronPath];
    delete requireFromPreload.cache[preloadPath];

    return { exposedApi, exposedWorldName, invokeCalls, onCalls, removeListenerCalls };
  }

  it('exponiert die API unter dem Weltnamen "api" (window.api, von App.vue erwartet)', () => {
    const { exposedWorldName } = loadPreloadWithStubbedElectron();
    expect(exposedWorldName).toBe('api');
  });

  // Verbotenes aufzählen, nicht Erlaubtes (REVIEW-NOTES [S01], vierter Fall): eine exakte
  // Feldanzahl wird in jedem Folgeschritt, der die Preload-API erweitert, planmäßig rot.
  it('exponiert keinen generischen Durchgriff (invoke/send/on/ipcRenderer)', () => {
    const { exposedApi } = loadPreloadWithStubbedElectron();
    const forbidden = ['invoke', 'send', 'on', 'ipcRenderer'];
    for (const name of forbidden) {
      expect(Object.keys(exposedApi)).not.toContain(name);
    }
  });

  it('jedes exponierte Feld ist eine Funktion (kein Wert, kein generischer Durchgriff)', () => {
    const { exposedApi } = loadPreloadWithStubbedElectron();
    for (const value of Object.values(exposedApi)) {
      expect(typeof value).toBe('function');
    }
  });

  it('enthält die vom Renderer namentlich benötigten Methoden', () => {
    const { exposedApi } = loadPreloadWithStubbedElectron();
    const required = [
      'appVersion',
      'connect',
      'connectSaved',
      'connectionStatus',
      'forgetSaved',
      'respondCertificate',
      'onCertificatePrompt',
      'usersList',
      'onUsersLoadProgress',
      'actionsRun',
      'actionsStop',
      'onActionsProgress',
      'filesSaveCsv',
    ];
    for (const name of required) {
      expect(Object.keys(exposedApi)).toContain(name);
    }
  });

  it('appVersion() ruft ausschließlich den hartcodierten Kanal app.version ohne Aufrufer-Argumente auf', async () => {
    const { exposedApi, invokeCalls } = loadPreloadWithStubbedElectron();
    await exposedApi.appVersion();
    expect(invokeCalls).toEqual([{ channel: 'app.version', args: [] }]);
  });

  it('connect() leitet das Argument unverändert an den Kanal connection.connect weiter', async () => {
    const { exposedApi, invokeCalls } = loadPreloadWithStubbedElectron();
    const args = { baseUrl: 'https://host', adminUser: 'admin', appPassword: 'geheim', remember: true };
    await exposedApi.connect(args);
    expect(invokeCalls).toEqual([{ channel: 'connection.connect', args: [args] }]);
  });

  it('onCertificatePrompt() abonniert tls.onCertificatePrompt und gibt einen Disposer zurück', () => {
    const { exposedApi, onCalls, removeListenerCalls } = loadPreloadWithStubbedElectron();
    const callback = () => {};
    const dispose = exposedApi.onCertificatePrompt(callback);
    expect(onCalls).toHaveLength(1);
    expect(onCalls[0].channel).toBe('tls.onCertificatePrompt');
    expect(typeof dispose).toBe('function');
    dispose();
    expect(removeListenerCalls).toEqual([{ channel: 'tls.onCertificatePrompt', listener: onCalls[0].listener }]);
  });

  it('usersList() ruft ausschließlich den Kanal users.list ohne Argumente auf', async () => {
    const { exposedApi, invokeCalls } = loadPreloadWithStubbedElectron();
    await exposedApi.usersList();
    expect(invokeCalls).toEqual([{ channel: 'users.list', args: [] }]);
  });

  it('onUsersLoadProgress() abonniert users.onLoadProgress und gibt einen Disposer zurück', () => {
    const { exposedApi, onCalls, removeListenerCalls } = loadPreloadWithStubbedElectron();
    const callback = () => {};
    const dispose = exposedApi.onUsersLoadProgress(callback);
    expect(onCalls).toHaveLength(1);
    expect(onCalls[0].channel).toBe('users.onLoadProgress');
    expect(typeof dispose).toBe('function');
    dispose();
    expect(removeListenerCalls).toEqual([{ channel: 'users.onLoadProgress', listener: onCalls[0].listener }]);
  });

  it('actionsRun() leitet das Argument unverändert an den Kanal actions.run weiter', async () => {
    const { exposedApi, invokeCalls } = loadPreloadWithStubbedElectron();
    const args = { jobId: 'job1', action: 'user.enable', items: ['alice'], params: {} };
    await exposedApi.actionsRun(args);
    expect(invokeCalls).toEqual([{ channel: 'actions.run', args: [args] }]);
  });

  it('actionsStop() leitet das Argument unverändert an den Kanal actions.stop weiter', async () => {
    const { exposedApi, invokeCalls } = loadPreloadWithStubbedElectron();
    const args = { jobId: 'job1' };
    await exposedApi.actionsStop(args);
    expect(invokeCalls).toEqual([{ channel: 'actions.stop', args: [args] }]);
  });

  it('filesSaveCsv() leitet das Argument unverändert an den Kanal files.saveCsv weiter', async () => {
    const { exposedApi, invokeCalls } = loadPreloadWithStubbedElectron();
    const args = { vorschlag: 'ergebnis.csv', inhalt: 'userid;aktion\r\n' };
    await exposedApi.filesSaveCsv(args);
    expect(invokeCalls).toEqual([{ channel: 'files.saveCsv', args: [args] }]);
  });

  it('onActionsProgress() abonniert actions.onProgress und gibt einen Disposer zurück', () => {
    const { exposedApi, onCalls, removeListenerCalls } = loadPreloadWithStubbedElectron();
    const callback = () => {};
    const dispose = exposedApi.onActionsProgress(callback);
    expect(onCalls).toHaveLength(1);
    expect(onCalls[0].channel).toBe('actions.onProgress');
    expect(typeof dispose).toBe('function');
    dispose();
    expect(removeListenerCalls).toEqual([{ channel: 'actions.onProgress', listener: onCalls[0].listener }]);
  });
});

describe('src/main/', () => {
  // S01 verbietet diese Module/Verzeichnisse ausdrücklich (docs/steps/S01-skeleton.md "Ausdrücklich
  // NICHT in diesem Schritt"); spätere Schritte legen laut ARCHITECTURE §2 weitere main/-Module an,
  // daher keine exakte Allowlist (REVIEW-NOTES: "Verbotenes aufzählen, nicht Erlaubtes").
  // 'ocs' ist mit S03 entfernt - das Verzeichnis existiert ab dann (gleiches Schema wie
  // 'src/shared/' nach S02). 'session.js', 'credentials.js' und 'tls.js' sind mit S04 entfernt -
  // sie entstehen jetzt legitim (REVIEW-NOTES [S03]). 'actions' ist mit S07 entfernt - das
  // Verzeichnis existiert ab dann (REVIEW-NOTES [S03]: Scope-Guards bei jedem neuen Modul mitpflegen).
  // 'files.js' ist mit S08 entfernt - es entsteht jetzt legitim (REVIEW-NOTES [S03]).
  it('enthält keines der in S01 verbotenen Module/Verzeichnisse', () => {
    const entries = readdirSync(path.join(root, 'src', 'main'));
    const forbidden = ['log.js'];
    for (const name of forbidden) {
      expect(entries).not.toContain(name);
    }
  });
});

describe('src/renderer/index.html', () => {
  const html = readFileSync(path.join(root, 'src', 'renderer', 'index.html'), 'utf8');

  it('enthält ein Content-Security-Policy-Meta-Tag mit default-src \'self\'', () => {
    const cspMatch = html.match(/<meta[^>]*http-equiv="Content-Security-Policy"[^>]*content="([^"]+)"/);
    expect(cspMatch).not.toBeNull();
    expect(cspMatch[1]).toContain("default-src 'self'");
  });

  it('erlaubt style-src nur mit unsafe-inline (swal2/Vue nutzen inline Styles)', () => {
    const cspMatch = html.match(/<meta[^>]*http-equiv="Content-Security-Policy"[^>]*content="([^"]+)"/);
    expect(cspMatch).not.toBeNull();
    expect(cspMatch[1]).toMatch(/style-src[^;]*'unsafe-inline'/);
  });
});
