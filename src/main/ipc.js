import { ipcMain, app, net, shell, BrowserWindow } from 'electron';
import { normalizeBaseUrl } from '../shared/url.js';
import { MESSAGES } from '../shared/messages.js';
import { describeError } from '../shared/logSafe.js';
import { isAllowedExternalUrl } from '../shared/externalUrl.js';
import { checkConnection } from './ocs/connection.js';
import { fetchAllUsers } from './ocs/userList.js';
import { listGroups, createGroup, deleteGroup, renameGroup, getGroupMembers } from './ocs/groups.js';
import { getServerInfo, resolveExternalIp } from './ocs/serverInfo.js';
import { istGruppeLoeschbar } from '../shared/groups.js';
import { runJob } from './actions/pipeline.js';
import { session } from './session.js';
import * as credentials from './credentials.js';
import { createTlsController } from './tls.js';
import { saveCsv, openCsv } from './files.js';

// net.fetch is Electron's Chromium-backed fetch, never globalThis.fetch (ARCHITEKTURKORREKTUR):
// app.on('certificate-error') only fires for Chromium requests, so only net.fetch lets the user's
// certificate exception apply. Wrapped, not passed directly, to avoid a stray `this` binding.
const fetchImpl = (...args) => net.fetch(...args);

function broadcast(channel, payload) {
  const windows = BrowserWindow.getAllWindows ? BrowserWindow.getAllWindows() : [];
  for (const win of windows) {
    if (win.isDestroyed()) continue; // a destroyed webContents would throw on send
    try {
      win.webContents.send(channel, payload);
    } catch (error) {
      // Advisory push: a failed send must never abort the job that triggered it.
      console.error(`${channel} send failed:`, describeError(error));
    }
  }
}

// Exported so tests can drive the controller directly and so a future bootstrap step can call
// installCertificateVerifier(session.defaultSession, tlsController) (src/main/tls.js).
export const tlsController = createTlsController({
  sendPrompt: (payload) => broadcast('tls.onCertificatePrompt', payload),
});

function hostnameOf(baseUrl) {
  try {
    return new URL(baseUrl).hostname;
  } catch {
    return null;
  }
}

// The TLS controller is the authority on certificate outcomes (REVIEW-NOTES [S04]), not the
// fetch error string: a declined or timed-out certificate decision for this host must not be
// reported as a generic network failure just because net.fetch surfaces one of those.
function applyTlsOutcome(result, baseUrl) {
  if (result.ok || (result.kind !== 'network' && result.kind !== 'cert')) return result;
  const decision = tlsController.getDecision(hostnameOf(baseUrl));
  if (decision === 'abgelehnt') {
    return { ...result, kind: 'cert', messageId: 'zertifikat_abgelehnt', message: MESSAGES.zertifikat_abgelehnt };
  }
  if (decision === 'zeitueberschreitung') {
    return { ...result, kind: 'cert', messageId: 'zertifikat_nicht_vertraut', message: MESSAGES.zertifikat_nicht_vertraut };
  }
  return result;
}

function buildStatus() {
  return {
    connected: session.connected,
    baseUrl: session.baseUrl,
    adminUserId: session.adminUserId,
    secretStorage: session.secretStorage,
    certException: session.certException,
  };
}

