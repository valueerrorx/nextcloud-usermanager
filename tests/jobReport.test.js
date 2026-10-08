// S08 B: resolveGrund and summaryAnzeige, the two pure display helpers the action report needs.
import { describe, expect, it } from 'vitest';
import { resolveGrund, summaryAnzeige } from '../src/shared/jobReport.js';
import { MESSAGES } from '../src/shared/messages.js';

describe('resolveGrund', () => {
  it('null bleibt null', () => {
    expect(resolveGrund(null)).toBeNull();
  });

  it('eine bekannte messageId wird zum deutschen Text', () => {
    expect(resolveGrund('server_blockt_vorerst')).toBe(MESSAGES.server_blockt_vorerst);
  });

  it('ein bereits deutscher Satz (teilweise-Begründung) bleibt unverändert', () => {
    expect(resolveGrund('email konnte nicht gesetzt werden')).toBe('email konnte nicht gesetzt werden');
  });

  // Review-Gap: pinnt das Verhalten für ein unbekanntes, nicht-deutsches Token (weder messageId
  // noch deutscher Satz) - MESSAGES[grund] ?? grund lässt es unverändert durch.
  it('ein unbekanntes, nicht-deutsches Token bleibt unverändert', () => {
    expect(resolveGrund('some_unmapped_token_xyz')).toBe('some_unmapped_token_xyz');
  });
});

describe('summaryAnzeige', () => {
  it('fehler enthält teilweise zusätzlich, teilweise bleibt separat ausgewiesen', () => {
    const summary = { ok: 5, fehler: 2, nichtAusgefuehrt: 3, teilweise: 1 };
    expect(summaryAnzeige(summary)).toEqual({ ok: 5, fehler: 3, teilweise: 1, nichtAusgefuehrt: 3 });
  });

  it('ohne teilweise bleibt fehler unverändert', () => {
    const summary = { ok: 10, fehler: 4, nichtAusgefuehrt: 0, teilweise: 0 };
    expect(summaryAnzeige(summary)).toEqual({ ok: 10, fehler: 4, teilweise: 0, nichtAusgefuehrt: 0 });
  });
});
