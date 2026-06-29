/**
 * ReviewModeSurface
 *
 * Shared "focused review grid" scaffold behind the Triage and Review surfaces.
 * Both are the same interaction — a keyboard/gesture-driven pass over a list of
 * assets where each gets a per-card decision — differing only in a small
 * descriptor: which decisions exist, their hotkeys, how a card is annotated, and
 * the filter/scope panel. This component owns the common parts (focus index,
 * arrow-key navigation, decision buttons + hotkeys, the optional help modal,
 * shell + grid layout); callers supply the {@link ReviewModeSurfaceProps}.
 *
 * See plan `gallery-surface-unification`: a surface is its own component only
 * when genuinely layout-divergent; review-style surfaces are descriptors here.
 */

import { Button } from '@pixsim7/shared.ui';
import { useEffect, useMemo, useState, type ReactNode } from 'react';

import type { OverlayWidget } from '@lib/ui/overlay';

import { MediaCard, type MediaCardActions } from '@/components/media/MediaCard';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

import type { AssetsController } from '../hooks/useAssetsController';
import { toggleFavoriteTag } from '../lib/favoriteTag';
import type { AssetModel } from '../models/asset';

import { GalleryGrid, GallerySurfaceShell } from './shared';

/** One decision a reviewer can make on the focused asset. */
export interface ReviewDecision {
  id: string;
  /** Button label (e.g. "✓ Keep"). Used for hotkey descriptions + the button
   *  title; the on-button face falls back to this when {@link compactLabel} is unset. */
  label: string;
  /** Compact on-button face (e.g. just "✓") for space-tight surfaces. The full
   *  {@link label} still rides along as the button's title/tooltip. */
  compactLabel?: string;
  /** Keyboard shortcut key (e.g. 'k'). */
  hotkey: string;
  /** Display form of the hotkey for the help modal (e.g. 'K'). */
  hotkeyLabel?: string;
  /** Button style. Forced to 'primary' when {@link isActive} returns true. */
  variant?: 'primary' | 'secondary';
  /** Perform the decision for an asset (may be async — e.g. a backend write). */
  run: (asset: AssetModel) => void | Promise<void>;
  /**
   * Focus behaviour after deciding:
   * - 'next' (default): advance to the following asset (asset stays in list).
   * - 'stay': leave the index put — for decisions that remove the asset from the
   *   list (the next asset slides into the same slot; the clamp effect handles
   *   the tail).
   */
  advance?: 'next' | 'stay';
  /** Show this decision's button as already-chosen (e.g. Review's accept state). */
  isActive?: (asset: AssetModel) => boolean;
  /** Hide the button unless this returns true (e.g. Review's "skip/undo"). */
  visibleWhen?: (asset: AssetModel) => boolean;
}

export interface ReviewModeSurfaceProps {
  controller: AssetsController;
  title: string;
  subtitle?: string;
  /** Header content on the right (progress stats, help button, etc.). */
  headerActions?: ReactNode;
  /** Filter panel content — e.g. a scope switcher + the DynamicFilters chip bar. */
  filtersContent?: ReactNode;
  /** The decisions available per card. */
  decisions: ReviewDecision[];
  /** Extra classes for a card wrapper (e.g. accepted/rejected tinting). */
  cardClassName?: (asset: AssetModel, isFocused: boolean) => string;
  /**
   * Extra MediaCard overlay widgets for the focused card (e.g. a signal-score
   * badge). Returned widgets are merged into the card's overlay via
   * `customWidgets`, so they participate in the normal badge stacking /
   * box-separation pass instead of overlapping hand-rolled — build them with
   * `createBadgeWidget` + a `BADGE_SLOT`/`stackGroup`.
   */
  cardWidgets?: (asset: AssetModel) => OverlayWidget[];
  /** MediaCard overlay preset id. */
  overlayPresetId?: string;
  /** Gesture surface bound on each card (e.g. 'signal-triage'). */
  gestureSurfaceId?: string;
  /** Extra MediaCard actions merged onto the controller's per-asset actions. */
  cardActions?: (asset: AssetModel) => Partial<MediaCardActions>;
  /** Extra content under the decision buttons (e.g. a reference-tagging row). */
  cardFooter?: (asset: AssetModel) => ReactNode;
  /** Custom empty-queue content. */
  emptyState?: ReactNode;
  /** Run once on mount (e.g. select the initial triage queue). */
  onMount?: () => void;
  /** Rows for the `?`-toggled keyboard help modal. Omit to disable the modal. */
  helpRows?: { keys: string; label: string }[];
  /** Card edge length in px (default 320). */
  cardSize?: number;
  /** Pin the header + filters so only the grid scrolls (see GallerySurfaceShell). */
  pinHeader?: boolean;
}

