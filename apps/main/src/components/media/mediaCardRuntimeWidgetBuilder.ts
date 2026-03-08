 
import type { OverlayWidget } from '@lib/ui/overlay';

import type { MediaCardResolvedProps } from './MediaCard';
import type { MediaCardOverlayData } from './mediaCardWidgets';

type MediaCardWidgetFactory = (
  props: MediaCardResolvedProps,
) => OverlayWidget<MediaCardOverlayData> | null;

interface MediaCardRuntimeWidgetFactories {
  createPrimaryIconWidget: MediaCardWidgetFactory;
  createStatusWidget: MediaCardWidgetFactory;
  createFavoriteWidget: MediaCardWidgetFactory;
  createQueueStatusWidget: MediaCardWidgetFactory;
  createSelectionStatusWidget: MediaCardWidgetFactory;
  createDurationWidget: MediaCardWidgetFactory;
  createProviderWidget: MediaCardWidgetFactory;
  createVideoScrubber: MediaCardWidgetFactory;
  createUploadButton: MediaCardWidgetFactory;
  createInfoPopover: MediaCardWidgetFactory;
  createGenerationButtonGroup: MediaCardWidgetFactory;
  createGenerationActionModeBadge: MediaCardWidgetFactory;
  createModelFamilyWidget: MediaCardWidgetFactory;
  createQuickTagWidget: () => OverlayWidget<MediaCardOverlayData> | null;
  createQuickAddButton: () => OverlayWidget<MediaCardOverlayData> | null;
  createVersionBadge: () => OverlayWidget<MediaCardOverlayData>;
}

/**
 * Compose the default runtime widget set for MediaCard from factory functions.
 * Keeps the assembly contract in one place while allowing widget creators to
 * live in specialized modules.
 */
export function buildMediaCardRuntimeWidgets(
  props: MediaCardResolvedProps,
  factories: MediaCardRuntimeWidgetFactories,
): OverlayWidget<MediaCardOverlayData>[] {
  const {
    createPrimaryIconWidget,
    createStatusWidget,
    createFavoriteWidget,
    createQueueStatusWidget,
    createSelectionStatusWidget,
    createDurationWidget,
    createProviderWidget,
    createVideoScrubber,
    createUploadButton,
    createInfoPopover,
    createGenerationButtonGroup,
    createGenerationActionModeBadge,
    createModelFamilyWidget,
    createQuickTagWidget,
    createQuickAddButton,
    createVersionBadge,
  } = factories;

  const widgets = [
    createPrimaryIconWidget(props),
    createModelFamilyWidget(props),
    createStatusWidget(props),
    createFavoriteWidget(props),
    createQuickTagWidget(),
    createQueueStatusWidget(props),
    createSelectionStatusWidget(props),
    // Note: Generation status widget is opt-in via customWidgets or overlay config.
    createDurationWidget(props),
    createProviderWidget(props),
    createVideoScrubber(props),
    createUploadButton(props),
    createInfoPopover(props),
    createQuickAddButton(),
    createGenerationActionModeBadge(props),
    createGenerationButtonGroup(props),
    createVersionBadge(),
  ];

  let result = widgets
    .filter((widget): widget is OverlayWidget<MediaCardOverlayData> => widget !== null)
    .map((widget) => ({ ...widget, group: 'media-card-runtime' }));

  if (props.presetCapabilities?.forceHoverOnly) {
    result = result.map((widget) => ({
      ...widget,
      visibility: { trigger: 'hover-container' as const },
    }));
  }

  return result;
}
