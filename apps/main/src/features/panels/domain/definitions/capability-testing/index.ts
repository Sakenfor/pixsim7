import { CapabilityTestingPanel } from '@features/panels/components/dev/CapabilityTestingPanel';

import { definePanel } from '../../../lib/definePanel';


export default definePanel({
  id: 'capability-testing',
  title: 'Capability Testing',
  component: CapabilityTestingPanel,
  category: 'dev',
  browsable: false,
  tags: ['capabilities', 'testing', 'validation'],
  icon: 'checkCircle',
  description: 'Test and validate system capabilities',
  updatedAt: '2026-03-10T00:00:00Z',
  changeNote: 'Added canonical metadata baseline for capability validation tool.',
  featureHighlights: ['Manual validation surface for capability registration and behavior.'],
  navigation: {
    openPreference: 'float-preferred',
  },
  supportsCompactMode: false,
  supportsMultipleInstances: false,
  devTool: { category: 'debug' },
});
