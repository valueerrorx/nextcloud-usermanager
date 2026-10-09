import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BASE_URL, hostLabel, initialConnectForm, lastLoadLabel, statusDot, uiPhase,
} from '../src/shared/connectionUi.js';

describe('initialConnectForm', () => {
  it('belegt die URL mit dem Testserver vor, wenn nichts gespeichert ist', () => {
    expect(initialConnectForm({ savedBaseUrl: null, savedAdminUser: null })).toEqual({
      baseUrl: 'https://cloud.xapient.solutions', adminUser: '', appPassword: '', remember: false,
    });
    expect(DEFAULT_BASE_URL).toBe('https://cloud.xapient.solutions');
  });

  it('bevorzugt den gespeicherten Server und Admin, das Passwort bleibt leer', () => {
    const form = initialConnectForm({ savedBaseUrl: 'https://andere.cloud', savedAdminUser: 'root', appPassword: 'x' });
    expect(form.baseUrl).toBe('https://andere.cloud');
    expect(form.adminUser).toBe('root');
    expect(form.appPassword).toBe('');
  });

  it('übersteht ein fehlendes Status-Objekt', () => {
    expect(initialConnectForm(undefined).baseUrl).toBe(DEFAULT_BASE_URL);
  });
});

describe('uiPhase', () => {
  it('prüft, solange der Start nicht abgeschlossen und nichts verbunden ist', () => {
    expect(uiPhase({ checked: false, connected: false })).toBe('pruefe');
  });
  it('zeigt nach der Prüfung ohne Verbindung das Popup', () => {
    expect(uiPhase({ checked: true, connected: false })).toBe('dialog');
  });
  it('ist bereit, sobald verbunden', () => {
    expect(uiPhase({ checked: true, connected: true })).toBe('bereit');
    expect(uiPhase({ checked: false, connected: true })).toBe('bereit');
  });
});

describe('statusDot', () => {
  it('connecting hat Vorrang, dann connected, sonst disconnected', () => {
    expect(statusDot({ connected: false, connecting: true })).toBe('connecting');
    expect(statusDot({ connected: true, connecting: true })).toBe('connecting');
    expect(statusDot({ connected: true, connecting: false })).toBe('connected');
    expect(statusDot({ connected: false, connecting: false })).toBe('disconnected');
  });
});

describe('hostLabel', () => {
  it('zeigt nur den Host, nicht die volle URL', () => {
    expect(hostLabel('https://cloud.example.org:8443/nextcloud')).toBe('cloud.example.org');
  });
  it('fällt bei leer/ungültig auf "Nicht verbunden" zurück', () => {
    expect(hostLabel(null)).toBe('Nicht verbunden');
    expect(hostLabel('')).toBe('Nicht verbunden');
    expect(hostLabel('kein url')).toBe('Nicht verbunden');
  });
});

describe('lastLoadLabel', () => {
  it('ist leer ohne Stand und enthält sonst das formatierte Datum', () => {
    expect(lastLoadLabel(null)).toBe('');
    const ms = new Date(2026, 9, 9, 14, 5, 0).getTime();
    expect(lastLoadLabel(ms)).toBe(`Zuletzt: ${new Date(ms).toLocaleString('de-DE')}`);
  });
});
