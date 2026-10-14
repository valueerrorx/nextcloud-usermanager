// serverinfo app endpoint (S18). Local error map; any failure is mapped to the fallback id.
import { lookup } from 'node:dns/promises';
import { isPublicIp, systemSnapshot, parseServerInfoPage } from './serverInfoPage.js';
import { mapOcsError } from './errors.js';

const SERVER_INFO_ERRORS = {};

// GET /apps/serverinfo/api/v1/info -> freespace, RAM, active users.
// Hostname, OS, CPU name and addresses are only on the admin system page (Nextcloud 33).
export async function getServerInfo(client) {
  const result = await client.request({
    method: 'GET',
    path: '/apps/serverinfo/api/v1/info',
    query: { skipApps: 'true', skipUpdate: 'true' },
  });
  if (!result.ok) return mapOcsError(result, SERVER_INFO_ERRORS, 'freiplatz_nicht_verfuegbar');
  const [basic, page] = await Promise.all([
    client.request({ method: 'GET', path: '/apps/serverinfo/api/v1/basicdata' }),
    client.fetchText('/index.php/settings/admin/serverinfo'),
  ]);
  const freespace = result.data?.nextcloud?.system?.freespace;
  return {
    ok: true,
    data: {
      freeBytes: Number.isFinite(freespace) ? freespace : null,
      system: systemSnapshot({
        info: result.data,
        uptime: basic.ok ? basic.data?.uptime : null,
        page: page.ok ? parseServerInfoPage(page.text) : null,
      }),
    },
    httpStatus: result.httpStatus,
    versuche: result.versuche,
  };
}

// Address of the connected host. Private interface addresses are not the external IP.
export async function resolveExternalIp(baseUrl, lookupImpl = lookup) {
  let hostname;
  try {
    hostname = new URL(baseUrl).hostname;
  } catch {
    return null;
  }
  if (isPublicIp(hostname)) return hostname;
  if (!hostname.includes('.')) return null;
  let timer;
  try {
    const looked = await Promise.race([
      lookupImpl(hostname, { family: 4 }),
      new Promise((resolve) => { timer = setTimeout(() => resolve(null), 2000); }),
    ]);
    return isPublicIp(looked?.address) ? looked.address : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
