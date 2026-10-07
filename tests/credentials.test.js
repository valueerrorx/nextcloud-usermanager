import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  unlink: vi.fn(),
}));

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/fake/userData') },
  safeStorage: {
    isEncryptionAvailable: vi.fn(),
    getSelectedStorageBackend: vi.fn(),
    encryptString: vi.fn(),
    decryptString: vi.fn(),
    setUsePlainTextEncryption: vi.fn(),
  },
}));

import { readFile, writeFile, unlink } from 'node:fs/promises';
import { safeStorage } from 'electron';
import { forget, load, peek, probeStorage, save } from '../src/main/credentials.js';

describe('probeStorage — safeStorage kann still auf Klartext zurückfallen (REVIEW-NOTES 7)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('isEncryptionAvailable() === false -> session', () => {
    safeStorage.isEncryptionAvailable.mockReturnValue(false);
    expect(probeStorage()).toBe('session');
  });

  it('Linux-Backend basic_text -> session', () => {
    safeStorage.isEncryptionAvailable.mockReturnValue(true);
    safeStorage.getSelectedStorageBackend.mockReturnValue('basic_text');
    expect(probeStorage()).toBe('session');
  });

  it('Linux-Backend gnome_libsecret -> keyring', () => {
    safeStorage.isEncryptionAvailable.mockReturnValue(true);
    safeStorage.getSelectedStorageBackend.mockReturnValue('gnome_libsecret');
    expect(probeStorage()).toBe('keyring');
  });

  it('Linux-Backend kwallet5 -> keyring', () => {
    safeStorage.isEncryptionAvailable.mockReturnValue(true);
    safeStorage.getSelectedStorageBackend.mockReturnValue('kwallet5');
    expect(probeStorage()).toBe('keyring');
  });

  it('Nicht-Linux (z.B. macOS) -> keyring ohne getSelectedStorageBackend-Unterscheidung', () => {
    const original = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    try {
      safeStorage.isEncryptionAvailable.mockReturnValue(true);
      expect(probeStorage()).toBe('keyring');
      expect(safeStorage.getSelectedStorageBackend).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(process, 'platform', original);
    }
  });
});

describe('save — basic_text persistiert nie, nie setUsePlainTextEncryption', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('basic_text: keine Datei geschrieben, secretStorage session, messageId kein_keyring_nur_sitzung', async () => {
    safeStorage.isEncryptionAvailable.mockReturnValue(true);
    safeStorage.getSelectedStorageBackend.mockReturnValue('basic_text');

    const result = await save({ baseUrl: 'https://host', adminUser: 'admin', appPassword: 'geheimpasswort' });

    expect(result).toEqual({ ok: true, secretStorage: 'session', messageId: 'kein_keyring_nur_sitzung' });
    expect(writeFile).not.toHaveBeenCalled();
    expect(safeStorage.setUsePlainTextEncryption).not.toHaveBeenCalled();
  });

  it('Keyring: Datei mit base64-secret, Klartextpasswort nicht in der Datei', async () => {
    safeStorage.isEncryptionAvailable.mockReturnValue(true);
    safeStorage.getSelectedStorageBackend.mockReturnValue('gnome_libsecret');
    safeStorage.encryptString.mockReturnValue(Buffer.from('cipherbytes'));
    writeFile.mockResolvedValue(undefined);

    const result = await save({ baseUrl: 'https://host', adminUser: 'admin', appPassword: 'geheimpasswort' });

    expect(result).toEqual({ ok: true, secretStorage: 'keyring' });
    expect(writeFile).toHaveBeenCalledTimes(1);
    const [writtenPath, writtenContent] = writeFile.mock.calls[0];
    expect(writtenPath).toContain('credentials.json');
    expect(writtenContent).not.toContain('geheimpasswort');
    const parsed = JSON.parse(writtenContent);
    expect(parsed).toEqual({ baseUrl: 'https://host', adminUser: 'admin', secret: Buffer.from('cipherbytes').toString('base64') });
  });

  it('Schreibfehler: keine Exception, secretStorage session, messageId secret_nicht_gespeichert', async () => {
    safeStorage.isEncryptionAvailable.mockReturnValue(true);
    safeStorage.getSelectedStorageBackend.mockReturnValue('gnome_libsecret');
    safeStorage.encryptString.mockReturnValue(Buffer.from('cipherbytes'));
    writeFile.mockRejectedValue(new Error('disk full'));

    const result = await save({ baseUrl: 'https://host', adminUser: 'admin', appPassword: 'geheimpasswort' });

    expect(result).toEqual({ ok: true, secretStorage: 'session', messageId: 'secret_nicht_gespeichert' });
  });
});

