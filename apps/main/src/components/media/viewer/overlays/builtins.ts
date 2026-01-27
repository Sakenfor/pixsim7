import {
  AnnotationOverlayMain,
  AnnotationOverlayToolbar,
  AnnotationOverlaySidebar,
} from './builtins/annotationOverlay';
import { CaptureOverlayMain, CaptureOverlayToolbar } from './builtins/captureOverlay';
import { PoseBoardOverlayMain } from './builtins/poseOverlay';
import { registerMediaOverlay } from './registry';

registerMediaOverlay({
  id: 'annotate',
  label: 'Annotate',
  description: 'Draw labeled regions on the current asset.',
  shortcut: 'A',
  priority: 10,
  tone: 'green',
  Main: AnnotationOverlayMain,
  Toolbar: AnnotationOverlayToolbar,
  Sidebar: AnnotationOverlaySidebar,
});

registerMediaOverlay({
  id: 'pose',
  label: 'Pose',
  description: 'Compose mannequin poses and snapshot references.',
  shortcut: 'M',
  priority: 20,
  tone: 'purple',
  Main: PoseBoardOverlayMain,
});

registerMediaOverlay({
  id: 'capture',
  label: 'Capture',
  description: 'Select a region and capture a frame.',
  shortcut: 'C',
  priority: 30,
  tone: 'amber',
  isAvailable: (asset) => asset.type === 'video' || asset.type === 'image',
  Main: CaptureOverlayMain,
  Toolbar: CaptureOverlayToolbar,
});
