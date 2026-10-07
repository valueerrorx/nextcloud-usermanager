import { describe, expect, it } from 'vitest';
import { normalizeBaseUrl } from '../src/shared/url.js';

describe('normalizeBaseUrl — Pflichttabelle (S04 spec A1)', () => {
  const okCases = [
    ['https://cloud.xapient.solutions', 'https://cloud.xapient.solutions'],
    ['https://cloud.xapient.solutions/', 'https://cloud.xapient.solutions'],
    ['https://cloud.xapient.solutions///', 'https://cloud.xapient.solutions'],
    ['https://Cloud.Xapient.Solutions', 'https://cloud.xapient.solutions'],
    ['HTTPS://host', 'https://host'],
    ['https://host/nextcloud', 'https://host/nextcloud'],
    ['https://host/nextcloud/', 'https://host/nextcloud'],
    ['https://host/NextCloud', 'https://host/NextCloud'],
    ['https://host:8443/nextcloud', 'https://host:8443/nextcloud'],
    ['https://192.168.1.10/nextcloud', 'https://192.168.1.10/nextcloud'],
    ['https://host/index.php', 'https://host'],
    ['https://host/nextcloud/index.php', 'https://host/nextcloud'],
    ['https://host/ocs/v1.php/cloud/users', 'https://host'],
    ['https://host/nextcloud/ocs/v2.php', 'https://host/nextcloud'],
    ['https://host/settings/admin', 'https://host'],
    ['https://host/login', 'https://host'],
    ['https://host/?foo=1#x', 'https://host'],
    ['https://host?', 'https://host'],
  ];

  for (const [input, expected] of okCases) {
    it(`${input} -> ${expected}`, () => {
      expect(normalizeBaseUrl(input)).toEqual({ ok: true, baseUrl: expected });
    });
  }

  const errorCases = [
    ['http://host', 'url_nur_https'],
    ['ftp://host', 'url_nur_https'],
    ['cloud.xapient.solutions', 'url_kein_schema'],
    ['', 'url_leer'],
    ['   ', 'url_leer'],
    [null, 'url_leer'],
    [42, 'url_leer'],
    ['https://', 'url_ungueltig'],
  ];

  for (const [input, messageId] of errorCases) {
    it(`${JSON.stringify(input)} -> ${messageId}`, () => {
      expect(normalizeBaseUrl(input)).toEqual({ ok: false, messageId });
    });
  }

  it('lehnt eine URL mit Zugangsdaten ab und das Ergebnis enthält weder den Benutzernamen noch das Passwort', () => {
    const result = normalizeBaseUrl('https://admin:geheim@host');
    expect(result).toEqual({ ok: false, messageId: 'url_mit_zugangsdaten' });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('admin:');
    expect(serialized).not.toContain('geheim');
  });
});