export function ReviewModeSurface({
  controller,
  title,
  subtitle,
  headerActions,
  filtersContent,
  decisions,
  cardClassName,
  cardWidgets,
  overlayPresetId,
  gestureSurfaceId,
  cardActions,
  cardFooter,
  emptyState,
  onMount,
  helpRows,
  pinHeader,
  cardSize = 320,
}: ReviewModeSurfaceProps) {
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [showHelp, setShowHelp] = useState(false);

  // Mount-only side effect (e.g. triage's initial queue selection).
  useEffect(() => {
    onMount?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const assetCount = controller.assets.length;

  // Apply a decision, then move focus. 'stay' decisions remove the asset, so the
  // next one slides into the current slot — leave the index and let the clamp
  // effect below fix an out-of-range tail.
  const perform = (decision: ReviewDecision, asset: AssetModel) => {
    void decision.run(asset);
    if (decision.advance !== 'stay') {
      setFocusedIndex((prev) => Math.min(prev + 1, controller.assets.length - 1));
    }
  };

  const shortcuts = useMemo(
    () => {
      const decisionShortcuts = decisions.map((d) => ({
        key: d.hotkey,
        description: d.label,
        callback: () => {
          const asset = controller.assets[focusedIndex];
          if (asset) perform(d, asset);
        },
      }));
      const navShortcuts = [
        {
          key: 'ArrowRight',
          description: 'Next',
          callback: () =>
            setFocusedIndex((prev) => Math.min(prev + 1, controller.assets.length - 1)),
        },
        {
          key: 'ArrowLeft',
          description: 'Previous',
          callback: () => setFocusedIndex((prev) => Math.max(prev - 1, 0)),
        },
      ];
      const helpShortcut = helpRows
        ? [
            {
              key: '?',
              description: 'Toggle keyboard shortcuts',
              callback: () => setShowHelp((prev) => !prev),
              preventDefault: false,
            },
          ]
        : [];
      return [...decisionShortcuts, ...navShortcuts, ...helpShortcut];
    },
    // focusedIndex / assets are read fresh inside the callbacks each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [decisions, controller.assets, focusedIndex, helpRows],
  );
  useKeyboardShortcuts(shortcuts);

  // Auto-clamp focus when the list shrinks (decisions that remove assets).
  useEffect(() => {
    if (focusedIndex >= assetCount && assetCount > 0) {
      setFocusedIndex(assetCount - 1);
    }
  }, [assetCount, focusedIndex]);

  const renderCard = (asset: AssetModel, index: number) => {
    const isFocused = index === focusedIndex;
    // The tone is the SINGLE source of border colour so it can't fight a default
    // neutral border (two `border-*` utilities have nondeterministic precedence in
    // Tailwind). Focus emphasis rides on the ring, which doesn't conflict.
    const tone = cardClassName?.(asset, isFocused);
    return (
      <div
        className={`relative overflow-hidden rounded-lg border-2 transition-all ${
          isFocused ? 'ring-4 ring-blue-500 ring-offset-2 ' : ''
        }${tone || 'border-neutral-200 dark:border-neutral-700'}`}
        onClick={() => setFocusedIndex(index)}
      >
        <MediaCard
          asset={asset}
          onToggleFavorite={() => toggleFavoriteTag(asset)}
          actions={{
            ...controller.getAssetActions(asset),
            ...cardActions?.(asset),
          }}
          customWidgets={cardWidgets?.(asset)}
          overlayPresetId={overlayPresetId}
          gestureSurfaceId={gestureSurfaceId}
        />
        <div className="border-t border-neutral-200 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-900">
          <div className="flex gap-2">
            {decisions.map((d) => {
              if (d.visibleWhen && !d.visibleWhen(asset)) return null;
              const active = d.isActive?.(asset) ?? false;
              return (
                <Button
                  key={d.id}
                  variant={active ? 'primary' : d.variant ?? 'secondary'}
                  onClick={(e) => {
                    e.stopPropagation();
                    perform(d, asset);
                  }}
                  className="flex-1 text-sm"
                  title={d.label}
                >
                  {d.compactLabel ?? d.label}
                </Button>
              );
            })}
          </div>
          {cardFooter?.(asset)}
        </div>
      </div>
    );
  };

  return (
    <>
      {helpRows && showHelp && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setShowHelp(false)}
        >
          <div
            className="max-w-md rounded-lg bg-white p-6 dark:bg-neutral-800"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-4 text-lg font-semibold">Keyboard Shortcuts</h3>
            <div className="space-y-2 text-sm">
              {helpRows.map((row) => (
                <div key={row.keys} className="flex justify-between">
                  <kbd className="rounded bg-neutral-100 px-2 py-1 dark:bg-neutral-700">
                    {row.keys}
                  </kbd>
                  <span>{row.label}</span>
                </div>
              ))}
            </div>
            <Button variant="primary" onClick={() => setShowHelp(false)} className="mt-4 w-full">
              Close
            </Button>
          </div>
        </div>
      )}

      <GallerySurfaceShell
        title={title}
        subtitle={subtitle}
        headerActions={headerActions}
        filtersContent={filtersContent}
        error={controller.error}
        loading={controller.loading}
        itemCount={assetCount}
        pinHeader={pinHeader}
      >
        <GalleryGrid
          items={controller.assets}
          renderCard={renderCard}
          getKey={(a) => a.id}
          cardSize={cardSize}
          rowGap={24}
          columnGap={24}
          pagination={{
            currentPage: controller.currentPage,
            totalPages: controller.totalPages,
            hasMore: controller.hasMore,
            loading: controller.loading,
            onPageChange: controller.goToPage,
          }}
          emptyState={emptyState}
        />
      </GallerySurfaceShell>
    </>
  );
}
