/**
 * Dynamic Settings Panel
 *
 * Renders a settings category using its schema definition.
 * Supports both tabbed and non-tabbed layouts.
 */

import { useState, useEffect, useMemo } from 'react';
import { settingsSchemaRegistry } from '../../lib/core';
import { SettingFieldRenderer } from './SettingFieldRenderer';
import type { SettingGroup, SettingTab } from './types';

interface DynamicSettingsPanelProps {
  categoryId: string;
  /** Optional: Show only this specific tab (no tab navigation) */
  tabId?: string;
}

function SettingGroupRenderer({
  group,
  useStore,
}: {
  group: SettingGroup;
  useStore: () => { get: (id: string) => any; set: (id: string, value: any) => void; getAll: () => Record<string, any> };
}) {
  const store = useStore();
  const allValues = store.getAll();

  return (
    <div className="space-y-3">
      {group.title && (
        <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          {group.title}
        </div>
      )}
      {group.description && (
        <p className="text-[11px] text-neutral-600 dark:text-neutral-400">
          {group.description}
        </p>
      )}
      <div className="space-y-3 border border-neutral-200 dark:border-neutral-800 rounded-md p-3 bg-neutral-50/60 dark:bg-neutral-900/40">
        {group.fields.map((field) => (
          <SettingFieldRenderer
            key={field.id}
            field={field}
            value={store.get(field.id)}
            onChange={(value) => store.set(field.id, value)}
            allValues={allValues}
          />
        ))}
      </div>
    </div>
  );
}

function TabContent({
  tab,
  useStore,
}: {
  tab: SettingTab;
  useStore: () => { get: (id: string) => any; set: (id: string, value: any) => void; getAll: () => Record<string, any> };
}) {
  return (
    <div className="space-y-4">
      {tab.groups.map((group) => (
        <SettingGroupRenderer key={group.id} group={group} useStore={useStore} />
      ))}
      {tab.footer && (
        <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
          {tab.footer}
        </div>
      )}
    </div>
  );
}

export function DynamicSettingsPanel({ categoryId, tabId }: DynamicSettingsPanelProps) {
  const [, forceUpdate] = useState(0);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  // Subscribe to registry changes
  useEffect(() => {
    return settingsSchemaRegistry.subscribe(() => forceUpdate((n) => n + 1));
  }, []);

  const category = settingsSchemaRegistry.getCategory(categoryId);

  // Get tabs as array
  const tabs = useMemo(() => {
    if (!category) return [];
    return Array.from(category.tabs.values());
  }, [category]);

  // Set initial active tab (use provided tabId or first tab)
  useEffect(() => {
    if (tabs.length > 0 && !activeTabId) {
      setActiveTabId(tabId || tabs[0].id);
    }
  }, [tabs, activeTabId, tabId]);

  if (!category) {
    return (
      <div className="p-4 text-neutral-500">
        Settings category "{categoryId}" not found.
      </div>
    );
  }

  const hasTabs = tabs.length > 0;
  const activeTab = tabs.find((t) => t.id === (tabId || activeTabId)) ?? tabs[0];

  // If specific tabId provided, show only that tab's content (no navigation)
  if (tabId && activeTab) {
    return (
      <div className="text-xs text-neutral-800 dark:text-neutral-100 space-y-4">
        <TabContent tab={activeTab} useStore={category.useStore} />
      </div>
    );
  }

  // Tabbed layout (show all tabs with navigation)
  if (hasTabs) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden text-xs text-neutral-800 dark:text-neutral-100">
        {/* Tab bar */}
        <div className="flex-shrink-0 flex gap-1 p-2 border-b border-neutral-200 dark:border-neutral-800">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              className={`px-3 py-1.5 text-[11px] font-medium rounded-md transition-colors flex items-center gap-1.5 ${
                activeTabId === tab.id
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                  : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
              }`}
            >
              {tab.icon && <span>{tab.icon}</span>}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-auto p-4">
          {activeTab && <TabContent tab={activeTab} useStore={category.useStore} />}
        </div>
      </div>
    );
  }

  // Non-tabbed layout (direct groups)
  return (
    <div className="flex-1 overflow-auto p-4 text-xs text-neutral-800 dark:text-neutral-100 space-y-6">
      {category.groups.map((group) => (
        <SettingGroupRenderer key={group.id} group={group} useStore={category.useStore} />
      ))}
    </div>
  );
}
