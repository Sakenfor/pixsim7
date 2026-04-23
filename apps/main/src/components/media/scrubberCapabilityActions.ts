/**
 * Scrubber keyboard actions, registered as capability actions so shortcuts are
 * user-editable via the standard settings UI. Each action is gated on
 * `videoMarksStore.activeAssetId` — they only fire while the user is hovering
 * a video card, so Home/End/U don't hijack keys elsewhere.
 *
 * Migrated from the hardcoded keyboard handler that used to live inside
 * VideoScrubWidget.
 *
 * TODO: migrate onto `registerActiveTargetActions` (see
 * `@lib/capabilities/activeTargetActions`). Currently blocked by the
 * action bodies here reaching into `videoMarksStore` directly for marks,
 * currentTime, duration, and per-mode seek — the factory assumes each
 * action dispatches through a handler-bundle surface. To migrate, first
 * move `goToPrev`/`goToNext`/`stepRelative`/... into `videoMarksStore`
 * as methods, then register them as a bundle.
 */

import type { ActionDefinition } from '@pixsim7/shared.types';
import { useToastStore } from '@pixsim7/shared.ui';

import {
  registerAction,
  registerFeature,
  toActionCapability,
  unregisterAction,
  unregisterFeature,
} from '@lib/capabilities';

import { useVideoMarksStore, SELECT_LAST_FRAME } from './videoMarksStore';

const FEATURE_ID = 'media-card.video-scrub';
const STEP_COARSE = 0.5;
const STEP_FRAME = 1 / 30;

function getActiveId(): string | null {
  return useVideoMarksStore.getState().activeAssetId;
}

function getSeek() {
  const state = useVideoMarksStore.getState();
  const id = state.activeAssetId;
  return id ? state.seekFn[id] : undefined;
}

function getCurrentTime(): number {
  const state = useVideoMarksStore.getState();
  const id = state.activeAssetId;
  return id ? state.currentTime[id] ?? 0 : 0;
}

function getDuration(): number {
  const state = useVideoMarksStore.getState();
  const id = state.activeAssetId;
  return id ? state.duration[id] ?? 0 : 0;
}

function getMarks(): number[] {
  const state = useVideoMarksStore.getState();
  const id = state.activeAssetId;
  return id ? state.byAsset[id] ?? [] : [];
}

function goToPrev() {
  const seek = getSeek();
  if (!seek) return;
  const current = getCurrentTime();
  const marks = getMarks();
  if (marks.length === 0) {
    seek(0, { holdUntilCursorNear: true });
    return;
  }
  const prevMarks = marks.filter((m) => m < current - 0.05);
  if (prevMarks.length > 0) {
    const target = prevMarks[prevMarks.length - 1];
    seek(target, { holdUntilCursorNear: true });
    useVideoMarksStore.getState().setSelected(
      useVideoMarksStore.getState().activeAssetId!,
      target,
    );
  } else {
    seek(0, { holdUntilCursorNear: true });
  }
}

function goToNext() {
  const seek = getSeek();
  if (!seek) return;
  const current = getCurrentTime();
  const duration = getDuration();
  const marks = getMarks();
  const activeId = useVideoMarksStore.getState().activeAssetId;
  if (marks.length === 0) {
    seek(duration - STEP_FRAME, { holdUntilCursorNear: true });
    if (activeId) useVideoMarksStore.getState().setSelected(activeId, SELECT_LAST_FRAME);
    return;
  }
  const nextMarks = marks.filter((m) => m > current + 0.05);
  if (nextMarks.length > 0) {
    const target = nextMarks[0];
    seek(target, { holdUntilCursorNear: true });
    if (activeId) useVideoMarksStore.getState().setSelected(activeId, target);
  } else {
    seek(duration - STEP_FRAME, { holdUntilCursorNear: true });
    if (activeId) useVideoMarksStore.getState().setSelected(activeId, SELECT_LAST_FRAME);
  }
}

function stepRelative(delta: number) {
  const seek = getSeek();
  if (!seek) return;
  seek(getCurrentTime() + delta);
}

function uploadHoveredFrame() {
  const state = useVideoMarksStore.getState();
  const id = state.activeAssetId;
  if (!id) return;
  const fn = state.extractFrameFn[id];
  if (!fn) return;
  void fn(getCurrentTime());
}

