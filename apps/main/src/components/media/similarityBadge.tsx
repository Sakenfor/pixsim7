/* eslint-disable react-refresh/only-export-components */
/**
 * Similarity badges — a user-configurable stack of top-left badges, each a
 * saved "lens" (a combination of Inputs / Prompt / Seed facets) that counts the
 * assets sharing that combo. Replaces the three fixed sibling-count badges.
 *
 * The lens list lives in the global {@link useSiblingFacetStore} (cap
 * {@link MAX_LENSES}); the whole 7-way `cohort_counts` map is shipped on every
 * asset, so rendering N lenses is free. Fully configurable inline: hover a chip
 * to toggle its facets, remove it, or add another badge — all from the same
 * popup. (A standalone "+" appears only as a bootstrap when every badge has
 * been removed.) Edits are global, so every card updates at once. Clicking a
 * chip opens the mini-gallery for that combination.
 *
 * Within the hover-gated container a chip renders only where its lens has a
 * cohort here (>= 2); cards the lens doesn't apply to show nothing for it
 * (editing + "Add badge" stay reachable from any visible badge's popup, and a
 * chip mid-edit stays mounted). Gated to information-dense presets via
 * `showsSiblingBadges`. See plan `media-card-sibling-badges`.
 */
import { useHoverExpand, PortalFloat } from '@pixsim7/shared.ui';
import React, { useEffect, useRef, useState } from 'react';

import { openSimilarityGallery } from '@lib/dockview/contextMenu/actions/assetActions';
import { Icon } from '@lib/icons';
import type { OverlayWidget } from '@lib/ui/overlay';
import { BADGE_SLOT, BADGE_PRIORITY } from '@lib/ui/overlay';

import { useAppearanceStore } from '@features/appearance';
import { type AssetModel } from '@features/assets';

import { FacetCube } from './FacetCube';
import type { MediaCardResolvedProps } from './MediaCard';
import type { MediaCardOverlayData } from './mediaCardWidgets';
import {
  facetComboKey,
  MAX_LENSES,
  useSiblingFacetStore,
  type SiblingFacets,
  type SiblingLens,
} from './siblingFacetStore';

const FACET_META: { key: keyof SiblingFacets; label: string; icon: string }[] = [
  { key: 'inputs', label: 'Inputs', icon: 'link' },
  { key: 'prompt', label: 'Prompt', icon: 'messageSquare' },
  { key: 'seed', label: 'Seed', icon: 'hash' },
];

const CHIP_BASE =
  'cq-badge inline-flex items-center gap-1 rounded-full !bg-black/65 !text-white text-[10px] font-medium backdrop-blur-sm shadow-sm px-1.5 py-0.5 cursor-pointer hover:animate-hover-pop';

/**
 * Touch-only device (no hover). Mirrors the detection in
 * {@link adaptVisibilityForTouch}: on these devices there is no mouse hover, so
 * the chip's hover-expand popup never opens — tapping a chip must open the
 * editor popup instead of jumping straight to the mini-gallery. The popup keeps
 * a "View" button so navigating to the gallery stays one tap away.
 */
const IS_TOUCH_ONLY =
  typeof window !== 'undefined' &&
  'ontouchstart' in window &&
  !window.matchMedia('(hover: hover)').matches;

/** Which facets the asset actually carries (lens facets it lacks are dropped). */
function presentFacets(asset: AssetModel): SiblingFacets {
  return {
    inputs: !!asset.inputAssetsKey,
    prompt: !!(asset.promptFamilyId || asset.promptVersionId),
    seed: typeof asset.genSeed === 'number' && Number.isFinite(asset.genSeed),
  };
}

/**
 * Per-facet colour — the primary indicator. Each facet keeps the same hue
 * everywhere (the glyph rings + the editor popup dots) so the colour language is
 * learnable: blue = inputs, violet = prompt, amber = seed. Tuned to read on the
 * dark `bg-black/65` chip.
 */
const FACET_COLOR: Record<keyof SiblingFacets, string> = {
  inputs: '#38bdf8', // sky-400
  prompt: '#a78bfa', // violet-400
  seed: '#fbbf24', // amber-400
};

/**
 * Modular facet glyph — one composited icon instead of a row of 3. Stacked
 * concentric layers: a neutral centre node (the asset) plus one ring per active
 * facet, each at a FIXED radius in its facet colour. So colour says *which*
 * facets and the number of rings says *how many* — both legible at badge size
 * where distinct shapes blur together. Inactive facets draw nothing, so adding
 * a facet literally "stacks on" another layer.
 *
 * Fixed radius per facet (inner→outer) keeps a given combo's look stable, the
 * seed of a reusable modular-icon system if this lands (today local to
 * similarity). Radii/colours live in the maps above + below — swap in one place.
 */
