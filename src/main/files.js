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
