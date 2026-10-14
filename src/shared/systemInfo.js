import { formatBytes } from './quota.js';

const NICHT_VERFUEGBAR = 'nicht verfügbar';

function decodeHtml(raw) {
  return raw
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function textOrNull(value) {
  return typeof value === 'string' && value !== '' ? value : null;
}

function fieldAfter(html, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escaped}\\s*<span class="info">([\\s\\S]*?)</span>`, 'i').exec(html);
  return match ? decodeHtml(match[1]) : '';
}

function teil(n, einer, mehrere) {
  return `${n} ${Number(n) === 1 ? einer : mehrere}`;
}

// serverinfo basicdata formats uptime in English ("1 days, 2 hours, 3 minutes, 4 seconds").
export function formatUptime(text) {
  if (typeof text !== 'string' || text === '' || text.toLowerCase() === 'unknown') return null;
  const mitTagen = /^(\d+) days, (\d+) hours, (\d+) minutes, (\d+) seconds$/.exec(text);
  if (mitTagen) {
    return `${teil(mitTagen[1], 'Tag', 'Tage')}, ${teil(mitTagen[2], 'Stunde', 'Stunden')}, ${teil(mitTagen[3], 'Minute', 'Minuten')}`;
  }
  const ohneTage = /^(\d+) hours, (\d+) minutes, (\d+) seconds$/.exec(text);
  if (ohneTage) {
    return `${teil(ohneTage[1], 'Stunde', 'Stunden')}, ${teil(ohneTage[2], 'Minute', 'Minuten')}`;
  }
  return text;
}

function countable(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

const LABEL_BYTES = { MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4, PB: 1024 ** 5, EB: 1024 ** 6 };

function labelToBytes(label) {
  const match = /^(\d+(?:\.\d+)?)\s*(MB|GB|TB|PB|EB)$/.exec(label);
  if (!match) return null;
  return Math.round(Number(match[1]) * LABEL_BYTES[match[2]]);
}

function parseDisks(page) {
  const start = page.indexOf('disk-status');
  if (start === -1) return [];
  const slice = page.slice(start);
  const end = slice.indexOf('network-infos');
  const diskHtml = end === -1 ? slice : slice.slice(0, end);
  const disks = [];
  for (const block of diskHtml.split('diskinfo-container').slice(1)) {
    const spans = [...block.matchAll(/<span class="info">([\s\S]*?)<\/span>/g)].map((match) => decodeHtml(match[1]));
    if (spans.length < 4) continue;
    const totalBytes = labelToBytes(spans[2]);
    const freeBytes = labelToBytes(spans[3]);
    if (totalBytes === null || freeBytes === null) continue;
    disks.push({ mount: spans[0], freeBytes, totalBytes });
  }
  return disks;
}

function waehlePlatte(disks) {
  return disks.find((disk) => disk.mount === '/') ?? disks.reduce((best, disk) => (
    !best || disk.totalBytes > best.totalBytes ? disk : best
  ), null);
}

export function isPublicIp(value) {
  if (typeof value !== 'string') return false;
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(value);
  if (!match) return false;
  const parts = match.slice(1).map(Number);
  if (parts.some((part) => part > 255)) return false;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 192 && b === 168) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 169 && b === 254) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  return true;
}

// Nextcloud 33 puts hostname, OS, CPU and interface addresses only in the admin system page.
export function parseServerInfoPage(html) {
  if (typeof html !== 'string') return null;
  const start = html.indexOf('server-info-wrapper');
  if (start === -1) return null;
  const page = html.slice(start);
  const heading = /<h2\b[^>]*>([\s\S]*?)<\/h2>/.exec(page);
  const hostname = textOrNull(heading ? decodeHtml(heading[1]) : '');

  const tableEnd = page.indexOf('id="servertime"');
  const table = tableEnd === -1 ? page : page.slice(0, tableEnd);
  const cells = [...table.matchAll(/<td class="info">([\s\S]*?)<\/td>/g)].map((match) => decodeHtml(match[1]));

  const netStart = page.indexOf('network-infos');
  const net = netStart === -1 ? '' : page.slice(netStart);
  const activeAt = net.indexOf('active-users');
  const interfacesHtml = activeAt === -1 ? net : net.slice(0, activeAt);
  const ips = [];
  for (const chunk of interfacesHtml.split('<h3>').slice(1)) {
    const name = decodeHtml(chunk.split('</h3>')[0] ?? '');
    if (name === '' || name === 'lo') continue;
    for (const ip of fieldAfter(chunk, 'IPv4:').split(',')) {
      const trimmed = ip.trim();
      if (isPublicIp(trimmed)) ips.push(trimmed);
    }
  }
  const platte = waehlePlatte(parseDisks(page));

  return {
    hostname,
    betriebssystem: textOrNull(cells[0] ?? ''),
    prozessor: textOrNull(cells[1] ?? ''),
    ip: ips[0] ?? null,
    diskMount: platte?.mount ?? null,
    diskFreeBytes: platte?.freeBytes ?? null,
    diskTotalBytes: platte?.totalBytes ?? null,
  };
}

// info: OCS /api/v1/info data. uptime: basicdata string. page: parseServerInfoPage result.
export function systemSnapshot({ info, uptime, page }) {
  const memKiB = info?.nextcloud?.system?.mem_total;
  const cpuCount = info?.nextcloud?.system?.cpunum;
  const ramBytes = typeof memKiB === 'number' && memKiB > 0 ? memKiB * 1024 : null;
  const prozessor = page?.prozessor
    ?? (typeof cpuCount === 'number' && cpuCount > 0 ? `${cpuCount} Threads` : null);
  const active = info?.activeUsers ?? {};
  return {
    hostname: page?.hostname ?? null,
    betriebssystem: page?.betriebssystem ?? null,
    prozessor,
    ramBytes,
    uptime: formatUptime(uptime),
    ip: page?.ip ?? null,
    diskMount: page?.diskMount ?? null,
    diskFreeBytes: page?.diskFreeBytes ?? null,
    diskTotalBytes: page?.diskTotalBytes ?? null,
    aktiv24h: countable(active.last24hours),
    aktiv7d: countable(active.last7days),
  };
}

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
