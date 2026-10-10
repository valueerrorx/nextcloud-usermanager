// serverinfo app endpoint (S18). Local error map; any failure is mapped to the fallback id.
import { mapOcsError } from './errors.js';

const SERVER_INFO_ERRORS = {};

// GET /apps/serverinfo/api/v1/info -> data.nextcloud.system.freespace (bytes or null).
export async function getServerInfo(client) {
  const result = await client.request({
    method: 'GET',
    path: '/apps/serverinfo/api/v1/info',
    query: { skipApps: 'true', skipUpdate: 'true' },
  });
  if (!result.ok) return mapOcsError(result, SERVER_INFO_ERRORS, 'freiplatz_nicht_verfuegbar');
  const freespace = result.data?.nextcloud?.system?.freespace;
  return { ok: true, data: { freeBytes: Number.isFinite(freespace) ? freespace : null }, httpStatus: result.httpStatus, versuche: result.versuche };
}
