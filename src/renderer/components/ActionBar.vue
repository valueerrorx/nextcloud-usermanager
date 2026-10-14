<script setup>
// Batch bar (S17) and the one execution path for row actions: parameter prompt, Dry-Run, confirmation
// (swal2), actions.run. Rechnet nicht selbst: Dry-Run aus shared/dryRun.js, Begründungstexte aus
// shared/jobReport.js, Helfer aus shared/userRows.js (ARCHITECTURE §4.1, REVIEW-NOTES [S06]).
import Swal from 'sweetalert2';
import { planActions, planToItems, removeJobParams } from '../../shared/dryRun.js';
import { gruppenDerUser, gruppenOptionen } from '../../shared/filters.js';
import { gruppenAnzeigename, gruppenKurztext } from '../../shared/groups.js';
import { QUOTA_PRESETS, formatQuotaForApi, findQuotaPreset } from '../../shared/quota.js';
import {
  ACTION_LABELS, BATCH_ACTIONS, batchBarVisible, buildUpdateParams, optionenObjekt,
} from '../../shared/userRows.js';
import { MESSAGES } from '../../shared/messages.js';
import { describeError } from '../../shared/logSafe.js';
import { toastError } from '../toast.js';
import { escapeHtml, groupNameHtml, vorschauHtml, confirmDelete, startJob, VORSCHAU_DIALOG } from '../jobRunner.js';
import { dryRunPlan, groups, jobLaeuft } from '../state.js';

const props = defineProps({
  users: { type: Array, required: true },
  auswahl: { type: Set, required: true },
  adminUserId: { type: String, default: null },
  gesperrt: { type: Boolean, default: false },
});
const emit = defineEmits(['finished', 'clear']);

// Asks for the action's parameters; resolves null when the dialog is cancelled.
async function frageParams(action, user, userids) {
  switch (action) {
    case 'user.addToGroup': {
      const result = await Swal.fire({
        title: ACTION_LABELS[action],
        input: 'select',
        inputOptions: optionenObjekt(gruppenOptionen(props.users).map((id) => ({
          value: id,
          label: gruppenKurztext(groups.value, id),
        }))),
        inputPlaceholder: 'Gruppe wählen',
        inputValidator: (wert) => (wert ? undefined : 'Bitte eine Gruppe wählen'),
        showCancelButton: true,
        confirmButtonText: 'Vorschau',
        cancelButtonText: 'Abbrechen',
      });
      return result.isConfirmed ? { groupid: result.value } : null;
    }
    case 'user.removeFromGroup': {
      const ids = gruppenDerUser(props.users, userids);
      if (ids.length === 0) {
        const text = userids.length === 1
          ? 'Dieser Benutzer ist in keiner Gruppe.'
          : 'Keiner der ausgewählten Benutzer ist in einer Gruppe.';
        await Swal.fire({ title: ACTION_LABELS[action], text, icon: 'info' });
        return null;
      }
      const result = await Swal.fire({
        title: ACTION_LABELS[action],
        html: `<div class="gruppen-auswahl">${ids.map((id) => `
          <label class="form-check gruppen-eintrag">
            <input type="checkbox" class="form-check-input gruppen-entfernen" value="${escapeHtml(id)}">
            ${groupNameHtml(gruppenAnzeigename(groups.value, id), id)}
          </label>`).join('')}</div>`,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Vorschau',
        cancelButtonText: 'Abbrechen',
        preConfirm: () => {
          const gewaehlt = [...Swal.getHtmlContainer().querySelectorAll('.gruppen-entfernen:checked')]
            .map((el) => el.value);
          if (gewaehlt.length === 0) {
            Swal.showValidationMessage('Bitte mindestens eine Gruppe wählen');
            return false;
          }
          return gewaehlt;
        },
      });
      return result.isConfirmed ? { groupids: result.value } : null;
    }
    case 'user.setQuota': {
      const result = await Swal.fire({
        title: ACTION_LABELS[action],
        input: 'select',
        inputOptions: optionenObjekt(QUOTA_PRESETS.map((p) => ({ value: p.id, label: p.label }))),
        inputValue: QUOTA_PRESETS[0].id,
        showCancelButton: true,
        confirmButtonText: 'Vorschau',
        cancelButtonText: 'Abbrechen',
      });
      return result.isConfirmed ? { value: formatQuotaForApi(findQuotaPreset(result.value)) } : null;
    }
    case 'user.setPassword': {
      const result = await Swal.fire({
        title: ACTION_LABELS[action],
        input: 'password',
        inputPlaceholder: 'Neues Passwort',
        inputAttributes: { autocomplete: 'new-password' },
        inputValidator: (wert) => (wert.trim() ? undefined : 'Bitte ein Passwort eingeben'),
        showCancelButton: true,
        confirmButtonText: 'Vorschau',
        cancelButtonText: 'Abbrechen',
      });
      return result.isConfirmed ? { value: result.value.trim() } : null;
    }
    case 'user.update': {
      const result = await Swal.fire({
        title: ACTION_LABELS[action],
        html: `<p>Leere Felder bleiben unverändert.</p>
          <input id="edit-displayname" class="swal2-input" placeholder="Anzeigename" value="${escapeHtml(user?.displayname)}">
          <input id="edit-email" class="swal2-input" placeholder="E-Mail" value="${escapeHtml(user?.email)}">`,
        focusConfirm: false,
        preConfirm: () => {
          const felder = buildUpdateParams({
            displayname: document.getElementById('edit-displayname').value,
            email: document.getElementById('edit-email').value,
          });
          if (Object.keys(felder).length === 0) {
            Swal.showValidationMessage('Bitte Anzeigename oder E-Mail angeben');
            return false;
          }
          return felder;
        },
        showCancelButton: true,
        confirmButtonText: 'Vorschau',
        cancelButtonText: 'Abbrechen',
      });
      return result.isConfirmed ? result.value : null;
    }
    default:
      return {};
  }
}