describe('load — defekte oder nicht entschlüsselbare Datei wie "kein gespeicherter Zugang"', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fehlende Datei -> null, keine Löschung versucht', async () => {
    readFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

    const result = await load();

    expect(result).toBeNull();
    expect(unlink).not.toHaveBeenCalled();
  });

  it('kaputtes JSON -> null, Datei wird gelöscht', async () => {
    readFile.mockResolvedValue('{not json');
    unlink.mockResolvedValue(undefined);

    const result = await load();

    expect(result).toBeNull();
    expect(unlink).toHaveBeenCalledTimes(1);
  });

  it('gültige Datei -> entschlüsseltes Passwort, baseUrl und adminUser', async () => {
    readFile.mockResolvedValue(JSON.stringify({ baseUrl: 'https://host', adminUser: 'admin', secret: Buffer.from('cipherbytes').toString('base64') }));
    safeStorage.decryptString.mockReturnValue('geheimpasswort');

    const result = await load();

    expect(result).toEqual({ baseUrl: 'https://host', adminUser: 'admin', appPassword: 'geheimpasswort' });
  });

  it('decryptString wirft -> null, Datei wird gelöscht', async () => {
    readFile.mockResolvedValue(JSON.stringify({ baseUrl: 'https://host', adminUser: 'admin', secret: Buffer.from('cipherbytes').toString('base64') }));
    safeStorage.decryptString.mockImplementation(() => {
      throw new Error('decryption failed');
    });
    unlink.mockResolvedValue(undefined);

    const result = await load();

    expect(result).toBeNull();
    expect(unlink).toHaveBeenCalledTimes(1);
  });

  it('gültiges JSON mit falscher Form (secret fehlt) -> null, Datei wird gelöscht', async () => {
    readFile.mockResolvedValue(JSON.stringify({ baseUrl: 'https://host', adminUser: 'admin' }));
    unlink.mockResolvedValue(undefined);

    const result = await load();

    expect(result).toBeNull();
    expect(unlink).toHaveBeenCalledTimes(1);
  });
});

describe('peek — niemals entschlüsseln, nur Metadaten für connection.status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('gültige Datei -> baseUrl und adminUser ohne decryptString-Aufruf', async () => {
    readFile.mockResolvedValue(JSON.stringify({ baseUrl: 'https://host', adminUser: 'admin', secret: 'c2VjcmV0' }));

    const result = await peek();

    expect(result).toEqual({ baseUrl: 'https://host', adminUser: 'admin' });
    expect(safeStorage.decryptString).not.toHaveBeenCalled();
  });

  it('fehlende Datei -> null', async () => {
    readFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

    expect(await peek()).toBeNull();
  });
});

describe('forget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('löscht die Datei', async () => {
    unlink.mockResolvedValue(undefined);
    expect(await forget()).toEqual({ ok: true });
  });

  it('Datei schon weg (ENOENT) ist kein Fehler', async () => {
    unlink.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    expect(await forget()).toEqual({ ok: true });
  });

  it('anderer Schreibfehler -> ok: false mit messageId/message (S3-Result-Vertrag)', async () => {
    unlink.mockRejectedValue(new Error('EACCES'));
    expect(await forget()).toEqual({
      ok: false,
      messageId: 'zugang_loeschen_fehlgeschlagen',
      message: 'Der gespeicherte Zugang konnte nicht gelöscht werden.',
    });
  });
});
