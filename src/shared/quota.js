// Quota shape mapping, exactly the table in ARCHITECTURE §4 (binding). Pure, no I/O.
// `relative` from the OCS response is never read: it is 0 for unlimited quotas and would
// misreport an unlimited user as "0 % full" if used for usagePercent.
const UNIT_MULTIPLIERS = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 };

// Numeric string ("1073741824") or "<number><unit>" ("1 GB", "100MB"). Returns null if unparsable.
function parseByteString(s) {
  if (/^-?\d+(\.\d+)?$/.test(s)) {
    return Number(s);
  }
  const match = /^(\d+(?:\.\d+)?)\s*([A-Za-z]+)$/.exec(s);
  if (!match) return null;
  const multiplier = UNIT_MULTIPLIERS[match[2].toUpperCase()];
  if (multiplier === undefined) return null;
  return Math.round(Number(match[1]) * multiplier);
}

// Classifies the bare `quota` scalar (either the top-level raw value or the `.quota` field of
// the quota object). Scalar 0 is deliberately `unknown`, not `limited: 0` (Nextcloud also
// returns 0 for "no quota set" - DECISIONS "Deutung von quota: 0").
function classifyScalar(value) {
  if (value === -3 || value === 'none') return { kind: 'unlimited' };
  if (typeof value === 'number') {
    return value > 0 ? { kind: 'limited', limitBytes: value } : { kind: 'unknown' };
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const bytes = parseByteString(trimmed);
    return bytes !== null && bytes > 0 ? { kind: 'limited', limitBytes: bytes } : { kind: 'unknown' };
  }
  return { kind: 'unknown' }; // null, undefined, objects, etc.
}

export function parseQuota(raw) {
  const roh = raw;
  let scalarInput;
  let usedValue = null;

  if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
    scalarInput = raw.quota;
    usedValue = typeof raw.used === 'number' ? raw.used : null;
  } else {
    scalarInput = raw;
  }

  const scalar = classifyScalar(scalarInput);

  if (scalar.kind === 'unlimited') {
    // `used` stays a real number even when unlimited (RESEARCH-OCS V3); kept only if numeric.
    return { kind: 'unlimited', limitBytes: null, usedBytes: usedValue, usagePercent: null, roh };
  }

  if (scalar.kind === 'limited') {
    const usagePercent =
      scalar.limitBytes > 0 && usedValue != null ? (usedValue / scalar.limitBytes) * 100 : null;
    return { kind: 'limited', limitBytes: scalar.limitBytes, usedBytes: usedValue, usagePercent, roh };
  }

  return { kind: 'unknown', limitBytes: null, usedBytes: null, usagePercent: null, roh };
}

// GiB base 1024, one decimal place, German comma. null -> "unbekannt" (ARCHITECTURE §4.1).
export function formatBytes(bytes) {
  if (bytes === null || bytes === undefined) return 'unbekannt';
  const gib = bytes / 1024 ** 3;
  return `${gib.toFixed(1).replace('.', ',')} GiB`;
}

// One decimal place, German comma, trailing "%". null -> "unbekannt" (ARCHITECTURE §4.1,
// single place that turns a quota number into text, mirrors formatBytes).
export function formatPercent(percent) {
  if (percent === null || percent === undefined) return 'unbekannt';
  return `${percent.toFixed(1).replace('.', ',')} %`;
}

// Width of the quota bar in percent, capped at a full bar. Null means no bar.
export function quotaBalkenBreite(usagePercent) {
  if (typeof usagePercent !== 'number' || Number.isNaN(usagePercent)) return null;
  return Math.min(100, Math.max(0, usagePercent));
}

// GiB base 1073741824 (DECISIONS "Kontingent-Eingabe"), only presets, no free-text quota entry.
const GIB = 1073741824;
export const QUOTA_PRESETS = Object.freeze([
  // Nextcloud editUser accepts quota 'default' (UsersController.php, USER_FIELD_QUOTA case, stable33 L1077)
  { id: 'standard', label: 'Standard-Kontingent (Server)', apiValue: 'default' },
  { id: '1gb', label: '1 GB', bytes: 1 * GIB },
  { id: '2gb', label: '2 GB', bytes: 2 * GIB },
  { id: '5gb', label: '5 GB', bytes: 5 * GIB },
  { id: '10gb', label: '10 GB', bytes: 10 * GIB },
  { id: '20gb', label: '20 GB', bytes: 20 * GIB },
  { id: 'unbegrenzt', label: 'Unbegrenzt', bytes: null },
]);

// Bytes as a string for the OCS PUT quota call, or 'none' for unlimited (DECISIONS: "unbegrenzt als none").
export function formatQuotaForApi(preset) {
  if (preset.apiValue) return preset.apiValue;
  return preset.bytes === null ? 'none' : String(preset.bytes);
}

// Looks up a preset by its id - moved out of ActionBar.vue (REVIEW-NOTES [S06]).
export function findQuotaPreset(id) {
  return QUOTA_PRESETS.find((p) => p.id === id);
}
