import { LogViewerPanel } from '@features/panels/components/dev/LogViewerPanel';

import { definePanel } from '../../../lib/definePanel';


export default definePanel({
  id: 'log-viewer',
  title: 'Log Viewer',
  component: LogViewerPanel,
  category: 'dev',
  browsable: true,
  tags: ['logs', 'trace', 'debug', 'worker', 'pipeline', 'jobs', 'requests', 'errors'],
  icon: 'fileText',
  description: 'Query and inspect structured backend logs, trace jobs and requests',
  updatedAt: '2026-03-10T00:00:00Z',
  changeNote: 'Added canonical metadata baseline for structured log inspection tool.',
  featureHighlights: ['Trace and request-level backend log exploration UI.'],
  navigation: {
    openPreference: 'float-preferred',
  },
  supportsCompactMode: false,
  supportsMultipleInstances: false,
  devTool: { category: 'debug', safeForNonDev: true },
});
