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
 * Expanded glyphs: green (member, always visible) or grey (addable, hover-only).
 * Clicking toggles membership — silent remove, reversible by clicking again.
 * See plan `sets-multi-target-add`.
 */
import { buildTargetToggleWidget, BADGE_SLOT, BADGE_PRIORITY } from '@lib/ui/overlay';
import type { OverlayWidget } from '@lib/ui/overlay';

import type { AssetSet, ManualAssetSet } from '../stores/assetSetStore';
import { useAssetSetStore } from '../stores/assetSetStore';
import { useSetBadgeExpansionStore } from '../stores/setBadgeExpansionStore';

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
}

/** Count of the active sets this asset already belongs to. */
function countMemberships(assetId: number, activeSets: ManualAssetSet[]): number {
  return activeSets.reduce((n, set) => n + (set.assetIds.includes(assetId) ? 1 : 0), 0);
}

/**
 * The collapsed count badge: a circular glyph (matching the per-set toggles)
 * with the active-set count inside. Tint reads membership at a glance — solid
 * emerald when in every active set, faded emerald when in some, neutral when in
 * none. A ring marks the expanded state. Clicking flips the surface's expansion.
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
  return (
    <button
      type="button"
      // Keep focus on the document body — focusing a portaled overlay button
      // scrolls the page (see overlay-button-focus-scroll canon).
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={`relative inline-flex items-center justify-center cq-btn-md rounded-full shadow-sm backdrop-blur-sm cursor-pointer hover:animate-hover-pop ${tint} ${
        expanded ? 'ring-2 ring-accent ring-offset-1' : ''
      }`}
      title={tooltip}
      aria-label={tooltip}
    >
      <span className="text-[0.6em] font-bold leading-none">{total}</span>
    </button>
  );
}

/**
 * Build the (pinned, always-reachable) collapse/expand control. Shown at rest
 * regardless of membership — greyed when the asset is in none of the sets — so a
 * non-member still has a control to expand and add. It's a single small badge,
 * so the at-rest cost is low; without it a non-member card would have no visible
 * set affordance at all (you couldn't tune/add/remove).
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
    visibility: { trigger: 'always' },
    // Just above the per-set glyphs (status + 1) so it leads them in the stack,
    // and pinned (no `scrollable`) so it stays put while the glyphs scroll.
    priority: BADGE_PRIORITY.status + 2,
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
 * Build one toggle glyph per active target set for the given asset.
 * - `animateIn` adds a one-shot pop-in (used when glyphs appear on expand, so
 *   the open reads as an animation rather than an instant swap — not applied to
 *   the always-on single-set case, which would re-pop on every render).
 * - `alwaysVisible` keeps even non-member (addable) glyphs visible at rest. Used
 *   for the lone single-set glyph so a non-member still has a greyed control;
 *   left off when expanding 2+ (the pinned count badge is the at-rest affordance
 *   there, and the addable glyphs stay hover-only to keep the open row clean).
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
      },
    );
  });
}

/**
 * Build the active-target widgets for a card.
 *
 * - 0 active sets → nothing.
 * - 1 active set → the single glyph directly (collapsing one set is pointless).
 * - 2+ active sets → a circular count badge by default; the per-set glyphs only
 *   when the surface is expanded, led by the (pinned) count/collapse badge.
 */
export function buildActiveTargetWidgets(
  assetId: number,
  activeSets: ManualAssetSet[],
  options: ActiveTargetWidgetsOptions,
): OverlayWidget[] {
  if (activeSets.length === 0) return [];
  // Single set: render its glyph directly (collapsing one is pointless), kept
  // visible even for non-members so there's always a greyed control to add.
  if (activeSets.length === 1) {
    return buildPerSetGlyphs(assetId, activeSets, { alwaysVisible: true });
  }

  const memberCount = countMemberships(assetId, activeSets);
  const toggle = buildSetBadgeToggle(memberCount, activeSets.length, options);
  if (!options.expanded) return [toggle];
  return [toggle, ...buildPerSetGlyphs(assetId, activeSets, { animateIn: true })];
}
