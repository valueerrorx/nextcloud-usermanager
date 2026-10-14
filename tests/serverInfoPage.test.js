import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { formatUptime, isPublicIp, parseServerInfoPage, systemSnapshot } from '../src/main/ocs/serverInfoPage.js';

const PAGE = readFileSync(new URL('./fixtures/serverinfo-page.html', import.meta.url), 'utf8');

describe('parseServerInfoPage', () => {
  it('liest Hostname, OS, Prozessor, nur die öffentliche IP und die Root-Platte', () => {
    expect(parseServerInfoPage(PAGE)).toEqual({
      hostname: 'host.example',
      betriebssystem: 'Ubuntu 24.04',
      prozessor: 'AMD EPYC (8 Threads)',
      ip: '203.0.113.10',
      diskMount: '/',
      diskFreeBytes: Math.round(40 * 1024 ** 3),
      diskTotalBytes: Math.round(100 * 1024 ** 3),
    });
  });

  it('private und Loopback-Adressen sind nicht extern', () => {
    expect(isPublicIp('192.168.1.20')).toBe(false);
    expect(isPublicIp('10.0.0.8')).toBe(false);
    expect(isPublicIp('127.0.0.1')).toBe(false);
    expect(isPublicIp('203.0.113.10')).toBe(true);
  });

  it.each([
    ['leerer String', ''],
    ['null', null],
    ['Zahl', 42],
    ['undefined', undefined],
    ['Objekt', {}],
    ['HTML ohne Systemseite', '<html></html>'],
  ])('%s -> null, ohne Wurf', (_name, input) => {
    expect(() => parseServerInfoPage(input)).not.toThrow();
    expect(parseServerInfoPage(input)).toBeNull();
  });

  it('nur der Marker server-info-wrapper -> genau 7 Schlüssel, alle null', () => {
    expect(parseServerInfoPage('server-info-wrapper')).toEqual({
      betriebssystem: null, diskFreeBytes: null, diskMount: null, diskTotalBytes: null,
      hostname: null, ip: null, prozessor: null,
    });
  });

  it('halbe Fixture -> kein Wurf, genau 7 Schlüssel, Werte String/Zahl/null', () => {
    const half = PAGE.slice(0, Math.floor(PAGE.length / 2));
    expect(() => parseServerInfoPage(half)).not.toThrow();
    const result = parseServerInfoPage(half);
    expect(Object.keys(result).sort()).toEqual(['betriebssystem', 'diskFreeBytes', 'diskMount', 'diskTotalBytes', 'hostname', 'ip', 'prozessor']);
    for (const value of Object.values(result)) {
      expect([null, 'string', 'number']).toContain(value === null ? null : typeof value);
    }
  });
});

describe('formatUptime', () => {
  it('übersetzt die englische serverinfo-Form', () => {
    expect(formatUptime('1 days, 0 hours, 5 minutes, 9 seconds')).toBe('1 Tag, 0 Stunden, 5 Minuten');
    expect(formatUptime('3 hours, 4 minutes, 1 seconds')).toBe('3 Stunden, 4 Minuten');
    expect(formatUptime('Unknown')).toBeNull();
  });
});

describe('systemSnapshot', () => {
  it('RAM kommt aus mem_total in KiB, fehlende Seite bleibt leer', () => {
    const system = systemSnapshot({
      info: { nextcloud: { system: { mem_total: 2048, cpunum: 2 } }, activeUsers: { last24hours: 0, last7days: 4 } },
      uptime: null,
      page: null,
    });
    expect(system.ramBytes).toBe(2048 * 1024);
    expect(system.prozessor).toBe('2 Threads');
    expect(system.aktiv24h).toBe(0);
  });
});
