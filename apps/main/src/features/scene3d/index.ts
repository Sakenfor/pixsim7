/**
 * Scene 3D Feature
 *
 * Base shared feature for 3D model viewing and interaction.
 * Provides components for React Three Fiber canvas, model loading,
 * zone highlighting, and animation timeline.
 */

// Components
export { Model3DViewport } from './components/Model3DViewport';
export { ModelLoader } from './components/ModelLoader';
export { ZoneHighlighter, ZoneOutline } from './components/ZoneHighlighter';
export { AnimationTimeline } from './components/AnimationTimeline';

// Store
export {
  useModel3DStore,
  selectHasModel,
  selectIsInZoneMode,
  selectHasAnimations,
  selectZoneIds,
  selectSelectedZoneConfig,
} from './stores/model3DStore';
