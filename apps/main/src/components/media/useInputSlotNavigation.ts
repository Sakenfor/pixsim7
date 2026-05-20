/**
 * useInputSlotNavigation
 *
 * Single source of truth for input-slot prev/next walk. Consumers (chevron
 * widget + `useInputSlotShortcuts` for `[`/`]`/wheel/swipe) all read from
 * here so every affordance stays in lockstep and shares one underlying
 * neighbor lookup.
 *
 * Two cohort branches, both hooks always called (rules-of-hooks); only one
 * is active at a time:
 *   - **set cohort** (when `assetSetRef` present): walks the resolved set
 *     members via `useResolvedAssetSet`; `commit` pins via
 *     `pinAssetSetMember` (atomic mode='locked' + lockedAssetId + display
 *     swap). Decided with user: walking always pins.
 *   - **time/prompt cohort** (no `assetSetRef`): walks `created_at` filtered
 *     by `media_type` plus the active per-operation cohort
 *     (`navCohortByOperation`); `commit` is `replaceInputAsset`.
 *
 * Plan: `set-slot-walk-and-grid` (set branch); `media-card-input-time-nav`
 * + `same-prompt-cohort-nav` (time/prompt branch).
 */

import { useMemo } from 'react';

import {
  useAssetSequence,
  useResolvedAssetSet,
  type AssetModel,
} from '@features/assets';
import {
  useGenerationScopeStores,
  type AssetSetSlotRef,
  type InputNavCohort,
} from '@features/generation';

import type { OperationType } from '@/types/operations';

export interface UseInputSlotNavArgs {
  asset: AssetModel;
  inputId: string;
  operationType: OperationType;
  assetSetRef: AssetSetSlotRef | undefined;
  enabled?: boolean;
}

export interface UseInputSlotNavResult {
  prev: AssetModel | null;
  next: AssetModel | null;
  isLoadingPrev: boolean;
  isLoadingNext: boolean;
  /** Commit a target (typically `prev` or `next`) — cohort-appropriate write. */
  commit: (target: AssetModel) => void;
}

/**
 * Translate the active nav cohort into `useAssetSequence` filters. Shared so
 * the chevrons, the wheel handler, and `useInputSlotShortcuts` all walk the
 * same axis. `prompt` falls back to the `time` shape when the pivot has no
 * `promptVersionId` (uploads / captures) so navigation never dead-ends —
 * the cohort pill is disabled in that case so the user can't actually
 * select an empty cohort.
 */
export function resolveCohortFilters(
  asset: AssetModel,
  cohort: InputNavCohort,
): { mediaType?: string; operationType?: string; promptVersionId?: string } {
  if (cohort === 'prompt' && asset.promptVersionId) {
    return { mediaType: asset.mediaType, promptVersionId: asset.promptVersionId };
  }
  return {
    mediaType: asset.mediaType,
    operationType: asset.operationType ?? undefined,
  };
}

export function useInputSlotNavigation({
  asset,
  inputId,
  operationType,
  assetSetRef,
  enabled = true,
}: UseInputSlotNavArgs): UseInputSlotNavResult {
  const isSetMode = Boolean(assetSetRef);
  const { useInputStore } = useGenerationScopeStores();
  const replaceInputAsset = useInputStore((s) => s.replaceInputAsset);
  const pinAssetSetMember = useInputStore((s) => s.pinAssetSetMember);
  const cohort = useInputStore(
    (s) => s.navCohortByOperation[operationType] ?? 'time',
  );

  // Time/prompt branch — inert when in set mode (enabled:false yields no
  // fetch and the cached cohort filters return null neighbors).
  const seq = useAssetSequence({
    pivot: !isSetMode && enabled ? asset : null,
    filters: resolveCohortFilters(asset, cohort),
    windowBefore: 1,
    windowAfter: 1,
    enabled: !isSetMode && enabled,
  });

  // Set branch — inert when `undefined` setId.
  const { members, isLoading: isLoadingMembers } = useResolvedAssetSet(
    isSetMode && assetSetRef ? assetSetRef.setId : undefined,
  );

  return useMemo<UseInputSlotNavResult>(() => {
    if (isSetMode && assetSetRef) {
      // lockedAssetId is authoritative when set; otherwise the slot's
      // representative `asset` is the current pick.
      const currentId = assetSetRef.lockedAssetId ?? asset.id;
      const idx = members.findIndex((m) => m.id === currentId);
      const prev = idx > 0 ? members[idx - 1] : null;
      const next =
        idx >= 0 && idx < members.length - 1 ? members[idx + 1] : null;
      return {
        prev,
        next,
        isLoadingPrev: isLoadingMembers,
        isLoadingNext: isLoadingMembers,
        commit: (target) =>
          pinAssetSetMember(operationType, inputId, target),
      };
    }
    return {
      prev: seq.prev,
      next: seq.next,
      isLoadingPrev: seq.isLoadingPrev,
      isLoadingNext: seq.isLoadingNext,
      commit: (target) => replaceInputAsset(operationType, inputId, target),
    };
  }, [
    isSetMode,
    assetSetRef,
    asset.id,
    members,
    isLoadingMembers,
    seq.prev,
    seq.next,
    seq.isLoadingPrev,
    seq.isLoadingNext,
    replaceInputAsset,
    pinAssetSetMember,
    operationType,
    inputId,
  ]);
}
