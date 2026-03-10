/**
 * Analyzer Settings Store (v2)
 *
 * Analysis-point-centric state model. Each analysis point maps to an ordered
 * list of analyzer IDs (priority order). Well-known point IDs cover the
 * control-level defaults (prompt, image, video) and intent overrides.
 *
 * v1 compat: All original getters/setters are preserved and delegate to the
 * v2 `pointAnalyzerChains` internally. The persist migration auto-upgrades
 * v1 localStorage data on first load.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { DEFAULT_ASSET_ANALYZER_ID } from './constants';

// ─────────────────────────────────────────────────────────────────────────────
// Intent keys
// ─────────────────────────────────────────────────────────────────────────────

export const ASSET_ANALYZER_INTENT_KEYS = [
  'character_ingest_face',
  'character_ingest_sheet',
  'scene_prep_location',
  'scene_prep_style',
] as const;

export type AssetAnalyzerIntentKey = typeof ASSET_ANALYZER_INTENT_KEYS[number];

// ─────────────────────────────────────────────────────────────────────────────
// Well-known point IDs
// ─────────────────────────────────────────────────────────────────────────────

/** Control-level default point IDs */
export const CONTROL_POINT_IDS = {
  PROMPT_DEFAULT: '_control:prompt_default',
  IMAGE_DEFAULT: '_control:image_default',
  VIDEO_DEFAULT: '_control:video_default',
} as const;

/** Intent override point IDs */
export function intentPointId(intent: AssetAnalyzerIntentKey): string {
  return `_intent:${intent}`;
}

/** Check if a point ID is a well-known control point */
export function isControlPointId(id: string): boolean {
  return id.startsWith('_control:');
}

/** Check if a point ID is a well-known intent point */
export function isIntentPointId(id: string): boolean {
  return id.startsWith('_intent:');
}

/** Extract the intent key from an intent point ID */
export function extractIntentKey(pointId: string): AssetAnalyzerIntentKey | null {
  if (!pointId.startsWith('_intent:')) return null;
  const key = pointId.slice('_intent:'.length);
  return ASSET_ANALYZER_INTENT_KEYS.includes(key as AssetAnalyzerIntentKey)
    ? (key as AssetAnalyzerIntentKey)
    : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface AnalyzerSettingsState {
  // ── v2 primary data ──
  _version: number;
  pointAnalyzerChains: Record<string, string[]>;

  // ── v2 API ──
  setPointAnalyzerChain: (pointId: string, chain: string[]) => void;
  clearPointAnalyzerChain: (pointId: string) => void;
  getPointAnalyzerChain: (pointId: string) => string[];
  /**
   * Resolve the effective analyzer chain for a point, following the cascade:
   * point override -> intent fallback -> media default -> built-in fallback.
   *
   * For control points: returns the chain directly.
   * For intent points: returns intent chain if set, else image default.
   * For custom points: returns the point chain if set, else empty.
   */
  getEffectiveChain: (pointId: string) => string[];

  // ── v1 compat fields (derived from pointAnalyzerChains) ──
  defaultImageAnalyzer: string;
  defaultVideoAnalyzer: string;
  defaultImageAnalyzers: string[];
  defaultVideoAnalyzers: string[];
  intentAssetAnalyzers: Partial<Record<AssetAnalyzerIntentKey, string>>;
  intentAssetAnalyzerChains: Partial<Record<AssetAnalyzerIntentKey, string[]>>;

  // ── v1 compat setters (delegate to v2 internally) ──
  setDefaultImageAnalyzer: (value: string) => void;
  setDefaultVideoAnalyzer: (value: string) => void;
  setDefaultImageAnalyzers: (values: string[]) => void;
  setDefaultVideoAnalyzers: (values: string[]) => void;
  setIntentAssetAnalyzer: (intent: AssetAnalyzerIntentKey, value: string) => void;
  setIntentAssetAnalyzerChain: (intent: AssetAnalyzerIntentKey, values: string[]) => void;
  clearIntentAssetAnalyzer: (intent: AssetAnalyzerIntentKey) => void;

  // ── v1 compat getters ──
  getDefaultAssetAnalyzer: (mediaType?: 'image' | 'video') => string;
  getDefaultAssetAnalyzers: (mediaType?: 'image' | 'video') => string[];
  getIntentAssetAnalyzer: (intent: AssetAnalyzerIntentKey) => string | null;
  getIntentAssetAnalyzerChain: (intent: AssetAnalyzerIntentKey) => string[];
  getDefaultAssetAnalyzerForIntent: (intent: AssetAnalyzerIntentKey, mediaType?: 'image' | 'video') => string;
  getDefaultAssetAnalyzerChainForIntent: (intent: AssetAnalyzerIntentKey, mediaType?: 'image' | 'video') => string[];

  resetAnalyzerSettings: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'pixsim7:analyzerSettings';

export function normalizeAnalyzerChain(values: string[] | undefined, fallback: string): string[] {
  if (!Array.isArray(values)) return [fallback];
  const chain = values
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value): value is string => value.length > 0);
  return chain.length > 0 ? Array.from(new Set(chain)) : [fallback];
}

