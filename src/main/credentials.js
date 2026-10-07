import * as fs from 'node:fs/promises';
import path from 'node:path';
import { app, safeStorage } from 'electron';
import { MESSAGES } from '../shared/messages.js';

const FILENAME = 'credentials.json';

function filePath() {
  return path.join(app.getPath('userData'), FILENAME);
}

// safeStorage can silently fall back to plaintext (REVIEW-NOTES 7) - only a real OS keyring may
// persist. getSelectedStorageBackend() is Linux-only (electron.d.ts @platform linux); elsewhere
// isEncryptionAvailable() already reflects the OS keychain without a basic_text distinction.
export function probeStorage() {
  if (!safeStorage.isEncryptionAvailable()) return 'session';
  if (process.platform !== 'linux') return 'keyring';
  const backend = safeStorage.getSelectedStorageBackend();
  if (backend === 'gnome_libsecret' || backend.startsWith('kwallet')) return 'keyring';
  return 'session';
}

// Reads and parses the credentials file. Missing file -> null. Corrupt/wrong-shaped file -> like
// "no saved access", and the broken file is removed (A3: "Defekte ... Datei löschen").
async function readFile() {
  let raw;
  try {
    raw = await fs.readFile(filePath(), 'utf8');
  } catch {
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    await forget();
    return null;
  }
  if (typeof parsed?.baseUrl !== 'string' || typeof parsed?.adminUser !== 'string' || typeof parsed?.secret !== 'string') {
    await forget();
    return null;
  }
  return parsed;
}

// Persists only on explicit "remember" and only with a real keyring backend. On basic_text /
// unavailable encryption, nothing is written to disk - the caller reports secretStorage: 'session'.
export async function save({ baseUrl, adminUser, appPassword }) {
  const storage = probeStorage();
  if (storage !== 'keyring') {
    return { ok: true, secretStorage: 'session', messageId: 'kein_keyring_nur_sitzung' };
  }
  // encryptString can throw too (not just writeFile) - the session is already connected at this
  // point (A6: credentials are saved after a successful connect), so this must never reject.
  try {
    const secret = safeStorage.encryptString(appPassword).toString('base64');
    await fs.writeFile(filePath(), JSON.stringify({ baseUrl, adminUser, secret }), 'utf8');
  } catch {
    return { ok: true, secretStorage: 'session', messageId: 'secret_nicht_gespeichert' };
  }
  return { ok: true, secretStorage: 'keyring' };
}

// Decrypts the stored secret - the only place in the app allowed to do so (ARCHITECTURE §8).
export async function load() {
  const parsed = await readFile();
  if (!parsed) return null;
  let appPassword;
  try {
    appPassword = safeStorage.decryptString(Buffer.from(parsed.secret, 'base64'));
  } catch {
    await forget();
    return null;
  }
  return { baseUrl: parsed.baseUrl, adminUser: parsed.adminUser, appPassword };
}

// Metadata only, never decrypts - used by connection.status so prefilling the form never touches
// the secret (ARCHITECTURE §8: "Entschlüsseln passiert nur in connection.connectSaved").
export async function peek() {
  const parsed = await readFile();
  if (!parsed) return null;
  return { baseUrl: parsed.baseUrl, adminUser: parsed.adminUser };
}

export async function forget() {
  try {
    await fs.unlink(filePath());
    return { ok: true };
  } catch (err) {
    if (err?.code === 'ENOENT') return { ok: true };
    return { ok: false, messageId: 'zugang_loeschen_fehlgeschlagen', message: MESSAGES.zugang_loeschen_fehlgeschlagen };
  }
}
