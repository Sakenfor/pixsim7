/**
 * Admin Settings Module
 *
 * Dynamically collects all groups marked `adminGroup: true` from every
 * settings category and renders them in a single unified panel.
 * Groups keep their original store adapters so reads/writes go to the
 * correct backing store.
 *
 * Also hosts the Access (user permissions) management section which was
 * previously a standalone settings module.
 */
import { useState, useEffect } from 'react';

import { settingsSchemaRegistry } from '../../lib/core/settingsSchemaRegistry';
import { settingsRegistry } from '../../lib/core/registry';
import { SettingGroupRenderer } from '../shared/DynamicSettingsPanel';
import { AccessSettings } from './AccessSettings';

function AdminSettings() {
  const [revision, setRevision] = useState(0);

  // Re-render when registry changes (new categories/groups registered)
  useEffect(() => {
    return settingsSchemaRegistry.subscribe(() => setRevision((n) => n + 1));
  }, []);

  // Collect admin groups — recomputed on registry changes via revision
  void revision;
  const adminGroups = settingsSchemaRegistry.getAdminGroups();

  // Group by source category label for visual sections
  const bySource = new Map<string, typeof adminGroups>();
  for (const entry of adminGroups) {
    const list = bySource.get(entry.sourceLabel) ?? [];
    list.push(entry);
    bySource.set(entry.sourceLabel, list);
  }
  const sections = Array.from(bySource.entries());

  return (
    <div className="flex-1 overflow-auto p-4 text-xs text-neutral-800 dark:text-neutral-100 space-y-6">
      {/* Dynamic admin groups collected from all settings categories */}
      {sections.map(([sourceLabel, entries]) => (
        <div key={sourceLabel} className="space-y-4">
          <div className="text-[10px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
            {sourceLabel}
          </div>
          {entries.map((entry) => (
            <SettingGroupRenderer
              key={entry.group.id}
              group={entry.group}
              useStore={entry.useStore}
            />
          ))}
        </div>
      ))}

      {/* Access / user permissions management */}
      <div className="space-y-4">
        <div className="text-[10px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
          Access
        </div>
        <AccessSettings />
      </div>
    </div>
  );
}

// Register in the component-based settings registry for sidebar navigation
settingsRegistry.register({
  id: 'admin',
  label: 'Admin',
  icon: '🔒',
  component: AdminSettings,
  order: 99,
});
