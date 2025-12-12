/**
 * Normalize provider-specific generation parameters so downstream adapters
 * receive consistent types (ints over floats/strings, booleans as 1/undefined).
 */
export function normalizeProviderParams(params: Record<string, any> = {}) {
  const normalized: Record<string, any> = { ...params };

  const toggleFields: Array<'audio' | 'multi_shot' | 'off_peak'> = [
    'audio',
    'multi_shot',
    'off_peak',
  ];

  for (const field of toggleFields) {
    if (shouldEnableToggle(normalized[field])) {
      normalized[field] = 1;
    } else {
      delete normalized[field];
    }
  }

  if (normalized.duration !== undefined) {
    const value = Number(normalized.duration);
    if (Number.isFinite(value)) {
      const rounded = Math.max(0, Math.round(value));
      normalized.duration = rounded;
    } else {
      delete normalized.duration;
    }
  }

  return normalized;
}

function shouldEnableToggle(value: any): boolean {
  if (value === undefined || value === null) {
    return false;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value > 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized.length === 0) {
      return false;
    }
    return normalized === '1' || normalized === 'true' || normalized === 'on' || normalized === 'yes';
  }

  return false;
}
