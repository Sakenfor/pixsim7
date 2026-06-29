/**
 * Content component for the generation button group.
 *
 * Thin composer: pulls skin-agnostic state from `useGenerationButtonGroup`
 * and hands it to the pill skin (`toPillButtonItems` + the expand renderer
 * map + the provider picker popover). Swap in another skin here to reshape
 * the whole surface without touching behavior.
 */

import { ButtonGroup } from '@pixsim7/shared.ui';
import React, { useMemo } from 'react';

import {
  useButtonGroupWindowStore,
  useSurfaceButtonWindowOffset,
} from './buttonGroupWindowStore';
import type { MediaCardResolvedProps } from './MediaCard';
import type { MediaCardOverlayData } from './mediaCardWidgets';
import {
  GenerationProviderPickerPopover,
  toPillButtonItems,
} from './generationButtonGroupPillSkin';
import { useGenerationButtonGroup } from './useGenerationButtonGroup';

type GenerationButtonGroupContentProps = {
  data: MediaCardOverlayData;
  cardProps: MediaCardResolvedProps;
};

/**
 * Width (px) the centered generation pill keeps clear at the bottom edge when a
 * bottom corner is actually occupied — roughly one badge + gap per side. Because
 * the pill is centered, the binding constraint is the same whether one or both
 * corners are taken, so this is applied as a single all-or-nothing reserve.
 */
const BUTTON_GROUP_CORNER_RESERVE = 80;

/**
 * Is a bottom corner occupied for this asset? Only the bottom-left is in play —
 * it carries the version chip / warnings cluster (the duration badge now lives
 * top-left). Mirrors the `visibleWhen` predicates of createVersionBadge /
 * createWarningsBadge so the reserve tracks them.
 */
function hasBottomCornerBadge(data: MediaCardOverlayData): boolean {
  return Boolean(data.versionNumber) || (data.warnings?.length ?? 0) > 0;
}

export function GenerationButtonGroupContent({ data, cardProps }: GenerationButtonGroupContentProps) {
  const { actions, providerMenu, hotkeyContextMenu, container } = useGenerationButtonGroup({ data, cardProps });
  const buttonItems = useMemo(() => toPillButtonItems(actions), [actions]);

  // Only reserve corner room when a bottom corner is actually occupied; with
  // empty corners the pill keeps the full card width (more buttons visible).
  const widthInset = hasBottomCornerBadge(data) ? BUTTON_GROUP_CORNER_RESERVE : 0;

  // Wheel-cycle window position is shared per surface (gallery / viewer / …),
  // not per card — wheeling one pill advances every pill on the same surface.
  const surfaceKey = cardProps.gestureSurfaceId ?? 'gallery';
  const sharedWindowOffset = useSurfaceButtonWindowOffset(surfaceKey);
  const setSurfaceWindowOffset = useButtonGroupWindowStore((s) => s.setOffset);

  return (
    <div className="relative" data-context-ignore="true">
      <div
        ref={container.ref}
        onClick={(e) => e.stopPropagation()}
        onAuxClick={(e) => e.stopPropagation()}
        onWheel={container.onWheel}
        // Hover/focus sets this card as the active target for media-card
        // capability actions (Extend/Regenerate/Quick-Gen/… keyboard
        // shortcuts). Focus handlers use capture phase so bubbling
        // interactive descendants (the expanded dropdowns) still toggle
        // active correctly.
        onPointerEnter={container.onPointerEnter}
        onPointerLeave={container.onPointerLeave}
        onFocusCapture={container.onFocusCapture}
        onBlurCapture={container.onBlurCapture}
        onMouseDown={container.onMouseDown}
      >
        <ButtonGroup
          layout="pill"
          size="sm"
          items={buttonItems}
          expandOffset={8}
          portal
          responsiveVisible
          wheelCycle
          preferredVisibleId="smart-action"
          // Reserve room at the bottom corners only when one is occupied, so the
          // centered pill windows narrower instead of spanning the full card
          // into the bottom-left badge stack / bottom-right duration. The
          // box-separation pass stays the fallback for anything this misses.
          widthInset={widthInset}
          // Share the wheel-cycle position across the surface's cards.
          windowOffset={sharedWindowOffset}
          onWindowOffsetChange={(next) => setSurfaceWindowOffset(surfaceKey, next)}
        />
      </div>

      <GenerationProviderPickerPopover menu={providerMenu} />
      {hotkeyContextMenu}
    </div>
  );
}
