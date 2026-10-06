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

    return { exposedApi, exposedWorldName, invokeCalls };
  }

  it('exponiert die API unter dem Weltnamen "api" (window.api, von App.vue erwartet)', () => {
    const { exposedWorldName } = loadPreloadWithStubbedElectron();
    expect(exposedWorldName).toBe('api');
  });

  it('exponiert genau ein Feld: appVersion', () => {
    const { exposedApi } = loadPreloadWithStubbedElectron();
    expect(Object.keys(exposedApi)).toEqual(['appVersion']);
  });

  it('jedes exponierte Feld ist eine Funktion (kein Wert, kein generischer Durchgriff)', () => {
    const { exposedApi } = loadPreloadWithStubbedElectron();
    for (const value of Object.values(exposedApi)) {
      expect(typeof value).toBe('function');
    }
  });

  it('appVersion() ruft ausschließlich den hartcodierten Kanal app.version ohne Aufrufer-Argumente auf', async () => {
    const { exposedApi, invokeCalls } = loadPreloadWithStubbedElectron();
    await exposedApi.appVersion();
    expect(invokeCalls).toEqual([{ channel: 'app.version', args: [] }]);
  });
});

describe('src/main/', () => {
  // S01 verbietet diese Module/Verzeichnisse ausdrücklich (docs/steps/S01-skeleton.md "Ausdrücklich
  // NICHT in diesem Schritt"); spätere Schritte legen laut ARCHITECTURE §2 weitere main/-Module an,
  // daher keine exakte Allowlist (REVIEW-NOTES: "Verbotenes aufzählen, nicht Erlaubtes").
  it('enthält keines der in S01 verbotenen Module/Verzeichnisse', () => {
    const entries = readdirSync(path.join(root, 'src', 'main'));
    const forbidden = ['session.js', 'credentials.js', 'tls.js', 'log.js', 'files.js', 'ocs', 'actions'];
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
