/**
 * Generation grouping utilities.
 *
 * Pure functions for grouping GenerationModel[] by various criteria.
 * Designed for use inside useMemo in the GenerationsPanel.
 */
import { OPERATION_METADATA, type OperationType } from '@/types/operations';

import { getGenerationModelName, isActiveStatus, type GenerationModel } from '../models';

export type GenerationGroupBy = 'prompt' | 'operation' | 'provider' | 'model' | 'account' | 'asset';

export interface GenerationGroup {
  dimension: GenerationGroupBy;
  key: string;
  label: string;
  items: GenerationModel[];
  activeCount: number;
  latestTimestamp: number;
  subgroups?: GenerationGroup[];
}

export const GROUP_BY_OPTIONS: Array<{ value: GenerationGroupBy; label: string }> = [
  { value: 'prompt', label: 'Prompt' },
  { value: 'operation', label: 'Operation' },
  { value: 'provider', label: 'Provider' },
  { value: 'model', label: 'Model' },
  { value: 'account', label: 'Account' },
  { value: 'asset', label: 'Asset' },
];

/** Normalize a prompt string to a stable grouping key (first 120 chars, lowercased). */
function promptKey(prompt: string | null): string {
  if (!prompt) return '__no_prompt__';
  return prompt.slice(0, 120).toLowerCase().trim();
}

/** Build a display label for a prompt group. */
function promptLabel(prompt: string | null): string {
  if (!prompt) return '(No prompt)';
  if (prompt.length <= 80) return prompt;
  return prompt.slice(0, 80) + '...';
}

const ASSET_REF_RE = /^asset:(\d+)$/;

/**
 * Extract all asset IDs associated with a generation.
 * Checks source inputs first (may have multiple for multi-asset ops),
 * then rawParams legacy fields, then the output asset.
 * Returns at least one key (falls back to '__no_asset__').
 */
function extractAssetKeys(g: GenerationModel): string[] {
  const ids: string[] = [];

  // 1. inputs[].asset — canonical source asset refs, e.g. "asset:42"
  for (const input of g.inputs) {
    const ref = (input as Record<string, unknown>).asset;
    if (typeof ref === 'string') {
      const match = ref.match(ASSET_REF_RE);
      if (match) ids.push(match[1]);
    }
  }
  if (ids.length > 0) return ids;

  // 2. rawParams legacy source_asset_ids / source_asset_id
  const raw = g.rawParams;
  const legacyIds = raw.source_asset_ids ?? raw.sourceAssetIds;
  if (Array.isArray(legacyIds)) {
    for (const id of legacyIds) {
      if (typeof id === 'number') ids.push(String(id));
    }
  }
  if (ids.length > 0) return ids;

  const legacyId = raw.source_asset_id ?? raw.sourceAssetId;
  if (typeof legacyId === 'number') return [String(legacyId)];

  // 3. Output asset (result of generation)
  if (g.assetId != null) return [String(g.assetId)];

  return ['__no_asset__'];
}

/**
 * Key extractor that returns one or more keys per item.
 * Items with multiple keys appear in multiple groups.
 */
type KeyExtractor = (g: GenerationModel) => string | string[];
type LabelResolver = (key: string, sample: GenerationModel) => string;

function buildGroups(
  items: GenerationModel[],
  dimension: GenerationGroupBy,
  getKey: KeyExtractor,
  getLabel: LabelResolver,
): GenerationGroup[] {
  const map = new Map<string, GenerationModel[]>();
  const firstSample = new Map<string, GenerationModel>();

  for (const item of items) {
    const raw = getKey(item);
    const keys = typeof raw === 'string' ? [raw] : raw;
    for (const k of keys) {
      let list = map.get(k);
      if (!list) {
        list = [];
        map.set(k, list);
        firstSample.set(k, item);
      }
      list.push(item);
    }
  }

  const groups: GenerationGroup[] = [];
  for (const [key, groupItems] of map) {
    let activeCount = 0;
    let latest = 0;
    for (const g of groupItems) {
      if (isActiveStatus(g.status)) activeCount++;
      const ts = new Date(g.createdAt).getTime();
      if (ts > latest) latest = ts;
    }
    groups.push({
      dimension,
      key,
      label: getLabel(key, firstSample.get(key)!),
      items: groupItems,
      activeCount,
      latestTimestamp: latest,
    });
  }

  // Sort groups by newest first
  groups.sort((a, b) => b.latestTimestamp - a.latestTimestamp);
  return groups;
}

/** Get key/label extractors for a single dimension. */
function dimensionExtractors(dim: GenerationGroupBy): [KeyExtractor, LabelResolver] {
  switch (dim) {
    case 'prompt':
      return [
        g => promptKey(g.finalPrompt),
        (_key, sample) => promptLabel(sample.finalPrompt),
      ];
    case 'operation':
      return [
        g => g.operationType,
        key => OPERATION_METADATA[key as OperationType]?.label ?? key,
      ];
    case 'provider':
      return [g => g.providerId, key => key];
    case 'model':
      return [
        g => getGenerationModelName(g) ?? '__no_model__',
        key => (key === '__no_model__' ? '(No model)' : key),
      ];
    case 'account':
      return [
        g => g.accountEmail ?? '__no_account__',
        key => (key === '__no_account__' ? '(No account)' : key.split('@')[0]),
      ];
    case 'asset':
      return [
        g => extractAssetKeys(g),
        key => (key === '__no_asset__' ? '(No asset)' : `Asset #${key}`),
      ];
  }
}

/**
 * Group a sorted list of generations by one or more stacked dimensions.
 * Returns null when the stack is empty (caller should render flat list).
 *
 * For a single dimension, returns flat groups.
 * For multiple dimensions, groups are nested: top-level groups by the first
 * dimension, each containing subgroups by the second dimension, etc.
 */
export function groupGenerations(
  items: GenerationModel[],
  groupByStack: GenerationGroupBy[],
): GenerationGroup[] | null {
  if (groupByStack.length === 0) return null;

  const [first, ...rest] = groupByStack;
  const [getKey, getLabel] = dimensionExtractors(first);
  const groups = buildGroups(items, first, getKey, getLabel);

  if (rest.length === 0) return groups;

  // Recursively build subgroups for remaining dimensions
  for (const group of groups) {
    group.subgroups = groupGenerations(group.items, rest) ?? undefined;
  }
  return groups;
}