function normalizeOptionalChain(values: string[] | undefined): string[] {
  if (!Array.isArray(values)) return [];
  const chain = values
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value): value is string => value.length > 0);
  return Array.from(new Set(chain));
}

function withPrimaryAnalyzer(primary: string, existing: string[] | undefined, fallback: string): string[] {
  const normalizedPrimary = primary.trim() || fallback;
  const normalizedExisting = normalizeAnalyzerChain(existing, fallback);
  return [normalizedPrimary, ...normalizedExisting.filter((value) => value !== normalizedPrimary)];
}

/**
 * Derive v1 compat fields from the v2 pointAnalyzerChains.
 */
function deriveV1Fields(chains: Record<string, string[]>) {
  const imageChain = normalizeAnalyzerChain(
    chains[CONTROL_POINT_IDS.IMAGE_DEFAULT],
    DEFAULT_ASSET_ANALYZER_ID
  );
  const videoChain = normalizeAnalyzerChain(
    chains[CONTROL_POINT_IDS.VIDEO_DEFAULT],
    DEFAULT_ASSET_ANALYZER_ID
  );

  const intentScalars: Partial<Record<AssetAnalyzerIntentKey, string>> = {};
  const intentChains: Partial<Record<AssetAnalyzerIntentKey, string[]>> = {};
  for (const key of ASSET_ANALYZER_INTENT_KEYS) {
    const chain = normalizeOptionalChain(chains[intentPointId(key)]);
    if (chain.length > 0) {
      intentScalars[key] = chain[0];
      intentChains[key] = chain;
    }
  }

  return {
    defaultImageAnalyzer: imageChain[0],
    defaultVideoAnalyzer: videoChain[0],
    defaultImageAnalyzers: imageChain,
    defaultVideoAnalyzers: videoChain,
    intentAssetAnalyzers: intentScalars,
    intentAssetAnalyzerChains: intentChains,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Migration: v1 -> v2
// ─────────────────────────────────────────────────────────────────────────────

interface V1PersistedState {
  defaultImageAnalyzer?: string;
  defaultVideoAnalyzer?: string;
  defaultImageAnalyzers?: string[];
  defaultVideoAnalyzers?: string[];
  intentAssetAnalyzers?: Partial<Record<string, string>>;
  intentAssetAnalyzerChains?: Partial<Record<string, string[]>>;
}

/**
 * Migrate v1 persisted state to v2 pointAnalyzerChains.
 * Called by zustand persist `migrate` option.
 */
export function migrateV1ToV2(persisted: V1PersistedState): Record<string, string[]> {
  const chains: Record<string, string[]> = {};

  // Image default
  const imageChain = normalizeAnalyzerChain(
    persisted.defaultImageAnalyzers,
    persisted.defaultImageAnalyzer?.trim() || DEFAULT_ASSET_ANALYZER_ID
  );
  chains[CONTROL_POINT_IDS.IMAGE_DEFAULT] = imageChain;

  // Video default
  const videoChain = normalizeAnalyzerChain(
    persisted.defaultVideoAnalyzers,
    persisted.defaultVideoAnalyzer?.trim() || DEFAULT_ASSET_ANALYZER_ID
  );
  chains[CONTROL_POINT_IDS.VIDEO_DEFAULT] = videoChain;

  // Intent overrides: prefer chain, fall back to scalar
  const rawChains = persisted.intentAssetAnalyzerChains ?? {};
  const rawScalars = persisted.intentAssetAnalyzers ?? {};
  for (const key of ASSET_ANALYZER_INTENT_KEYS) {
    const fromChain = normalizeOptionalChain(rawChains[key]);
    if (fromChain.length > 0) {
      chains[intentPointId(key)] = fromChain;
      continue;
    }
    const scalar = rawScalars[key]?.trim();
    if (scalar) {
      chains[intentPointId(key)] = [scalar];
    }
  }

  return chains;
}

// ─────────────────────────────────────────────────────────────────────────────
// Default state
// ─────────────────────────────────────────────────────────────────────────────

function makeDefaultPointChains(): Record<string, string[]> {
  return {
    [CONTROL_POINT_IDS.IMAGE_DEFAULT]: [DEFAULT_ASSET_ANALYZER_ID],
    [CONTROL_POINT_IDS.VIDEO_DEFAULT]: [DEFAULT_ASSET_ANALYZER_ID],
  };
}

const DEFAULT_CHAINS = makeDefaultPointChains();

const DEFAULT_STATE = {
  _version: 2 as const,
  pointAnalyzerChains: DEFAULT_CHAINS,
  ...deriveV1Fields(DEFAULT_CHAINS),
};

// ─────────────────────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────────────────────

export const useAnalyzerSettingsStore = create<AnalyzerSettingsState>()(
  persist(
    (set, get) => ({
      ...DEFAULT_STATE,

      // ── v2 setters ──

      setPointAnalyzerChain: (pointId, chain) =>
        set((state) => {
          const normalized = normalizeOptionalChain(chain);
          const next = { ...state.pointAnalyzerChains };
          if (normalized.length > 0) {
            next[pointId] = normalized;
          } else {
            delete next[pointId];
          }
          return {
            pointAnalyzerChains: next,
            ...deriveV1Fields(next),
          };
        }),

      clearPointAnalyzerChain: (pointId) =>
        set((state) => {
          const next = { ...state.pointAnalyzerChains };
          delete next[pointId];
          return {
            pointAnalyzerChains: next,
            ...deriveV1Fields(next),
          };
        }),

      getPointAnalyzerChain: (pointId) => {
        return normalizeOptionalChain(get().pointAnalyzerChains[pointId]);
      },

      getEffectiveChain: (pointId) => {
        const state = get();
        const chains = state.pointAnalyzerChains;

        // Direct point chain
        const direct = normalizeOptionalChain(chains[pointId]);
        if (direct.length > 0) return direct;

        // For intent points, fall back to image default
        if (isIntentPointId(pointId)) {
          return normalizeAnalyzerChain(
            chains[CONTROL_POINT_IDS.IMAGE_DEFAULT],
            DEFAULT_ASSET_ANALYZER_ID
          );
        }

        // For control points, they should always have a value, but fallback
        if (isControlPointId(pointId)) {
          return [DEFAULT_ASSET_ANALYZER_ID];
        }

        // Custom analysis points: no automatic fallback
        return [];
      },

      // ── v1 compat setters ──

      setDefaultImageAnalyzer: (value) => {
        const state = get();
        const existing = state.pointAnalyzerChains[CONTROL_POINT_IDS.IMAGE_DEFAULT];
        const chain = withPrimaryAnalyzer(
          value?.trim() || DEFAULT_ASSET_ANALYZER_ID,
          existing,
          DEFAULT_ASSET_ANALYZER_ID
        );
        const next = { ...state.pointAnalyzerChains, [CONTROL_POINT_IDS.IMAGE_DEFAULT]: chain };
        set({ pointAnalyzerChains: next, ...deriveV1Fields(next) });
      },

      setDefaultVideoAnalyzer: (value) => {
        const state = get();
        const existing = state.pointAnalyzerChains[CONTROL_POINT_IDS.VIDEO_DEFAULT];
        const chain = withPrimaryAnalyzer(
          value?.trim() || DEFAULT_ASSET_ANALYZER_ID,
          existing,
          DEFAULT_ASSET_ANALYZER_ID
        );
        const next = { ...state.pointAnalyzerChains, [CONTROL_POINT_IDS.VIDEO_DEFAULT]: chain };
        set({ pointAnalyzerChains: next, ...deriveV1Fields(next) });
      },

      setDefaultImageAnalyzers: (values) => {
        const chain = normalizeAnalyzerChain(values, DEFAULT_ASSET_ANALYZER_ID);
        const state = get();
        const next = { ...state.pointAnalyzerChains, [CONTROL_POINT_IDS.IMAGE_DEFAULT]: chain };
        set({ pointAnalyzerChains: next, ...deriveV1Fields(next) });
      },

      setDefaultVideoAnalyzers: (values) => {
        const chain = normalizeAnalyzerChain(values, DEFAULT_ASSET_ANALYZER_ID);
        const state = get();
        const next = { ...state.pointAnalyzerChains, [CONTROL_POINT_IDS.VIDEO_DEFAULT]: chain };
        set({ pointAnalyzerChains: next, ...deriveV1Fields(next) });
      },

      setIntentAssetAnalyzer: (intent, value) => {
        const state = get();
        const pid = intentPointId(intent);
        const normalized = value?.trim();
        const next = { ...state.pointAnalyzerChains };
        if (!normalized) {
          delete next[pid];
        } else {
          const existing = next[pid];
          next[pid] = withPrimaryAnalyzer(normalized, existing, normalized);
        }
        set({ pointAnalyzerChains: next, ...deriveV1Fields(next) });
      },

      setIntentAssetAnalyzerChain: (intent, values) => {
        const state = get();
        const pid = intentPointId(intent);
        const chain = normalizeOptionalChain(values);
        const next = { ...state.pointAnalyzerChains };
        if (chain.length === 0) {
          delete next[pid];
        } else {
          next[pid] = chain;
        }
        set({ pointAnalyzerChains: next, ...deriveV1Fields(next) });
      },

      clearIntentAssetAnalyzer: (intent) => {
        const state = get();
        const pid = intentPointId(intent);
        const next = { ...state.pointAnalyzerChains };
        delete next[pid];
        set({ pointAnalyzerChains: next, ...deriveV1Fields(next) });
      },

      // ── v1 compat getters ──

      getDefaultAssetAnalyzer: (mediaType) =>
        get().getDefaultAssetAnalyzers(mediaType)[0],

      getDefaultAssetAnalyzers: (mediaType) => {
        const chains = get().pointAnalyzerChains;
        const key = mediaType === 'video'
          ? CONTROL_POINT_IDS.VIDEO_DEFAULT
          : CONTROL_POINT_IDS.IMAGE_DEFAULT;
        return normalizeAnalyzerChain(chains[key], DEFAULT_ASSET_ANALYZER_ID);
      },

      getIntentAssetAnalyzer: (intent) => {
        const chain = get().getIntentAssetAnalyzerChain(intent);
        return chain.length > 0 ? chain[0] : null;
      },

      getIntentAssetAnalyzerChain: (intent) => {
        return normalizeOptionalChain(get().pointAnalyzerChains[intentPointId(intent)]);
      },

      getDefaultAssetAnalyzerForIntent: (intent, mediaType) =>
        get().getDefaultAssetAnalyzerChainForIntent(intent, mediaType)[0],

      getDefaultAssetAnalyzerChainForIntent: (intent, mediaType) => {
        const intentChain = get().getIntentAssetAnalyzerChain(intent);
        return intentChain.length > 0 ? intentChain : get().getDefaultAssetAnalyzers(mediaType);
      },

      resetAnalyzerSettings: () => {
        const chains = makeDefaultPointChains();
        set({
          _version: 2,
          pointAnalyzerChains: chains,
          ...deriveV1Fields(chains),
        });
      },
    }),
    {
      name: STORAGE_KEY,
      version: 2,
      migrate: (persisted, version) => {
        // v1 (or no version) -> v2: upgrade shape
        if (version < 2) {
          const v1 = persisted as V1PersistedState;
          const chains = migrateV1ToV2(v1);
          return {
            _version: 2,
            pointAnalyzerChains: chains,
            ...deriveV1Fields(chains),
          };
        }
        return persisted as AnalyzerSettingsState;
      },
    }
  )
);
