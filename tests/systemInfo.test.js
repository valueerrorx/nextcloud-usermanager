import { describe, expect, it } from 'vitest';
import { formatBytes } from '../src/shared/quota.js';
import { formatUptime, isPublicIp, parseServerInfoPage, systemSnapshot, systemZeilen } from '../src/shared/systemInfo.js';

const PAGE = `<div class="server-info-wrapper">
  <h2><img alt=""> host.example</h2>
  <table>
    <tr><td class="info">Ubuntu 24.04</td></tr>
    <tr><td class="info">AMD EPYC</strong> (8 Threads)</td></tr>
    <tr><td class="info">16 GB</td></tr>
  </table>
  <span id="servertime"></span>
  <div class="disk-status">
    <div class="diskinfo-container">
      <span class="info">/boot</span><span class="info">ext4</span>
      <span class="info">1.00 GB</span><span class="info">0.50 GB</span>
    </div>
    <div class="diskinfo-container">
      <span class="info">/</span><span class="info">ext4</span>
      <span class="info">100.00 GB</span><span class="info">40.00 GB</span>
    </div>
  </div>
  <div class="network-infos">
    <h3>lo</h3>IPv4: <span class="info">127.0.0.1</span>
    <h3>ens18</h3>IPv4: <span class="info">192.168.1.20, 203.0.113.10</span>
    <div class="active-users-wrapper"></div>
  </div>
</div>`;

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

  it('ohne Systemseite -> null', () => {
    expect(parseServerInfoPage('<html>login</html>')).toBeNull();
    expect(parseServerInfoPage(null)).toBeNull();
  });
});

describe('formatUptime', () => {
  it('übersetzt die englische serverinfo-Form', () => {
    expect(formatUptime('1 days, 0 hours, 5 minutes, 9 seconds')).toBe('1 Tag, 0 Stunden, 5 Minuten');
    expect(formatUptime('3 hours, 4 minutes, 1 seconds')).toBe('3 Stunden, 4 Minuten');
    expect(formatUptime('Unknown')).toBeNull();
  });
});

describe('systemSnapshot und systemZeilen', () => {
  it('RAM kommt aus mem_total in KiB, fehlende Seite bleibt leer', () => {
    const system = systemSnapshot({
      info: { nextcloud: { system: { mem_total: 2048, cpunum: 2 } }, activeUsers: { last24hours: 0, last7days: 4 } },
      uptime: null,
      page: null,
    });
    expect(system.ramBytes).toBe(2048 * 1024);
    expect(system.prozessor).toBe('2 Threads');
    expect(system.aktiv24h).toBe(0);
    expect(systemZeilen(system).find((zeile) => zeile.label === 'Arbeitsspeicher').wert).toBe(formatBytes(2048 * 1024));
    expect(systemZeilen(system).find((zeile) => zeile.label === 'Hostname').wert).toBe('nicht verfügbar');
    expect(systemZeilen(system).find((zeile) => zeile.label === 'Festplatte').wert).toBe('nicht verfügbar');
    expect(systemZeilen(system).some((zeile) => zeile.label === 'Netzwerk')).toBe(false);
    expect(systemZeilen(system).every((zeile) => zeile.icon.startsWith('bi-'))).toBe(true);
    expect(systemZeilen(null).every((zeile) => zeile.wert === 'nicht verfügbar')).toBe(true);
  });
});
