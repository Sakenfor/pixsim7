/**
 * Surface Dimension Store
 *
 * Generic Zustand store for managing surface interaction dimensions.
 * Profile-driven - loads dimension configurations from surface profiles.
 *
 * Replaces the hardcoded interactionStatsStore with a flexible system
 * that supports any domain (romance, massage, botanical, etc.).
 */

import type {
  SurfaceProfile,
  SurfaceDimension,
  DimensionValues,
  DimensionContribution,
  GizmoSessionResult,
  SurfaceRegion,
} from '@pixsim7/shared.types';
import { create } from 'zustand';

// =============================================================================
// Types
// =============================================================================

/** Snapshot for history tracking */
interface DimensionSnapshot {
  timestamp: number;
  dimensions: DimensionValues;
  trigger?: {
    instrumentId: string;
    regionId: string;
  };
}

/** Store state */
interface SurfaceDimensionState {
  /** Current profile ID (null if not initialized) */
  profileId: string | null;

  /** Dimension configurations from profile */
  dimensionConfigs: Record<string, SurfaceDimension>;

  /** Current dimension values */
  dimensions: DimensionValues;

  /** Peak values reached during session */
  peakValues: DimensionValues;

  /** Contribution mappings from profile */
  contributions: Record<string, DimensionContribution[]>;

  /** Whether dimensions are being actively updated */
  isActive: boolean;

  /** Session start timestamp */
  sessionStartedAt: number | null;

  /** Last update timestamp for decay */
  lastUpdate: number;

  /** History for visualization/debugging */
  history: DimensionSnapshot[];

  /** Decay subscriber count */
  decaySubscriberCount: number;

  /** Whether decay timer is running */
  isDecayRunning: boolean;

  /** Instrument usage counts */
  instrumentUsage: Record<string, number>;

  /** Region interaction counts */
  regionInteractions: Record<string, number>;
}

/** Store actions */
interface SurfaceDimensionActions {
  /** Initialize store from a surface profile */
  initFromProfile: (profile: SurfaceProfile) => void;

  /** Reset to initial state */
  reset: () => void;

  /** Update a single dimension */
  updateDimension: (dimensionId: string, delta: number) => void;

  /** Update multiple dimensions */
  updateDimensions: (changes: DimensionValues) => void;

  /** Set a dimension to specific value */
  setDimension: (dimensionId: string, value: number) => void;

  /** Apply decay to all dimensions based on elapsed time */
  applyDecay: () => void;

  /** Set active state (pauses decay when active) */
  setActive: (active: boolean) => void;

  /** Calculate and apply instrument contributions for a region */
  applyInstrumentContribution: (
    instrumentId: string,
    region: SurfaceRegion,
    pressure: number,
    speed: number,
    deltaTime: number
  ) => DimensionValues;

  /** Get current session duration in seconds */
  getSessionDuration: () => number;

  /** Check if completion criteria are met */
  checkCompletion: (profile: SurfaceProfile) => {
    isComplete: boolean;
    completionType?: 'success' | 'timeout';
    metConditions: string[];
  };

  /** Get session result for interaction execution */
  getSessionResult: (completionType: GizmoSessionResult['completionType']) => GizmoSessionResult;

  /** Get all dimensions sorted by value */
  getSortedDimensions: () => Array<{ id: string; value: number; config: SurfaceDimension }>;

  /** Get dominant dimension */
  getDominant: () => { id: string; value: number } | null;

  /** Get reaction level for a dimension */
  getReactionLevel: (dimensionId: string) => 'none' | 'low' | 'medium' | 'high' | 'peak';

  /** Record history snapshot */
  recordHistory: (trigger?: { instrumentId: string; regionId: string }) => void;

  /** Clear history */
  clearHistory: () => void;

  /** Subscribe to decay timer */
  subscribeDecay: (intervalMs?: number) => () => void;

  /** Internal: start decay timer */
  _startDecayTimer: (intervalMs: number) => void;

  /** Internal: stop decay timer */
  _stopDecayTimer: () => void;
}

// =============================================================================
// Module State
// =============================================================================

let decayTimerId: ReturnType<typeof setInterval> | null = null;

// =============================================================================
// Store
// =============================================================================

