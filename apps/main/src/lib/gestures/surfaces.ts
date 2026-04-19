/**
 * Built-in gesture surfaces.
 *
 * Importing this module registers the gallery, viewer and recent-strip
 * surfaces with the gesture-surface registry. The barrel `@lib/gestures`
 * imports it once so registration happens at app startup without the
 * consumer having to remember.
 */

import { ALL_VIEWER_ACTIONS, GESTURE_ACTIONS } from './gestureActions';
import { registerGestureSurface } from './gestureSurfaces';

registerGestureSurface({
  id: 'gallery',
  label: 'Gallery Cards',
  icon: '🖼️',
  order: 10,
  description: 'Swipe on asset cards in the gallery to trigger quick actions.',
  defaults: {
    enabled: true,
    threshold: 30,
    edgeInset: 0.2,
    cascadeStepPixels: 50,
    gestureUp: ['upload', 'upgradeModel', 'patchAsset'],
    gestureDown: ['archive'],
    gestureLeft: ['none'],
    gestureRight: ['quickGenerate'],
    chainUp: 'none',
    chainDown: 'none',
    chainLeft: 'none',
    chainRight: 'cycleDuration',
  },
  actionPool: GESTURE_ACTIONS,
});

registerGestureSurface({
  id: 'viewer',
  label: 'Media Viewer',
  icon: '🎞️',
  order: 20,
  description: 'Swipe in the media viewer (viewing mode) to navigate or trigger quick actions.',
  defaults: {
    enabled: true,
    threshold: 40,
    edgeInset: 0.05,
    cascadeStepPixels: 50,
    gestureUp: ['toggleFavorite'],
    gestureDown: ['closeViewer'],
    gestureLeft: ['navigateNext'],
    gestureRight: ['navigatePrev'],
    chainUp: 'none',
    chainDown: 'none',
    chainLeft: 'none',
    chainRight: 'none',
  },
  actionPool: ALL_VIEWER_ACTIONS,
  allowMirrorFrom: ['gallery'],
});

registerGestureSurface({
  id: 'strip',
  label: 'Recent Strip',
  icon: '🎚️',
  order: 30,
  description: 'Swipe on thumbnails in the recent-assets filmstrip below the media viewer.',
  defaults: {
    enabled: true,
    threshold: 30,
    edgeInset: 0.1,
    cascadeStepPixels: 50,
    gestureUp: ['quickGenerate'],
    gestureDown: ['archive'],
    gestureLeft: ['none'],
    gestureRight: ['none'],
    chainUp: 'none',
    chainDown: 'none',
    chainLeft: 'none',
    chainRight: 'none',
  },
  actionPool: GESTURE_ACTIONS,
  allowMirrorFrom: ['gallery', 'viewer'],
});

registerGestureSurface({
  id: 'signal-triage',
  label: 'Signal Triage',
  icon: '⚠️',
  order: 40,
  description: 'Cards in the signal triage gallery surface — swipe to keep or flag the heuristic decision.',
  defaults: {
    enabled: true,
    threshold: 30,
    edgeInset: 0.2,
    cascadeStepPixels: 50,
    gestureUp: ['markSignalKeep'],
    gestureDown: ['markSignalFlag'],
    gestureLeft: ['none'],
    gestureRight: ['none'],
    chainUp: 'none',
    chainDown: 'none',
    chainLeft: 'none',
    chainRight: 'none',
  },
  actionPool: GESTURE_ACTIONS,
  allowMirrorFrom: ['gallery'],
});
