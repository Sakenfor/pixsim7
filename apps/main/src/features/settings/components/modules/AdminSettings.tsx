/* eslint-disable react-refresh/only-export-components */
/**
 * Admin Settings Module
 *
 * Dynamically collects all groups marked `adminGroup: true` from every
 * settings category and renders them as sub-sections in the sidebar.
 * Groups keep their original store adapters so reads/writes go to the
 * correct backing store.
 *
 * Also hosts the Access (user permissions) management sub-section.
 */
import { useState, useEffect, type ComponentType, type ReactNode } from 'react';

import { settingsRegistry, type SettingsSubSection } from '../../lib/core/registry';
import { settingsSchemaRegistry } from '../../lib/core/settingsSchemaRegistry';
import { SettingGroupRenderer } from '../shared/DynamicSettingsPanel';

import { AccessSettings } from './AccessSettings';

/** Renders all admin groups from a single source category (no heading — sidebar has the label) */
function AdminSourceSection({ sourceLabel }: { sourceLabel: string }) {
  const [revision, setRevision] = useState(0);
  useEffect(() => settingsSchemaRegistry.subscribe(() => setRevision((n) => n + 1)), []);
  void revision;

  const entries = settingsSchemaRegistry
    .getAdminGroups()
    .filter((e) => e.sourceLabel === sourceLabel);

  if (entries.length === 0) return null;

  return (
    <div className="flex-1 overflow-auto p-4 text-xs text-neutral-800 dark:text-neutral-100 space-y-4">
      {entries.map((entry) => (
        <SettingGroupRenderer
          key={entry.group.id}
          group={entry.group}
          useStore={entry.useStore}
        />
      ))}
    </div>
  );
}

/** Overview page showing all admin groups (used when clicking the parent "Admin" item) */
function AdminOverview() {
  const [revision, setRevision] = useState(0);
  useEffect(() => settingsSchemaRegistry.subscribe(() => setRevision((n) => n + 1)), []);
  void revision;

  const adminGroups = settingsSchemaRegistry.getAdminGroups();
  const bySource = new Map<string, typeof adminGroups>();
  for (const entry of adminGroups) {
    const list = bySource.get(entry.sourceLabel) ?? [];
    list.push(entry);
    bySource.set(entry.sourceLabel, list);
  }
  const sections = Array.from(bySource.entries());

  return (
    <div className="flex-1 overflow-auto p-4 text-xs text-neutral-800 dark:text-neutral-100 space-y-6">
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
      <div className="space-y-4">
        <div className="text-[10px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
          Access
        </div>
        <AccessSettings />
      </div>
    </div>
  );
}

/** Build sub-sections dynamically from admin groups */
function buildAdminSubSections(): SettingsSubSection[] {
  const adminGroups = settingsSchemaRegistry.getAdminGroups();

  // Collect unique source labels with their icons
  const sources = new Map<string, ReactNode>();
  for (const entry of adminGroups) {
    if (!sources.has(entry.sourceLabel)) {
      sources.set(entry.sourceLabel, entry.sourceIcon);
    }
  }

  const subSections: SettingsSubSection[] = [];

  for (const [sourceLabel, sourceIcon] of sources) {
    const SectionComponent: ComponentType = () => (
      <AdminSourceSection sourceLabel={sourceLabel} />
    );
    SectionComponent.displayName = `Admin_${sourceLabel}`;

    subSections.push({
      id: `admin-${sourceLabel.toLowerCase().replace(/\s+/g, '-')}`,
      label: sourceLabel,
      icon: sourceIcon,
      component: SectionComponent,
    });
  }

  // Always add Access as last sub-section
  subSections.push({
    id: 'admin-access',
    label: 'Access',
    icon: '👤',
    component: AccessSettings,
  });

  return subSections;
}

function registerAdminModule() {
  const subSections = buildAdminSubSections();
  settingsRegistry.register({
    id: 'admin',
    label: 'Admin',
    icon: '🔒',
    component: AdminOverview,
    order: 99,
    subSections,
  });
}

// Initial registration
registerAdminModule();

// Re-register when schema changes add new admin groups
settingsSchemaRegistry.subscribe(() => {
  registerAdminModule();
});
