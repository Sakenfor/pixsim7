/* eslint-disable react-refresh/only-export-components */
/**
 * Active add-target overlay widgets.
 *
 * Single source of truth for the per-set toggle glyphs shown on a media card's
 * hover overlay. The gallery (RemoteGallerySource) and the viewer
 * (useOverlayWidgetsForAsset) both render asset cards and must show the same
 * affordance, so they share this builder instead of hand-rolling it twice and
 * drifting (cf. the media-card-fresh-asset-ref surface-drift history).
 *
 * By default the set glyphs are COLLAPSED into a single circular count badge
 * (a number = how many active target sets) to keep resting cards clean; clicking
 * it expands to the full per-set row. The expanded/collapsed choice is scoped
 * per *surface* (gallery, viewer, …) via {@link useSetBadgeExpansionStore} — not
 * per card — so it toggles every card on the surface at once and is remembered
 * there.
 *
 * Revealed glyphs: green (member) or grey (addable).
 * Clicking toggles membership — silent remove, reversible by clicking again.
 * See plan `sets-multi-target-add`.
 */
import { Popover } from '@pixsim7/shared.ui';
import { useRef, useState } from 'react';

import { Icon } from '@lib/icons';
import { buildTargetToggleWidget, BADGE_SLOT, BADGE_PRIORITY } from '@lib/ui/overlay';
import type { OverlayWidget } from '@lib/ui/overlay';

import type { AssetSet, ManualAssetSet } from '../stores/assetSetStore';
import { useAssetSets, useAssetSetStore } from '../stores/assetSetStore';
import { MAX_ACTIVE_TARGETS, useGalleryApplyTargetStore } from '../stores/galleryApplyTargetStore';
import { sortByAddRecency } from '../stores/setAddRecencyStore';
import { useSetBadgeExpansionStore } from '../stores/setBadgeExpansionStore';

/**
 * How many of the most-recently-added-to sets get a glyph while the hover/tap
 * affordance is revealed but collapsed (a quick-re-add shortcut shown
 * alongside the count badge). Set to 0 to restore the pure count-only
 * collapsed look.
 */
const COLLAPSED_PREVIEW_COUNT = 3;

/**
 * Resolve the ordered active-target ids to the loaded manual sets, dropping any
 * that are missing or smart (membership ops apply to manual sets only).
 */
export function selectActiveTargetSets(
  sets: AssetSet[],
  activeManualSetIds: number[],
): ManualAssetSet[] {
  return activeManualSetIds
    .map((id) => sets.find((s) => s.id === id))
    .filter((s): s is ManualAssetSet => s?.kind === 'manual');
}

export interface ActiveTargetWidgetsOptions {
  /**
   * Surface the card lives on (e.g. `'gallery'`, `'viewer'`). Scopes the
   * collapsed/expanded state so it's shared per-surface, not per-card.
   */
  surfaceKey: string;
  /**
   * Whether the set badges are expanded on this surface. Read reactively from
   * {@link useSurfaceSetBadgesExpanded} at the call site so the card rebuilds
   * its widgets when the surface toggles.
   */
  expanded: boolean;
  /**
   * Per-set "last added-to" timestamps (see {@link useSetAddRecencyStore}).
   * Read reactively at the call site so cards re-order when you add to a set.
   * Floats recently-used sets to the front of the row and picks the collapsed
   * preview glyphs. Defaults to no recency (input order preserved).
   */
  lastAddedAt?: Record<number, number>;
}

/** Count of the active sets this asset already belongs to. */
function countMemberships(assetId: number, activeSets: ManualAssetSet[]): number {
  return activeSets.reduce((n, set) => n + (set.assetIds.includes(assetId) ? 1 : 0), 0);
}

/** Press-and-hold threshold (ms) that opens the active-target picker. */
const LONG_PRESS_MS = 450;
const ACTIVE_TARGET_VISIBILITY = { trigger: 'hover-container' } as const;

/**
 * The collapsed count badge: a circular glyph (matching the per-set toggles)
 * with the active-set count inside. Tint reads membership at a glance — solid
 * emerald when in every active set, faded emerald when in some, neutral when in
 * none. A ring marks the expanded state. A short click flips the surface's
 * expansion; press-and-hold opens the active-target picker (curate which sets
 * are targets) — a hidden-but-clean affordance over a separate control.
 */
