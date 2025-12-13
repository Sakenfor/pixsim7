/**
 * Settings Panel
 *
 * Dynamic tabbed settings panel that loads modules from the settings registry.
 * Modules register themselves and provide their own UI components.
 */
import { useState, useEffect, Suspense } from 'react';
import { settingsRegistry, type SettingsModule } from '@features/settings';

// Import modules to trigger registration
import './modules';

function SettingsTabButton({
  module,
  isActive,
  onClick,
}: {
  module: SettingsModule;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1.5 ${
        isActive
          ? 'bg-blue-500 text-white'
          : 'bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600'
      }`}
    >
      {module.icon && <span className="text-sm">{module.icon}</span>}
      {module.label}
    </button>
  );
}

function SettingsTabContent({ module }: { module: SettingsModule }) {
  const Component = module.component;
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <Component />
    </Suspense>
  );
}

export function SettingsPanel() {
  const [modules, setModules] = useState<SettingsModule[]>(() => settingsRegistry.getAll());
  const [activeTabId, setActiveTabId] = useState<string>(() => {
    const all = settingsRegistry.getAll();
    return all.length > 0 ? all[0].id : '';
  });

  // Subscribe to registry changes
  useEffect(() => {
    const unsubscribe = settingsRegistry.subscribe(() => {
      const updated = settingsRegistry.getAll();
      setModules(updated);
      // If active tab was removed, switch to first available
      if (!updated.find(m => m.id === activeTabId) && updated.length > 0) {
        setActiveTabId(updated[0].id);
      }
    });
    return unsubscribe;
  }, [activeTabId]);

  const activeModule = modules.find(m => m.id === activeTabId);

  return (
    <div className="h-full w-full flex flex-col bg-white dark:bg-neutral-900">
      {/* Header */}
      <div className="border-b border-neutral-200 dark:border-neutral-800 px-4 py-3">
        <div className="mb-3">
          <h1 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
            Settings
          </h1>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Configure global behavior for cubes, panels, and providers.
          </p>
        </div>

        {/* Dynamic Tabs */}
        <div className="flex gap-2 flex-wrap">
          {modules.map(module => (
            <SettingsTabButton
              key={module.id}
              module={module}
              isActive={activeTabId === module.id}
              onClick={() => setActiveTabId(module.id)}
            />
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {activeModule ? (
        <SettingsTabContent module={activeModule} />
      ) : (
        <div className="flex-1 flex items-center justify-center text-neutral-500 dark:text-neutral-400 text-sm">
          No settings modules registered
        </div>
      )}
    </div>
  );
}