// CRITICAL-Fix (REVIEW-NOTES [S08]/[S09a]/[S10], wiederholt in S13-Review): die Argumente wurden
// bisher in der Funktionssignatur destrukturiert - window.api.connect() ohne Argument liess das
// als TypeError über die IPC-Grenze platzen statt ein Result zu liefern (ARCHITECTURE §3 "Alle
// invoke-Kanäle werfen nie"). Destrukturierung jetzt innerhalb des try, wie files.js es schon
// immer richtig gemacht hat.
async function handleConnect(args) {
  let secrets = [];
  try {
    const { baseUrl, adminUser, appPassword, remember } = args;
    secrets = [appPassword];
    const normalized = normalizeBaseUrl(baseUrl);
    if (!normalized.ok) {
      return { ok: false, messageId: normalized.messageId, message: MESSAGES[normalized.messageId] };
    }

    const result = await checkConnection({ baseUrl: normalized.baseUrl, adminUser, appPassword, fetchImpl });
    // client already classified it (REVIEW-NOTES 3) - applyTlsOutcome only overrides a cert
    // misdiagnosis, no second error table.
    if (!result.ok) return applyTlsOutcome(result, normalized.baseUrl);

    // Session is written only now, on success - a failed attempt above leaves it untouched.
    session.setConnected({
      client: result.client,
      baseUrl: normalized.baseUrl,
      adminUser,
      adminUserId: result.adminUserId,
      appPassword,
      secretStorage: 'session',
    });

    if (!remember) {
      return { ok: true, status: buildStatus() };
    }

    const saved = await credentials.save({ baseUrl: normalized.baseUrl, adminUser, appPassword });
    session.setSecretStorage(saved.secretStorage);
    const response = { ok: true, status: buildStatus() };
    if (saved.messageId) {
      response.messageId = saved.messageId;
      response.message = MESSAGES[saved.messageId];
    }
    return response;
  } catch (error) {
    // Logged (never the password) - a swallowed exception made real failures invisible.
    console.error('connection.connect failed:', describeError(error, secrets));
    return { ok: false, messageId: 'unerwarteter_serverfehler', message: MESSAGES.unerwarteter_serverfehler };
  }
}

async function handleConnectSaved() {
  let secrets = [];
  try {
    return await connectSaved((saved) => { secrets = [saved.appPassword]; });
  } catch (error) {
    console.error('connection.connectSaved failed:', describeError(error, secrets));
    return { ok: false, messageId: 'unerwarteter_serverfehler', message: MESSAGES.unerwarteter_serverfehler };
  }
}

async function connectSaved(onLoaded) {
  const saved = await credentials.load();
  if (!saved) {
    return { ok: false, messageId: 'kein_gespeicherter_zugang', message: MESSAGES.kein_gespeicherter_zugang };
  }
  onLoaded(saved);

  const result = await checkConnection({ ...saved, fetchImpl });
  if (!result.ok) {
    const tlsResult = applyTlsOutcome(result, saved.baseUrl);
    if (tlsResult !== result) return tlsResult; // declined/timed-out certificate wins over the raw classification
    if (result.kind === 'auth') {
      // A rejected saved password is dropped so the next start makes no further failed attempt.
      const forgotten = await credentials.forget();
      if (!forgotten.ok) console.error('connection.connectSaved: rejected credential not removed:', forgotten.messageId);
      return { ...result, messageId: 'gespeichertes_passwort_abgelehnt', message: MESSAGES.gespeichertes_passwort_abgelehnt };
    }
    return result;
  }

  session.setConnected({
    client: result.client,
    baseUrl: saved.baseUrl,
    adminUser: saved.adminUser,
    adminUserId: result.adminUserId,
    appPassword: saved.appPassword,
    secretStorage: 'keyring',
  });
  return { ok: true, status: buildStatus() };
}

// Logout: drops the session and deletes the saved credential so auto-connect cannot reconnect.
async function handleLogout() {
  try {
    session.disconnect();
    return await credentials.forget();
  } catch (error) {
    console.error('connection.logout failed:', describeError(error));
    return { ok: false, messageId: 'unerwarteter_serverfehler', message: MESSAGES.unerwarteter_serverfehler };
  }
}

// Only allow-listed https URLs reach the OS browser (shell.openExternal).
async function handleOpenExternal(args) {
  try {
    const { url } = args;
    if (!isAllowedExternalUrl(url, session.baseUrl)) {
      return { ok: false, messageId: 'link_nicht_erlaubt', message: MESSAGES.link_nicht_erlaubt };
    }
    await shell.openExternal(url);
    return { ok: true };
  } catch (error) {
    console.error('app.openExternal failed:', describeError(error));
    return { ok: false, messageId: 'link_nicht_erlaubt', message: MESSAGES.link_nicht_erlaubt };
  }
}