function SetCountBadge({
  memberCount,
  total,
  expanded,
  tooltip,
  onToggle,
}: {
  memberCount: number;
  total: number;
  expanded: boolean;
  tooltip: string;
  onToggle: () => void;
}) {
  const tint =
    memberCount >= total
      ? '!bg-emerald-600/90 !text-white'
      : memberCount > 0
        ? '!bg-emerald-600/60 !text-white'
        : '!bg-white/95 dark:!bg-neutral-900/95 !text-neutral-700 dark:!text-neutral-200';

  const btnRef = useRef<HTMLButtonElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const timerRef = useRef<number | null>(null);
  // Set when the hold timer fires, so the trailing click doesn't also toggle.
  const heldRef = useRef(false);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };
  const startHold = () => {
    heldRef.current = false;
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      heldRef.current = true;
      setPickerOpen(true);
    }, LONG_PRESS_MS);
  };

  return (
    <div className="relative inline-flex">
      <button
        ref={btnRef}
        type="button"
        // Keep focus on the document body — focusing a portaled overlay button
        // scrolls the page (see overlay-button-focus-scroll canon).
        onMouseDown={(e) => e.preventDefault()}
        onPointerDown={startHold}
        onPointerUp={clearTimer}
        onPointerLeave={clearTimer}
        onPointerCancel={clearTimer}
        onClick={(e) => {
          e.stopPropagation();
          if (heldRef.current) {
            // A hold just opened the picker; swallow the trailing click.
            heldRef.current = false;
            return;
          }
          onToggle();
        }}
        className={`relative inline-flex items-center justify-center cq-btn-md rounded-full shadow-sm backdrop-blur-sm cursor-pointer hover:animate-hover-pop ${tint} ${
          expanded ? 'ring-2 ring-accent ring-offset-1' : ''
        }`}
        title={`${tooltip} · hold to choose active sets`}
        aria-label={tooltip}
      >
        <span className="text-[0.6em] font-bold leading-none">{total}</span>
      </button>
      <Popover
        open={pickerOpen}
        anchor={btnRef.current}
        placement="bottom"
        align="end"
        offset={4}
        onClose={() => setPickerOpen(false)}
        triggerRef={btnRef}
      >
        <ActiveTargetPickerList />
      </Popover>
    </div>
  );
}

/**
 * Build the pinned collapse/expand control. Revealed on card hover/tap,
 * regardless of membership — greyed when the asset is in none of the sets — so a
 * non-member still has a control to expand and add without putting set chrome
 * on every resting card.
 */
function buildSetBadgeToggle(
  memberCount: number,
  total: number,
  options: ActiveTargetWidgetsOptions,
): OverlayWidget {
  const { surfaceKey, expanded } = options;
  const detail = `In ${memberCount} of ${total} target sets`;
  return {
    id: 'set-target-toggle',
    type: 'custom',
    ...BADGE_SLOT.topRight,
    visibility: ACTIVE_TARGET_VISIBILITY,
    // Last pinned item before the scrollable per-set glyphs: the stack renderer
    // renders all pinned widgets before the scroll region, so this must sort
    // below other top-right pinned badges to keep the count visually attached
    // to the expanding set-glyph column.
    priority: BADGE_PRIORITY.status - 1,
    style: { className: '-mt-1' },
    interactive: true,
    handlesOwnInteraction: true,
    render: () => (
      <SetCountBadge
        memberCount={memberCount}
        total={total}
        expanded={expanded}
        tooltip={expanded ? `${detail} · click to collapse` : `${detail} · click to show each set`}
        onToggle={() => useSetBadgeExpansionStore.getState().toggle(surfaceKey)}
      />
    ),
  };
}

/**
 * The active-target picker: every manual set with a checkbox toggling its
 * active-target flag. Subscribes to the stores directly so the checkmarks track
 * toggles live, and stays open across clicks so you can flag several at once.
 * This curates *which sets are targets* (the top-right group) — distinct from
 * the per-set glyphs, which toggle whether THIS asset is a member. Opened by
 * press-and-holding the count badge (see {@link SetCountBadge}).
 */
