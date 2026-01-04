/**
 * Settings Panel
 *
 * Sidebar-based settings panel with expandable sub-sections.
 * Modules register themselves and provide their own UI components.
 */
import { useState, useEffect, Suspense, type ReactNode } from 'react';
import { settingsRegistry, type SettingsModule } from '@features/settings';
import { useSettingsUiStore } from '../stores/settingsUiStore';

// Import modules to trigger registration
import './modules';

/** Chevron icon for expand/collapse */
function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

/** Sidebar item for a settings module */
function SidebarModuleItem({
  module,
  isActive,
  isExpanded,
  activeSubSectionId,
  onSelect,
  onToggleExpand,
  onSelectSubSection,
}: {
  module: SettingsModule;
  isActive: boolean;
  isExpanded: boolean;
  activeSubSectionId: string | null;
  onSelect: () => void;
  onToggleExpand: () => void;
  onSelectSubSection: (subId: string) => void;
}) {
  const hasSubSections = module.subSections && module.subSections.length > 0;

  return (
    <div className="select-none">
      {/* Main module item */}
      <button
        onClick={() => {
          if (hasSubSections) {
            onToggleExpand();
          }
          onSelect();
        }}
        className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs rounded-md transition-colors ${
          isActive && !activeSubSectionId
            ? 'bg-blue-500 text-white'
            : isActive
            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
            : 'hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300'
        }`}
      >
        {hasSubSections && (
          <span
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand();
            }}
            className="p-0.5 -ml-1 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded"
          >
            <ChevronIcon expanded={isExpanded} />
          </span>
        )}
        {module.icon && <span className="text-sm flex-shrink-0">{module.icon}</span>}
        <span className="font-medium truncate">{module.label}</span>
      </button>

      {/* Sub-sections */}
      {hasSubSections && isExpanded && (
        <div className="ml-4 mt-0.5 space-y-0.5 border-l border-neutral-200 dark:border-neutral-700">
          {module.subSections!.map((sub) => (
            <button
              key={sub.id}
              onClick={() => onSelectSubSection(sub.id)}
              className={`w-full flex items-center gap-2 pl-3 pr-2 py-1.5 text-left text-[11px] rounded-r-md transition-colors ${
                isActive && activeSubSectionId === sub.id
                  ? 'bg-blue-500 text-white'
                  : 'hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
              }`}
            >
              {sub.icon && <span className="text-xs flex-shrink-0">{sub.icon}</span>}
              <span className="truncate">{sub.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

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
          {icon && <span className="text-lg">{icon}</span>}
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

  return (
    <div className="h-full w-full flex bg-white dark:bg-neutral-900">
      {/* Sidebar */}
      <div className="w-48 flex-shrink-0 border-r border-neutral-200 dark:border-neutral-800 flex flex-col">
        {/* Sidebar header */}
        <div className="flex-shrink-0 px-3 py-3 border-b border-neutral-200 dark:border-neutral-800">
          <h1 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
            Settings
          </h1>
        </div>

        {/* Sidebar navigation */}
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {modules.map((module) => (
            <SidebarModuleItem
              key={module.id}
              module={module}
              isActive={activeTabId === module.id}
              isExpanded={expandedModules.has(module.id)}
              activeSubSectionId={activeTabId === module.id ? activeSubSection : null}
              onSelect={() => handleSelectModule(module.id)}
              onToggleExpand={() => handleToggleExpand(module.id)}
              onSelectSubSection={(subId) => handleSelectSubSection(module.id, subId)}
            />
          ))}
        </div>
      </div>

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
