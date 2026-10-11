// Real toast.js, real sweetalert2 (node: no DOM, popups resolve as dismissed), real jobHistorie/jobToast.
// Only window.api is mocked; a mocked toast module hid the missing Swal catch() before.
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Swal from 'sweetalert2';
import { startJob, unerwartetFooter } from '../src/renderer/jobRunner.js';
import { toastSuccess, toastError } from '../src/renderer/toast.js';
import { planActions } from '../src/shared/dryRun.js';
import { jobLaeuft, jobSummary, jobHistorie } from '../src/renderer/state.js';

const sara = {
  userid: 'sara', displayname: 'Sara', email: null, enabled: true, groups: [],
  quota: { kind: 'limited', limitBytes: 1073741824, usedBytes: 0, usagePercent: 0 },
};
const params = { value: '2147483648' };
const results = [{ userid: 'sara', aktion: 'user.setQuota', status: 'ok', grund: null, httpStatus: 200, ocsCode: null }];
// sweetalert2 is inert without a window (node); the mock drops window.api once startJob has read it.
function mockApi(impl) {
  const actionsRun = vi.fn(async (...args) => {
    delete globalThis.window;
    return impl(...args);
  });
  globalThis.window = { api: { actionsRun } };
  return actionsRun;
}
const summary = { ok: 1, fehler: 0, nichtAusgefuehrt: 0, teilweise: 0 };

describe('toast.js mit echtem sweetalert2', () => {
  it('toastSuccess und toastError werfen nicht (SweetAlert hat kein catch)', () => {
    expect(() => toastSuccess('x')).not.toThrow();
    expect(() => toastError('x')).not.toThrow();
  });
});

describe('startJob user.setQuota mit echtem Toast', () => {
  let fire;
  beforeEach(() => {
    fire = vi.spyOn(Swal, 'fire');
    jobLaeuft.value = false;
    jobSummary.value = null;
    jobHistorie.value = [];
  });

  it('Erfolg: kein Fehlerdialog, Historie gefüllt, Ergebnis zurück', async () => {
    const plan = planActions({ users: [sara], auswahl: ['sara'], action: 'user.setQuota', params, adminUserId: 'admin' });
    const actionsRun = mockApi(() => ({ ok: true, results, summary }));
    const ergebnis = await startJob(plan, 'user.setQuota', params);
    expect(ergebnis).toEqual(results);
    expect(actionsRun).toHaveBeenCalledTimes(1);
    expect(fire.mock.calls.filter(([o]) => o?.title === 'Fehler')).toHaveLength(0);
    expect(jobHistorie.value).toHaveLength(1);
    expect(jobHistorie.value[0].aktion).toBe('Kontingent setzen');
    expect(jobLaeuft.value).toBe(false);
  });

  it('echter Fehler im try: Dialog trägt name: message im Footer', async () => {
    const plan = planActions({ users: [sara], auswahl: ['sara'], action: 'user.setQuota', params, adminUserId: 'admin' });
    mockApi(() => { throw new TypeError('kaputt'); });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await startJob(plan, 'user.setQuota', params);
    const dialog = fire.mock.calls.map(([o]) => o).find((o) => o?.title === 'Fehler');
    expect(dialog.text).toBe('Unerwartete Antwort des Servers.');
    expect(dialog.footer).toContain('TypeError: kaputt');
  });

  it('unerwartetFooter escaped HTML', () => {
    expect(unerwartetFooter(new Error('<b>x</b>'))).not.toContain('<b>');
  });
});

describe('ein Klick startet genau einen Job', () => {
  it('zweiter startJob während der erste läuft ruft actions.run nicht erneut auf', async () => {
    const plan = planActions({ users: [sara], auswahl: ['sara'], action: 'user.setQuota', params, adminUserId: 'admin' });
    jobLaeuft.value = false;
    let release;
    const actionsRun = mockApi(() => new Promise((resolve) => { release = () => resolve({ ok: true, results, summary }); }));
    const erster = startJob(plan, 'user.setQuota', params);
    const zweiter = await startJob(plan, 'user.setQuota', params);
    expect(zweiter).toBeNull();
    release();
    await erster;
    expect(actionsRun).toHaveBeenCalledTimes(1);
  });

  it('Verdrahtung: ein row-action-Emit, ein Handler, ein Aufruf von runSingle', () => {
    const lies = (pfad) => readFileSync(new URL(pfad, import.meta.url), 'utf8');
    const zaehle = (text, muster) => (text.match(muster) ?? []).length;
    expect(zaehle(lies('../src/renderer/components/UserTable.vue'), /\$emit\('row-action'/g)).toBe(1);
    const users = lies('../src/renderer/views/UsersView.vue');
    expect(zaehle(users, /@row-action=/g)).toBe(1);
    expect(zaehle(users, /runSingle\(/g)).toBe(1);
    expect(zaehle(lies('../src/renderer/components/ActionBar.vue'), /startJob\(/g)).toBe(1);
  });
});
