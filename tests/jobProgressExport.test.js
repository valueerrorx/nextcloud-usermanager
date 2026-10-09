// S11 B2 wiring guard: JobProgress.vue has @vue/test-utils as its only route to a behavioural
// test, and that dependency is forbidden (spec "Tests"). This greps instead - it only proves the
// warning text is wired somewhere under src/renderer/, not that it actually blocks the save
// dialog (REVIEW-NOTES [S01] "Regex-Assertions auf Quelltext sind kein Sicherheitstest"), but it
// stops the exact regression this step fixed: passwort_export_warnung declared and never read.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const rendererDir = fileURLToPath(new URL('../src/renderer', import.meta.url));

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

describe('passwort_export_warnung ist unter src/renderer/ tatsächlich verdrahtet (S11 B2)', () => {
  it('wird in mindestens einer Renderer-Datei referenziert, nicht nur in shared/messages.js', () => {
    const dateien = alleDateiInhalte(rendererDir);
    const treffer = dateien.filter(({ text }) => text.includes('passwort_export_warnung'));
    expect(treffer.map((t) => t.pfad)).not.toHaveLength(0);
  });
});
