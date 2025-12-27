import { definePanel } from '../../lib/definePanel';
import { PanelLauncherModule } from '@features/controlCenter/components/PanelLauncherModule';

export default definePanel({
  id: 'panel-browser',
  title: 'Panel Browser',
  component: PanelLauncherModule,
  category: 'utilities',
  tags: ['panels', 'launcher', 'browser', 'utilities'],
  icon: 'layoutGrid',
  description: 'Browse all available panels and launch them docked or floating',
  availableIn: ['workspace', 'control-center'],
  supportsCompactMode: false,
  supportsMultipleInstances: false,
});
