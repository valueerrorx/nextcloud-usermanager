// "Frei auf dem Server" tile value (S18). Pure; never derived from per-user quota.
import { formatBytes } from './quota.js';

const NICHT_VERFUEGBAR = 'nicht verfügbar';
const HINWEIS = 'serverinfo-App nicht erreichbar oder keine Berechtigung';

// result: server.freeSpace result or null (not loaded yet). Only finite numbers >= 0 count as a value.
export function freiplatzAnzeige(result) {
  const bytes = result?.freeBytes;
  if (result?.ok === true && typeof bytes === 'number' && Number.isFinite(bytes) && bytes >= 0) {
    return { wert: formatBytes(bytes), hinweis: null };
  }
  return { wert: NICHT_VERFUEGBAR, hinweis: HINWEIS };
}
