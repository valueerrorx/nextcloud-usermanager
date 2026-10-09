import { describe, expect, it } from 'vitest';
import { ABOUT_URL, isAllowedExternalUrl, nextcloudLink } from '../src/shared/externalUrl.js';

describe('isAllowedExternalUrl', () => {
  it('erlaubt die About-URL', () => {
    expect(isAllowedExternalUrl(ABOUT_URL)).toBe(true);
    expect(isAllowedExternalUrl('https://xapient.solutions/seite?a=1')).toBe(true);
  });

  it('lehnt alles andere ab', () => {
    const verboten = [
      'http://xapient.solutions/', 'https://www.xapient.solutions/', 'https://xapient.solutions.evil.example/',
      'https://evil.example/', 'https://user:pw@xapient.solutions/', 'file:///etc/passwd',
      'javascript:alert(1)', 'xapient.solutions', '', null, undefined, 42, {},
    ];
    for (const url of verboten) expect(isAllowedExternalUrl(url)).toBe(false);
  });
});

describe('isAllowedExternalUrl mit verbundenem Server', () => {
  const server = 'https://cloud.example.org/nextcloud';
  it('erlaubt den Host des verbundenen Servers über https', () => {
    expect(isAllowedExternalUrl('https://cloud.example.org/nextcloud', server)).toBe(true);
  });
  it('lehnt andere Hosts, http, Zugangsdaten und Teilstring-Hosts weiterhin ab', () => {
    const verboten = [
      'http://cloud.example.org/', 'https://evil.example/', 'https://cloud.example.org.evil.example/',
      'https://user:pw@cloud.example.org/', 'https://sub.cloud.example.org/',
    ];
    for (const url of verboten) expect(isAllowedExternalUrl(url, server)).toBe(false);
  });
  it('lehnt einen abweichenden Port ab, erlaubt den gleichen Port', () => {
    expect(isAllowedExternalUrl('https://cloud.example.org:8443/', server)).toBe(false);
    expect(isAllowedExternalUrl('https://cloud.example.org:8443/', 'https://cloud.example.org:8443/x')).toBe(true);
    expect(isAllowedExternalUrl('https://cloud.example.org/', 'https://cloud.example.org:8443/x')).toBe(false);
  });
  it('ein http- oder ungültiger Serverwert schaltet keinen Host frei', () => {
    for (const base of ['http://cloud.example.org', 'nonsense', '', null, undefined]) {
      expect(isAllowedExternalUrl('https://cloud.example.org/', base)).toBe(false);
    }
  });
  it('nextcloudLink liefert die URL nur für https', () => {
    expect(nextcloudLink(server)).toBe(server);
    for (const base of ['http://cloud.example.org', 'ftp://cloud.example.org', 'x', '', null]) expect(nextcloudLink(base)).toBeNull();
  });
});
