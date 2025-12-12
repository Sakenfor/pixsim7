/**
 * HUD Feature Module
 *
 * HUD layout/editor UI components and state management.
 * Consolidates HUD builder, renderer, editor, and customization panels.
 *
 * @example
 * ```typescript
 * // Import from barrel
 * import { HudLayoutBuilder, HudRenderer, useHudLayoutStore } from '@features/hud';
 *
 * // Or import specific modules
 * import { HudEditor } from '@features/hud/components/editor/HudEditor';
 * import { HudCustomizationPanel } from '@features/hud/panels/HudCustomizationPanel';
 * ```
 */

// ============================================================================
// Components - HUD Builder & Renderer
// ============================================================================

export { HudLayoutBuilder } from './components/HudLayoutBuilder';
export { HudRegionSelector } from './components/HudRegionSelector';
export { HudRegionCanvas } from './components/HudRegionCanvas';
export { HudWidgetLibrary } from './components/HudWidgetLibrary';
export { HudLayoutManager } from './components/HudLayoutManager';
export { HudRenderer, HudRendererToggle } from './components/HudRenderer';
export { HudLayoutSwitcher } from './components/HudLayoutSwitcher';

// Component types
export type { HudLayoutBuilderProps } from './components/HudLayoutBuilder';
export type { HudRegionSelectorProps } from './components/HudRegionSelector';
export type { HudRegionCanvasProps } from './components/HudRegionCanvas';
export type { HudWidgetLibraryProps } from './components/HudWidgetLibrary';
export type { HudLayoutManagerProps } from './components/HudLayoutManager';
export type { HudRendererProps } from './components/HudRenderer';
export type { HudLayoutSwitcherProps } from './components/HudLayoutSwitcher';

// ============================================================================
// Components - Editor
// ============================================================================

export { HudEditor } from './components/editor/HudEditor';
export type { HudLayoutEditorProps } from './components/editor/HudEditor';

// ============================================================================
// Panels - Game Integration
// ============================================================================

// Backward compatibility wrapper - re-exports HudEditor as HudLayoutEditor
export { HudLayoutEditor } from './panels/HudLayoutEditor';

export {
  HudProfileSwitcher,
  HudProfileSwitcherButton,
} from './panels/HudProfileSwitcher';

export {
  RegionalHudLayout,
  DefaultHudLayout,
} from './panels/RegionalHudLayout';

export {
  HudCustomizationPanel,
  HudCustomizationButton,
} from './panels/HudCustomizationPanel';

// ============================================================================
// Stores
// ============================================================================

export {
  useHudLayoutStore,
  type HudLayoutState,
  type HudLayoutActions,
} from './stores/hudLayoutStore';
// Lib - Hud Core
export * from './lib/core';
