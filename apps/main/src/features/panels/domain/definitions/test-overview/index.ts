import { TestOverviewPanel } from '@features/panels/components/dev/TestOverviewPanel';

import { definePanel } from '../../../lib/definePanel';


export default definePanel({
  id: 'test-overview',
  title: 'Test Overview',
  component: TestOverviewPanel,
  category: 'dev',
  browsable: true,
  tags: ['tests', 'quality', 'profiles', 'pytest', 'vitest', 'diagnostics'],
  icon: 'flask',
  description: 'Test runner profiles, suite coverage, run history, and (admin) the live diagnostic runner.',
  updatedAt: '2026-05-22T00:00:00Z',
  changeNote: 'Folded the standalone Diagnostics panel in as an admin-only section — one Testing surface instead of two.',
  featureHighlights: [
    'Test profile and suite coverage snapshots in one place.',
    'Admin: run server-side diagnostics with a live event stream, alongside the automated-suite catalog.',
  ],
  navigation: {
    openPreference: 'float-preferred',
  },
  supportsCompactMode: false,
  supportsMultipleInstances: false,
  devTool: { category: 'debug', safeForNonDev: true },
});
