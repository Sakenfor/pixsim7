import { TestOverviewPanel } from '@features/panels/components/dev/TestOverviewPanel';

import { definePanel } from '../../../lib/definePanel';


export default definePanel({
  id: 'test-overview',
  title: 'Test Overview',
  component: TestOverviewPanel,
  category: 'dev',
  browsable: true,
  tags: ['tests', 'quality', 'profiles', 'pytest', 'vitest'],
  icon: 'flask',
  description: 'View test runner profiles, suite coverage, and local run snapshots.',
  updatedAt: '2026-03-10T00:00:00Z',
  changeNote: 'Added canonical metadata baseline for local test overview tool.',
  featureHighlights: ['Test profile and suite coverage snapshots in one place.'],
  navigation: {
    openPreference: 'float-preferred',
  },
  supportsCompactMode: false,
  supportsMultipleInstances: false,
  devTool: { category: 'debug', safeForNonDev: true },
});
