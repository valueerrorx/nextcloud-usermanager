import * as fs from 'node:fs/promises';
import { dialog } from 'electron';
import { MESSAGES } from '../shared/messages.js';

// Only a user-chosen path (DECISIONS "Passwort-Export auf Platte" / "Batch-Löschen" CSV export):
// defaultPath is only the suggested filename, never joined with an app directory. No auto-open.
// The whole body is guarded (ARCHITECTURE §3: invoke channels never throw) - a rejecting dialog
// or a write failure must still resolve to a Result, never reject the invoke call.
export async function saveCsv(args) {
  try {
    const { vorschlag, inhalt } = args;
    const { canceled, filePath } = await dialog.showSaveDialog({ defaultPath: vorschlag });
    if (canceled || !filePath) {
      return { ok: false, messageId: 'abgebrochen', message: MESSAGES.abgebrochen };
    }
    await fs.writeFile(filePath, inhalt, 'utf8');
    return { ok: true, path: filePath };
  } catch {
    return { ok: false, messageId: 'export_fehlgeschlagen', message: MESSAGES.export_fehlgeschlagen };
  }
}

// Dialogtitel je Zweck (S10-Review MINOR 6: `zweck` war in Preload/IPC-Signatur, aber hier toter
// Parameter). Unbekannter/fehlender Zweck fällt auf einen generischen Titel zurück.
const TITEL_JE_ZWECK = {
  import: 'CSV für den Import wählen',
  userliste: 'CSV mit Benutzerliste wählen',
};

// files.openCsv (S10 A1): Dateiauswahl für CSV-Import und Username-Liste. Einfachauswahl, Filter
// auf .csv. Ganzer Rumpf in einem try/catch (ARCHITECTURE §3: invoke-Kanäle werfen nie) - das war
// bei saveCsv ein CRITICAL in S08.
export async function openCsv(args = {}) {
  try {
    const { zweck } = args;
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: TITEL_JE_ZWECK[zweck] ?? 'CSV wählen',
      filters: [{ name: 'CSV', extensions: ['csv'] }],
      properties: ['openFile'],
    });
    if (canceled || !filePaths || filePaths.length === 0) {
      return { ok: false, messageId: 'abgebrochen', message: MESSAGES.abgebrochen };
    }
    const text = await fs.readFile(filePaths[0], 'utf8');
    return { ok: true, path: filePaths[0], text };
  } catch {
    return { ok: false, messageId: 'datei_lesen_fehlgeschlagen', message: MESSAGES.datei_lesen_fehlgeschlagen };
  }
}
