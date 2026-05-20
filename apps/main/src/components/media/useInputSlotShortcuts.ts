/**
 * useInputSlotShortcuts
 *
 * Keyboard + gesture commit handlers for input-slot prev/next navigation.
 * `[` / `]` keys (window-scoped, gated on `isFocused`); the gesture commit
 * handlers (`commitPrev`/`commitNext`) are also exported for `useCardGestures`
 * swipe wiring on the 'input-slot' surface.
 *
 * Source of truth for the neighbor lookup + commit semantics is
 * `useInputSlotNavigation` — same hook the chevrons use — so the cohort
 * branch (time/prompt vs set members) and the commit (replaceInputAsset vs
 * pinAssetSetMember) stay in lockstep across every affordance.
 *
 * Wheel-on-card-wrapper was retired earlier (events never bubbled reliably
 * through inner overlays); plain-wheel-on-chevron in `ChevronButton` is the
 * canonical wheel affordance. `targetRef` is kept on the args for future
 * focus-management work.
 *
 * Plans: `media-card-input-time-nav`, `set-slot-walk-and-grid`.
 */

import { useCallback, useEffect } from 'react';

import type { AssetModel } from '@features/assets';
import type { AssetSetSlotRef } from '@features/generation';

import type { OperationType } from '@/types/operations';

import { useInputSlotNavigation } from './useInputSlotNavigation';

export interface UseInputSlotShortcutsArgs {
  asset: AssetModel;
  inputId: string;
  operationType: OperationType;
  /**
   * Set linkage — switches navigation to the set-member cohort (commit
   * pins via `pinAssetSetMember`).
   */
  assetSetRef: AssetSetSlotRef | undefined;
  /** True only for the slot matching panel `currentInputId`. */
  isFocused: boolean;
  /** Disable wiring entirely (e.g. clamped slot). */
  enabled?: boolean;
  /**
   * Slot wrapper element ref. Currently unused (wheel lives on the chevron);
   * kept for future focus-management work.
   */
  targetRef: React.RefObject<HTMLElement | null>;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

export interface UseInputSlotShortcutsResult {
  /**
   * Commit handlers exposed for gesture wiring (e.g. `useCardGestures` for
   * the 'input-slot' surface). Closure-bound to this slot — call to swap
   * to the prev/next neighbor in the active cohort.
   */
  commitPrev: () => void;
  commitNext: () => void;
}

export function useInputSlotShortcuts({
  asset,
  inputId,
  operationType,
  assetSetRef,
  isFocused,
  enabled = true,
  targetRef,
}: UseInputSlotShortcutsArgs): UseInputSlotShortcutsResult {
  const { prev, next, commit: commitTarget } = useInputSlotNavigation({
    asset,
    inputId,
    operationType,
    assetSetRef,
    enabled,
  });

  void targetRef;

  const commit = useCallback(
    (direction: 'prev' | 'next') => {
      const neighbor = direction === 'prev' ? prev : next;
      if (!neighbor) return;
      commitTarget(neighbor);
    },
    [prev, next, commitTarget],
  );

  // `[` / `]` — global keydown, gated on focused slot + non-typing target.
  useEffect(() => {
    if (!enabled || !isFocused) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== '[' && e.key !== ']') return;
      if (isTypingTarget(e.target)) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      commit(e.key === '[' ? 'prev' : 'next');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled, isFocused, commit]);

  const commitPrev = useCallback(() => commit('prev'), [commit]);
  const commitNext = useCallback(() => commit('next'), [commit]);
  return { commitPrev, commitNext };
}
