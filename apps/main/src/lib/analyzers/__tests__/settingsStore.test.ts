/**
 * Tests for Analyzer Settings Store (v2)
 *
 * Covers: v1->v2 migration, compat getters/setters, v2 API,
 * resolution cascade, and round-trip behavior.
 */
/* eslint-disable import/no-unresolved */
import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_ASSET_ANALYZER_ID } from '../constants';
import {
  CONTROL_POINT_IDS,
  intentPointId,
  isControlPointId,
  isIntentPointId,
  extractIntentKey,
  migrateV1ToV2,
  normalizeAnalyzerChain,
  useAnalyzerSettingsStore,
} from '../settingsStore';

// Reset store before each test
beforeEach(() => {
  act(() => {
    useAnalyzerSettingsStore.getState().resetAnalyzerSettings();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Helper ID utilities
// ─────────────────────────────────────────────────────────────────────────────

describe('Point ID utilities', () => {
  it('intentPointId creates correct ID', () => {
    expect(intentPointId('character_ingest_face')).toBe('_intent:character_ingest_face');
  });

  it('isControlPointId identifies control points', () => {
    expect(isControlPointId('_control:image_default')).toBe(true);
    expect(isControlPointId('_intent:foo')).toBe(false);
    expect(isControlPointId('user:custom')).toBe(false);
  });

  it('isIntentPointId identifies intent points', () => {
    expect(isIntentPointId('_intent:character_ingest_face')).toBe(true);
    expect(isIntentPointId('_control:image_default')).toBe(false);
  });

  it('extractIntentKey extracts valid intent keys', () => {
    expect(extractIntentKey('_intent:character_ingest_face')).toBe('character_ingest_face');
    expect(extractIntentKey('_intent:unknown_intent')).toBe(null);
    expect(extractIntentKey('_control:image_default')).toBe(null);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// normalizeAnalyzerChain
// ─────────────────────────────────────────────────────────────────────────────

describe('normalizeAnalyzerChain', () => {
  it('returns fallback for undefined input', () => {
    expect(normalizeAnalyzerChain(undefined, 'fb')).toEqual(['fb']);
  });

  it('returns fallback for empty array', () => {
    expect(normalizeAnalyzerChain([], 'fb')).toEqual(['fb']);
  });

  it('deduplicates entries', () => {
    expect(normalizeAnalyzerChain(['a', 'b', 'a'], 'fb')).toEqual(['a', 'b']);
  });

  it('trims whitespace', () => {
    expect(normalizeAnalyzerChain([' a ', ' b '], 'fb')).toEqual(['a', 'b']);
  });

  it('filters empty strings', () => {
    expect(normalizeAnalyzerChain(['', '  ', 'a'], 'fb')).toEqual(['a']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// v1 -> v2 migration
// ─────────────────────────────────────────────────────────────────────────────

describe('migrateV1ToV2', () => {
  it('migrates default image/video chains', () => {
    const result = migrateV1ToV2({
      defaultImageAnalyzer: 'asset:face-detection',
      defaultImageAnalyzers: ['asset:face-detection', 'asset:object-detection'],
      defaultVideoAnalyzer: 'asset:caption',
      defaultVideoAnalyzers: ['asset:caption'],
    });

    expect(result[CONTROL_POINT_IDS.IMAGE_DEFAULT]).toEqual([
      'asset:face-detection',
      'asset:object-detection',
    ]);
    expect(result[CONTROL_POINT_IDS.VIDEO_DEFAULT]).toEqual(['asset:caption']);
  });

  it('migrates intent chains', () => {
    const result = migrateV1ToV2({
      intentAssetAnalyzerChains: {
        character_ingest_face: ['asset:face-detection'],
      },
    });

    expect(result['_intent:character_ingest_face']).toEqual(['asset:face-detection']);
  });

  it('migrates intent scalars when no chain exists', () => {
    const result = migrateV1ToV2({
      intentAssetAnalyzers: {
        scene_prep_location: 'asset:scene-tagging',
      },
    });

    expect(result['_intent:scene_prep_location']).toEqual(['asset:scene-tagging']);
  });

  it('prefers intent chain over scalar', () => {
    const result = migrateV1ToV2({
      intentAssetAnalyzers: {
        character_ingest_face: 'asset:object-detection',
      },
      intentAssetAnalyzerChains: {
        character_ingest_face: ['asset:face-detection', 'asset:object-detection'],
      },
    });

    expect(result['_intent:character_ingest_face']).toEqual([
      'asset:face-detection',
      'asset:object-detection',
    ]);
  });

  it('returns defaults for empty v1 state', () => {
    const result = migrateV1ToV2({});
    expect(result[CONTROL_POINT_IDS.IMAGE_DEFAULT]).toEqual([DEFAULT_ASSET_ANALYZER_ID]);
    expect(result[CONTROL_POINT_IDS.VIDEO_DEFAULT]).toEqual([DEFAULT_ASSET_ANALYZER_ID]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// v2 API
// ─────────────────────────────────────────────────────────────────────────────

describe('v2 API: setPointAnalyzerChain / getPointAnalyzerChain', () => {
  it('sets and gets a custom point chain', () => {
    act(() => {
      useAnalyzerSettingsStore.getState().setPointAnalyzerChain('user:my-point', [
        'asset:face-detection',
        'asset:object-detection',
      ]);
    });

    const chain = useAnalyzerSettingsStore.getState().getPointAnalyzerChain('user:my-point');
    expect(chain).toEqual(['asset:face-detection', 'asset:object-detection']);
  });

  it('returns empty array for unset point', () => {
    const chain = useAnalyzerSettingsStore.getState().getPointAnalyzerChain('user:nonexistent');
    expect(chain).toEqual([]);
  });

  it('clearPointAnalyzerChain removes the chain', () => {
    act(() => {
      useAnalyzerSettingsStore.getState().setPointAnalyzerChain('user:test', ['asset:ocr']);
    });
    act(() => {
      useAnalyzerSettingsStore.getState().clearPointAnalyzerChain('user:test');
    });

    expect(useAnalyzerSettingsStore.getState().getPointAnalyzerChain('user:test')).toEqual([]);
  });

  it('setting empty array clears the chain', () => {
    act(() => {
      useAnalyzerSettingsStore.getState().setPointAnalyzerChain('user:test', ['asset:ocr']);
    });
    act(() => {
      useAnalyzerSettingsStore.getState().setPointAnalyzerChain('user:test', []);
    });

    expect(useAnalyzerSettingsStore.getState().getPointAnalyzerChain('user:test')).toEqual([]);
    expect(useAnalyzerSettingsStore.getState().pointAnalyzerChains['user:test']).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getEffectiveChain cascade
// ─────────────────────────────────────────────────────────────────────────────

describe('getEffectiveChain', () => {
  it('returns direct chain for control point', () => {
    const chain = useAnalyzerSettingsStore.getState().getEffectiveChain(CONTROL_POINT_IDS.IMAGE_DEFAULT);
    expect(chain).toEqual([DEFAULT_ASSET_ANALYZER_ID]);
  });

  it('returns intent chain when set', () => {
    act(() => {
      useAnalyzerSettingsStore.getState().setIntentAssetAnalyzerChain(
        'character_ingest_face',
        ['asset:face-detection']
      );
    });

    const chain = useAnalyzerSettingsStore.getState().getEffectiveChain('_intent:character_ingest_face');
    expect(chain).toEqual(['asset:face-detection']);
  });

  it('falls back to image default for unset intent', () => {
    act(() => {
      useAnalyzerSettingsStore.getState().setDefaultImageAnalyzers([
        'asset:scene-tagging',
        'asset:object-detection',
      ]);
    });

    const chain = useAnalyzerSettingsStore.getState().getEffectiveChain('_intent:scene_prep_style');
    expect(chain).toEqual(['asset:scene-tagging', 'asset:object-detection']);
  });

  it('returns direct chain for custom point when set', () => {
    act(() => {
      useAnalyzerSettingsStore.getState().setPointAnalyzerChain('user:custom', ['asset:ocr']);
    });

    expect(useAnalyzerSettingsStore.getState().getEffectiveChain('user:custom')).toEqual(['asset:ocr']);
  });

  it('returns empty for unset custom point', () => {
    expect(useAnalyzerSettingsStore.getState().getEffectiveChain('user:unknown')).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// v1 compat setters
// ─────────────────────────────────────────────────────────────────────────────

describe('v1 compat setters write to pointAnalyzerChains', () => {
  it('setDefaultImageAnalyzers updates control point', () => {
    act(() => {
      useAnalyzerSettingsStore.getState().setDefaultImageAnalyzers([
        'asset:face-detection',
        'asset:scene-tagging',
      ]);
    });

    const state = useAnalyzerSettingsStore.getState();
    expect(state.pointAnalyzerChains[CONTROL_POINT_IDS.IMAGE_DEFAULT]).toEqual([
      'asset:face-detection',
      'asset:scene-tagging',
    ]);
    // v1 compat fields also updated
    expect(state.defaultImageAnalyzer).toBe('asset:face-detection');
    expect(state.defaultImageAnalyzers).toEqual(['asset:face-detection', 'asset:scene-tagging']);
  });

  it('setDefaultVideoAnalyzer updates control point with primary', () => {
    act(() => {
      useAnalyzerSettingsStore.getState().setDefaultVideoAnalyzer('asset:caption');
    });

    const state = useAnalyzerSettingsStore.getState();
    expect(state.pointAnalyzerChains[CONTROL_POINT_IDS.VIDEO_DEFAULT][0]).toBe('asset:caption');
    expect(state.defaultVideoAnalyzer).toBe('asset:caption');
  });

  it('setIntentAssetAnalyzerChain updates intent point', () => {
    act(() => {
      useAnalyzerSettingsStore.getState().setIntentAssetAnalyzerChain(
        'character_ingest_sheet',
        ['asset:face-detection', 'asset:object-detection']
      );
    });

    const state = useAnalyzerSettingsStore.getState();
    expect(state.pointAnalyzerChains['_intent:character_ingest_sheet']).toEqual([
      'asset:face-detection',
      'asset:object-detection',
    ]);
    expect(state.intentAssetAnalyzerChains.character_ingest_sheet).toEqual([
      'asset:face-detection',
      'asset:object-detection',
    ]);
    expect(state.intentAssetAnalyzers.character_ingest_sheet).toBe('asset:face-detection');
  });

  it('clearIntentAssetAnalyzer removes intent point', () => {
    act(() => {
      useAnalyzerSettingsStore.getState().setIntentAssetAnalyzerChain(
        'scene_prep_location',
        ['asset:scene-tagging']
      );
    });
    act(() => {
      useAnalyzerSettingsStore.getState().clearIntentAssetAnalyzer('scene_prep_location');
    });

    const state = useAnalyzerSettingsStore.getState();
    expect(state.pointAnalyzerChains['_intent:scene_prep_location']).toBeUndefined();
    expect(state.intentAssetAnalyzerChains.scene_prep_location).toBeUndefined();
    expect(state.intentAssetAnalyzers.scene_prep_location).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// v1 compat getters
// ─────────────────────────────────────────────────────────────────────────────

describe('v1 compat getters', () => {
  it('getDefaultAssetAnalyzers returns image chain by default', () => {
    act(() => {
      useAnalyzerSettingsStore.getState().setDefaultImageAnalyzers([
        'asset:face-detection',
        'asset:object-detection',
      ]);
    });

    expect(useAnalyzerSettingsStore.getState().getDefaultAssetAnalyzers()).toEqual([
      'asset:face-detection',
      'asset:object-detection',
    ]);
    expect(useAnalyzerSettingsStore.getState().getDefaultAssetAnalyzers('image')).toEqual([
      'asset:face-detection',
      'asset:object-detection',
    ]);
  });

  it('getDefaultAssetAnalyzers returns video chain for video', () => {
    act(() => {
      useAnalyzerSettingsStore.getState().setDefaultVideoAnalyzers(['asset:caption']);
    });

    expect(useAnalyzerSettingsStore.getState().getDefaultAssetAnalyzers('video')).toEqual([
      'asset:caption',
    ]);
  });

  it('getDefaultAssetAnalyzer returns primary', () => {
    act(() => {
      useAnalyzerSettingsStore.getState().setDefaultImageAnalyzers([
        'asset:face-detection',
        'asset:object-detection',
      ]);
    });

    expect(useAnalyzerSettingsStore.getState().getDefaultAssetAnalyzer()).toBe('asset:face-detection');
  });

  it('getIntentAssetAnalyzerChain returns chain when set', () => {
    act(() => {
      useAnalyzerSettingsStore.getState().setIntentAssetAnalyzerChain(
        'character_ingest_face',
        ['asset:face-detection']
      );
    });

    expect(
      useAnalyzerSettingsStore.getState().getIntentAssetAnalyzerChain('character_ingest_face')
    ).toEqual(['asset:face-detection']);
  });

  it('getIntentAssetAnalyzerChain returns empty for unset intent', () => {
    expect(
      useAnalyzerSettingsStore.getState().getIntentAssetAnalyzerChain('scene_prep_style')
    ).toEqual([]);
  });

  it('getIntentAssetAnalyzer returns primary or null', () => {
    expect(
      useAnalyzerSettingsStore.getState().getIntentAssetAnalyzer('character_ingest_face')
    ).toBe(null);

    act(() => {
      useAnalyzerSettingsStore.getState().setIntentAssetAnalyzerChain(
        'character_ingest_face',
        ['asset:face-detection']
      );
    });

    expect(
      useAnalyzerSettingsStore.getState().getIntentAssetAnalyzer('character_ingest_face')
    ).toBe('asset:face-detection');
  });

  it('getDefaultAssetAnalyzerChainForIntent falls back to media default', () => {
    act(() => {
      useAnalyzerSettingsStore.getState().setDefaultImageAnalyzers([
        'asset:scene-tagging',
        'asset:object-detection',
      ]);
    });

    // No intent override set, should fall back to image default
    expect(
      useAnalyzerSettingsStore.getState().getDefaultAssetAnalyzerChainForIntent('scene_prep_style')
    ).toEqual(['asset:scene-tagging', 'asset:object-detection']);
  });

  it('getDefaultAssetAnalyzerChainForIntent uses intent chain when set', () => {
    act(() => {
      useAnalyzerSettingsStore.getState().setDefaultImageAnalyzers(['asset:object-detection']);
      useAnalyzerSettingsStore.getState().setIntentAssetAnalyzerChain(
        'character_ingest_face',
        ['asset:face-detection']
      );
    });

    expect(
      useAnalyzerSettingsStore.getState().getDefaultAssetAnalyzerChainForIntent('character_ingest_face')
    ).toEqual(['asset:face-detection']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// resetAnalyzerSettings
// ─────────────────────────────────────────────────────────────────────────────

describe('resetAnalyzerSettings', () => {
  it('resets all chains to defaults', () => {
    act(() => {
      const s = useAnalyzerSettingsStore.getState();
      s.setDefaultImageAnalyzers(['asset:face-detection', 'asset:caption']);
      s.setIntentAssetAnalyzerChain('character_ingest_face', ['asset:face-detection']);
      s.setPointAnalyzerChain('user:custom', ['asset:ocr']);
    });

    act(() => {
      useAnalyzerSettingsStore.getState().resetAnalyzerSettings();
    });

    const state = useAnalyzerSettingsStore.getState();
    expect(state.pointAnalyzerChains[CONTROL_POINT_IDS.IMAGE_DEFAULT]).toEqual([
      DEFAULT_ASSET_ANALYZER_ID,
    ]);
    expect(state.pointAnalyzerChains['_intent:character_ingest_face']).toBeUndefined();
    expect(state.pointAnalyzerChains['user:custom']).toBeUndefined();
    expect(state.defaultImageAnalyzer).toBe(DEFAULT_ASSET_ANALYZER_ID);
    expect(state.intentAssetAnalyzers).toEqual({});
    expect(state.intentAssetAnalyzerChains).toEqual({});
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// v1 -> v2 round-trip
// ─────────────────────────────────────────────────────────────────────────────

describe('v1 -> v2 round-trip consistency', () => {
  it('v1 setters produce same v1 getter results as before', () => {
    act(() => {
      const s = useAnalyzerSettingsStore.getState();
      s.setDefaultImageAnalyzers(['asset:face-detection', 'asset:object-detection']);
      s.setDefaultVideoAnalyzers(['asset:caption']);
      s.setIntentAssetAnalyzerChain('character_ingest_face', ['asset:face-detection']);
    });

    const state = useAnalyzerSettingsStore.getState();

    // v1 getters should reflect what was set
    expect(state.getDefaultAssetAnalyzers('image')).toEqual([
      'asset:face-detection',
      'asset:object-detection',
    ]);
    expect(state.getDefaultAssetAnalyzers('video')).toEqual(['asset:caption']);
    expect(state.getDefaultAssetAnalyzer('image')).toBe('asset:face-detection');
    expect(state.getDefaultAssetAnalyzer('video')).toBe('asset:caption');
    expect(state.getIntentAssetAnalyzerChain('character_ingest_face')).toEqual([
      'asset:face-detection',
    ]);
    expect(state.getIntentAssetAnalyzer('character_ingest_face')).toBe('asset:face-detection');
    expect(state.getDefaultAssetAnalyzerForIntent('character_ingest_face')).toBe(
      'asset:face-detection'
    );

    // v2 getters should agree
    expect(state.getPointAnalyzerChain(CONTROL_POINT_IDS.IMAGE_DEFAULT)).toEqual([
      'asset:face-detection',
      'asset:object-detection',
    ]);
    expect(state.getEffectiveChain('_intent:character_ingest_face')).toEqual([
      'asset:face-detection',
    ]);
  });
});
