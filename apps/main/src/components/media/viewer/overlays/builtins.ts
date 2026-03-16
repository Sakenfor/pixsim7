import { AnnotationOverlayMain } from './builtins/annotationOverlay';
import { CaptureOverlayMain } from './builtins/captureOverlay';
import { MaskOverlayMain } from './builtins/maskOverlay';
import { PoseBoardOverlayMain } from './builtins/poseOverlay';
import { PromptToolsOverlayMain, PromptToolsOverlaySidebar } from './builtins/promptToolsOverlay';
import { registerMediaOverlay } from './registry';

registerMediaOverlay({
  id: 'annotate',
  label: 'Annotate',
  description: 'Draw labeled regions on the current asset.',
  icon: 'pencil',
  shortcut: 'A',
  priority: 10,
  tone: 'green',
  Main: AnnotationOverlayMain,
});

registerMediaOverlay({
  id: 'pose',
  label: 'Pose',
  description: 'Compose mannequin poses and snapshot references.',
  icon: 'user',
  shortcut: 'M',
  priority: 20,
  tone: 'purple',
  Main: PoseBoardOverlayMain,
});

registerMediaOverlay({
  id: 'mask',
  label: 'Mask',
  description: 'Draw an inpainting mask on the current image.',
  icon: 'paintbrush',
  shortcut: 'I',
  priority: 25,
  tone: 'blue',
  isAvailable: (asset) => asset.type === 'image',
  Main: MaskOverlayMain,
});

registerMediaOverlay({
  id: 'prompt-tools',
  label: 'Prompt Tools',
  description: 'Run prompt editing tools on the current media context.',
  icon: 'wand',
  shortcut: 'T',
  priority: 27,
  tone: 'amber',
  isAvailable: (asset) => asset.type === 'image',
  Main: PromptToolsOverlayMain,
  Sidebar: PromptToolsOverlaySidebar,
});

registerMediaOverlay({
  id: 'capture',
  label: 'Capture',
  description: 'Select a region and capture a frame.',
  icon: 'camera',
  shortcut: 'C',
  priority: 30,
  tone: 'amber',
  isAvailable: (asset) => asset.type === 'video' || asset.type === 'image',
  Main: CaptureOverlayMain,
});
