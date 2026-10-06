import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const css = readFileSync(fileURLToPath(new URL('../src/renderer/styles/theme.css', import.meta.url)), 'utf8');

// S01 pins exactly these six tokens with exactly these values (S01-skeleton.md); no additions in later steps
const mandatedTokens = {
  '--bg': '#15181d',
  '--bg-elev': '#1d2128',
  '--fg': '#e6e8eb',
  '--fg-muted': '#9aa3ad',
  '--accent': '#4a9eff',
  '--border': '#2b313a',
};

describe('theme.css Tokens', () => {
  for (const [token, value] of Object.entries(mandatedTokens)) {
    it(`definiert ${token}: ${value}`, () => {
      const re = new RegExp(`${token.replace(/-/g, '\\-')}:\\s*${value};`);
      expect(css).toMatch(re);
    });
  }

  it('definiert genau diese sechs Tokens, keine weiteren', () => {
    const rootBlockMatch = css.match(/:root\s*{([^}]*)}/);
    expect(rootBlockMatch).not.toBeNull();
    const declaredTokens = [...rootBlockMatch[1].matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]);
    expect(declaredTokens.sort()).toEqual(Object.keys(mandatedTokens).sort());
  });
});
