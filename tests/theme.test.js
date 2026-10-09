import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const css = readFileSync(fileURLToPath(new URL('../src/renderer/styles/theme.css', import.meta.url)), 'utf8');

// S09a-Palette (DECISIONS "UI-Designvorlage", docs/steps/S09a-ui-designsystem.md). Diese Werte
// sind Pflicht, aber es gibt keine Obergrenze fuer weitere Tokens (REVIEW-NOTES [S01] - eine
// exakte Allowlist auf :root war die bekannte Falle, die mit jeder neuen Palette rot wird).
const mandatedTokens = {
  '--body-bg': '#0d1117',
  '--sidebar-bg': '#161b22',
  '--card-bg': '#161b22',
  '--sidebar-border': '#30363d',
  '--text-primary': '#e6edf3',
  '--text-secondary': '#8b949e',
  '--accent': '#58a6ff',
  '--success': '#3fb950',
  '--danger': '#f85149',
  '--warning': '#d29922',
};

describe('theme.css Tokens', () => {
  for (const [token, value] of Object.entries(mandatedTokens)) {
    it(`definiert ${token}: ${value}`, () => {
      const re = new RegExp(`${token.replace(/-/g, '\\-')}:\\s*${value};`);
      expect(css).toMatch(re);
    });
  }

  it('enthaelt alle Pflicht-Tokens in :root, weitere Tokens sind erlaubt', () => {
    const rootBlockMatch = css.match(/:root\s*{([^}]*)}/);
    expect(rootBlockMatch).not.toBeNull();
    const declaredTokens = [...rootBlockMatch[1].matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]);
    for (const token of Object.keys(mandatedTokens)) {
      expect(declaredTokens).toContain(token);
    }
  });

  // CLAUDE.md "Dark theme only" ist eine Konvention ohne Guard (Testlücke S09a-Review): kein
  // Light-Pfad bedeutet kein prefers-color-scheme-Media-Query und kein zweiter
  // data-bs-theme-Block, der einen hellen Zweig definieren würde.
  it('hat keinen Light-Pfad (kein prefers-color-scheme, kein zweiter data-bs-theme-Block)', () => {
    expect(css).not.toMatch(/prefers-color-scheme/);
    expect(css).not.toMatch(/\[data-bs-theme/);
  });
});

// S13-Review MINOR: die stat-*-Klassen aus DashboardView.vue standen bislang in keinem Test -
// eine Umbenennung in theme.css hätte das Dashboard lautlos unstyled gelassen. Nur die Selektoren
// prüfen (nicht Werte - die sind S09a-Geschmackssache, kein verbindlicher Vertrag wie die
// Farbtokens oben).
describe('Dashboard stat-*-Klassen (S13, portiert aus Microsoft365-Manager)', () => {
  const erwarteteSelektoren = [
    '.dashboard-stat-row', '.stat-card', '.stat-card-kicker', '.stat-value',
    '.stat-card-metrics', '.stat-card-metrics--stack', '.stat-metric', '.stat-metric--row',
    '.stat-metric-label', '.stat-metric-value',
  ];

  for (const selektor of erwarteteSelektoren) {
    it(`definiert ${selektor}`, () => {
      const re = new RegExp(`${selektor.replace(/[.-]/g, '\\$&')}\\s*{`);
      expect(css).toMatch(re);
    });
  }
});
