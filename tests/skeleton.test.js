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

  // Verbotenes aufzählen, nicht Erlaubtes (REVIEW-NOTES [S01], fünfter Fall): die vorherige
  // exakte Allowlist ['sweetalert2', 'vue'] diktierte, wo bootstrap/bootstrap-icons stehen
  // dürfen, statt die tatsächlich benötigten Pakete zu prüfen. Umgedreht: die Runtime-Pakete,
  // die der Code wirklich importiert, müssen da sein; Build-/Electron-/CSS-Pakete dürfen nicht
  // als Runtime-Dependency landen (bootstrap/bootstrap-icons bleiben bewusst in devDependencies,
  // siehe tests/uiDependencies.test.js).
  it('hat vue und sweetalert2 als Runtime-Dependencies, keine Build- oder Electron-Pakete darin', () => {
    const deps = Object.keys(pkg.dependencies ?? {});
    for (const name of ['vue', 'sweetalert2']) {
      expect(deps).toContain(name);
    }
    const forbidden = ['electron', 'vite', 'bootstrap', 'bootstrap-icons'];
    for (const name of forbidden) {
      expect(deps).not.toContain(name);
    }
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

  // CRITICAL-Fix S09a-Review: img-src muss auch im gebauten Markup überleben, sonst blockiert
  // default-src 'self' weiterhin die data:image/svg+xml-Indikatoren von Bootstrap (.form-select-
  // Pfeil, angehakte Checkbox) - ein Smoke-Start allein beweist das nicht (REVIEW-NOTES [S09a]).
  it('enthält img-src \'self\' data: im gebauten CSP-Meta-Tag', () => {
    const distIndex = path.join(scratchOutDir, 'index.html');
    const html = readFileSync(distIndex, 'utf8');
    const cspMatch = html.match(/<meta[^>]*http-equiv="Content-Security-Policy"[^>]*content="([^"]+)"/);
    expect(cspMatch).not.toBeNull();
    expect(cspMatch[1]).toMatch(/img-src[^;]*'self'[^;]*data:/);
  });

  // Beweis, dass die Aufweichung tatsächlich etwas erlaubt: das gebaute Bootstrap-CSS enthält
  // die data:image/svg+xml-Hintergrundbilder, die ohne img-src von default-src blockiert würden.
  it('das gebündelte CSS enthält die data:image/svg+xml-Formularindikatoren, die img-src erlaubt', () => {
    const assetsDir = path.join(scratchOutDir, 'assets');
    const cssFile = readdirSync(assetsDir).find((name) => name.endsWith('.css'));
    expect(cssFile).toBeDefined();
    const css = readFileSync(path.join(assetsDir, cssFile), 'utf8');
    expect(css).toContain('data:image/svg+xml');
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
      'logout',
      'openExternal',
      'respondCertificate',
      'onCertificatePrompt',
      'usersList',
      'onUsersLoadProgress',
      'actionsRun',
      'actionsStop',
      'onActionsProgress',
      'filesSaveCsv',
      'groupsList',
      'groupsCreate',
      'groupsDelete',
      'groupsRename',
      'groupsMembers',
      'serverFreeSpace',
      'filesOpenCsv',
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

  // Testlücke S10-Review: groupsList/groupsCreate/filesOpenCsv standen nur in der required-Liste
  // oben, aber ohne Routing-Test (Kanal + Argumente) wie appVersion/connect/usersList - Abnahme 4 war
  // dadurch nicht geprüft.
  it('groupsList() ruft ausschließlich den Kanal groups.list ohne Argumente auf', async () => {
    const { exposedApi, invokeCalls } = loadPreloadWithStubbedElectron();
    await exposedApi.groupsList();
    expect(invokeCalls).toEqual([{ channel: 'groups.list', args: [] }]);
  });

  it('groupsCreate() leitet das Argument unverändert an den Kanal groups.create weiter', async () => {
    const { exposedApi, invokeCalls } = loadPreloadWithStubbedElectron();
    const args = { groupid: 'neue-gruppe' };
    await exposedApi.groupsCreate(args);
    expect(invokeCalls).toEqual([{ channel: 'groups.create', args: [args] }]);
  });

  // S12 A3: groupsDelete fehlte noch im Routing-Test, analog zu groupsCreate oben.
  it('groupsRename() leitet das Argument unverändert an den Kanal groups.rename weiter', async () => {
    const { exposedApi, invokeCalls } = loadPreloadWithStubbedElectron();
    const args = { groupid: '2026-1C', displayname: 'Klasse 1C' };
    await exposedApi.groupsRename(args);
    expect(invokeCalls).toEqual([{ channel: 'groups.rename', args: [args] }]);
  });

  it('groupsDelete() leitet das Argument unverändert an den Kanal groups.delete weiter', async () => {
    const { exposedApi, invokeCalls } = loadPreloadWithStubbedElectron();
    const args = { groupid: 'alte-gruppe' };
    await exposedApi.groupsDelete(args);
    expect(invokeCalls).toEqual([{ channel: 'groups.delete', args: [args] }]);
  });

  it('groupsMembers() leitet das Argument an groups.members, serverFreeSpace() ohne Argumente an server.freeSpace', async () => {
    const { exposedApi, invokeCalls } = loadPreloadWithStubbedElectron();
    const args = { groupid: 'g' };
    await exposedApi.groupsMembers(args);
    await exposedApi.serverFreeSpace('ignoriert');
    expect(invokeCalls).toEqual([
      { channel: 'groups.members', args: [args] },
      { channel: 'server.freeSpace', args: [] },
    ]);
  });

  it('filesOpenCsv() leitet das Argument unverändert an den Kanal files.openCsv weiter', async () => {
    const { exposedApi, invokeCalls } = loadPreloadWithStubbedElectron();
    const args = { zweck: 'import' };
    await exposedApi.filesOpenCsv(args);
    expect(invokeCalls).toEqual([{ channel: 'files.openCsv', args: [args] }]);
  });

  // S16-Kanäle
  it('exponiert forgetSaved nicht mehr (Löschen läuft nur über logout)', () => {
    const { exposedApi } = loadPreloadWithStubbedElectron();
    expect(Object.keys(exposedApi)).not.toContain('forgetSaved');
  });

  it('logout() ruft ausschließlich den Kanal connection.logout ohne Argumente auf', async () => {
    const { exposedApi, invokeCalls } = loadPreloadWithStubbedElectron();
    await exposedApi.logout();
    expect(invokeCalls).toEqual([{ channel: 'connection.logout', args: [] }]);
  });

  it('openExternal() leitet das Argument unverändert an den Kanal app.openExternal weiter', async () => {
    const { exposedApi, invokeCalls } = loadPreloadWithStubbedElectron();
    const args = { url: 'https://xapient.solutions/' };
    await exposedApi.openExternal(args);
    expect(invokeCalls).toEqual([{ channel: 'app.openExternal', args: [args] }]);
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
  const cspMatch = html.match(/<meta[^>]*http-equiv="Content-Security-Policy"[^>]*content="([^"]+)"/);

  it('enthält ein Content-Security-Policy-Meta-Tag mit default-src \'self\'', () => {
    expect(cspMatch).not.toBeNull();
    expect(cspMatch[1]).toContain("default-src 'self'");
  });

  it('erlaubt style-src nur mit unsafe-inline (swal2/Vue nutzen inline Styles)', () => {
    expect(cspMatch).not.toBeNull();
    expect(cspMatch[1]).toMatch(/style-src[^;]*'unsafe-inline'/);
  });

  // Testlücke S09a-Review: nur default-src und style-src waren gepinnt. font-src trägt die
  // Icon-Font, img-src (DECISIONS "CSP: img-src 'self' data: ergänzt") die
  // data:image/svg+xml-Formularindikatoren von Bootstrap - beide dürfen nicht lautlos verschwinden.
  it('erlaubt font-src nur \'self\' (Icon-Font aus dem eigenen Bundle)', () => {
    expect(cspMatch).not.toBeNull();
    expect(cspMatch[1]).toMatch(/font-src[^;]*'self'/);
  });

  it('erlaubt img-src \'self\' und data: (Bootstrap-Formularindikatoren)', () => {
    expect(cspMatch).not.toBeNull();
    expect(cspMatch[1]).toMatch(/img-src[^;]*'self'[^;]*data:/);
  });

  // Explizite Spec-Vorgabe (docs/steps/S09a-ui-designsystem.md "Abhängigkeiten") ohne Guard.
  it('setzt data-bs-theme="dark" auf <html>', () => {
    expect(html).toMatch(/<html[^>]*data-bs-theme="dark"/);
  });
});
