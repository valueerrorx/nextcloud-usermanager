// Renderer-side connection flow (startup check, auto-connect, connect, logout). I/O module like
// loaders.js; every window.api call is inside try/catch so each attempt ends in a visible outcome.
import Swal from 'sweetalert2';
import { MESSAGES } from '../shared/messages.js';
import { hostLabel } from '../shared/connectionUi.js';
import {
  activeView, certException, connectError, connecting, connection, jobLaeuft, resetOnConnect, startupGeprueft,
} from './state.js';
import { toastError, toastSuccess } from './toast.js';

function applyStatus(status) {
  Object.assign(connection, status);
  certException.value = status.certException;
}

async function refreshStatus() {
  try {
    applyStatus(await window.api.connectionStatus());
  } catch (error) {
    console.error('Failed to load connection status:', error);
  }
}

// Result of connect/connectSaved -> { ok, message }. Success resets stale data, closes the popup
// (connection.connected) and toasts; the freshly mounted views then load their data.
async function applyConnectResult(result) {
  if (!result?.ok) {
    return { ok: false, message: result?.message ?? MESSAGES.unerwarteter_serverfehler };
  }
  resetOnConnect();
  if (result.messageId) {
    // e.g. no keyring: shown before connected flips, so no view change can swallow it (REVIEW-NOTES 7).
    try {
      await Swal.fire({ icon: 'warning', title: 'Hinweis', text: result.message });
    } catch (error) {
      console.error('Failed to show connect notice:', error);
    }
  }
  applyStatus(result.status);
  toastSuccess(`Verbunden mit ${hostLabel(result.status.baseUrl)}`);
  await refreshStatus(); // picks up hasSaved after a remember:true connect
  return { ok: true };
}

// Popup submit. Always resolves { ok, message }; the popup shows message on failure.
export async function connectWith(form) {
  connecting.value = true;
  try {
    const result = await window.api.connect({
      baseUrl: form.baseUrl,
      adminUser: form.adminUser,
      appPassword: form.appPassword,
      remember: form.remember,
    });
    return await applyConnectResult(result);
  } catch (error) {
    console.error('connect() failed:', error);
    return { ok: false, message: MESSAGES.unerwarteter_serverfehler };
  } finally {
    connecting.value = false;
  }
}

// One saved-credential attempt at startup; a rejection is never retried (brute-force lock),
// it opens the popup with the message instead.
async function autoConnect() {
  try {
    const outcome = await applyConnectResult(await window.api.connectSaved());
    if (!outcome.ok) connectError.value = outcome.message;
  } catch (error) {
    console.error('connectSaved() failed:', error);
    connectError.value = MESSAGES.unerwarteter_serverfehler;
  }
}

export async function startup() {
  connecting.value = true;
  try {
    await refreshStatus();
    if (!connection.connected && connection.hasSaved) await autoConnect();
  } finally {
    connecting.value = false;
    startupGeprueft.value = true;
  }
}

export async function logout() {
  if (jobLaeuft.value) return; // blocked while a job runs (the sidebar button is disabled too)
  let result;
  try {
    result = await window.api.logout();
  } catch (error) {
    console.error('logout() failed:', error);
    result = { ok: false, message: MESSAGES.unerwarteter_serverfehler };
  }
  // The session is gone in main either way, so the UI locks regardless of the delete result.
  resetOnConnect();
  activeView.value = 'dashboard';
  await refreshStatus();
  connection.connected = false;
  if (result.ok) {
    toastSuccess('Abgemeldet');
  } else {
    toastError(result.message ?? MESSAGES.zugang_loeschen_fehlgeschlagen);
  }
}
