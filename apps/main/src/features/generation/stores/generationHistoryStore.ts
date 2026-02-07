import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import type { OperationType } from "@/types/operations";

/**
 * History mode determines how assets are grouped.
 * - 'per-operation': Separate history for each operation type (i2v, extend, etc.)
 * - 'global': Single shared history across all operation types
 */
export type HistoryMode = 'per-operation' | 'global';
export type HistorySortMode = 'pinned-first' | 'recent-first';

/** Special key used for global history mode */
const GLOBAL_HISTORY_KEY = '_global' as OperationType;

/**
 * Asset history entry for per-operation tracking.
 * Tracks assets used in generations for quick reuse.
 */
export interface AssetHistoryEntry {
  assetId: number;
  thumbnailUrl: string;      // Cache for quick display
  mediaType: 'image' | 'video';
  lastUsedAt: string;        // ISO timestamp
  useCount: number;
  pinned: boolean;
}

/**
 * Generation history state - tracks assets used per operation type.
 * Provides quick swap functionality for frequently used assets.
 */
export interface GenerationHistoryState {
  historyByOperation: Partial<Record<OperationType | '_global', AssetHistoryEntry[]>>;
  maxHistorySize: number;    // Default 20 per operation
  historyMode: HistoryMode;  // per-operation or global
  historySortMode: HistorySortMode;
  includeOutputsInHistory: boolean;
  hideIncompatibleAssets: boolean;
  autoPrefetchHistoryThumbnails: boolean;
  usePerOperationHistoryLimits: boolean;
  maxHistorySizeByOperation: Partial<Record<OperationType, number>>;

  // Settings
  setHistoryMode: (mode: HistoryMode) => void;
  setMaxHistorySize: (size: number) => void;
  setHistorySortMode: (mode: HistorySortMode) => void;
  setIncludeOutputsInHistory: (value: boolean) => void;
  setHideIncompatibleAssets: (value: boolean) => void;
  setAutoPrefetchHistoryThumbnails: (value: boolean) => void;
  setUsePerOperationHistoryLimits: (value: boolean) => void;
  setMaxHistorySizeForOperation: (operationType: OperationType, size: number) => void;

  // Actions
  recordUsage: (
    operationType: OperationType,
    assets: Array<{ id: number; thumbnailUrl?: string; mediaType?: string }>
  ) => void;
  togglePin: (operationType: OperationType, assetId: number) => void;
  removeFromHistory: (operationType: OperationType, assetId: number) => void;
  clearHistory: (operationType: OperationType) => void;
  clearAllHistory: () => void;
  clearAllUnpinned: () => void;

  // Getters
  getHistory: (operationType: OperationType) => AssetHistoryEntry[];
  getSortedHistory: (operationType: OperationType) => AssetHistoryEntry[]; // Pinned first, then by recency
}

const DEFAULT_MAX_HISTORY_SIZE = 20;

/**
 * Zustand store for generation asset history.
 * Persists to localStorage for cross-session access.
 */
