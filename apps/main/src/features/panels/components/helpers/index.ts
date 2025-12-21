/**
 * Global Helper Panels
 *
 * Context-aware panels that can be used across different parts of the application.
 *
 * Note: New panels should be added to `definitions/` using `definePanel()` for auto-discovery.
 * These legacy exports are maintained for backwards compatibility.
 */

export { QuickGeneratePanel } from './QuickGeneratePanel';
export { InfoPanel } from './InfoPanel';
export type { QuickGeneratePanelProps, QuickGeneratePanelContext } from './QuickGeneratePanel';
export type { InfoPanelProps, InfoPanelContext } from './InfoPanel';

// Re-export from new location for backwards compatibility
export {
  InteractiveSurfacePanel,
  type InteractiveSurfacePanelProps,
  type InteractiveSurfacePanelContext,
} from '../../definitions/interactive-surface';
