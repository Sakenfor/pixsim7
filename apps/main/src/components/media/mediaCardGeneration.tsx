/* eslint-disable react-refresh/only-export-components */
/**
 * MediaCard Generation Widgets
 *
 * Generation-related overlay components and widgets for MediaCard.
 * Split from mediaCardWidgets.tsx for better separation of concerns.
 *
 * This file contains widget factory functions and re-exports from split modules.
 * Implementation details live in:
 *  - mediaCardGeneration.helpers.ts   — pure utilities (seed, prompt, asset checks)
 *  - SourceAssetsPreview.tsx           — hover-expand source asset thumbnails
 *  - useGenerationCardHandlers.ts      — all callback handlers + loading states
 *  - GenerationButtonGroupContent.tsx  — the button group component
 */

import type { OverlayWidget } from '@lib/ui/overlay';
import { createMenuWidget, type MenuItem, type BadgeWidgetConfig } from '@lib/ui/overlay';
import { createBadgeWidget } from '@lib/ui/overlay';

import {
  getStatusConfig,
  getStatusBadgeClasses,
} from '@features/generation';

import { GenerationButtonGroupContent } from './GenerationButtonGroupContent';
import type { MediaCardResolvedProps } from './MediaCard';
import type { MediaCardOverlayData } from './mediaCardWidgets';

// Re-export from split modules for backward compatibility
export { stripInputParams, parseGenerationRecord, parseGenerationContext, extractGenerationAssetIds } from './mediaCardGeneration.utils';
export {
  getSmartActionLabel,
  resolveMaxSlotsFromSpecs,
  resolveMaxSlotsForModel,
  SlotPickerContent,
  SlotPickerGrid,
  type SlotPickerContentProps,
} from './SlotPicker';
export { GenerationButtonGroupContent } from './GenerationButtonGroupContent';
export {
  stripSeedFromValue,
  stripSeedFromParams,
  paramsIncludeSeed,
  operationSupportsSeedParam,
  resolvePromptLimitFromSpec,
  hasAssetInputs,
  type PromptLimitOpSpec,
} from './mediaCardGeneration.helpers';
export { SourceAssetsPreview } from './SourceAssetsPreview';
export { useGenerationCardHandlers } from './useGenerationCardHandlers';
export type { UseGenerationCardHandlersArgs } from './useGenerationCardHandlers';

// Local import for use in createGenerationButtonGroup

/**
 * Build generation menu items based on media type and available actions
 */
export function buildGenerationMenuItems(
  id: number,
  mediaType: MediaCardResolvedProps['mediaType'],
  actions: MediaCardResolvedProps['actions']
): MenuItem[] {
  if (!actions) return [];

  const menuItems: MenuItem[] = [];

  // Image operations
  if (mediaType === 'image') {
    if (actions.onImageToImage) {
      menuItems.push({
        id: 'img2img',
        label: 'Queue Image to Image',
        icon: 'image',
        onClick: () => actions.onImageToImage?.(id),
      });
    }
    if (actions.onImageToVideo) {
      menuItems.push({
        id: 'img2vid',
        label: 'Queue Image to Video',
        icon: 'video',
        onClick: () => actions.onImageToVideo?.(id),
      });
    }
  }

  // Video operations
  if (mediaType === 'video' && actions.onVideoExtend) {
    menuItems.push({
      id: 'extend',
      label: 'Queue Extend in Quick Gen',
      icon: 'arrowRight',
      onClick: () => actions.onVideoExtend?.(id),
    });
  }

  // Universal operations
  if (actions.onAddToTransition) {
    menuItems.push({
      id: 'transition',
      label: 'Queue in Transition',
      icon: 'shuffle',
      onClick: () => actions.onAddToTransition?.(id),
    });
  }

  if (actions.onAddToGenerate) {
    menuItems.push({
      id: 'generate',
      label: 'Queue in Current Mode',
      icon: 'zap',
      onClick: () => actions.onAddToGenerate?.(id),
    });
  }

  return menuItems;
}

