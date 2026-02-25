/**
 * Settings Panel
 *
 * Sidebar-based settings panel with expandable sub-sections.
 * Modules register themselves and provide their own UI components.
 */
import { HierarchicalSidebarNav, SidebarPaneShell } from '@pixsim7/shared.ui';
import { useState, useEffect, Suspense, type ReactNode } from 'react';

import { Icon } from '@lib/icons';

import { settingsRegistry, type SettingsModule } from '@features/settings';

import { useSettingsUiStore } from '../stores/settingsUiStore';

// Import modules to trigger registration
import './modules';

/** Loading spinner for suspense fallback */
function LoadingSpinner() {
  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

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
      <Suspense fallback={<LoadingSpinner />}>
        <Component />
      </Suspense>
    </div>
  );
}

export function SettingsPanel() {
  const [modules, setModules] = useState<SettingsModule[]>(() => settingsRegistry.getAll());
  const activeTabId = useSettingsUiStore((state) => state.activeTabId);
  const setActiveTabId = useSettingsUiStore((state) => state.setActiveTabId);

  // Track expanded modules and active sub-sections
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [activeSubSection, setActiveSubSection] = useState<string | null>(null);

  // Subscribe to registry changes
  useEffect(() => {
    const unsubscribe = settingsRegistry.subscribe(() => {
      const updated = settingsRegistry.getAll();
      setModules(updated);
      // If active tab was removed, switch to first available
      if (!updated.find((m) => m.id === activeTabId) && updated.length > 0) {
        setActiveTabId(updated[0].id);
        setActiveSubSection(null);
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

  // Auto-expand module when selected (if it has sub-sections)
  useEffect(() => {
    if (activeTabId) {
      const module = modules.find((m) => m.id === activeTabId);
      if (module?.subSections?.length) {
        setExpandedModules((prev) => new Set([...prev, activeTabId]));
      }
    }
  }, [activeTabId, modules]);

  const handleSelectModule = (moduleId: string) => {
    setActiveTabId(moduleId);
    setActiveSubSection(null);
  };

  const handleToggleExpand = (moduleId: string) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) {
        next.delete(moduleId);
      } else {
        next.add(moduleId);
      }
      return next;
    });
  };

  const handleSelectSubSection = (moduleId: string, subSectionId: string) => {
    setActiveTabId(moduleId);
    setActiveSubSection(subSectionId);
  };

  const activeModule = modules.find((m) => m.id === activeTabId);
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

  return (
    <div className="h-full w-full flex bg-white dark:bg-neutral-900">
      <SidebarPaneShell title="Settings" variant="light" widthClassName="w-48">
        <HierarchicalSidebarNav
          className="space-y-0.5"
          items={navItems}
          expandedItemIds={expandedModules}
          onSelectItem={handleSelectModule}
          onToggleExpand={handleToggleExpand}
          onSelectChild={handleSelectSubSection}
          getItemState={(item) => {
            if (activeTabId !== item.id) return 'inactive';
            return activeSubSection ? 'ancestor' : 'active';
          }}
          getChildState={(item, child) =>
            activeTabId === item.id && activeSubSection === child.id ? 'active' : 'inactive'
          }
        />
      </SidebarPaneShell>

      {/* Content area */}
      {activeModule ? (
        <SettingsContent module={activeModule} subSectionId={activeSubSection} />
      ) : (
        <div className="flex-1 flex items-center justify-center text-neutral-500 dark:text-neutral-400 text-sm">
          No settings modules registered
        </div>
      )}
    </div>
  );
}
