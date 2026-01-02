import { definePanel } from '../../../lib/definePanel';
import { ShortcutsModule } from '@features/controlCenter/components/ShortcutsModule';

export default definePanel({
  id: 'shortcuts',
  title: 'Shortcuts',
  component: ShortcutsModule,
  category: 'utilities',
  tags: ['navigation', 'shortcuts', 'quick', 'links'],
  icon: 'zap',
  description: 'Quick navigation shortcuts to common areas',
  availableIn: ['workspace', 'control-center'],
  supportsCompactMode: true,
  supportsMultipleInstances: false,
});
