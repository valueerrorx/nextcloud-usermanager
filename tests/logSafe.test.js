import { describe, expect, it } from 'vitest';
import { describeError } from '../src/shared/logSafe.js';

describe('describeError', () => {
  it('beschreibt Name und Nachricht', () => {
    expect(describeError(new TypeError('boom'))).toBe('TypeError: boom');
    expect(describeError('text')).toBe('text');
  });

  it('schwärzt Basic-Header und übergebene Secrets', () => {
    const out = describeError(new Error('Authorization: Basic YWRtaW46cHc= und pw123'), ['pw123']);
    expect(out).not.toContain('YWRtaW46cHc=');
    expect(out).not.toContain('pw123');
  });

  it('ignoriert leere und nicht-String-Secrets', () => {
    expect(describeError(new Error('a'), ['', undefined, null])).toBe('Error: a');
  });
});
