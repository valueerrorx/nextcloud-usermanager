// S08 A4: files.saveCsv — nutzergewählter Pfad, kein App-Verzeichnis-Default, kein Auto-Open.
// S10 A1: files.openCsv — Einfachauswahl, Filter auf .csv, UTF-8 lesen, ganzer Rumpf in try/catch.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  dialog: { showSaveDialog: vi.fn(), showOpenDialog: vi.fn() },
}));

vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn(),
  readFile: vi.fn(),
}));

import { dialog } from 'electron';
import { writeFile, readFile } from 'node:fs/promises';
import { saveCsv, openCsv } from '../src/main/files.js';

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

describe('openCsv', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Abbruch im Dialog (canceled: true) -> { ok: false, messageId: abgebrochen }', async () => {
    dialog.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });

    const result = await openCsv({ zweck: 'import' });

    expect(result).toEqual({ ok: false, messageId: 'abgebrochen', message: expect.any(String) });
    expect(readFile).not.toHaveBeenCalled();
  });

  it('Lesefehler -> { ok: false, messageId: datei_lesen_fehlgeschlagen }, wirft nicht', async () => {
    dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/home/user/import.csv'] });
    readFile.mockRejectedValue(new Error('EACCES'));

    const result = await openCsv({ zweck: 'import' });

    expect(result).toEqual({ ok: false, messageId: 'datei_lesen_fehlgeschlagen', message: expect.any(String) });
  });

  it('Erfolg -> { ok: true, path, text }, liest UTF-8', async () => {
    dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/home/user/import.csv'] });
    readFile.mockResolvedValue('Vorname;Nachname;Geburtsdatum\n');

    const result = await openCsv({ zweck: 'import' });

    expect(result).toEqual({ ok: true, path: '/home/user/import.csv', text: 'Vorname;Nachname;Geburtsdatum\n' });
    expect(readFile).toHaveBeenCalledWith('/home/user/import.csv', 'utf8');
  });

  it('Einfachauswahl mit .csv-Filter, kein Fehler im Dialog selbst wirft über die invoke-Grenze', async () => {
    dialog.showOpenDialog.mockRejectedValue(new Error('dialog kaputt'));

    const result = await openCsv({ zweck: 'import' });

    expect(result).toEqual({ ok: false, messageId: 'datei_lesen_fehlgeschlagen', message: expect.any(String) });
    expect(dialog.showOpenDialog).toHaveBeenCalledWith({
      title: 'CSV für den Import wählen',
      filters: [{ name: 'CSV', extensions: ['csv'] }],
      properties: ['openFile'],
    });
  });

  // MINOR-Fix S10-Review: `zweck` stand in Preload/IPC-Signatur, wurde hier aber nie gelesen -
  // jetzt bestimmt es den Dialogtitel statt ein toter Parameter in drei Schichten zu sein.
  it('zweck userliste setzt einen eigenen Dialogtitel', async () => {
    dialog.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });

    await openCsv({ zweck: 'userliste' });

    expect(dialog.showOpenDialog).toHaveBeenCalledWith({
      title: 'CSV mit Benutzerliste wählen',
      filters: [{ name: 'CSV', extensions: ['csv'] }],
      properties: ['openFile'],
    });
  });

  it('unbekannter/fehlender zweck fällt auf einen generischen Dialogtitel zurück', async () => {
    dialog.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });

    await openCsv({});

    expect(dialog.showOpenDialog).toHaveBeenCalledWith({
      title: 'CSV wählen',
      filters: [{ name: 'CSV', extensions: ['csv'] }],
      properties: ['openFile'],
    });
  });
});
