import { describe, expect, it } from 'vitest';
import { formatBytes } from '../src/shared/quota.js';
import { systemZeilen } from '../src/shared/systemInfo.js';

describe('systemZeilen', () => {
  it('RAM wird formatiert, fehlende Felder sind "nicht verfügbar"', () => {
    const system = { ramBytes: 2048 * 1024, prozessor: '2 Threads', aktiv24h: 0, aktiv7d: 4 };
    expect(systemZeilen(system).find((zeile) => zeile.label === 'Arbeitsspeicher').wert).toBe(formatBytes(2048 * 1024));
    expect(systemZeilen(system).find((zeile) => zeile.label === 'Hostname').wert).toBe('nicht verfügbar');
    expect(systemZeilen(system).find((zeile) => zeile.label === 'Festplatte').wert).toBe('nicht verfügbar');
    expect(systemZeilen(system).some((zeile) => zeile.label === 'Netzwerk')).toBe(false);
    expect(systemZeilen(system).every((zeile) => zeile.icon.startsWith('bi-'))).toBe(true);
    expect(systemZeilen(null).every((zeile) => zeile.wert === 'nicht verfügbar')).toBe(true);
  });
});
