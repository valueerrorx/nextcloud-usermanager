import { describe, expect, it } from 'vitest';
import { ABOUT_URL, isAllowedExternalUrl } from '../src/shared/externalUrl.js';

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
