import { mediaOverlayRegistry } from './registry';
import {
  AnnotationOverlayMain,
  AnnotationOverlayToolbar,
  AnnotationOverlaySidebar,
} from './builtins/annotationOverlay';
import { PoseBoardOverlayMain } from './builtins/poseOverlay';

mediaOverlayRegistry.register({
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

mediaOverlayRegistry.register({
  id: 'pose',
  label: 'Pose',
  description: 'Compose mannequin poses and snapshot references.',
  shortcut: 'M',
  priority: 20,
  tone: 'purple',
  Main: PoseBoardOverlayMain,
});
