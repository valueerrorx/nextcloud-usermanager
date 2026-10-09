// formatTimestamp konsolidiert aus DashboardView.vue/UsersView.vue/App.vue (REVIEW-NOTES MINOR).
import { describe, expect, it } from 'vitest';
import { formatTimestamp } from '../src/shared/time.js';

describe('formatTimestamp', () => {
  it('null -> leerer String (noch kein Stand)', () => {
    expect(formatTimestamp(null)).toBe('');
  });

  it('0 -> leerer String', () => {
    expect(formatTimestamp(0)).toBe('');
  });

  it('ein echter Zeitstempel -> dasselbe wie new Date(ms).toLocaleString(\'de-DE\')', () => {
    const ms = Date.parse('2026-01-02T10:00:00Z');
    expect(formatTimestamp(ms)).toBe(new Date(ms).toLocaleString('de-DE'));
  });
});
