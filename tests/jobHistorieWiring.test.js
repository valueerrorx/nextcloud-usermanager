// Wiring guard für den pushJobHistorie-Aufrufort (REVIEW-NOTES "S13 Finding 8" / DECISIONS
// "Dry-Runs in der Job-Historie"): der Dry-Run/Vorschau-Pfad darf jobHistorie nie anfassen, nur
// der tatsächlich ausgeführte Pfad darf anhängen. Kappung/Reihenfolge von pushJobHistorie selbst
// sind in dashboard.test.js bewiesen - hier geht es nur um die Aufrufstelle in den .vue-Dateien.
// @vue/test-utils ist verboten (CLAUDE.md "No new dependencies") - deshalb Quelltextprüfung wie
// tests/jobProgressExport.test.js und tests/uiDependencies.test.js, keine Verhaltensprüfung.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const actionBarSrc = readFileSync(fileURLToPath(new URL('../src/renderer/components/ActionBar.vue', import.meta.url)), 'utf8');
// startJob moved to jobRunner.js in S18 (shared with the group delete flow).
const jobRunnerSrc = readFileSync(fileURLToPath(new URL('../src/renderer/jobRunner.js', import.meta.url)), 'utf8');
const importViewSrc = readFileSync(fileURLToPath(new URL('../src/renderer/views/ImportView.vue', import.meta.url)), 'utf8');

// Extrahiert den Funktionskörper zwischen "async function <name>(" und der schließenden Zeile
// "}" auf oberster Klammerebene - reicht für die flache Struktur dieser beiden Dateien.
function funktionsKoerper(quelltext, funktionsname) {
  const start = quelltext.indexOf(`function ${funktionsname}(`);
  expect(start, `function ${funktionsname} nicht gefunden`).toBeGreaterThanOrEqual(0);
  let tiefe = 0;
  let ende = -1;
  for (let i = quelltext.indexOf('{', start); i < quelltext.length; i += 1) {
    if (quelltext[i] === '{') tiefe += 1;
    if (quelltext[i] === '}') {
      tiefe -= 1;
      if (tiefe === 0) {
        ende = i;
        break;
      }
    }
  }
  expect(ende, `Ende von ${funktionsname} nicht gefunden`).toBeGreaterThan(start);
  return quelltext.slice(start, ende + 1);
}

describe('ActionBar.vue — pushJobHistorie nur auf dem ausgeführten Pfad', () => {
  it('onVorschau (Dry-Run/Bestätigung) ruft pushJobHistorie nicht auf', () => {
    const body = funktionsKoerper(actionBarSrc, 'onVorschau');
    expect(body).not.toContain('pushJobHistorie');
  });

  it('startJob (nach actions.run) ruft pushJobHistorie nur innerhalb von "if (result.ok)" auf', () => {
    const body = funktionsKoerper(jobRunnerSrc, 'startJob');
    const okZweigStart = body.indexOf('if (result.ok)');
    const sonstZweigStart = body.indexOf('} else {');
    expect(okZweigStart).toBeGreaterThanOrEqual(0);
    expect(sonstZweigStart).toBeGreaterThan(okZweigStart);
    const okZweig = body.slice(okZweigStart, sonstZweigStart);
    expect(okZweig).toContain('pushJobHistorie');
    expect(body.slice(sonstZweigStart)).not.toContain('pushJobHistorie');
  });
});

describe('ImportView.vue — pushJobHistorie nur auf dem ausgeführten Pfad', () => {
  it('onAnlegen ruft pushJobHistorie nur innerhalb von "if (result.ok)" auf', () => {
    const body = funktionsKoerper(importViewSrc, 'onAnlegen');
    const okZweigStart = body.indexOf('if (result.ok)');
    const sonstZweigStart = body.indexOf('} else {');
    expect(okZweigStart).toBeGreaterThanOrEqual(0);
    expect(sonstZweigStart).toBeGreaterThan(okZweigStart);
    const okZweig = body.slice(okZweigStart, sonstZweigStart);
    expect(okZweig).toContain('pushJobHistorie');
    expect(body.slice(sonstZweigStart)).not.toContain('pushJobHistorie');
  });

  it('die Vorschau (buildImportPlan/watch(plan, ...)) ruft pushJobHistorie nicht auf', () => {
    const watchStart = importViewSrc.indexOf('watch(plan,');
    const watchEnd = importViewSrc.indexOf('});', watchStart);
    expect(watchStart).toBeGreaterThanOrEqual(0);
    expect(importViewSrc.slice(watchStart, watchEnd)).not.toContain('pushJobHistorie');
  });
});
