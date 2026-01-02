import { definePanel } from '../../../lib/definePanel';
import { SurfaceWorkbenchPanel } from '@features/panels/components/tools/SurfaceWorkbenchPanel';

export default definePanel({
  id: 'surface-workbench',
  title: 'Surface Workbench',
  component: SurfaceWorkbenchPanel,
  category: 'tools',
  tags: ['surfaces', 'hud', 'overlay', 'gizmo', 'editor'],
  icon: 'layoutGrid',
  description:
    'Inspect available surfaces (HUD, overlay, gizmo) for the active context',
  contextLabel: (ctx) =>
    ctx.scene.title
      ? `Scene: ${ctx.scene.title}`
      : ctx.world.id
        ? `World #${ctx.world.id}`
        : undefined,
  supportsCompactMode: false,
  supportsMultipleInstances: false,
});
