import { formatBytes } from './quota.js';

const NICHT_VERFUEGBAR = 'nicht verfügbar';

function festplatte(system) {
  const frei = system?.diskFreeBytes;
  const gesamt = system?.diskTotalBytes;
  if (typeof frei !== 'number' || typeof gesamt !== 'number' || gesamt <= 0) return NICHT_VERFUEGBAR;
  const ort = typeof system.diskMount === 'string' && system.diskMount !== '' && system.diskMount !== '/'
    ? ` (${system.diskMount})`
    : '';
  return `${formatBytes(frei)} frei von ${formatBytes(gesamt)}${ort}`;
}

export function systemZeilen(system) {
  const text = (wert) => (typeof wert === 'string' && wert !== '' ? wert : NICHT_VERFUEGBAR);
  const zahl = (wert) => (typeof wert === 'number' ? String(wert) : NICHT_VERFUEGBAR);
  const ram = typeof system?.ramBytes === 'number' && system.ramBytes > 0
    ? formatBytes(system.ramBytes)
    : NICHT_VERFUEGBAR;
  const zeile = (label, wert, icon, ton) => ({ label, wert, icon, ton });
  return [
    zeile('Hostname', text(system?.hostname), 'bi-pc-display', 'host'),
    zeile('IP-Adresse', text(system?.ip), 'bi-globe2', 'ip'),
    zeile('Prozessor', text(system?.prozessor), 'bi-cpu', 'cpu'),
    zeile('Arbeitsspeicher', ram, 'bi-memory', 'ram'),
    zeile('Festplatte', festplatte(system), 'bi-device-hdd', 'disk'),
    zeile('Betriebssystem', text(system?.betriebssystem), 'bi-terminal', 'os'),
    zeile('Betriebszeit', text(system?.uptime), 'bi-clock-history', 'zeit'),
    zeile('Aktive Benutzer, 24 Stunden', zahl(system?.aktiv24h), 'bi-person-check', 'user'),
    zeile('Aktive Benutzer, 7 Tage', zahl(system?.aktiv7d), 'bi-calendar3', 'user'),
  ];
}
