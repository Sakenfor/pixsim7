/**
 * Settings Panel
 *
 * Sidebar-based settings panel with expandable sub-sections.
 * Modules register themselves and provide their own UI components.
 */
import { SidebarContentLayout, useSidebarNav } from '@pixsim7/shared.ui';
import { useState, useEffect, Suspense, type ReactNode } from 'react';

import { Icon } from '@lib/icons';

import { settingsRegistry, type SettingsModule } from '@features/settings';

import { useSettingsUiStore } from '../stores/settingsUiStore';

import { SettingsLoadingState } from './shared/SettingsLoadingState';

// Import modules to trigger registration
import './modules';

/** Content area that renders the active module/sub-section */
function SettingsContent({
  module,
  subSectionId,
}: {
  module: SettingsModule;
  subSectionId: string | null;
}) {
  // Find the component to render
  let Component: React.ComponentType;
  let title: string;
  let icon: ReactNode;

  if (subSectionId && module.subSections) {
    const subSection = module.subSections.find((s) => s.id === subSectionId);
    if (subSection) {
      Component = subSection.component;
      title = subSection.label;
      icon = subSection.icon;
    } else {
      Component = module.component;
      title = module.label;
      icon = module.icon;
    }
  } else {
    Component = module.component;
    title = module.label;
    icon = module.icon;
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      {/* Content header */}
      <div className="flex-shrink-0 border-b border-neutral-200 dark:border-neutral-700 px-4 py-3">
        <div className="flex items-center gap-2">
          {icon && <Icon name={icon as string} size={18} />}
          <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
            {title}
          </h2>
        </div>
      </div>

      {/* Content body */}
      <Suspense fallback={<SettingsLoadingState fullHeight label="Loading settings panel..." />}>
        <Component />
      </Suspense>
    </div>
  );
}

export function SettingsPanel() {
  const [modules, setModules] = useState<SettingsModule[]>(() => settingsRegistry.getAll());
  const activeTabId = useSettingsUiStore((state) => state.activeTabId);
  const setActiveTabId = useSettingsUiStore((state) => state.setActiveTabId);

  // Subscribe to registry changes
  useEffect(() => {
    const unsubscribe = settingsRegistry.subscribe(() => {
      const updated = settingsRegistry.getAll();
      setModules(updated);
      // If active tab was removed, switch to first available
      if (!updated.find((m) => m.id === activeTabId) && updated.length > 0) {
        setActiveTabId(updated[0].id);
      }
    });
    return unsubscribe;
  }, [activeTabId, setActiveTabId]);

  // Set initial active tab
  useEffect(() => {
    if (!activeTabId && modules.length > 0) {
      setActiveTabId(modules[0].id);
    }
  }, [activeTabId, modules, setActiveTabId]);

  const navItems = modules.map((module) => ({
    id: module.id,
    label: module.label,
    icon: module.icon ? <Icon name={module.icon as string} size={14} className="flex-shrink-0" /> : undefined,
    children: module.subSections?.map((sub) => ({
      id: sub.id,
      label: sub.label,
      icon: sub.icon ? <Icon name={sub.icon as string} size={12} className="flex-shrink-0" /> : undefined,
    })),
  }));

  const nav = useSidebarNav({ sections: navItems, initial: activeTabId ?? undefined, storageKey: 'settings:nav' });

  // Sync external store → hook when external navigation changes
  useEffect(() => {
    if (activeTabId && activeTabId !== nav.activeSectionId) {
      nav.navigate(activeTabId);
    }
  }, [activeTabId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync hook → external store
  useEffect(() => {
    if (nav.activeSectionId && nav.activeSectionId !== activeTabId) {
      setActiveTabId(nav.activeSectionId);
    }
  }, [nav.activeSectionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeModule = modules.find((m) => m.id === nav.activeSectionId);

  return (
    <div className="h-full w-full flex bg-white dark:bg-neutral-900">
      <SidebarContentLayout
        sections={navItems}
        activeSectionId={nav.activeSectionId}
        onSelectSection={nav.selectSection}
        activeChildId={nav.activeChildId}
        onSelectChild={nav.selectChild}
        expandedSectionIds={nav.expandedSectionIds}
        onToggleExpand={nav.toggleExpand}
        sidebarTitle="Settings"
        sidebarWidth="w-48"
        variant="light"
        navClassName="space-y-0.5"
        collapsible
        expandedWidth={192}
        persistKey="settings-sidebar"
      >
        {activeModule ? (
          <SettingsContent module={activeModule} subSectionId={nav.activeChildId ?? null} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-neutral-500 dark:text-neutral-400 text-sm">
            No settings modules registered
          </div>
        )}
      </SidebarContentLayout>
    </div>
  );
}
