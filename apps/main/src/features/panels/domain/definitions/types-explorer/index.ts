import { TypesExplorerPanel } from '@features/panels/components/dev/TypesExplorerPanel';

import { definePanel } from '../../../lib/definePanel';


export default definePanel({
  id: 'types-explorer',
  title: 'Types Explorer',
  component: TypesExplorerPanel,
  category: 'dev',
  browsable: true,
  tags: ['types', 'openapi', 'schema', 'generated', 'composition', 'roles', 'labels'],
  icon: 'fileCode',
  description: 'Browse generated types: composition roles, region labels, OpenAPI',
  updatedAt: '2026-03-10T00:00:00Z',
  changeNote: 'Added canonical metadata baseline for generated-type explorer.',
  featureHighlights: ['One-stop browsing for generated OpenAPI and composition-role types.'],
  navigation: {
    openPreference: 'float-preferred',
  },
  supportsCompactMode: false,
  supportsMultipleInstances: false,
  devTool: { category: 'debug', safeForNonDev: true },
});