const FACET_RING: Record<keyof SiblingFacets, number> = {
  inputs: 4.0, // innermost
  prompt: 7.4,
  seed: 10.8, // outermost
};
const RING_ORDER: (keyof SiblingFacets)[] = ['inputs', 'prompt', 'seed'];

function FacetGlyph({ facets, size = 15 }: { facets: SiblingFacets; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="shrink-0" aria-hidden>
      {RING_ORDER.map((f) =>
        facets[f] ? (
          <circle
            key={f}
            cx={12}
            cy={12}
            r={FACET_RING[f]}
            fill="none"
            stroke={FACET_COLOR[f]}
            strokeWidth={2}
          />
        ) : null,
      )}
      {/* Asset anchor — tints with the chip text (white). */}
      <circle cx={12} cy={12} r={1.8} fill="currentColor" />
    </svg>
  );
}

function SimilarityChip({
  lens,
  data,
  asset,
}: {
  lens: SiblingLens;
  data: MediaCardOverlayData;
  asset: AssetModel;
}) {
  const toggleLensFacet = useSiblingFacetStore((s) => s.toggleLensFacet);
  const removeLens = useSiblingFacetStore((s) => s.removeLens);
  const addLens = useSiblingFacetStore((s) => s.addLens);
  const atCap = useSiblingFacetStore((s) => s.lenses.length >= MAX_LENSES);
  const badgeSkin = useAppearanceStore((s) => s.badgeSkin);
  const { isExpanded, handlers } = useHoverExpand({ expandDelay: 120, collapseDelay: 200 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  // Touch devices have no hover, so the popup is opened by tapping the chip.
  const [touchOpen, setTouchOpen] = useState(false);
  const open = isExpanded || touchOpen;

  // Dismiss the touch-opened popup on an outside tap (synthesised mousedown).
  // Mirrors the close-on-outside pattern used by the status / info popovers.
  useEffect(() => {
    if (!touchOpen) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (popoverRef.current?.contains(t)) return;
      setTouchOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [touchOpen]);

  const counts = data.cohortCounts ?? {};
  const present = presentFacets(asset);
  // Effective lens = lit facets the asset actually has — drives both the count
  // and what the click opens (they must agree).
  const effective: SiblingFacets = {
    inputs: lens.facets.inputs && present.inputs,
    prompt: lens.facets.prompt && present.prompt,
    seed: lens.facets.seed && present.seed,
  };
  const effKey = facetComboKey(effective);
  const count = effKey ? counts[effKey] ?? 0 : 0;
  const hasCohort = count >= 2;

  const litLabels = FACET_META.filter((f) => effective[f.key]).map((f) => f.label.toLowerCase());
  const editHint = IS_TOUCH_ONLY ? 'tap to edit' : 'hover to edit';
  const tip = litLabels.length
    ? `${count} sharing ${litLabels.join(' + ')} — ${editHint}`
    : `No facet applies to this asset — ${editHint}`;

  // Only render where this lens actually has a cohort (>= 2). The old dimmed
  // icon-only handle on every card was redundant — editing + "Add badge" are
  // reachable from any visible badge's popup. Stay mounted while the editor is
  // open so toggling facets down to no-cohort mid-edit doesn't unmount the popup.
  if (!hasCohort && !open) return null;

  return (
    <>
      <div
        ref={triggerRef}
        {...handlers}
        className={`${CHIP_BASE} ${hasCohort ? '' : 'opacity-40'}`}
        title={tip}
        onClick={(e) => {
          e.stopPropagation();
          // Touch devices can't hover, so a tap opens the editor popup (facet
          // toggles + "Add badge" + a "View" button) instead of jumping
          // straight to the mini-gallery — otherwise the editor is unreachable
          // on mobile. Mouse keeps click-to-view since hover reveals the popup.
          if (IS_TOUCH_ONLY) {
            setTouchOpen((v) => !v);
            return;
          }
          openSimilarityGallery(asset, lens.facets);
        }}
      >
        {badgeSkin === 'cube' ? (
          <FacetCube facets={lens.facets} />
        ) : (
          <FacetGlyph facets={lens.facets} />
        )}
        {hasCohort && <span className="whitespace-nowrap">{count}</span>}
      </div>
      {open && (
        <PortalFloat
          anchor={triggerRef.current}
          placement="top"
          align="start"
          offset={6}
          onMouseEnter={handlers.onMouseEnter}
          onMouseLeave={handlers.onMouseLeave}
        >
          {/* `data-overlay-interactive` marks this portaled popup as a real
              control. PortalFloat renders to <body>, but its clicks still bubble
              through the React tree to MediaCard's onClickCapture/pointer-down
              guards — without this attribute the DOM-based `closest()` check
              there finds nothing, so the card eats the tap (revealing its button
              group) instead of letting "Add badge"/facet toggles fire. Mirrors
              the generation submenu's `data-gen-action-popover` marker. */}
          <div
            ref={popoverRef}
            data-overlay-interactive="true"
            className="min-w-[170px] rounded-lg bg-neutral-900/95 backdrop-blur-sm shadow-xl p-1.5 ring-1 ring-white/10"
          >
            <div className="flex items-center justify-between px-1 pb-1">
              <span className="text-[10px] uppercase tracking-wide text-white/50">Similar by</span>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation();
                  removeLens(lens.id);
                }}
                className="rounded p-0.5 text-white/40 hover:bg-white/10 hover:text-white/80"
                title="Remove this badge"
              >
                <Icon name="trash" size={12} />
              </button>
            </div>
            <div className="flex flex-col gap-0.5">
              {FACET_META.map((f) => {
                const lit = lens.facets[f.key];
                const has = present[f.key];
                return (
                  <button
                    key={f.key}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleLensFacet(lens.id, f.key);
                    }}
                    className={`flex items-center gap-2 rounded px-2 py-1 text-[11px] text-left transition-colors ${
                      lit ? 'bg-accent/80 text-accent-text' : 'text-white/80 hover:bg-white/10'
                    } ${has ? '' : 'italic'}`}
                    title={has ? undefined : `This asset has no ${f.label.toLowerCase()}`}
                  >
                    {/* Colour swatch — same hue as this facet's ring in the
                        glyph, so the popup doubles as the legend. */}
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: FACET_COLOR[f.key], opacity: lit ? 1 : 0.35 }}
                    />
                    <Icon name={f.icon} size={12} />
                    <span className="flex-1">
                      {f.label}
                      {!has && lit ? ' (n/a here)' : ''}
                    </span>
                    {lit && <Icon name="check" size={12} />}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.stopPropagation();
                setTouchOpen(false);
                openSimilarityGallery(asset, lens.facets);
              }}
              disabled={!hasCohort}
              className="mt-1 w-full rounded bg-white/10 px-2 py-1 text-[11px] text-white/90 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {litLabels.length ? `View ${count} (${litLabels.join(' + ')})` : 'Pick a facet'}
            </button>
            {/* Add a new badge from here — keeps all badge management in the
                same popup as the facet toggles (no separate "+" chip). */}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.stopPropagation();
                addLens();
              }}
              disabled={atCap}
              title={atCap ? `At most ${MAX_LENSES} badges` : 'Add another similarity badge'}
              className="mt-1 flex w-full items-center justify-center gap-1 rounded border border-dashed border-white/25 px-2 py-1 text-[11px] text-white/70 hover:border-white/50 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Icon name="plus" size={11} />
              {atCap ? 'Max badges' : 'Add badge'}
            </button>
          </div>
        </PortalFloat>
      )}
    </>
  );
}

