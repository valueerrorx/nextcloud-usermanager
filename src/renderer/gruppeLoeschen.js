// Delete a group together with members that belong to no other group (S18). Fresh member list,
// plan, typed confirmation and execution all go through the existing user.delete path (jobRunner.js);
// the group itself is deleted only if every user deletion succeeded. Resolves true if the group is gone.
import Swal from 'sweetalert2';
import { planActions } from '../shared/dryRun.js';
import { planGruppeMitMitgliedern, entscheideGruppeLoeschen, gruppeNichtGeloeschtText } from '../shared/groups.js';
import { MESSAGES } from '../shared/messages.js';
import { confirmDelete, escapeHtml, listeHtml, startJob, VORSCHAU_DIALOG } from './jobRunner.js';
import { ladeUserliste } from './loaders.js';
import { connection, dryRunPlan, jobLaeuft, users } from './state.js';

function bleibtZeile(eintrag) {
  const grund = eintrag.andereGruppen.length > 0
    ? `andere Gruppen: ${eintrag.andereGruppen.map(escapeHtml).join(', ')}`
    : 'verbundener Admin';
  return `${escapeHtml(eintrag.userid)} (${grund})`;
}

function kontextHtml(gid, bleiben) {
  return `<p>Gruppe <strong>${escapeHtml(gid)}</strong> wird gelöscht.</p>
    <div class="vorschau"><div class="vorschau-titel">Bleibt <span class="vorschau-anzahl">${bleiben.length}</span></div>${listeHtml(bleiben, bleibtZeile)}</div>`;
}

async function fehler(text) {
  await Swal.fire({ title: 'Fehler', text, icon: 'error' });
}

async function loescheGruppeSelbst(gid) {
  const result = await window.api.groupsDelete({ groupid: gid });
  if (!result.ok) {
    await fehler(result.message ?? MESSAGES.gruppe_loeschen_fehlgeschlagen);
    return false;
  }
  return true;
}

export async function loescheGruppeMitMitgliedern(gid) {
  if (jobLaeuft.value) {
    await Swal.fire({ title: 'Auftrag läuft', text: MESSAGES.job_laeuft_bereits, icon: 'warning' });
    return false;
  }
  try {
    const mitglieder = await window.api.groupsMembers({ groupid: gid });
    if (!mitglieder.ok) {
      await fehler(mitglieder.message ?? MESSAGES.gruppenmitglieder_fehlgeschlagen);
      return false;
    }
    // Andere Gruppen der Mitglieder müssen aktuell sein, sonst würde ein Mehrfachmitglied gelöscht.
    const reload = await ladeUserliste();
    if (!reload.ok) {
      await fehler(MESSAGES.userliste_nicht_aktuell);
      return false;
    }
    const gruppenPlan = planGruppeMitMitgliedern({
      gid, mitglieder: mitglieder.members, users: users.value, adminUserId: connection.adminUserId,
    });
    if (gruppenPlan.unbekannt.length > 0) {
      await fehler(MESSAGES.userliste_nicht_aktuell);
      return false;
    }

    const { zuLoeschen, bleiben } = gruppenPlan;
    if (zuLoeschen.length === 0) {
      const ok = await Swal.fire({
        ...VORSCHAU_DIALOG,
        title: 'Gruppe löschen',
        html: `${kontextHtml(gid, bleiben)}<p>Es werden keine Benutzer gelöscht.</p>`,
        showCancelButton: true,
        confirmButtonText: 'Löschen',
        cancelButtonText: 'Abbrechen',
      });
      return ok.isConfirmed ? await loescheGruppeSelbst(gid) : false;
    }

    const plan = planActions({
      users: users.value, auswahl: zuLoeschen, action: 'user.delete', params: {}, adminUserId: connection.adminUserId,
    });
    if (!(await confirmDelete(plan, kontextHtml(gid, bleiben)))) return false;

    dryRunPlan.value = plan;
    const results = await startJob(plan, 'user.delete', {});
    const entscheidung = entscheideGruppeLoeschen({ erwartet: zuLoeschen.length, results });
    if (!entscheidung.loeschen) {
      await Swal.fire({ title: 'Gruppe nicht gelöscht', text: gruppeNichtGeloeschtText(entscheidung.nichtGeloescht), icon: 'warning' });
      return false;
    }
    return await loescheGruppeSelbst(gid);
  } catch (error) {
    console.error('Group delete with members failed:', error);
    await fehler(MESSAGES.unerwarteter_serverfehler);
    return false;
  }
}
