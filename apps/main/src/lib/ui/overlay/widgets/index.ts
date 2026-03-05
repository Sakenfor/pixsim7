/**
 * Built-in Widget Types
 *
 * Export all pre-built widget creators
 */

export {
  BADGE_SLOT,
  BADGE_PRIORITY,
  createBadgeWidget,
  BadgePresets,
} from './BadgeWidget';
export type { BadgeWidgetConfig } from './BadgeWidget';

export { createButtonWidget } from './ButtonWidget';
export type { ButtonWidgetConfig } from './ButtonWidget';

export { createPanelWidget } from './PanelWidget';
export type { PanelWidgetConfig } from './PanelWidget';

export { createMenuWidget } from './MenuWidget';
export type { MenuItem, MenuWidgetConfig } from './MenuWidget';

export {
  VideoScrubWidgetRenderer,
  createVideoScrubWidget,
} from './VideoScrubWidget';
export type {
  VideoScrubWidgetConfig,
  VideoScrubWidgetRendererProps,
} from './VideoScrubWidget';

export { createProgressWidget } from './ProgressWidget';
export type { ProgressWidgetConfig } from './ProgressWidget';

export { createUploadWidget } from './UploadWidget';
export type { UploadState, UploadWidgetConfig } from './UploadWidget';

export { createTooltipWidget } from './TooltipWidget';
export type { TooltipContent, TooltipWidgetConfig } from './TooltipWidget';

export { createSceneViewHost } from './SceneViewHost';
export type { SceneViewHostConfig } from './SceneViewHost';
