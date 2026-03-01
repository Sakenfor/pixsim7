/**
 * Generation filter definitions for use with useClientFilters.
 *
 * Reuses the generic ClientFilterDef<T> system from the gallery feature.
 */
import type { ClientFilterDef } from '@features/gallery/lib/useClientFilters';

import { OPERATION_METADATA, type OperationType } from '@/types/operations';

import {
  getGenerationModelName,
  isActiveStatus,
  type GenerationModel,
  type GenerationStatus,
} from '../models';

/** Composite status values used in the filter UI */
type StatusFilterValue = GenerationStatus | 'active';

const STATUS_OPTIONS: Array<{ value: StatusFilterValue; label: string }> = [
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
];
const NO_MODEL_VALUE = '__no_model__';

function matchesStatus(g: GenerationModel, selected: string): boolean {
  if (selected === 'active') return isActiveStatus(g.status);
  return g.status === selected;
}

function toTitleCase(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function resolveModelGroup(modelValue: string): { key: string; label: string } {
  if (modelValue === NO_MODEL_VALUE) {
    return { key: 'no_model', label: 'No model' };
  }
  const prefix = modelValue.split(/[-_.]/)[0]?.toLowerCase().trim() ?? '';
  if (!prefix) return { key: 'other', label: 'Other' };
  return { key: prefix, label: toTitleCase(prefix) };
}

export const GENERATION_FILTER_DEFS: ClientFilterDef<GenerationModel>[] = [
  // ── Search ────────────────────────────────────────────────────────────────
  {
    key: 'q',
    label: 'Search',
    icon: 'search',
    type: 'search',
    order: 0,
    predicate: (item, value) => {
      const q = (value as string | undefined)?.toLowerCase();
      if (!q) return true;
      return (
        (item.finalPrompt?.toLowerCase().includes(q) ?? false) ||
        (item.name?.toLowerCase().includes(q) ?? false) ||
        (item.description?.toLowerCase().includes(q) ?? false) ||
        (getGenerationModelName(item)?.toLowerCase().includes(q) ?? false)
      );
    },
  },

  // ── Status ────────────────────────────────────────────────────────────────
  {
    key: 'status',
    label: 'Status',
    icon: 'activity',
    type: 'enum',
    selectionMode: 'multi',
    order: 1,
    deriveOptionsWithCounts: (items) => {
      const counts: Record<string, number> = {};
      for (const opt of STATUS_OPTIONS) counts[opt.value] = 0;
      for (const g of items) {
        if (isActiveStatus(g.status)) counts['active'] = (counts['active'] ?? 0) + 1;
        if (counts[g.status] !== undefined) counts[g.status] = (counts[g.status] ?? 0) + 1;
      }
      return STATUS_OPTIONS.map(opt => ({
        value: opt.value,
        label: opt.label,
        count: counts[opt.value] ?? 0,
      }));
    },
    predicate: (item, value) => {
      const selected = value as string[] | undefined;
      if (!selected || selected.length === 0) return true;
      return selected.some(s => matchesStatus(item, s));
    },
  },

  // ── Provider ──────────────────────────────────────────────────────────────
  {
    key: 'provider',
    label: 'Provider',
    icon: 'server',
    type: 'enum',
    selectionMode: 'multi',
    order: 2,
    deriveOptionsWithCounts: (items) => {
      const counts = new Map<string, number>();
      for (const g of items) {
        counts.set(g.providerId, (counts.get(g.providerId) ?? 0) + 1);
      }
      return Array.from(counts.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([value, count]) => ({ value, label: value, count }));
    },
    predicate: (item, value) => {
      const selected = value as string[] | undefined;
      if (!selected || selected.length === 0) return true;
      return selected.includes(item.providerId);
    },
  },

  {
    key: 'model',
    label: 'Model',
    icon: 'layers',
    type: 'enum',
    selectionMode: 'multi',
    order: 3,
    overflow: true,
    deriveOptionsWithCounts: (items) => {
      const counts = new Map<string, number>();
      for (const g of items) {
        const model = getGenerationModelName(g) ?? NO_MODEL_VALUE;
        counts.set(model, (counts.get(model) ?? 0) + 1);
      }
      return Array.from(counts.entries())
        .map(([value, count]) => {
          const group = resolveModelGroup(value);
          return {
            value,
            label: value === NO_MODEL_VALUE ? '(No model)' : value,
            count,
            groupKey: group.key,
            groupLabel: group.label,
          };
        })
        .sort((a, b) => {
          const groupCmp = (a.groupLabel ?? '').localeCompare(b.groupLabel ?? '');
          if (groupCmp !== 0) return groupCmp;
          return a.label.localeCompare(b.label);
        });
    },
    predicate: (item, value) => {
      const selected = value as string[] | undefined;
      if (!selected || selected.length === 0) return true;
      const model = getGenerationModelName(item) ?? NO_MODEL_VALUE;
      return selected.includes(model);
    },
  },

  // ── Operation ─────────────────────────────────────────────────────────────
  {
    key: 'operation',
    label: 'Operation',
    icon: 'layers',
    type: 'enum',
    selectionMode: 'multi',
    order: 4,
    deriveOptionsWithCounts: (items) => {
      const counts = new Map<string, number>();
      for (const g of items) {
        counts.set(g.operationType, (counts.get(g.operationType) ?? 0) + 1);
      }
      return Array.from(counts.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([value, count]) => ({
          value,
          label: OPERATION_METADATA[value as OperationType]?.label ?? value,
          count,
        }));
    },
    predicate: (item, value) => {
      const selected = value as string[] | undefined;
      if (!selected || selected.length === 0) return true;
      return selected.includes(item.operationType);
    },
  },

  // ── Account ───────────────────────────────────────────────────────────────
  {
    key: 'account',
    label: 'Account',
    icon: 'user',
    type: 'enum',
    selectionMode: 'multi',
    order: 5,
    overflow: true,
    deriveOptionsWithCounts: (items) => {
      const counts = new Map<string, { count: number; providers: Set<string> }>();
      for (const g of items) {
        const email = g.accountEmail;
        if (!email) continue;
        const existing = counts.get(email);
        if (existing) {
          existing.count += 1;
          if (g.providerId) existing.providers.add(g.providerId);
          continue;
        }
        counts.set(email, {
          count: 1,
          providers: new Set(g.providerId ? [g.providerId] : []),
        });
      }
      return Array.from(counts.entries())
        .map(([value, meta]) => {
          const providers = Array.from(meta.providers.values()).filter(Boolean).sort();
          const providerGroup =
            providers.length === 0
              ? 'unknown'
              : providers.length === 1
                ? providers[0]
                : 'mixed';
          const providerLabel =
            providerGroup === 'mixed'
              ? 'Mixed provider'
              : providerGroup === 'unknown'
                ? 'Unknown provider'
                : providerGroup;
          return {
            value,
            label: value.split('@')[0],
            count: meta.count,
            groupKey: providerGroup,
            groupLabel: providerLabel,
          };
        })
        .sort((a, b) => {
          const groupCmp = (a.groupLabel ?? '').localeCompare(b.groupLabel ?? '');
          if (groupCmp !== 0) return groupCmp;
          return a.label.localeCompare(b.label);
        });
    },
    predicate: (item, value) => {
      const selected = value as string[] | undefined;
      if (!selected || selected.length === 0) return true;
      return item.accountEmail != null && selected.includes(item.accountEmail);
    },
  },
];
