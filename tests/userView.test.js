// S05 A2 Abnahme 3: email null bleibt null, fehlende groups, case-insensitiver Admin-Vergleich,
// fehlender displayname.
import { describe, expect, it } from 'vitest';
import { toUserView } from '../src/shared/userView.js';

describe('toUserView', () => {
  it('email: null bleibt null (nicht "" und nicht der String "null")', () => {
    const result = toUserView({ id: 'bob', email: null, enabled: true, groups: [] }, { adminUserId: 'admin' });
    expect(result.email).toBeNull();
  });

  it('fehlende groups werden zu []', () => {
    const result = toUserView({ id: 'bob', enabled: true }, { adminUserId: 'admin' });
    expect(result.groups).toEqual([]);
  });

  it('istVerbundenerAdmin vergleicht case-insensitiv (Aaron.w vs. aaron.w)', () => {
    const result = toUserView({ id: 'Aaron.w', enabled: true, groups: [] }, { adminUserId: 'aaron.w' });
    expect(result.istVerbundenerAdmin).toBe(true);
  });

  it('istVerbundenerAdmin ist false für einen anderen Benutzer', () => {
    const result = toUserView({ id: 'Aaron.w', enabled: true, groups: [] }, { adminUserId: 'someone-else' });
    expect(result.istVerbundenerAdmin).toBe(false);
  });

  it('fehlender displayname fällt auf userid zurück', () => {
    const result = toUserView({ id: 'bob', enabled: true, groups: [] }, { adminUserId: 'admin' });
    expect(result.displayname).toBe('bob');
  });
});
