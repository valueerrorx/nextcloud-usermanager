import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const mainJs = readFileSync(new URL('../src/renderer/main.js', import.meta.url), 'utf8');
const rendererDir = fileURLToPath(new URL('../src/renderer', import.meta.url));

// Rekursiv alle Dateien unter src/renderer/ einlesen - Testlücke S09a-Review: eine Regex-Prüfung
// nur auf main.js (REVIEW-NOTES [S01] "Regex-Assertions auf Quelltext sind kein Sicherheitstest")
// liess jede .vue-Datei mit einem eigenen "import 'bootstrap'" unentdeckt durch.
function alleDateiInhalte(dir) {
  const inhalte = [];
  for (const eintrag of readdirSync(dir, { withFileTypes: true })) {
    const vollerPfad = path.join(dir, eintrag.name);
    if (eintrag.isDirectory()) {
      inhalte.push(...alleDateiInhalte(vollerPfad));
    } else {
      inhalte.push({ pfad: vollerPfad, text: readFileSync(vollerPfad, 'utf8') });
    }
  }
  return inhalte;
}

// bootstrap/bootstrap-icons sind reine CSS-/Font-Assets, gebuendelt von Vite - kein eigener
// Eintrag in den Runtime-`dependencies` (tests/skeleton.test.js prüft das als Verbotsliste,
// REVIEW-NOTES [S01] "Verzeichnisinhalte nie als exakte Allowlist prüfen").
describe('UI-Designsystem-Abhängigkeiten (S09a, DECISIONS "Bootstrap 5 und bootstrap-icons")', () => {
  // Testlücke S09a-Review: die vorherige Prüfung mischte dependencies und devDependencies und
  // bewies damit nie die Platzierung, die der eigene Kommentar oben behauptet.
  it('listet bootstrap und bootstrap-icons in devDependencies, nicht in den Runtime-dependencies', () => {
    expect(pkg.devDependencies).toHaveProperty('bootstrap');
    expect(pkg.devDependencies).toHaveProperty('bootstrap-icons');
    expect(pkg.dependencies).not.toHaveProperty('bootstrap');
    expect(pkg.dependencies).not.toHaveProperty('bootstrap-icons');
  });

  it('importiert in main.js nur das Bootstrap-CSS, kein Bootstrap-JS', () => {
    expect(mainJs).toMatch(/bootstrap\/dist\/css\/bootstrap\.min\.css/);
    expect(mainJs).toMatch(/bootstrap-icons\/font\/bootstrap-icons\.css/);
    // kein "import 'bootstrap'" oder Import aus bootstrap/dist/js/*
    expect(mainJs).not.toMatch(/from\s+'bootstrap'(?!\/)/);
    expect(mainJs).not.toMatch(/['"]bootstrap(?:\/dist)?\/(?:dist\/)?js\//);
    expect(mainJs).not.toMatch(/bootstrap\.(?:bundle\.)?min\.js/);
  });

  it('importiert nirgends unter src/renderer/ Bootstrap-JS, auch nicht in einer einzelnen .vue-Datei', () => {
    const dateien = alleDateiInhalte(rendererDir);
    expect(dateien.length).toBeGreaterThan(0);
    for (const { pfad, text } of dateien) {
      expect(text, pfad).not.toMatch(/from\s+'bootstrap'(?!\/)/);
      expect(text, pfad).not.toMatch(/['"]bootstrap(?:\/dist)?\/(?:dist\/)?js\//);
      expect(text, pfad).not.toMatch(/bootstrap\.(?:bundle\.)?min\.js/);
    }
  });
});
