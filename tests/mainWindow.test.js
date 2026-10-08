import { describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { BROWSER_WINDOW_OPTIONS, applyNavigationGuards } from '../src/main/windowOptions.js';

describe('BROWSER_WINDOW_OPTIONS', () => {
  it('setzt die Security-Flags fest', () => {
    expect(BROWSER_WINDOW_OPTIONS.webPreferences.contextIsolation).toBe(true);
    expect(BROWSER_WINDOW_OPTIONS.webPreferences.sandbox).toBe(true);
    expect(BROWSER_WINDOW_OPTIONS.webPreferences.nodeIntegration).toBe(false);
    expect(BROWSER_WINDOW_OPTIONS.webPreferences.webSecurity).not.toBe(false);
  });

  it('lädt das Preload als index.cjs', () => {
    expect(BROWSER_WINDOW_OPTIONS.webPreferences.preload.endsWith('index.cjs')).toBe(true);
  });

  it('der Preload-Pfad löst tatsächlich auf eine existierende Datei auf', () => {
    expect(existsSync(BROWSER_WINDOW_OPTIONS.webPreferences.preload)).toBe(true);
  });

  it('ist dunkel hinterlegt', () => {
    expect(BROWSER_WINDOW_OPTIONS.backgroundColor).toBe('#0d1117');
  });

  it('bleibt unsichtbar bis ready-to-show (show: false, verhindert weißes Aufblitzen zusammen mit backgroundColor)', () => {
    expect(BROWSER_WINDOW_OPTIONS.show).toBe(false);
  });
});

// fake webContents: EventEmitter is enough for will-navigate (event, url); will-frame-navigate
// emits a single merged details object instead and is tested with a plain object, not emit()
// setWindowOpenHandler is captured separately
function createFakeWebContents(currentUrl) {
  const webContents = new EventEmitter();
  let windowOpenHandler = null;
  webContents.getURL = () => currentUrl;
  webContents.setWindowOpenHandler = (handler) => {
    windowOpenHandler = handler;
  };
  webContents.invokeWindowOpenHandler = (details) => windowOpenHandler(details);
  return webContents;
}

describe('applyNavigationGuards', () => {
  it('registriert einen setWindowOpenHandler, der jedes neue Fenster verweigert', () => {
    const webContents = createFakeWebContents('file:///app/index.html');
    applyNavigationGuards(webContents);
    expect(webContents.invokeWindowOpenHandler({ url: 'https://example.com' })).toEqual({ action: 'deny' });
  });

  it('blockt will-navigate zu einer fremden URL per preventDefault', () => {
    const webContents = createFakeWebContents('file:///app/index.html');
    applyNavigationGuards(webContents);
    const event = { preventDefault: vi.fn() };
    webContents.emit('will-navigate', event, 'https://example.com');
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it('lässt will-navigate zur aktuell geladenen URL unangetastet', () => {
    const currentUrl = 'file:///app/index.html';
    const webContents = createFakeWebContents(currentUrl);
    applyNavigationGuards(webContents);
    const event = { preventDefault: vi.fn() };
    webContents.emit('will-navigate', event, currentUrl);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  // dev case: guard compares exact URL equality, so a same-origin path change is also blocked
  it('blockt will-navigate im Dev-Modus auch auf einen anderen Pfad desselben Dev-Servers', () => {
    const currentUrl = 'http://localhost:5173/';
    const webContents = createFakeWebContents(currentUrl);
    applyNavigationGuards(webContents);
    const event = { preventDefault: vi.fn() };
    webContents.emit('will-navigate', event, 'http://localhost:5173/other');
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it('registriert Guards für sowohl will-navigate als auch will-frame-navigate', () => {
    const webContents = createFakeWebContents('file:///app/index.html');
    applyNavigationGuards(webContents);
    expect(webContents.eventNames()).toEqual(expect.arrayContaining(['will-navigate', 'will-frame-navigate']));
  });

  // Electron emits a SINGLE details object for will-frame-navigate (url, isMainFrame,
  // isSameDocument, preventDefault all merged on it), never (event, url) like will-navigate.
  it('blockt will-frame-navigate einer Sub-Frame zu einer fremden URL per preventDefault', () => {
    const webContents = createFakeWebContents('file:///app/index.html');
    applyNavigationGuards(webContents);
    const details = {
      preventDefault: vi.fn(),
      url: 'https://example.com',
      isMainFrame: false,
      isSameDocument: false,
    };
    webContents.emit('will-frame-navigate', details);
    expect(details.preventDefault).toHaveBeenCalledOnce();
  });

  it('lässt will-frame-navigate zur aktuell geladenen URL unangetastet', () => {
    const currentUrl = 'file:///app/index.html';
    const webContents = createFakeWebContents(currentUrl);
    applyNavigationGuards(webContents);
    const details = {
      preventDefault: vi.fn(),
      url: currentUrl,
      isMainFrame: true,
      isSameDocument: false,
    };
    webContents.emit('will-frame-navigate', details);
    expect(details.preventDefault).not.toHaveBeenCalled();
  });
});