// Never decrypts (credentials.peek) - the password must never be touched on a status poll.
async function handleStatus() {
  try {
    const meta = await credentials.peek();
    return {
      ...buildStatus(),
      hasSaved: meta !== null,
      savedBaseUrl: meta?.baseUrl ?? null,
      savedAdminUser: meta?.adminUser ?? null,
    };
  } catch (error) {
    console.error('connection.status failed:', describeError(error));
    return { ...buildStatus(), hasSaved: false, savedBaseUrl: null, savedAdminUser: null };
  }
}

// users.list has no connection -> nicht_verbunden, without ever touching ocs/userList.js (S05 A7).
async function handleUsersList() {
  if (!session.connected) {
    return { ok: false, messageId: 'nicht_verbunden', message: MESSAGES.nicht_verbunden };
  }
  try {
    const result = await fetchAllUsers({
      client: session.client,
      adminUserId: session.adminUserId,
      onProgress: (progress) => broadcast('users.onLoadProgress', progress),
    });
    if (!result.ok) return result;
    return { ok: true, users: result.users, mode: result.mode, uebersprungen: result.uebersprungen, fetchedAt: Date.now() };
  } catch (error) {
    console.error('users.list failed:', describeError(error));
    return { ok: false, messageId: 'unerwarteter_serverfehler', message: MESSAGES.unerwarteter_serverfehler };
  }
}

// actions.run never fails globally (ARCHITECTURE §3) - only "not connected" returns ok:false,
// every per-item error lives in results. The finally always runs, even if runJob throws, so a
// job's state never gets stuck at 'laufend' and its stop flag never leaks past the job's end.
// CRITICAL-Fix (REVIEW-NOTES [S13]): Destrukturierung jetzt innerhalb des try, siehe handleConnect.
async function handleActionsRun(args) {
  try {
    const { jobId, action, items, params } = args;
    if (!session.connected) {
      return { ok: false, messageId: 'nicht_verbunden', message: MESSAGES.nicht_verbunden };
    }
    session.setJobState(jobId, 'laufend');
    try {
      return await runJob({
        jobId,
        action,
        items,
        params,
        client: session.client,
        shouldStop: () => session.shouldStop(jobId),
        onProgress: (payload) => broadcast('actions.onProgress', payload),
      });
    } catch (error) {
      console.error('actions.run failed:', describeError(error));
      // operations.js#getSteps throws for an unknown action id - a programmer error inside main
      // (by design, see operations.js), but this invoke channel must still resolve, never reject
      // (ARCHITECTURE §3: "nie global fehlerhaft").
      return { ok: false, messageId: 'unbekannte_aktion', message: MESSAGES.unbekannte_aktion };
    } finally {
      session.setJobState(jobId, 'beendet');
      session.clearStopFlag(jobId);
    }
  } catch (error) {
    const detail = describeError(error, [session.appPassword]);
    console.error('actions.run failed:', detail);
    return {
      ok: false,
      messageId: 'unerwarteter_serverfehler',
      message: `${MESSAGES.unerwarteter_serverfehler} (${detail})`,
    };
  }
}

// groups.list / groups.create (S10 A3) - gleiche nicht_verbunden-Wächter wie users.list/actions.run,
// sonst dieselbe Schmalspur-Delegation an ocs/groups.js.
async function handleGroupsList() {
  if (!session.connected) {
    return { ok: false, messageId: 'nicht_verbunden', message: MESSAGES.nicht_verbunden };
  }
  try {
    const result = await listGroups(session.client);
    if (!result.ok) return result;
    return { ok: true, groups: result.data };
  } catch (error) {
    console.error('groups.list failed:', describeError(error));
    return { ok: false, messageId: 'unerwarteter_serverfehler', message: MESSAGES.unerwarteter_serverfehler };
  }
}

