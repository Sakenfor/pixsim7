/**
 * Engine brand definitions for AI agent engines (claude, codex, etc.)
 *
 * Single source of truth for engine display properties — colors, labels,
 * short codes.  Import from here instead of inlining ad-hoc color maps.
 */

export interface EngineBrand {
  /** Display name */
  label: string;
  /** 1–3 char abbreviation for compact badges */
  short: string;
  /** Tailwind text color class */
  textColor: string;
  /** Badge color key (for shared Badge component) */
  badgeColor: 'blue' | 'purple' | 'orange' | 'gray';
  /** Hex color for non-Tailwind contexts (inline styles, charts) */
  hex: string;
}

const ENGINE_BRANDS: Record<string, EngineBrand> = {
  claude: {
    label: 'Claude',
    short: 'Cl',
    textColor: 'text-orange-400',
    badgeColor: 'orange',
    hex: '#FB923C',
  },
  codex: {
    label: 'Codex',
    short: 'Cx',
    textColor: 'text-blue-400',
    badgeColor: 'blue',
    hex: '#60A5FA',
  },
  api: {
    label: 'API',
    short: 'AP',
    textColor: 'text-amber-400',
    badgeColor: 'orange',
    hex: '#FBBF24',
  },
};

const UNKNOWN_ENGINE: EngineBrand = {
  label: 'Unknown',
  short: '?',
  textColor: 'text-neutral-400',
  badgeColor: 'gray',
  hex: '#9CA3AF',
};

/** Look up engine brand by engine id string. Never returns undefined. */
export function getEngineBrand(engine: string | undefined | null): EngineBrand {
  if (!engine) return UNKNOWN_ENGINE;
  return ENGINE_BRANDS[engine] ?? UNKNOWN_ENGINE;
}

/**
 * Reduce an engine identifier to its canonical short form, mirroring the
 * backend `normalize_engine` in `pixsim7/backend/main/services/llm/remote_cmd_bridge.py`.
 *
 * Bridges register engines as `claude-cli` / `codex-cli` (the literal CLI
 * binary name) while UI tabs carry the user-facing `claude` / `codex`. Any
 * comparison between a tab's engine and the bridge-reported engines must
 * pass through this helper or every match misses.
 */
export function normalizeEngine(value: string | null | undefined): string | null {
  const v = (value ?? '').trim().toLowerCase();
  if (!v) return null;
  return v.endsWith('-cli') ? v.slice(0, -4) : v;
}

export { ENGINE_BRANDS, UNKNOWN_ENGINE };
