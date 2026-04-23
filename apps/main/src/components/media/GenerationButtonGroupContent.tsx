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

export function GenerationButtonGroupContent({ data, cardProps }: GenerationButtonGroupContentProps) {
  const { actions, providerMenu, container } = useGenerationButtonGroup({ data, cardProps });
  const buttonItems = useMemo(() => toPillButtonItems(actions), [actions]);

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
        />
      </div>

      <GenerationProviderPickerPopover menu={providerMenu} />
    </div>
  );
}
