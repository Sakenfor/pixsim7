/**
 * Asset Maintenance panel
 *
 * Standalone, dock-able view of the asset maintenance dashboard. Renders the
 * same `MaintenanceDashboard` component used inside Settings → Maintenance,
 * so any new row (signal scan, duplicates, etc.) appears in both surfaces
 * without duplication. The panel exists because the settings frame makes the
 * dashboard hard to keep visible while operating on assets.
 */

import { MaintenanceDashboard } from '@features/settings/components/shared/MaintenanceDashboard';

import { definePanel } from '../../../lib/definePanel';

function AssetMaintenancePanel() {
  return (
    <div className="h-full overflow-auto">
      <MaintenanceDashboard />
    </div>
  );
}

export default definePanel({
  id: 'asset-maintenance',
  title: 'Asset Maintenance',
  component: AssetMaintenancePanel,
  category: 'dev',
  icon: 'wrench',
  description: 'Hash coverage, storage sync, signal scan, duplicates, and other asset maintenance tools.',
  tags: ['maintenance', 'assets', 'admin', 'backfill', 'signal-scan', 'duplicates'],
  devTool: { category: 'debug' },
  navigation: {
    openPreference: 'float-preferred',
  },
  supportsCompactMode: false,
  supportsMultipleInstances: false,
});
