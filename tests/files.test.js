// S08 A4: files.saveCsv — nutzergewählter Pfad, kein App-Verzeichnis-Default, kein Auto-Open.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  dialog: { showSaveDialog: vi.fn() },
}));

vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn(),
}));

import { dialog } from 'electron';
import { writeFile } from 'node:fs/promises';
import { saveCsv } from '../src/main/files.js';

describe('saveCsv', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Abbruch im Dialog (canceled: true) -> { ok: false, messageId: abgebrochen }', async () => {
    dialog.showSaveDialog.mockResolvedValue({ canceled: true, filePath: undefined });

    const result = await saveCsv({ vorschlag: 'ergebnis.csv', inhalt: 'userid;aktion\r\n' });

    expect(result).toEqual({ ok: false, messageId: 'abgebrochen', message: expect.any(String) });
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('Schreibfehler -> { ok: false, messageId: export_fehlgeschlagen }', async () => {
    dialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: '/home/user/ergebnis.csv' });
    writeFile.mockRejectedValue(new Error('disk full'));

    const result = await saveCsv({ vorschlag: 'ergebnis.csv', inhalt: 'userid;aktion\r\n' });

    expect(result).toEqual({ ok: false, messageId: 'export_fehlgeschlagen', message: expect.any(String) });
  });

  it('Erfolg -> { ok: true, path }, Inhalt wird unverändert geschrieben', async () => {
    dialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: '/home/user/ergebnis.csv' });
    writeFile.mockResolvedValue(undefined);

    const result = await saveCsv({ vorschlag: 'ergebnis.csv', inhalt: 'userid;aktion\r\nalice;user.enable\r\n' });

    expect(result).toEqual({ ok: true, path: '/home/user/ergebnis.csv' });
    expect(writeFile).toHaveBeenCalledWith('/home/user/ergebnis.csv', 'userid;aktion\r\nalice;user.enable\r\n', 'utf8');
  });

  it('ruft showSaveDialog nur mit dem vorgeschlagenen Dateinamen auf, kein Pfad im App-Verzeichnis', async () => {
    dialog.showSaveDialog.mockResolvedValue({ canceled: true, filePath: undefined });

    await saveCsv({ vorschlag: 'ergebnis.csv', inhalt: 'x' });

    expect(dialog.showSaveDialog).toHaveBeenCalledWith({ defaultPath: 'ergebnis.csv' });
  });
});