// groupid wird hier validiert, nicht nur im Renderer (S10-Review MINOR 2): ein schreibender
// Server-Call verlässt sich nicht auf die Clientprüfung, ein leerer/nur-Leerzeichen-Name geht
// sonst unvalidiert bis zu POST /cloud/groups durch.
// CRITICAL-Fix (REVIEW-NOTES [S13]): Destrukturierung jetzt innerhalb des try, siehe handleConnect.
async function handleGroupsCreate(args) {
  try {
    const { groupid } = args;
    if (!session.connected) {
      return { ok: false, messageId: 'nicht_verbunden', message: MESSAGES.nicht_verbunden };
    }
    if (!groupid || groupid.trim() === '') {
      return { ok: false, messageId: 'gruppe_anlegen_fehlgeschlagen', message: MESSAGES.gruppe_anlegen_fehlgeschlagen };
    }
    const result = await createGroup(session.client, groupid);
    if (!result.ok) return result;
    return { ok: true };
  } catch (error) {
    console.error('groups.create failed:', describeError(error));
    return { ok: false, messageId: 'unerwarteter_serverfehler', message: MESSAGES.unerwarteter_serverfehler };
  }
}

// groups.delete (S12 A3): gleiche nicht_verbunden- und Leerstring-Wächter wie groups.create.
// Der admin-Schutz prüft hier zusätzlich über die pure Funktion aus shared/groups.js (S12 "Die
// Lehre aus S10") - ein Schutz, der nur im Dialog säße, wäre von jedem anderen Aufrufer umgehbar,
// genau wie der Selbstschutz in dryRun.js.
// CRITICAL-Fix (REVIEW-NOTES [S13]): Destrukturierung jetzt innerhalb des try, siehe handleConnect.
async function handleGroupsDelete(args) {
  try {
    const { groupid } = args;
    if (!session.connected) {
      return { ok: false, messageId: 'nicht_verbunden', message: MESSAGES.nicht_verbunden };
    }
    if (!groupid || groupid.trim() === '') {
      return { ok: false, messageId: 'gruppenname_leer', message: MESSAGES.gruppenname_leer };
    }
    if (!istGruppeLoeschbar(groupid)) {
      return { ok: false, messageId: 'gruppe_admin_geschuetzt', message: MESSAGES.gruppe_admin_geschuetzt };
    }
    const result = await deleteGroup(session.client, groupid);
    if (!result.ok) return result;
    return { ok: true };
  } catch (error) {
    console.error('groups.delete failed:', describeError(error));
    return { ok: false, messageId: 'unerwarteter_serverfehler', message: MESSAGES.unerwarteter_serverfehler };
  }
}

// groups.rename changes the display name. The gid in the path stays the membership key.
async function handleGroupsRename(args) {
  try {
    const { groupid, displayname } = args;
    if (!session.connected) {
      return { ok: false, messageId: 'nicht_verbunden', message: MESSAGES.nicht_verbunden };
    }
    const name = typeof displayname === 'string' ? displayname.trim() : '';
    if (!groupid || groupid.trim() === '' || name === '') {
      return { ok: false, messageId: 'gruppenname_leer', message: MESSAGES.gruppenname_leer };
    }
    const result = await renameGroup(session.client, groupid, name);
    if (!result.ok) return result;
    return { ok: true };
  } catch (error) {
    console.error('groups.rename failed:', describeError(error));
    return { ok: false, messageId: 'unerwarteter_serverfehler', message: MESSAGES.unerwarteter_serverfehler };
  }
}

// groups.members (S18): fresh member list of one group; never throws (destructuring inside try).
async function handleGroupsMembers(args) {
  try {
    const { groupid } = args;
    if (!session.connected) {
      return { ok: false, messageId: 'nicht_verbunden', message: MESSAGES.nicht_verbunden };
    }
    if (!groupid || groupid.trim() === '') {
      return { ok: false, messageId: 'gruppenname_leer', message: MESSAGES.gruppenname_leer };
    }
    const result = await getGroupMembers(session.client, groupid);
    if (!result.ok) return result;
    return { ok: true, members: result.data };
  } catch (error) {
    console.error('groups.members failed:', describeError(error));
    return { ok: false, messageId: 'unerwarteter_serverfehler', message: MESSAGES.unerwarteter_serverfehler };
  }
}