async function confirmNormal(plan) {
  const result = await Swal.fire({
    ...VORSCHAU_DIALOG,
    title: 'Vorschau',
    html: `${vorschauHtml(plan)}<p>${plan.anzahl} Benutzer werden geändert. Fortfahren?</p>`,
    showCancelButton: true,
    confirmButtonText: 'Ja',
    cancelButtonText: 'Nein',
  });
  return result.isConfirmed;
}

// Dry-Run for exactly the given userids, then confirmation and execution (single and batch alike).
async function onVorschau(action, paramsObj, userids) {
  const plan = planActions({
    users: props.users,
    auswahl: userids,
    action,
    params: paramsObj,
    adminUserId: props.adminUserId,
    gruppen: groups.value,
  });

  if (plan.anzahl === 0) {
    await Swal.fire({
      ...VORSCHAU_DIALOG,
      title: 'Vorschau',
      html: `${vorschauHtml(plan)}<p>${MESSAGES.keine_aenderung_noetig}</p>`,
      confirmButtonText: 'OK',
    });
    return;
  }

  const bestaetigt = action === 'user.delete' ? await confirmDelete(plan) : await confirmNormal(plan);
  if (!bestaetigt) return;

  dryRunPlan.value = plan;
  const jobParams = action === 'user.removeFromGroup' && paramsObj.groupids
    ? removeJobParams(props.users, planToItems(plan), paramsObj.groupids)
    : paramsObj;
  try {
    await startJob(plan, action, jobParams, 'users');
  } finally {
    // Die Daten sind jetzt veraltet (B4) - der Elternteil lädt die Userliste neu.
    emit('finished');
  }
}

function blockiert() {
  return jobLaeuft.value || props.gesperrt;
}

// Every dialog and the run itself are wrapped so a failure ends in a toast, never a stuck UI.
async function fuehreAus(action, user, userids) {
  if (blockiert()) return;
  try {
    const paramsObj = await frageParams(action, user, userids);
    if (paramsObj === null) return;
    await onVorschau(action, paramsObj, userids);
  } catch (error) {
    console.error('Action failed:', error);
    toastError(`${MESSAGES.unerwarteter_serverfehler} (${describeError(error)})`);
  }
}

// Row button: the same path with a selection of exactly this user.
async function runSingle(userid, action) {
  await fuehreAus(action, props.users.find((u) => u.userid === userid), [userid]);
}

function runBatch(action) {
  return fuehreAus(action, null, [...props.auswahl]);
}

defineExpose({ runSingle });
</script>

<template>
  <div
    v-if="batchBarVisible(auswahl.size)"
    class="content-card mb-2"
  >
    <div class="content-card-body py-2 px-3 d-flex flex-wrap align-items-center gap-2">
      <span><strong>{{ auswahl.size }}</strong> ausgewählt</span>
      <button
        v-for="aktion in BATCH_ACTIONS"
        :key="aktion.id"
        type="button"
        class="btn btn-sm"
        :class="`btn-outline-${aktion.variant}`"
        :disabled="jobLaeuft || gesperrt"
        @click="runBatch(aktion.id)"
      >
        <i
          class="bi"
          :class="aktion.icon"
          aria-hidden="true"
        />
        {{ aktion.label }}
      </button>
      <button
        type="button"
        class="btn btn-link btn-sm text-secondary ms-auto"
        @click="emit('clear')"
      >
        Auswahl aufheben
      </button>
    </div>
  </div>
</template>