export const useGenerationHistoryStore = create<GenerationHistoryState>()(
  persist(
    (set, get) => ({
      historyByOperation: {},
      maxHistorySize: DEFAULT_MAX_HISTORY_SIZE,
      historyMode: 'per-operation' as HistoryMode,
      historySortMode: 'pinned-first' as HistorySortMode,
      includeOutputsInHistory: true,
      hideIncompatibleAssets: false,
      autoPrefetchHistoryThumbnails: true,
      usePerOperationHistoryLimits: false,
      maxHistorySizeByOperation: {},

      setHistoryMode: (mode) => set({ historyMode: mode }),
      setMaxHistorySize: (size) => set({ maxHistorySize: Math.max(1, Math.min(100, size)) }),
      setHistorySortMode: (mode) => set({ historySortMode: mode }),
      setIncludeOutputsInHistory: (value) => set({ includeOutputsInHistory: value }),
      setHideIncompatibleAssets: (value) => set({ hideIncompatibleAssets: value }),
      setAutoPrefetchHistoryThumbnails: (value) => set({ autoPrefetchHistoryThumbnails: value }),
      setUsePerOperationHistoryLimits: (value) => set({ usePerOperationHistoryLimits: value }),
      setMaxHistorySizeForOperation: (operationType, size) =>
        set((state) => ({
          maxHistorySizeByOperation: {
            ...state.maxHistorySizeByOperation,
            [operationType]: Math.max(1, Math.min(100, size)),
          },
        })),

      recordUsage: (operationType, assets) => {
        if (assets.length === 0) return;

        set((state) => {
          // Use global key if in global mode, otherwise use operation type
          const historyKey = state.historyMode === 'global' ? GLOBAL_HISTORY_KEY : operationType;
          const currentHistory = state.historyByOperation[historyKey] ?? [];
          const now = new Date().toISOString();
          const updatedHistory = [...currentHistory];

          for (const asset of assets) {
            // Skip if no valid ID
            if (!asset.id || !Number.isFinite(asset.id)) continue;

            const existingIndex = updatedHistory.findIndex(
              (entry) => entry.assetId === asset.id
            );

            if (existingIndex >= 0) {
              // Update existing entry
              const existing = updatedHistory[existingIndex];
              updatedHistory[existingIndex] = {
                ...existing,
                lastUsedAt: now,
                useCount: existing.useCount + 1,
                // Update thumbnailUrl if provided and existing is empty
                thumbnailUrl: asset.thumbnailUrl || existing.thumbnailUrl,
              };
            } else {
              // Add new entry
              updatedHistory.push({
                assetId: asset.id,
                thumbnailUrl: asset.thumbnailUrl || '',
                mediaType: (asset.mediaType === 'video' ? 'video' : 'image') as 'image' | 'video',
                lastUsedAt: now,
                useCount: 1,
                pinned: false,
              });
            }
          }

          const effectiveMaxSize =
            state.historyMode === 'per-operation' && state.usePerOperationHistoryLimits
              ? state.maxHistorySizeByOperation[operationType] ?? state.maxHistorySize
              : state.maxHistorySize;

          // Prune unpinned entries beyond maxHistorySize
          const pinned = updatedHistory.filter((e) => e.pinned);
          const unpinned = updatedHistory.filter((e) => !e.pinned);

          // Sort unpinned by lastUsedAt descending
          unpinned.sort(
            (a, b) => new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime()
          );

          // Keep only maxHistorySize unpinned entries
          const prunedUnpinned = unpinned.slice(0, Math.max(1, effectiveMaxSize));

          return {
            historyByOperation: {
              ...state.historyByOperation,
              [historyKey]: [...pinned, ...prunedUnpinned],
            },
          };
        });
      },

      togglePin: (operationType, assetId) => {
        set((state) => {
          const historyKey = state.historyMode === 'global' ? GLOBAL_HISTORY_KEY : operationType;
          const currentHistory = state.historyByOperation[historyKey] ?? [];
          const updatedHistory = currentHistory.map((entry) =>
            entry.assetId === assetId
              ? { ...entry, pinned: !entry.pinned }
              : entry
          );

          return {
            historyByOperation: {
              ...state.historyByOperation,
              [historyKey]: updatedHistory,
            },
          };
        });
      },

      removeFromHistory: (operationType, assetId) => {
        set((state) => {
          const historyKey = state.historyMode === 'global' ? GLOBAL_HISTORY_KEY : operationType;
          const currentHistory = state.historyByOperation[historyKey] ?? [];
          const updatedHistory = currentHistory.filter(
            (entry) => entry.assetId !== assetId
          );

          return {
            historyByOperation: {
              ...state.historyByOperation,
              [historyKey]: updatedHistory,
            },
          };
        });
      },

      clearHistory: (operationType) => {
        set((state) => {
          const historyKey = state.historyMode === 'global' ? GLOBAL_HISTORY_KEY : operationType;
          const currentHistory = state.historyByOperation[historyKey] ?? [];
          // Keep pinned entries
          const pinnedOnly = currentHistory.filter((e) => e.pinned);

          return {
            historyByOperation: {
              ...state.historyByOperation,
              [historyKey]: pinnedOnly,
            },
          };
        });
      },

      clearAllHistory: () => {
        set({ historyByOperation: {} });
      },
      clearAllUnpinned: () => {
        set((state) => {
          const nextHistory: Partial<Record<OperationType | '_global', AssetHistoryEntry[]>> = {};
          (Object.keys(state.historyByOperation) as Array<OperationType | '_global'>).forEach((key) => {
            const current = state.historyByOperation[key] ?? [];
            nextHistory[key] = current.filter((entry) => entry.pinned);
          });
          return { historyByOperation: nextHistory };
        });
      },

      getHistory: (operationType) => {
        const state = get();
        const historyKey = state.historyMode === 'global' ? GLOBAL_HISTORY_KEY : operationType;
        return state.historyByOperation[historyKey] ?? [];
      },

      getSortedHistory: (operationType) => {
        const state = get();
        const historyKey = state.historyMode === 'global' ? GLOBAL_HISTORY_KEY : operationType;
        const history = state.historyByOperation[historyKey] ?? [];

        if (state.historySortMode === 'recent-first') {
          return [...history].sort(
            (a, b) => new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime()
          );
        }

        // Separate pinned and unpinned
        const pinned = history.filter((e) => e.pinned);
        const unpinned = history.filter((e) => !e.pinned);

        // Sort pinned by useCount descending
        pinned.sort((a, b) => b.useCount - a.useCount);

        // Sort unpinned by lastUsedAt descending
        unpinned.sort(
          (a, b) => new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime()
        );

        return [...pinned, ...unpinned];
      },
    }),
    {
      name: 'generation-history-store',
      storage: createJSONStorage(() => localStorage),
      version: 1,
      partialize: (state) => ({
        historyByOperation: state.historyByOperation,
        maxHistorySize: state.maxHistorySize,
        historyMode: state.historyMode,
        historySortMode: state.historySortMode,
        includeOutputsInHistory: state.includeOutputsInHistory,
        hideIncompatibleAssets: state.hideIncompatibleAssets,
        autoPrefetchHistoryThumbnails: state.autoPrefetchHistoryThumbnails,
        usePerOperationHistoryLimits: state.usePerOperationHistoryLimits,
        maxHistorySizeByOperation: state.maxHistorySizeByOperation,
      }),
    }
  )
);
