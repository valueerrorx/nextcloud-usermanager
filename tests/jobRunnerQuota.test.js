// Quota change that succeeds on the server must end as success in the UI (no error dialog, no error toast).
import { beforeEach, describe, expect, it, vi } from 'vitest';

const swalFire = vi.fn();
vi.mock('sweetalert2', () => ({ default: { fire: (...a) => swalFire(...a), getConfirmButton: vi.fn(), getInput: vi.fn() } }));
const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('../src/renderer/toast.js', () => ({ toastError: (...a) => toastError(...a), toastSuccess: (...a) => toastSuccess(...a) }));

const { startJob } = await import('../src/renderer/jobRunner.js');
const { planActions } = await import('../src/shared/dryRun.js');
const { jobLaeuft, jobSummary, jobHistorie } = await import('../src/renderer/state.js');

const sara = {
  userid: 'sara', displayname: 'Sara', email: null, enabled: true, groups: [],
  quota: { kind: 'limited', limitBytes: 1073741824, usedBytes: 0, usagePercent: 0 },
};

describe('startJob — user.setQuota Erfolgspfad', () => {
  beforeEach(() => {
    swalFire.mockReset();
    toastSuccess.mockReset();
    toastError.mockReset();
    jobLaeuft.value = false;
    jobSummary.value = null;
    jobHistorie.value = [];
  });

  it('actions.run ok -> Erfolgs-Toast, kein Fehlerdialog, Ergebnis zurückgegeben', async () => {
    const params = { value: '2147483648' };
    const plan = planActions({ users: [sara], auswahl: ['sara'], action: 'user.setQuota', params, adminUserId: 'admin' });
    expect(plan.anzahl).toBe(1);
    const results = [{ userid: 'sara', aktion: 'user.setQuota', status: 'ok', grund: null, httpStatus: 200, ocsCode: null }];
    const actionsRun = vi.fn(async () => ({ ok: true, results, summary: { ok: 1, fehler: 0, nichtAusgefuehrt: 0, teilweise: 0 } }));
    globalThis.window = { api: { actionsRun } };

    const ergebnis = await startJob(plan, 'user.setQuota', params);

    expect(ergebnis).toEqual(results);
    expect(actionsRun).toHaveBeenCalledWith(expect.objectContaining({ action: 'user.setQuota', items: ['sara'], params }));
    expect(swalFire).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
    expect(toastSuccess).toHaveBeenCalledWith('Kontingent setzen: 1 OK');
    expect(jobLaeuft.value).toBe(false);
  });
});