export const useSurfaceDimensionStore = create<SurfaceDimensionState & SurfaceDimensionActions>(
  (set, get) => ({
    // Initial state
    profileId: null,
    dimensionConfigs: {},
    dimensions: {},
    peakValues: {},
    contributions: {},
    isActive: false,
    sessionStartedAt: null,
    lastUpdate: Date.now(),
    history: [],
    decaySubscriberCount: 0,
    isDecayRunning: false,
    instrumentUsage: {},
    regionInteractions: {},

    initFromProfile: (profile) => {
      // Build dimension configs map
      const dimensionConfigs: Record<string, SurfaceDimension> = {};
      const dimensions: DimensionValues = {};

      for (const dim of profile.dimensions) {
        dimensionConfigs[dim.id] = dim;
        dimensions[dim.id] = dim.initialValue ?? 0;
      }

      set({
        profileId: profile.id,
        dimensionConfigs,
        dimensions,
        peakValues: { ...dimensions },
        contributions: profile.contributions,
        isActive: false,
        sessionStartedAt: Date.now(),
        lastUpdate: Date.now(),
        history: [],
        instrumentUsage: {},
        regionInteractions: {},
      });
    },

    reset: () => {
      const { _stopDecayTimer } = get();
      _stopDecayTimer();

      set({
        profileId: null,
        dimensionConfigs: {},
        dimensions: {},
        peakValues: {},
        contributions: {},
        isActive: false,
        sessionStartedAt: null,
        lastUpdate: Date.now(),
        history: [],
        decaySubscriberCount: 0,
        isDecayRunning: false,
        instrumentUsage: {},
        regionInteractions: {},
      });
    },

    updateDimension: (dimensionId, delta) => {
      set((state) => {
        const config = state.dimensionConfigs[dimensionId];
        if (!config) return state;

        const currentValue = state.dimensions[dimensionId] ?? 0;
        const newValue = Math.max(
          config.minValue,
          Math.min(config.maxValue, currentValue + delta)
        );

        const newPeak = Math.max(state.peakValues[dimensionId] ?? 0, newValue);

        return {
          dimensions: { ...state.dimensions, [dimensionId]: newValue },
          peakValues: { ...state.peakValues, [dimensionId]: newPeak },
          lastUpdate: Date.now(),
        };
      });
    },

    updateDimensions: (changes) => {
      set((state) => {
        const newDimensions = { ...state.dimensions };
        const newPeaks = { ...state.peakValues };

        for (const [dimId, delta] of Object.entries(changes)) {
          const config = state.dimensionConfigs[dimId];
          if (!config) continue;

          const currentValue = newDimensions[dimId] ?? 0;
          const newValue = Math.max(
            config.minValue,
            Math.min(config.maxValue, currentValue + delta)
          );

          newDimensions[dimId] = newValue;
          newPeaks[dimId] = Math.max(newPeaks[dimId] ?? 0, newValue);
        }

        return {
          dimensions: newDimensions,
          peakValues: newPeaks,
          lastUpdate: Date.now(),
        };
      });
    },

    setDimension: (dimensionId, value) => {
      set((state) => {
        const config = state.dimensionConfigs[dimensionId];
        if (!config) return state;

        const clampedValue = Math.max(
          config.minValue,
          Math.min(config.maxValue, value)
        );

        return {
          dimensions: { ...state.dimensions, [dimensionId]: clampedValue },
          peakValues: {
            ...state.peakValues,
            [dimensionId]: Math.max(state.peakValues[dimensionId] ?? 0, clampedValue),
          },
          lastUpdate: Date.now(),
        };
      });
    },

    applyDecay: () => {
      const { dimensions, dimensionConfigs, lastUpdate, isActive } = get();

      // Don't decay while actively interacting
      if (isActive) {
        set({ lastUpdate: Date.now() });
        return;
      }

      const now = Date.now();
      const deltaTime = (now - lastUpdate) / 1000;

      if (deltaTime < 0.05) return; // Skip if < 50ms

      const decayedDimensions: DimensionValues = {};

      for (const [dimId, value] of Object.entries(dimensions)) {
        const config = dimensionConfigs[dimId];
        if (!config) {
          decayedDimensions[dimId] = value;
          continue;
        }

        const decay = config.decayRate * deltaTime;
        decayedDimensions[dimId] = Math.max(config.minValue, value - decay);
      }

      set({
        dimensions: decayedDimensions,
        lastUpdate: now,
      });
    },

    setActive: (active) => {
      set({ isActive: active, lastUpdate: Date.now() });
    },

    applyInstrumentContribution: (instrumentId, region, pressure, speed, deltaTime) => {
      const { contributions, updateDimensions, instrumentUsage, regionInteractions } = get();

      const instrumentContribs = contributions[instrumentId];
      if (!instrumentContribs || instrumentContribs.length === 0) {
        return {};
      }

      const changes: DimensionValues = {};

      for (const contrib of instrumentContribs) {
        let amount = contrib.baseAmount;

        // Apply pressure scaling
        if (contrib.pressureScale) {
          amount *= 1 + (pressure - 0.5) * contrib.pressureScale;
        }

        // Apply speed scaling
        if (contrib.speedScale) {
          amount *= 1 + (speed - 0.5) * contrib.speedScale;
        }

        // Apply region property scaling
        if (contrib.regionPropertyScale) {
          for (const [propName, scale] of Object.entries(contrib.regionPropertyScale)) {
            const propValue = region.properties[propName];
            if (propValue !== undefined) {
              // Positive scale multiplies contribution, negative scale can reduce it
              if (scale >= 0) {
                amount *= 1 + propValue * scale;
              } else {
                amount *= Math.max(0.1, 1 + propValue * scale);
              }
            }
          }
        }

        // Apply instrument modifiers from region
        const instrumentMod = region.instrumentModifiers?.[instrumentId];
        if (instrumentMod !== undefined) {
          amount *= instrumentMod;
        }

        // Scale by delta time
        amount *= deltaTime * 10; // Baseline ~100ms ticks

        // Clamp to reasonable range
        amount = Math.max(-0.1, Math.min(0.1, amount));

        if (Math.abs(amount) > 0.001) {
          changes[contrib.dimension] = (changes[contrib.dimension] ?? 0) + amount;
        }
      }

      // Apply changes
      if (Object.keys(changes).length > 0) {
        updateDimensions(changes);
      }

      // Track usage
      set({
        instrumentUsage: {
          ...instrumentUsage,
          [instrumentId]: (instrumentUsage[instrumentId] ?? 0) + 1,
        },
        regionInteractions: {
          ...regionInteractions,
          [region.id]: (regionInteractions[region.id] ?? 0) + 1,
        },
      });

      return changes;
    },

    getSessionDuration: () => {
      const { sessionStartedAt } = get();
      if (!sessionStartedAt) return 0;
      return (Date.now() - sessionStartedAt) / 1000;
    },

    checkCompletion: (profile) => {
      const { dimensions, getSessionDuration } = get();
      const criteria = profile.completionCriteria;

      if (!criteria) {
        return { isComplete: false, metConditions: [] };
      }

      const duration = getSessionDuration();
      const metConditions: string[] = [];

      // Check time limit
      if (criteria.timeLimit && duration >= criteria.timeLimit) {
        return {
          isComplete: true,
          completionType: 'timeout',
          metConditions: ['Time limit reached'],
        };
      }

      // Check minimum duration
      if (criteria.minDuration && duration < criteria.minDuration) {
        return { isComplete: false, metConditions: [] };
      }

      // Check allOf conditions (all must be met)
      let allOfMet = true;
      if (criteria.allOf && criteria.allOf.length > 0) {
        for (const cond of criteria.allOf) {
          const met = checkCondition(cond, dimensions, duration);
          if (met) {
            metConditions.push(cond.label || cond.type);
          } else {
            allOfMet = false;
          }
        }
      }

      // Check anyOf conditions (at least one must be met)
      let anyOfMet = !criteria.anyOf || criteria.anyOf.length === 0;
      if (criteria.anyOf && criteria.anyOf.length > 0) {
        for (const cond of criteria.anyOf) {
          const met = checkCondition(cond, dimensions, duration);
          if (met) {
            anyOfMet = true;
            metConditions.push(cond.label || cond.type);
          }
        }
      }

      const isComplete = allOfMet && anyOfMet;

      return {
        isComplete,
        completionType: isComplete ? 'success' : undefined,
        metConditions,
      };
    },

    getSessionResult: (completionType) => {
      const { dimensions, peakValues, instrumentUsage, regionInteractions, getSessionDuration } = get();

      return {
        finalDimensions: { ...dimensions },
        completionType,
        sessionDuration: getSessionDuration(),
        peakValues: { ...peakValues },
        instrumentUsage: { ...instrumentUsage },
        regionInteractions: { ...regionInteractions },
      };
    },

    getSortedDimensions: () => {
      const { dimensions, dimensionConfigs } = get();

      return Object.entries(dimensions)
        .filter(([id]) => dimensionConfigs[id]?.visible !== false)
        .map(([id, value]) => ({
          id,
          value,
          config: dimensionConfigs[id],
        }))
        .sort((a, b) => b.value - a.value);
    },

    getDominant: () => {
      const { dimensions } = get();

      let dominant: { id: string; value: number } | null = null;

      for (const [id, value] of Object.entries(dimensions)) {
        if (!dominant || value > dominant.value) {
          dominant = { id, value };
        }
      }

      return dominant && dominant.value > 0.1 ? dominant : null;
    },

    getReactionLevel: (dimensionId) => {
      const { dimensions, dimensionConfigs } = get();
      const value = dimensions[dimensionId] ?? 0;
      const config = dimensionConfigs[dimensionId];

      if (!config?.thresholds) {
        return value > 0.5 ? 'medium' : value > 0.2 ? 'low' : 'none';
      }

      const thresholds = config.thresholds;
      if (thresholds.peak !== undefined && value >= thresholds.peak) return 'peak';
      if (thresholds.high !== undefined && value >= thresholds.high) return 'high';
      if (thresholds.medium !== undefined && value >= thresholds.medium) return 'medium';
      if (thresholds.low !== undefined && value >= thresholds.low) return 'low';
      return 'none';
    },

    recordHistory: (trigger) => {
      set((state) => ({
        history: [
          ...state.history.slice(-99),
          {
            timestamp: Date.now(),
            dimensions: { ...state.dimensions },
            trigger,
          },
        ],
      }));
    },

    clearHistory: () => {
      set({ history: [] });
    },

    subscribeDecay: (intervalMs = 100) => {
      const { decaySubscriberCount, _startDecayTimer } = get();

      set({ decaySubscriberCount: decaySubscriberCount + 1 });

      if (decaySubscriberCount === 0) {
        _startDecayTimer(intervalMs);
      }

      return () => {
        const { decaySubscriberCount, _stopDecayTimer } = get();
        const newCount = Math.max(0, decaySubscriberCount - 1);
        set({ decaySubscriberCount: newCount });

        if (newCount === 0) {
          _stopDecayTimer();
        }
      };
    },

    _startDecayTimer: (intervalMs) => {
      if (decayTimerId !== null) return;

      decayTimerId = setInterval(() => {
        get().applyDecay();
      }, intervalMs);

      set({ isDecayRunning: true });
    },

    _stopDecayTimer: () => {
      if (decayTimerId !== null) {
        clearInterval(decayTimerId);
        decayTimerId = null;
      }
      set({ isDecayRunning: false });
    },
  })
);

// =============================================================================
// Helpers
// =============================================================================

function checkCondition(
  condition: NonNullable<SurfaceProfile['completionCriteria']>['allOf'][number],
  dimensions: DimensionValues,
  duration: number
): boolean {
  switch (condition.type) {
    case 'dimension_threshold': {
      if (!condition.dimensionId) return false;
      const value = dimensions[condition.dimensionId] ?? 0;
      return condition.minValue !== undefined && value >= condition.minValue;
    }

    case 'all_dimensions': {
      if (!condition.averageMin) return false;
      const values = Object.values(dimensions);
      if (values.length === 0) return false;
      const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
      return avg >= condition.averageMin;
    }

    case 'time_elapsed':
      return condition.seconds !== undefined && duration >= condition.seconds;

    case 'custom':
      // Custom conditions not implemented yet
      return false;

    default:
      return false;
  }
}
