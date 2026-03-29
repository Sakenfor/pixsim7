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
import { type BadgeWidgetConfig } from '@lib/ui/overlay';
import { createBadgeWidget } from '@lib/ui/overlay';

import { useCapability, CAP_CHARACTER_INGEST_ACTION, type CharacterIngestActionContext } from '@features/contextHub';
import {
  getStatusConfig,
  getStatusBadgeClasses,
} from '@features/generation';

import { GenerationButtonGroupContent } from './GenerationButtonGroupContent';
import type { MediaCardResolvedProps } from './MediaCard';
import { useMediaCardActionModeStore } from './mediaCardActionModeStore';
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

function GenerationActionModeBadgeContent({ cardProps }: { cardProps: MediaCardResolvedProps }) {
  const mode = useMediaCardActionModeStore((s) => s.byAssetId[cardProps.id] ?? 'generation');
  const { value: characterIngestAction } =
    useCapability<CharacterIngestActionContext>(CAP_CHARACTER_INGEST_ACTION);

  const canShowCharacterMode = cardProps.mediaType === 'image' && !!characterIngestAction?.addAssetsToIngest;
  if (!canShowCharacterMode) return null;

  const label = mode === 'character-ingest' ? 'CHAR' : 'GEN';
  const className = mode === 'character-ingest'
    ? 'bg-emerald-600/90 text-white border-emerald-400/40'
    : 'bg-black/65 text-white border-white/15';
  const title = mode === 'character-ingest'
    ? `Character ingest mode (${characterIngestAction.characterLabel || characterIngestAction.characterId})`
    : 'Generation mode';

  return (
    <div
      className={`pointer-events-none rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide border backdrop-blur-sm ${className}`}
      title={title}
    >
      {label}
    </div>
  );
}

export function createGenerationActionModeBadge(props: MediaCardResolvedProps): OverlayWidget<MediaCardOverlayData> | null {
  if (!props.presetCapabilities?.showsGenerationMenu) {
    return null;
  }

  return {
    id: 'generation-action-mode-badge',
    type: 'custom',
    position: { anchor: 'bottom-left', offset: { x: 8, y: -28 } },
    visibility: { trigger: 'hover-container' },
    priority: 34,
    interactive: false,
    render: () => <GenerationActionModeBadgeContent cardProps={props} />,
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
    variant: 'icon',
    icon: config.icon,
    color: config.color,
    shape: 'circle',
    tooltip: config.tooltip,
    className: `${config.className} backdrop-blur-md`,
    priority: 16,
  });
}
