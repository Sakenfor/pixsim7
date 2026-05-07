/**
 * Testing · Diagnostics — dockable workspace panel.
 *
 * Panel surface for the same admin-only diagnostic test runner that lives
 * at /dev/testing/diagnostics.  Component reuses ``DiagnosticsView`` from
 * the route, so the route page and the dock panel share one source of
 * truth.
 *
 * Auto-discovered via the panel registry (any ``definitions/<id>/index.ts``
 * default export is picked up at startup).  Category ``dev`` opts it into
 * the Dev Tools catalog as a side benefit of being a dev panel — set
 * ``devTool: false`` if that becomes unwanted.
 */
import { definePanel } from '../../../lib/definePanel';

import { TestingDiagnosticsPanel } from './TestingDiagnosticsPanel';


export default definePanel({
  id: 'testing-diagnostics',
  title: 'Diagnostics',
  component: TestingDiagnosticsPanel,
  category: 'dev',
  browsable: true,
  tags: ['diagnostics', 'testing', 'admin', 'observability'],
  icon: 'flask',
  description: 'Run admin-only diagnostic tests with a live event stream alongside other workspace panels.',
  updatedAt: '2026-05-07T00:00:00Z',
  changeNote: 'Initial dockable panel mirroring /dev/testing/diagnostics — same component, two surfaces.',
  featureHighlights: [
    'Run server-side diagnostics inline alongside generation / asset / prompt panels.',
    'Live phase strip, observations table, key transitions, summary — same shape as the Rich --pretty CLI.',
  ],
  navigation: {
    openPreference: 'float-preferred',
  },
  supportsCompactMode: false,
  supportsMultipleInstances: false,
  devTool: { category: 'debug' },
});