// server.freeSpace (S18): freeBytes is number|null; a failure is a plain result, the renderer shows no popup.
async function handleServerFreeSpace() {
  try {
    if (!session.connected) {
      return { ok: false, messageId: 'nicht_verbunden', message: MESSAGES.nicht_verbunden };
    }
    const result = await getServerInfo(session.client);
    if (!result.ok) return result;
    const ip = await resolveExternalIp(session.baseUrl) ?? result.data.system.ip;
    return { ok: true, freeBytes: result.data.freeBytes, system: { ...result.data.system, ip } };
  } catch (error) {
    console.error('server.freeSpace failed:', describeError(error));
    return { ok: false, messageId: 'unerwarteter_serverfehler', message: MESSAGES.unerwarteter_serverfehler };
  }
}

// Never throws, always a defined zustand (ARCHITECTURE §5) - a double click on "Abbrechen" is
// harmless because 'bereits_beendet' and 'unbekannt' are both non-error outcomes.
// CRITICAL-Fix (REVIEW-NOTES [S13]): Destrukturierung jetzt innerhalb des try, siehe handleConnect
// - ein fehlendes Argument wird wie eine unbekannte jobId behandelt, nicht wie ein Fehler, weil
// §5 für diesen Kanal gar keinen Fehlerfall vorsieht.
function handleActionsStop(args) {
  try {
    const { jobId } = args;
    const zustand = session.getJobState(jobId);
    if (zustand === null) return { ok: true, zustand: 'unbekannt' };
    if (zustand === 'beendet') return { ok: true, zustand: 'bereits_beendet' };
    session.setStopFlag(jobId);
    return { ok: true, zustand: 'gestoppt' };
  } catch (error) {
    console.error('actions.stop failed:', describeError(error));
    return { ok: true, zustand: 'unbekannt' };
  }
}

// Only place with ipcMain.handle/on (ARCHITECTURE §2).
export function registerIpcHandlers() {
  ipcMain.handle('app.version', () => ({ ok: true, version: app.getVersion() }));
  ipcMain.handle('connection.connect', (event, args) => handleConnect(args));
  ipcMain.handle('connection.connectSaved', () => handleConnectSaved());
  ipcMain.handle('connection.status', () => handleStatus());
  ipcMain.handle('connection.logout', () => handleLogout());
  ipcMain.handle('app.openExternal', (event, args) => handleOpenExternal(args));
  ipcMain.handle('users.list', () => handleUsersList());
  ipcMain.handle('actions.run', (event, args) => handleActionsRun(args));
  ipcMain.handle('actions.stop', (event, args) => handleActionsStop(args));
  ipcMain.handle('groups.list', () => handleGroupsList());
  ipcMain.handle('groups.create', (event, args) => handleGroupsCreate(args));
  ipcMain.handle('groups.delete', (event, args) => handleGroupsDelete(args));
  ipcMain.handle('groups.rename', (event, args) => handleGroupsRename(args));
  ipcMain.handle('groups.members', (event, args) => handleGroupsMembers(args));
  ipcMain.handle('server.freeSpace', () => handleServerFreeSpace());
  ipcMain.handle('files.saveCsv', (event, args) => saveCsv(args));
  ipcMain.handle('files.openCsv', (event, args) => openCsv(args));
  ipcMain.handle('tls.respondCertificate', (event, args) => {
    const result = tlsController.respond(args);
    // Push the accepted exception into session so buildStatus() reports it (REVIEW-NOTES [S04]:
    // a state the UI must show has to land where the UI reads it) - it was living only in the
    // controller's closure before, so the permanent banner silently disappeared again.
    if (result.ok && !result.messageId) {
      session.setCertException(tlsController.getException());
    }
    return result;
  });
}
