import { createOcsClient } from './client.js';

// Connection probe used by connection.connect and connection.connectSaved (ARCHITECTURE §7):
// GET /cloud/users?limit=1. The client already classifies 401/403/429/notOcs/network/timeout/cert
// (REVIEW-NOTES 3) - this function passes that classification through unchanged, no second table.
// ...clientOptions forwards sleep/retryDelaysMs/timeoutMs when a caller (tests) supplies them -
// same injectable knobs createOcsClient already exposes, so retry tests don't wait in real time.
export async function checkConnection({ baseUrl, adminUser, appPassword, fetchImpl, ...clientOptions }) {
  const client = createOcsClient({ baseUrl, adminUser, appPassword, fetchImpl, ...clientOptions });
  const result = await client.request({ method: 'GET', path: '/cloud/users', query: { limit: 1 } });
  if (!result.ok) return result;
  // adminUserId is the typed login name (DECISIONS "Ermittlung des verbundenen Admin-Accounts"),
  // never derived from the response.
  return { ok: true, adminUserId: adminUser, client, httpStatus: result.httpStatus, versuche: result.versuche };
}