/**
 * Create generation actions menu widget
 */
export function createGenerationMenu(props: MediaCardResolvedProps): OverlayWidget<MediaCardOverlayData> | null {
  const { id, mediaType, actions, badgeConfig, presetCapabilities } = props;

  // Only show the generation menu if preset capabilities enable it
  if (!presetCapabilities?.showsGenerationMenu) {
    return null;
  }

  const showGenerationBadge = badgeConfig?.showGenerationBadge ?? true;

  if (!showGenerationBadge || !actions) {
    return null;
  }

  const menuItems = buildGenerationMenuItems(id, mediaType, actions);

  if (menuItems.length === 0) {
    return null;
  }

  return createMenuWidget({
    id: 'generation-menu',
    position: { anchor: 'bottom-right', offset: { x: -8, y: -8 } },
    visibility: { trigger: 'hover-container' },
    items: menuItems,
    trigger: {
      icon: 'zap',
      variant: 'button',
      label: 'Generate',
      className: 'bg-accent hover:bg-accent-hover text-accent-text',
    },
    triggerType: 'click',
    placement: 'top-right',
    priority: 35,
  });
}

/**
 * Create generation button group widget (bottom-center)
 * Two merged buttons: menu (left) + smart action (right)
 */
export function createGenerationButtonGroup(props: MediaCardResolvedProps): OverlayWidget<MediaCardOverlayData> | null {
  const { badgeConfig, presetCapabilities } = props;

  // Only show if preset capabilities enable it
  if (!presetCapabilities?.showsGenerationMenu) {
    return null;
  }

  const showGenerationBadge = badgeConfig?.showGenerationBadge ?? true;

  if (!showGenerationBadge) {
    return null;
  }

  return {
    id: 'generation-button-group',
    type: 'custom',
    position: { anchor: 'bottom-center', offset: { x: 0, y: -14 } },
    visibility: { trigger: 'hover-container' },
    priority: 35,
    interactive: true,
    handlesOwnInteraction: true,
    render: (data: MediaCardOverlayData) => (
      <GenerationButtonGroupContent data={data} cardProps={props} />
    ),
  };
}

/**
 * Create generation status badge widget (top-right, below provider badge)
 * Shows when an asset is being generated (pending/processing) or failed
 */
export function createGenerationStatusWidget(props: MediaCardResolvedProps): OverlayWidget<MediaCardOverlayData> | null {
  const { generationStatus, generationError, badgeConfig } = props;

  if (!generationStatus) {
    return null;
  }

  // Only show for non-completed states (or failed)
  if (generationStatus === 'completed' && !badgeConfig?.showGenerationBadge) {
    return null;
  }

  // Get status configuration
  const statusCfg = getStatusConfig(generationStatus);
  const badgeColor: NonNullable<BadgeWidgetConfig['color']> =
    statusCfg.color === 'amber'
      ? 'orange'
      : statusCfg.color === 'neutral'
        ? 'gray'
        : statusCfg.color;
  const config = {
    icon: statusCfg.icon as any,
    color: badgeColor,
    label: statusCfg.label,
    className: getStatusBadgeClasses(generationStatus) + (generationStatus === 'processing' ? ' animate-spin' : ''),
    tooltip: generationStatus === 'failed' ? (generationError || statusCfg.description) : statusCfg.description,
  };

  return createBadgeWidget({
    id: 'generation-status',
    position: { anchor: 'top-right', offset: { x: -8, y: 8 } },
    stackGroup: 'badges-tr',
    visibility: { trigger: 'always' },
    variant: 'icon',
    icon: config.icon,
    color: config.color,
    shape: 'circle',
    tooltip: config.tooltip,
    className: `${config.className} backdrop-blur-md`,
    priority: 16,
  });
}
