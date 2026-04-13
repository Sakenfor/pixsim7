// Register built-in gesture surfaces at module-load so consumers can read
// their config without having to know about the registration ordering.
import './surfaces';

export {
  useMouseGesture,
  type GestureDirection,
  type GesturePhase,
  type GestureEvent,
  type GestureSwipeEvent,
  type ActiveGesture,
} from './useMouseGesture';
export {
  GESTURE_ACTIONS,
  resolveGestureHandler,
  getGestureActionLabel,
  computeGestureCount,
  isScalableAction,
  resolveCascadeAction,
  CHAIN_GESTURE_ACTIONS,
  getChainActionLabel,
  isChainDurationAction,
  VIEWER_GESTURE_ACTIONS,
  ALL_VIEWER_ACTIONS,
  type GestureActionId,
  type ChainGestureActionId,
  type ViewerGestureActionId,
  type GestureResolverContext,
  type CascadeResolution,
} from './gestureActions';
export {
  registerGestureSurface,
  getGestureSurface,
  getAllGestureSurfaces,
  subscribeGestureSurfaces,
  getCascadeActionsForDirection,
  getChainActionForDirection,
  type GestureSurfaceId,
  type GestureSurfaceSource,
  type GestureSurfaceConfig,
  type GestureSurfaceDescriptor,
} from './gestureSurfaces';
export {
  useGestureSurfaceStore,
  useSurfaceOwnConfig,
  useSurfaceGestureConfig,
} from './useGestureSurfaceStore';
export { useGestureSecondaryStore, resolveDurationFromDy, type GestureSecondaryState } from './useGestureSecondaryStore';
export { useCardGestures, type UseCardGesturesOptions, type UseCardGesturesResult } from './useCardGestures';
export { useViewerGestures, type ViewerGestureContext, type UseViewerGesturesResult } from './useViewerGestures';
export { GestureOverlay, GestureCancelOverlay } from './GestureOverlay';