function ActiveTargetPickerList() {
  // useAssetSets ensures the cache is loaded and re-renders on changes.
  const { sets } = useAssetSets();
  const activeIds = useGalleryApplyTargetStore((s) => s.activeManualSetIds);
  const toggleTarget = useGalleryApplyTargetStore((s) => s.toggleActiveTarget);

  const manualSets = sets.filter((s): s is ManualAssetSet => s.kind === 'manual');
  const activeSet = new Set(activeIds);
  const atCap = activeIds.length >= MAX_ACTIVE_TARGETS;

  return (
    <div className="min-w-[200px] max-w-[260px] max-h-[280px] overflow-y-auto bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-lg py-1">
      <div className="px-3 py-1.5 text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
        Active target sets
      </div>
      {manualSets.length === 0 ? (
        <div className="px-3 py-2 text-xs text-neutral-400">No manual sets yet</div>
      ) : (
        manualSets.map((set) => {
          const isActive = activeSet.has(set.id);
          const disabled = !isActive && atCap;
          return (
            <button
              key={set.id}
              type="button"
              disabled={disabled}
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.stopPropagation();
                toggleTarget(set.id);
              }}
              className={`w-full px-3 py-1.5 flex items-center gap-2 text-sm text-left transition-colors ${
                disabled
                  ? 'opacity-40 cursor-not-allowed'
                  : 'hover:bg-neutral-100 dark:hover:bg-neutral-700 cursor-pointer'
              }`}
              title={disabled ? `Max ${MAX_ACTIVE_TARGETS} active targets` : undefined}
            >
              <Icon
                name={isActive ? 'checkSquare' : 'square'}
                size={14}
                className={isActive ? 'text-emerald-500' : 'text-neutral-400'}
              />
              {set.icon && (
                <Icon name={set.icon} size={13} className="text-neutral-500 dark:text-neutral-400" />
              )}
              <span className="flex-1 truncate">{set.name}</span>
            </button>
          );
        })
      )}
    </div>
  );
}

/**
 * Build one toggle glyph per active target set for the given asset.
 * - `animateIn` adds a one-shot pop-in (used when glyphs appear on expand, so
 *   the open reads as an animation rather than an instant swap — not applied to
 *   the always-on single-set case, which would re-pop on every render).
 * - `alwaysVisible` includes non-member (addable) glyphs in the revealed stack.
 *   The active-target affordance is still hover/tap-revealed so resting cards
 *   don't carry set-management chrome.
 */
function buildPerSetGlyphs(
  assetId: number,
  activeSets: ManualAssetSet[],
  { animateIn = false, alwaysVisible = false }: { animateIn?: boolean; alwaysVisible?: boolean } = {},
): OverlayWidget[] {
  return activeSets.map((set) => {
    const isMember = set.assetIds.includes(assetId);
    return buildTargetToggleWidget(
      () => {
        const store = useAssetSetStore.getState();
        if (isMember) void store.removeAssetsFromSet(set.id, [assetId]);
        else void store.addAssetsToSet(set.id, [assetId]);
      },
      {
        id: `target-toggle-${set.id}`,
        isMember,
        icon: set.icon,
        tooltip: isMember ? `In "${set.name}" — click to remove` : `Add to "${set.name}"`,
        extraClassName: animateIn ? 'animate-scale-in' : undefined,
        alwaysVisible,
        visibility: ACTIVE_TARGET_VISIBILITY,
      },
    );
  });
}

/**
 * Build the active-target widgets for a card.
 *
 * Sets are ordered most-recently-added-to first (so the sets you've been
 * dropping assets into lead the row); ties and never-added sets keep the
 * caller's active-target order.
 *
 * - 0 active sets → nothing.
 * - 1 active set → the single glyph directly (collapsing one set is pointless).
 * - 2+ active sets → a circular count badge plus, while collapsed, the top
 *   {@link COLLAPSED_PREVIEW_COUNT} recently-added-to glyphs for quick re-add;
 *   the full per-set row when the surface is expanded, led by the (pinned)
 *   count/collapse badge.
 */
export function buildActiveTargetWidgets(
  assetId: number,
  activeSets: ManualAssetSet[],
  options: ActiveTargetWidgetsOptions,
): OverlayWidget[] {
  if (activeSets.length === 0) return [];
  // Recently-added-to first; falls back to the caller's order when nothing has
  // been added yet (empty recency map is a no-op sort).
  const ordered = sortByAddRecency(activeSets, options.lastAddedAt ?? {});

  // Single set: render its glyph directly (collapsing one is pointless), but
  // still reveal it only on hover/tap like the multi-set affordance.
  if (ordered.length === 1) {
    return buildPerSetGlyphs(assetId, ordered, { alwaysVisible: true });
  }

  const memberCount = countMemberships(assetId, ordered);
  const toggle = buildSetBadgeToggle(memberCount, ordered.length, options);
  if (options.expanded) {
    return [toggle, ...buildPerSetGlyphs(assetId, ordered, { animateIn: true, alwaysVisible: true })];
  }
  // Collapsed: count badge + the top-N *actually* added-to glyphs, all
  // hover/tap-revealed as a quick re-add shortcut.
  // Only sets with a real add-timestamp qualify — never pad with untouched sets,
  // or a freshly-flagged target with no add history would show here unprompted.
  const recency = options.lastAddedAt ?? {};
  const preview = ordered.filter((s) => recency[s.id]).slice(0, COLLAPSED_PREVIEW_COUNT);
  if (preview.length === 0) return [toggle];
  return [toggle, ...buildPerSetGlyphs(assetId, preview, { alwaysVisible: true })];
}
