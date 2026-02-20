/**
 * Asset Set Store
 *
 * Persistent named collections of assets for generation strategies.
 * Manual sets hold explicit asset IDs; smart sets hold filter criteria
 * that are resolved dynamically at generation time.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { AssetFilters } from '../hooks/useAssets';

// ── Types ──────────────────────────────────────────────────────────────

export type AssetSetKind = 'manual' | 'smart';

export interface ManualAssetSet {
  id: string;
  name: string;
  kind: 'manual';
  assetIds: number[];
  description?: string;
  color?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SmartAssetSet {
  id: string;
  name: string;
  kind: 'smart';
  filters: AssetFilters;
  maxResults?: number;
  description?: string;
  color?: string;
  createdAt: string;
  updatedAt: string;
}

export type AssetSet = ManualAssetSet | SmartAssetSet;

// ── Store ──────────────────────────────────────────────────────────────

interface AssetSetState {
  sets: AssetSet[];

  createSet: (set: Omit<AssetSet, 'id' | 'createdAt' | 'updatedAt'>) => AssetSet;
  updateSet: (id: string, patch: Partial<Pick<AssetSet, 'name' | 'description' | 'color'>>) => void;
  deleteSet: (id: string) => void;
  renameSet: (id: string, name: string) => void;

  // Manual set mutations
  addAssetsToSet: (id: string, assetIds: number[]) => void;
  removeAssetsFromSet: (id: string, assetIds: number[]) => void;
  reorderAssetsInSet: (id: string, assetIds: number[]) => void;

  // Smart set mutations
  updateSmartFilters: (id: string, filters: AssetFilters, maxResults?: number) => void;

  // Queries
  getSet: (id: string) => AssetSet | undefined;
  getAllSets: () => AssetSet[];
}

export const useAssetSetStore = create<AssetSetState>()(
  persist(
    (set, get) => ({
      sets: [],

      createSet: (input) => {
        const now = new Date().toISOString();
        const newSet: AssetSet = {
          ...input,
          id: `aset_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          createdAt: now,
          updatedAt: now,
        } as AssetSet;
        set((state) => ({ sets: [...state.sets, newSet] }));
        return newSet;
      },

      updateSet: (id, patch) =>
        set((state) => ({
          sets: state.sets.map((s) =>
            s.id === id
              ? { ...s, ...patch, updatedAt: new Date().toISOString() }
              : s,
          ),
        })),

      deleteSet: (id) =>
        set((state) => ({ sets: state.sets.filter((s) => s.id !== id) })),

      renameSet: (id, name) =>
        set((state) => ({
          sets: state.sets.map((s) =>
            s.id === id
              ? { ...s, name, updatedAt: new Date().toISOString() }
              : s,
          ),
        })),

      addAssetsToSet: (id, assetIds) =>
        set((state) => ({
          sets: state.sets.map((s) => {
            if (s.id !== id || s.kind !== 'manual') return s;
            const existing = new Set(s.assetIds);
            const newIds = assetIds.filter((aid) => !existing.has(aid));
            if (newIds.length === 0) return s;
            return {
              ...s,
              assetIds: [...s.assetIds, ...newIds],
              updatedAt: new Date().toISOString(),
            };
          }),
        })),

      removeAssetsFromSet: (id, assetIds) =>
        set((state) => ({
          sets: state.sets.map((s) => {
            if (s.id !== id || s.kind !== 'manual') return s;
            const removeSet = new Set(assetIds);
            return {
              ...s,
              assetIds: s.assetIds.filter((aid) => !removeSet.has(aid)),
              updatedAt: new Date().toISOString(),
            };
          }),
        })),

      reorderAssetsInSet: (id, assetIds) =>
        set((state) => ({
          sets: state.sets.map((s) =>
            s.id === id && s.kind === 'manual'
              ? { ...s, assetIds, updatedAt: new Date().toISOString() }
              : s,
          ),
        })),

      updateSmartFilters: (id, filters, maxResults) =>
        set((state) => ({
          sets: state.sets.map((s) => {
            if (s.id !== id || s.kind !== 'smart') return s;
            return {
              ...s,
              filters,
              ...(maxResults !== undefined ? { maxResults } : {}),
              updatedAt: new Date().toISOString(),
            };
          }),
        })),

      getSet: (id) => get().sets.find((s) => s.id === id),
      getAllSets: () => get().sets,
    }),
    { name: 'pixsim7-asset-sets' },
  ),
);
