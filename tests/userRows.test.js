import { describe, expect, it } from 'vitest';
import {
  BATCH_ACTIONS, batchBarVisible, buildUpdateParams, jobToast, logoutState, optionenObjekt,
  rowActions, userInitials,
} from '../src/shared/userRows.js';

const user = (extra = {}) => ({ userid: 'anna', displayname: 'Anna Berger', enabled: true, ...extra });
const byAction = (list, action) => list.find((a) => a.action === action);

describe('userInitials', () => {
  it('nimmt die ersten Buchstaben der ersten zwei Wörter', () => {
    expect(userInitials(user())).toBe('AB');
    expect(userInitials(user({ displayname: 'Anna Maria Berger' }))).toBe('AM');
  });
  it('ein Wort ergibt zwei Buchstaben, leerer Name fällt auf die userid zurück', () => {
    expect(userInitials(user({ displayname: 'Anna' }))).toBe('AN');
    expect(userInitials(user({ displayname: '', userid: 'max.muster' }))).toBe('MM');
  });
  it('liefert ? ohne verwertbaren Namen', () => {
    expect(userInitials({ userid: '', displayname: '' })).toBe('?');
  });
});

describe('rowActions', () => {
  it('liefert alle Aktionen mit title und Icon, aktiver User -> Deaktivieren (danger)', () => {
    const list = rowActions(user(), { adminUserId: 'root' });
    expect(list.map((a) => a.action)).toEqual([
      'user.update', 'user.setPassword', 'user.setQuota', 'user.addToGroup', 'user.removeFromGroup', 'user.disable', 'user.delete',
    ]);
    expect(byAction(list, 'user.disable')).toMatchObject({ icon: 'bi-person-slash', danger: true, disabled: false });
    for (const a of list) expect(a.title).toBeTruthy();
  });
  it('Kontingent und Gruppen sind für einen normalen User aktiv, nicht danger', () => {
    const list = rowActions(user(), { adminUserId: 'root' });
    expect(byAction(list, 'user.setQuota')).toMatchObject({ icon: 'bi-hdd', danger: false, disabled: false });
    expect(byAction(list, 'user.addToGroup')).toMatchObject({ icon: 'bi-people', disabled: false });
    expect(byAction(list, 'user.removeFromGroup')).toMatchObject({ icon: 'bi-person-dash', disabled: false });
  });
  it('Kontingent und Gruppen sind auch beim eigenen Konto frei', () => {
    const list = rowActions(user({ userid: 'admin' }), { adminUserId: 'admin' });
    for (const a of ['user.setQuota', 'user.addToGroup', 'user.removeFromGroup']) expect(byAction(list, a).disabled).toBe(false);
  });
  it('deaktivierter User -> Aktivieren, nicht danger', () => {
    const list = rowActions(user({ enabled: false }), { adminUserId: 'root' });
    expect(byAction(list, 'user.enable')).toMatchObject({ icon: 'bi-person-check', danger: false, label: 'Aktivieren' });
    expect(byAction(list, 'user.disable')).toBeUndefined();
  });
  it('eigenes Konto (case-insensitiv): Löschen und Deaktivieren gesperrt mit Hinweis, Rest frei', () => {
    const list = rowActions(user({ userid: 'Admin' }), { adminUserId: 'admin' });
    expect(byAction(list, 'user.delete')).toMatchObject({ disabled: true });
    expect(byAction(list, 'user.delete').title).toContain('eigene Konto');
    expect(byAction(list, 'user.disable')).toMatchObject({ disabled: true });
    expect(byAction(list, 'user.update').disabled).toBe(false);
    expect(byAction(list, 'user.setPassword').disabled).toBe(false);
  });
  it('eigenes Konto deaktiviert: Aktivieren bleibt erlaubt', () => {
    const list = rowActions(user({ userid: 'admin', enabled: false }), { adminUserId: 'admin' });
    expect(byAction(list, 'user.enable').disabled).toBe(false);
    expect(byAction(list, 'user.delete').disabled).toBe(true);
  });
  it('ohne adminUserId ist niemand das eigene Konto', () => {
    expect(byAction(rowActions(user(), { adminUserId: null }), 'user.delete').disabled).toBe(false);
  });
  it('gesperrt (Job läuft) sperrt alle Aktionen', () => {
    const list = rowActions(user(), { adminUserId: 'root', gesperrt: true });
    expect(list.every((a) => a.disabled)).toBe(true);
  });
});

describe('batchBarVisible', () => {
  it('erst ab 2 Ausgewählten', () => {
    expect([0, 1, 2, 3].map(batchBarVisible)).toEqual([false, false, true, true]);
  });
  it('BATCH_ACTIONS enthält die sechs Aktionen, nicht Passwort/Bearbeiten', () => {
    const ids = BATCH_ACTIONS.map((a) => a.id);
    expect(ids).toHaveLength(6);
    expect(ids).not.toContain('user.setPassword');
    expect(ids).not.toContain('user.update');
  });
});

describe('logoutState', () => {
  it('sperrt nur bei laufendem Job', () => {
    expect(logoutState(true).disabled).toBe(true);
    expect(logoutState(true).title).toContain('laufenden');
    expect(logoutState(false)).toEqual({ disabled: false, title: 'Abmelden' });
  });
});

describe('jobToast', () => {
  it('Erfolg ohne Fehler', () => {
    expect(jobToast('Löschen', { ok: 5, fehler: 0, teilweise: 0 })).toEqual({ kind: 'success', text: 'Löschen: 5 OK' });
  });
  it('Fehler inklusive teilweise zählen als fehlgeschlagen', () => {
    expect(jobToast('Löschen', { ok: 5, fehler: 1, teilweise: 1 })).toEqual({ kind: 'error', text: 'Löschen: 5 OK, 2 fehlgeschlagen' });
  });
});

describe('optionenObjekt / buildUpdateParams', () => {
  it('baut value -> label', () => {
    expect(optionenObjekt([{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }])).toEqual({ a: 'A', b: 'B' });
  });
  it('trimmt und lässt leere Felder weg', () => {
    expect(buildUpdateParams({ displayname: ' Neu ', email: '  ' })).toEqual({ displayname: 'Neu' });
    expect(buildUpdateParams({ displayname: '', email: 'a@b.de' })).toEqual({ email: 'a@b.de' });
    expect(buildUpdateParams({ displayname: '', email: '' })).toEqual({});
  });
});
