// S18: tile value for "Frei auf dem Server".
import { describe, expect, it } from 'vitest';
import { freiplatzAnzeige } from '../src/shared/freiplatz.js';
import { dashboardCards } from '../src/shared/dashboard.js';
import { formatBytes } from '../src/shared/quota.js';

describe('freiplatzAnzeige', () => {
  it('Zahl und 0 sind Werte', () => {
    expect(freiplatzAnzeige({ ok: true, freeBytes: 1073741824 })).toEqual({ wert: formatBytes(1073741824), hinweis: null });
    expect(freiplatzAnzeige({ ok: true, freeBytes: 0 }).wert).toBe(formatBytes(0));
  });

  it.each([
    ['null', { ok: true, freeBytes: null }],
    ['-3', { ok: true, freeBytes: -3 }],
    ['NaN', { ok: true, freeBytes: NaN }],
    ['Infinity', { ok: true, freeBytes: Infinity }],
    ['String', { ok: true, freeBytes: '5' }],
    ['Fehlerresult', { ok: false, messageId: 'x', freeBytes: 5 }],
    ['nicht geladen', null],
  ])('%s -> nicht verfügbar mit Hinweis', (_name, result) => {
    expect(freiplatzAnzeige(result)).toEqual({ wert: 'nicht verfügbar', hinweis: 'serverinfo-App nicht erreichbar oder keine Berechtigung' });
  });

  it('Speicher-Kachel trägt die Zeile "Frei auf dem Server" neben "Genutzt gesamt"', () => {
    const speicher = dashboardCards({ users: [], groupCount: 0, freiplatz: { ok: true, freeBytes: 1073741824 } })[2];
    expect(speicher.metrics.find((m) => m.label === 'Frei auf dem Server').wert).toBe(formatBytes(1073741824));
    expect(speicher.metrics.map((m) => m.label)).toEqual(['Genutzt gesamt', 'Frei auf dem Server']);
    const ohne = dashboardCards({ users: [], groupCount: 0 })[2];
    expect(ohne.metrics.find((m) => m.label === 'Frei auf dem Server').wert).toBe('nicht verfügbar');
  });
});
