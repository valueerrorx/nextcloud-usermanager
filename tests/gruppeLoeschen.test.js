// S18 review: group delete with members and the central job guard (mocked window.api, Swal, loaders).
import { beforeEach, describe, expect, it, vi } from 'vitest';

const swalFire = vi.fn();
vi.mock('sweetalert2', () => ({ default: { fire: (...a) => swalFire(...a), getConfirmButton: vi.fn(), getInput: vi.fn() } }));
const ladeUserliste = vi.fn();
vi.mock('../src/renderer/loaders.js', () => ({ ladeUserliste: (...a) => ladeUserliste(...a) }));
vi.mock('../src/renderer/toast.js', () => ({ toastError: vi.fn(), toastSuccess: vi.fn() }));

const { loescheGruppeMitMitgliedern } = await import('../src/renderer/gruppeLoeschen.js');
const { startJob } = await import('../src/renderer/jobRunner.js');
const { users, jobLaeuft, connection } = await import('../src/renderer/state.js');

const user = (userid, groups) => ({ userid, groups, enabled: true });
const ok = (userid) => ({ userid, status: 'ok' });
let api;
const meldungen = () => swalFire.mock.calls.map((c) => c[0].text).filter(Boolean);

beforeEach(() => {
  swalFire.mockReset();
  swalFire.mockResolvedValue({ isConfirmed: true });
  ladeUserliste.mockReset();
  ladeUserliste.mockImplementation(async () => {
    users.value = [user('a', ['g']), user('b', ['g'])];
    return { ok: true };
  });
  jobLaeuft.value = false;
  connection.adminUserId = 'admin';
  users.value = [user('a', ['g']), user('b', ['g'])];
  api = {
    groupsMembers: vi.fn(async () => ({ ok: true, members: ['a', 'b'] })),
    groupsDelete: vi.fn(async () => ({ ok: true })),
    actionsRun: vi.fn(async () => ({ ok: true, results: [ok('a'), ok('b')], summary: { ok: 2, fehler: 0 } })),
  };
  globalThis.window = { api };
});

describe('loescheGruppeMitMitgliedern', () => {
  it('laufender Job -> abgelehnt, kein Servercall', async () => {
    jobLaeuft.value = true;
    expect(await loescheGruppeMitMitgliedern('g')).toBe(false);
    expect(api.groupsMembers).not.toHaveBeenCalled();
    expect(api.actionsRun).not.toHaveBeenCalled();
  });

  it('startJob lehnt zweiten Start ab, actionsRun nicht aufgerufen', async () => {
    jobLaeuft.value = true;
    expect(await startJob({ anzahl: 1, auszufuehren: [] }, 'user.delete', {})).toBeNull();
    expect(api.actionsRun).not.toHaveBeenCalled();
    expect(jobLaeuft.value).toBe(true);
  });

  it('plant mit neu geladener Userliste', async () => {
    ladeUserliste.mockImplementation(async () => {
      users.value = [user('a', ['g']), user('b', ['g', 'zweite'])];
      return { ok: true };
    });
    await loescheGruppeMitMitgliedern('g');
    expect(api.actionsRun.mock.calls[0][0].items).toEqual(['a']);
  });

  it('Reload schlägt fehl -> nichts gelöscht', async () => {
    ladeUserliste.mockResolvedValue({ ok: false });
    expect(await loescheGruppeMitMitgliedern('g')).toBe(false);
    expect(api.actionsRun).not.toHaveBeenCalled();
    expect(api.groupsDelete).not.toHaveBeenCalled();
  });

  it('groupsMembers ok:false -> nichts gelöscht', async () => {
    api.groupsMembers.mockResolvedValue({ ok: false, message: 'x' });
    expect(await loescheGruppeMitMitgliedern('g')).toBe(false);
    expect(api.actionsRun).not.toHaveBeenCalled();
    expect(api.groupsDelete).not.toHaveBeenCalled();
  });

  it('unbekanntes Mitglied -> nichts gelöscht', async () => {
    api.groupsMembers.mockResolvedValue({ ok: true, members: ['a', 'fremd'] });
    expect(await loescheGruppeMitMitgliedern('g')).toBe(false);
    expect(api.actionsRun).not.toHaveBeenCalled();
    expect(api.groupsDelete).not.toHaveBeenCalled();
  });

  it('Abbruch bei der Bestätigung -> nichts gelöscht', async () => {
    swalFire.mockResolvedValue({ isConfirmed: false });
    expect(await loescheGruppeMitMitgliedern('g')).toBe(false);
    expect(api.actionsRun).not.toHaveBeenCalled();
    expect(api.groupsDelete).not.toHaveBeenCalled();
  });

  it('Job liefert null -> Gruppe bleibt', async () => {
    api.actionsRun.mockResolvedValue({ ok: false, message: 'boom' });
    expect(await loescheGruppeMitMitgliedern('g')).toBe(false);
    expect(api.groupsDelete).not.toHaveBeenCalled();
  });

  it('alle ok -> Gruppe genau einmal, nach actionsRun', async () => {
    expect(await loescheGruppeMitMitgliedern('g')).toBe(true);
    expect(api.groupsDelete).toHaveBeenCalledTimes(1);
    expect(api.actionsRun.mock.invocationCallOrder[0]).toBeLessThan(api.groupsDelete.mock.invocationCallOrder[0]);
    expect(meldungen()).toEqual([]);
  });

  it('Plan schließt Mitglied aus (weniger Results als erwartet) -> Gruppe bleibt', async () => {
    api.actionsRun.mockResolvedValue({ ok: true, results: [ok('a')], summary: { ok: 1, fehler: 0 } });
    expect(await loescheGruppeMitMitgliedern('g')).toBe(false);
    expect(api.groupsDelete).not.toHaveBeenCalled();
  });
});