function AddLensChip() {
  const addLens = useSiblingFacetStore((s) => s.addLens);
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        e.stopPropagation();
        addLens();
      }}
      className="cq-badge inline-flex items-center justify-center rounded-full border border-dashed border-white/40 !bg-black/45 !text-white/70 backdrop-blur-sm shadow-sm w-[18px] h-[18px] cursor-pointer hover:!text-white hover:border-white/70 hover:animate-hover-pop"
      title="Add a similarity badge"
    >
      <Icon name="plus" size={11} />
    </button>
  );
}

function SimilarityBadgeStack({ data, asset }: { data: MediaCardOverlayData; asset: AssetModel }) {
  const lenses = useSiblingFacetStore((s) => s.lenses);
  return (
    <div className="flex flex-col items-start gap-1">
      {lenses.map((lens) => (
        <SimilarityChip key={lens.id} lens={lens} data={data} asset={asset} />
      ))}
      {/* "Add badge" normally lives in each chip's popup; the standalone "+"
          is only a bootstrap for when every badge has been removed. */}
      {lenses.length === 0 && <AddLensChip />}
    </div>
  );
}

/**
 * Faceted similarity-badge factory. One overlay item (anchored top-left in the
 * `badges-tl` stack) that renders the user's lens chips + add handle. Gated to
 * information-dense presets (`showsSiblingBadges`); manages its own
 * hover-expand + clicks (`handlesOwnInteraction`).
 */
export function createSimilarityBadge(
  props: MediaCardResolvedProps,
): OverlayWidget<MediaCardOverlayData> | null {
  if (!props.presetCapabilities?.showsSiblingBadges) return null;
  const asset = props.contextMenuAsset;
  // No real AssetModel (e.g. remote provider-library items rendered through the
  // legacy individual-field path) — similarity facets don't apply, and
  // presentFacets() would deref undefined. Skip the badge entirely.
  if (!asset) return null;
  return {
    id: 'similarity',
    type: 'badge',
    ...BADGE_SLOT.topLeft,
    visibility: { trigger: 'hover-container', touchFallback: 'always' },
    priority: BADGE_PRIORITY.background,
    interactive: true,
    handlesOwnInteraction: true,
    render: (data) => <SimilarityBadgeStack data={data} asset={asset} />,
  };
}
