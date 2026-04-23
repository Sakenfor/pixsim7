/**
 * Dynamic Settings Panel
 *
 * Renders a settings category using its schema definition.
 * Supports both tabbed and non-tabbed layouts.
 */

import { useState, useEffect } from 'react';

import { isAdminUser } from '@lib/auth/userRoles';
import { Icon } from '@lib/icons';

import { useAuthStore } from '@/stores/authStore';

import { settingsSchemaRegistry } from '../../lib/core';
import type { SettingGroup, SettingTab } from '../../lib/core/types';

import { SettingFieldRenderer } from './SettingFieldRenderer';

interface DynamicSettingsPanelProps {
  categoryId: string;
  /** Optional: Show only this specific tab (no tab navigation) */
  tabId?: string;
}

type PanelStore = {
  get: (id: string) => unknown;
  set: (id: string, value: unknown) => void;
  getAll: () => Record<string, unknown>;
};

export function SettingGroupRenderer({
  group,
  store: storeProp,
  useStore: useStoreProp,
}: {
  group: SettingGroup;
  /** Pre-resolved store (used by TabContent / CategoryContent). */
  store?: PanelStore;
  /** Store hook — called when `store` isn't provided (used by AdminSettings). */
  useStore?: () => PanelStore;
}) {
  // Support both call patterns: direct store OR useStore hook.
  // Hook is always called (Rules of Hooks), result is only used when storeProp is absent.
  const hookStore = useStoreProp?.();
  const store = storeProp ?? hookStore;

  const user = useAuthStore((s) => s.user);
  const isAdmin = isAdminUser(user);

  if (!store) return null;

  const allValues = { ...store.getAll(), __isAdmin: !!isAdmin, __userRole: user?.role };

  if (group.showWhen && !group.showWhen(allValues)) {
    return null;
  }

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
  useStore: () => PanelStore;
}) {
  const store = useStore();

  return (
    <div className="space-y-4">
      {tab.groups.map((group) => (
        <SettingGroupRenderer key={group.id} group={group} store={store} />
      ))}
      {tab.footer && (
        <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
          {tab.footer}
        </div>
      )}
    </div>
  );
}

function CategoryContent({
  groups,
  useStore,
}: {
  groups: SettingGroup[];
  useStore: () => PanelStore;
}) {
  const store = useStore();

  return (
    <>
      {groups.map((group) => (
        <SettingGroupRenderer key={group.id} group={group} store={store} />
      ))}
    </>
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

  // NOTE: category objects are mutated in-place by settingsSchemaRegistry.
  // Recompute tabs on every render so late registrations are reflected
  // without requiring a remount (fixes "shows more tabs only on 2nd open").
  const tabs = category ? Array.from(category.tabs.values()) : [];
  const firstTabId = tabs[0]?.id ?? null;

  // Set initial active tab (use provided tabId or first tab)
  useEffect(() => {
    if (firstTabId && !activeTabId) {
      setActiveTabId(tabId || firstTabId);
    }
  }, [firstTabId, activeTabId, tabId]);

  if (!category) {
    return (
      <div className="p-4 text-neutral-500">
        Settings category "{categoryId}" not found.
      </div>
    );
  }

  const hasTabs = tabs.length > 0;
  const activeTab = tabs.find((t) => t.id === (tabId || activeTabId)) ?? tabs[0];

  // Resolve per-tab store: prefer tab-level useStore, fall back to category-level
  const resolveUseStore = (tab: SettingTab) => tab.useStore ?? category.useStore;

  // If specific tabId provided, show only that tab's content (no navigation)
  if (tabId && activeTab) {
    return (
      <div className="text-xs text-neutral-800 dark:text-neutral-100 space-y-4">
        <TabContent key={activeTab.id} tab={activeTab} useStore={resolveUseStore(activeTab)} />
      </div>
    );
  }

  // Tabbed layout (show all tabs with navigation)
  if (hasTabs) {
    return (
      <div className="flex-1 flex overflow-hidden text-xs text-neutral-800 dark:text-neutral-100">
        {/* Left sidebar - vertical tabs */}
        <div className="flex-shrink-0 w-40 border-r border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/50 flex flex-col">
          <div className="flex-1 overflow-auto py-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTabId(tab.id)}
                className={`w-full px-3 py-2 text-[11px] font-medium transition-colors flex items-center gap-2 text-left ${
                  activeTabId === tab.id
                    ? 'bg-accent-subtle text-accent border-r-2 border-accent'
                    : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                }`}
              >
                {tab.icon && <Icon name={tab.icon as string} size={14} />}
                <span className="truncate">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Right content area */}
        <div className="flex-1 overflow-auto p-4">
          {activeTab && (
            <TabContent key={activeTab.id} tab={activeTab} useStore={resolveUseStore(activeTab)} />
          )}
        </div>
      </div>
    );
  }

  // Non-tabbed layout (direct groups)
  return (
    <div className="flex-1 overflow-auto p-4 text-xs text-neutral-800 dark:text-neutral-100 space-y-6">
      <CategoryContent groups={category.groups} useStore={category.useStore} />
    </div>
  );
}