function uploadLastFrame() {
  const state = useVideoMarksStore.getState();
  const id = state.activeAssetId;
  if (!id) return;
  const fn = state.extractLastFrameFn[id];
  if (!fn) return;
  void fn();
}

const isHoveringVideo = () => getActiveId() !== null;

const SCRUBBER_ACTIONS: ActionDefinition[] = [
  {
    id: 'media-card.video-scrub.prev-mark',
    featureId: FEATURE_ID,
    title: 'Previous mark / start',
    description: 'Jump to previous mark, or start of video if none',
    shortcut: 'Home',
    execute: () => goToPrev(),
    enabled: isHoveringVideo,
  },
  {
    id: 'media-card.video-scrub.next-mark',
    featureId: FEATURE_ID,
    title: 'Next mark / end',
    description: 'Jump to next mark, or last frame of video if none',
    shortcut: 'End',
    execute: () => goToNext(),
    enabled: isHoveringVideo,
  },
  {
    id: 'media-card.video-scrub.step-back',
    featureId: FEATURE_ID,
    title: 'Step back',
    description: 'Step backward by a small amount',
    shortcut: 'ArrowLeft',
    execute: () => stepRelative(-STEP_COARSE),
    enabled: isHoveringVideo,
  },
  {
    id: 'media-card.video-scrub.step-forward',
    featureId: FEATURE_ID,
    title: 'Step forward',
    description: 'Step forward by a small amount',
    shortcut: 'ArrowRight',
    execute: () => stepRelative(STEP_COARSE),
    enabled: isHoveringVideo,
  },
  {
    id: 'media-card.video-scrub.step-back-frame',
    featureId: FEATURE_ID,
    title: 'Step back one frame',
    description: 'Precise single-frame step backward',
    shortcut: 'Ctrl+ArrowLeft',
    execute: () => stepRelative(-STEP_FRAME),
    enabled: isHoveringVideo,
  },
  {
    id: 'media-card.video-scrub.step-forward-frame',
    featureId: FEATURE_ID,
    title: 'Step forward one frame',
    description: 'Precise single-frame step forward',
    shortcut: 'Ctrl+ArrowRight',
    execute: () => stepRelative(STEP_FRAME),
    enabled: isHoveringVideo,
  },
  {
    id: 'media-card.video-scrub.upload-hovered-frame',
    featureId: FEATURE_ID,
    title: 'Upload hovered frame',
    description: 'Extract and upload the frame at the current scrub position',
    shortcut: 'U',
    execute: () => uploadHoveredFrame(),
    enabled: isHoveringVideo,
  },
  {
    id: 'media-card.video-scrub.upload-last-frame',
    featureId: FEATURE_ID,
    title: 'Upload last frame',
    description: 'Extract and upload the video’s last frame',
    shortcut: 'Shift+U',
    execute: () => uploadLastFrame(),
    enabled: isHoveringVideo,
  },
  {
    id: 'media-card.video-scrub.show-shortcuts',
    featureId: FEATURE_ID,
    title: 'Show scrubber shortcuts',
    description: 'Toast the current keyboard shortcuts for the hovered video card',
    shortcut: '?',
    execute: () => showShortcutsToast(),
    enabled: isHoveringVideo,
  },
];

function showShortcutsToast() {
  const lines = SCRUBBER_ACTIONS
    .filter((a) => a.id !== 'media-card.video-scrub.show-shortcuts')
    .map((a) => `${a.shortcut?.padEnd(18) ?? ''} ${a.title}`)
    .join('\n');
  useToastStore.getState().addToast({
    type: 'info',
    message: lines,
    title: 'Video scrubber shortcuts',
    duration: 6000,
  });
}

let registered = false;

export function registerScrubberCapabilityActions(): void {
  if (registered) return;
  registerFeature({
    id: FEATURE_ID,
    name: 'Video Scrubber',
    description: 'Hover-only keyboard shortcuts for video card scrubbing, mark navigation, and frame upload.',
    icon: 'film',
    category: 'utility',
  });
  for (const action of SCRUBBER_ACTIONS) {
    registerAction(toActionCapability(action));
  }
  registered = true;
}

export function unregisterScrubberCapabilityActions(): void {
  if (!registered) return;
  for (const action of SCRUBBER_ACTIONS) {
    unregisterAction(action.id);
  }
  unregisterFeature(FEATURE_ID);
  registered = false;
}
