// S05 A1: every row of the ARCHITECTURE §4 table, plus the relative-ignore test, plus formatBytes.
// S08 A2: QUOTA_PRESETS and formatQuotaForApi.
import { describe, expect, it } from 'vitest';
import { parseQuota, formatBytes, formatPercent, quotaBalkenBreite, QUOTA_PRESETS, formatQuotaForApi } from '../src/shared/quota.js';

describe('parseQuota — ARCHITECTURE §4 Tabelle', () => {
  it('Objekt mit quota: -3 -> unlimited, used bleibt erhalten', () => {
    const result = parseQuota({ free: -3, used: 12, total: -3, relative: 0, quota: -3 });
    expect(result).toEqual({ kind: 'unlimited', limitBytes: null, usedBytes: 12, usagePercent: null, roh: { free: -3, used: 12, total: -3, relative: 0, quota: -3 } });
  });

  it('Skalar "none" -> unlimited ohne usedBytes', () => {
    const result = parseQuota('none');
    expect(result.kind).toBe('unlimited');
    expect(result.usedBytes).toBeNull();
  });

  it('Objekt mit numerischem quota > 0 -> limited mit limitBytes und usedBytes', () => {
    const result = parseQuota({ free: 1013296222, used: 60445602, total: 1073741824, relative: 5.63, quota: 1073741824 });
    expect(result.kind).toBe('limited');
    expect(result.limitBytes).toBe(1073741824);
    expect(result.usedBytes).toBe(60445602);
  });

  it('Skalar 0 und Skalar "0" ergeben beide unknown, nicht limited: 0', () => {
    expect(parseQuota(0)).toMatchObject({ kind: 'unknown', limitBytes: null, usedBytes: null });
    expect(parseQuota('0')).toMatchObject({ kind: 'unknown', limitBytes: null, usedBytes: null });
  });

  it('null, abwesendes Feld und { total: null } ergeben alle unknown', () => {
    expect(parseQuota(null)).toMatchObject({ kind: 'unknown', limitBytes: null, usedBytes: null });
    expect(parseQuota(undefined)).toMatchObject({ kind: 'unknown', limitBytes: null, usedBytes: null });
    expect(parseQuota({ total: null })).toMatchObject({ kind: 'unknown', limitBytes: null, usedBytes: null });
  });

  it('"1 GB" und "100MB" ergeben limited mit geparsten Bytes', () => {
    expect(parseQuota('1 GB')).toMatchObject({ kind: 'limited', limitBytes: 1024 ** 3 });
    expect(parseQuota('100MB')).toMatchObject({ kind: 'limited', limitBytes: 100 * 1024 ** 2 });
  });

  it('numerischer String ergibt limited mit usedBytes wie geliefert', () => {
    const result = parseQuota({ quota: '1073741824', used: 42 });
    expect(result).toMatchObject({ kind: 'limited', limitBytes: 1073741824, usedBytes: 42 });
  });

  it('negative Werte ungleich -3 ergeben unknown', () => {
    expect(parseQuota(-5)).toMatchObject({ kind: 'unknown', limitBytes: null, usedBytes: null });
  });

  it('relative aus der Antwort wird ignoriert: relative: 99 bei quota: -3 bleibt unlimited ohne usagePercent', () => {
    const result = parseQuota({ quota: -3, relative: 99, used: 5 });
    expect(result.kind).toBe('unlimited');
    expect(result.usagePercent).toBeNull();
  });

  // Gap-Fix (Review): bislang gab es keine positive Zusicherung auf den Wert von usagePercent -
  // ein fehlendes "* 100" in der Formel hätte alle anderen Tests grün gelassen.
  it('usagePercent wird aus used/limitBytes berechnet (ca. 5,63 %)', () => {
    const result = parseQuota({ used: 60445602, quota: 1073741824 });
    expect(result.usagePercent).toBeCloseTo(5.63, 1);
  });

  it('limited ohne used -> usagePercent null', () => {
    const result = parseQuota({ quota: 1073741824 });
    expect(result.usagePercent).toBeNull();
  });
});

describe('formatPercent', () => {
  it('null -> "unbekannt"', () => {
    expect(formatPercent(null)).toBe('unbekannt');
  });

  it('5.63 -> "5,6 %" (eine Dezimalstelle, deutsches Komma)', () => {
    expect(formatPercent(5.63)).toBe('5,6 %');
  });

  it('100/3 -> "33,3 %" statt einer langen Dezimalkette', () => {
    expect(formatPercent(100 / 3)).toBe('33,3 %');
  });
});

describe('formatBytes', () => {
  it('null -> "unbekannt"', () => {
    expect(formatBytes(null)).toBe('unbekannt');
  });

  it('0 Bytes -> "0,0 GiB"', () => {
    expect(formatBytes(0)).toBe('0,0 GiB');
  });

  it('exakt 1 GiB -> "1,0 GiB"', () => {
    expect(formatBytes(1024 ** 3)).toBe('1,0 GiB');
  });

  it('1,5 GiB mit deutschem Komma -> "1,5 GiB"', () => {
    expect(formatBytes(1.5 * 1024 ** 3)).toBe('1,5 GiB');
  });
});

describe('QUOTA_PRESETS / formatQuotaForApi — DECISIONS "Kontingent-Eingabe"', () => {
  it('enthält genau die sechs Presets 1/2/5/10/20 GB und unbegrenzt', () => {
    expect(QUOTA_PRESETS.map((p) => p.id)).toEqual(['1gb', '2gb', '5gb', '10gb', '20gb', 'unbegrenzt']);
  });

  it('jedes begrenzte Preset benutzt die GiB-Basis 1073741824', () => {
    const erwartet = { '1gb': 1073741824, '2gb': 2147483648, '5gb': 5368709120, '10gb': 10737418240, '20gb': 21474836480 };
    for (const preset of QUOTA_PRESETS) {
      if (preset.id === 'unbegrenzt') continue;
      expect(preset.bytes).toBe(erwartet[preset.id]);
    }
  });

  it('formatQuotaForApi gibt für jedes begrenzte Preset die Bytes als String', () => {
    for (const preset of QUOTA_PRESETS) {
      if (preset.bytes === null) continue;
      expect(formatQuotaForApi(preset)).toBe(String(preset.bytes));
    }
  });

  it('formatQuotaForApi(unbegrenzt) -> "none"', () => {
    const unbegrenzt = QUOTA_PRESETS.find((p) => p.id === 'unbegrenzt');
    expect(formatQuotaForApi(unbegrenzt)).toBe('none');
  });
});

describe('quotaBalkenBreite', () => {
  it('liefert die Belegung als Prozent zwischen 0 und 100', () => {
    expect(quotaBalkenBreite(43.5)).toBe(43.5);
    expect(quotaBalkenBreite(0)).toBe(0);
  });

  it('kappt Werte über 100', () => {
    expect(quotaBalkenBreite(140)).toBe(100);
  });

  it('ohne Zahl kein Balken', () => {
    expect(quotaBalkenBreite(null)).toBeNull();
    expect(quotaBalkenBreite(undefined)).toBeNull();
  });
});
