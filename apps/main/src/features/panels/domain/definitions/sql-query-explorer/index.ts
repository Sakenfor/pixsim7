import { SqlQueryExplorerPanel } from '@features/panels/components/dev/SqlQueryExplorerPanel';

import { definePanel } from '../../../lib/definePanel';


export default definePanel({
  id: 'sql-query-explorer',
  title: 'SQL Query Explorer',
  component: SqlQueryExplorerPanel,
  category: 'dev',
  browsable: true,
  tags: ['sql', 'database', 'diagnostics', 'query', 'admin'],
  icon: 'database',
  description: 'Run read-only SQL queries for diagnostics and data exploration',
  updatedAt: '2026-03-10T00:00:00Z',
  changeNote: 'Added canonical metadata baseline for SQL diagnostics panel.',
  featureHighlights: ['Read-only SQL exploration for operational diagnostics.'],
  navigation: {
    openPreference: 'float-preferred',
  },
  supportsCompactMode: false,
  supportsMultipleInstances: false,
  devTool: { category: 'debug', safeForNonDev: true },
});
