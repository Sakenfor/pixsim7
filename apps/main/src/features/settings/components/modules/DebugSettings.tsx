/**
 * Debug Settings Module
 *
 * Unified debug logging toggles stored in backend user preferences.
 * Controls both frontend (browser console) and backend (server logs) debug output.
 *
 * Also renders settings exposed by dev tools from the DevTools registry.
 *
 * NOTE: Only visible in development mode.
 */
import type { DevToolSetting, DevToolSettingSelect, DevToolSettingNumber } from '@pixsim7/shared.devtools.core';
import { useState, useEffect } from 'react';

import { getUserPreferences, updatePreferenceKey, type DebugPreferences, type DevToolsPreferences, type DevToolSettingValue } from '@lib/api/userPreferences';
import { devToolRegistry } from '@lib/dev/devtools/devToolRegistry';
import { debugFlags } from '@lib/utils/debugFlags';

import { settingsRegistry } from '../../lib/core/registry';

interface DebugCategory {
  id: keyof DebugPreferences;
  label: string;
  description: string;
  location: 'frontend' | 'backend';
}

const DEBUG_CATEGORIES: DebugCategory[] = [
  // Frontend categories (browser console)
  { id: 'persistence', label: 'Persistence', description: 'localStorage read/write operations', location: 'frontend' },
  { id: 'rehydration', label: 'Rehydration', description: 'Store rehydration from localStorage', location: 'frontend' },
  { id: 'stores', label: 'Stores', description: 'Store initialization and creation', location: 'frontend' },
  { id: 'backend', label: 'Backend Sync', description: 'Backend API synchronization', location: 'frontend' },
  { id: 'registry', label: 'Registry', description: 'Plugin/feature/route/renderer registration', location: 'frontend' },
  { id: 'websocket', label: 'WebSocket', description: 'WebSocket connection and message handling', location: 'frontend' },

  // Backend categories (server logs)
  { id: 'generation', label: 'Generation Pipeline', description: 'Dedup, cache, params canonicalization', location: 'backend' },
  { id: 'provider', label: 'Provider API', description: 'Provider SDK calls and responses', location: 'backend' },
  { id: 'worker', label: 'Worker Jobs', description: 'Job processing and status polling', location: 'backend' },
  { id: 'validateCompositionVocabs', label: 'Vocab Validation', description: 'Validate composition fields (role, pose_id, etc.) against vocab registry', location: 'backend' },
];

/** Shared hook for debug state management */
function useDebugState() {
  const [debugStates, setDebugStates] = useState<DebugPreferences>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getUserPreferences()
      .then(prefs => {
        const debug = prefs.debug || {};
        setDebugStates(debug);
        debugFlags.updateFromPreferences(debug);
        setIsLoading(false);
      })
      .catch(err => {
        console.error('Failed to load debug preferences:', err);
        setIsLoading(false);
      });
  }, []);

  const handleToggle = async (categoryId: keyof DebugPreferences) => {
    let previousStates: DebugPreferences | null = null;
    let nextStates: DebugPreferences | null = null;

    setDebugStates(prev => {
      previousStates = prev;
      const newValue = !prev[categoryId];
      nextStates = { ...prev, [categoryId]: newValue };
      return nextStates;
    });

    if (nextStates) {
      debugFlags.updateFromPreferences(nextStates);
    }

    try {
      if (nextStates) {
        await updatePreferenceKey('debug', nextStates);
      }
    } catch (err) {
      console.error('Failed to save debug preference:', err);
      if (previousStates) {
        setDebugStates(previousStates);
        debugFlags.updateFromPreferences(previousStates);
      }
    }
  };

  return { debugStates, isLoading, handleToggle };
}

/** Hook for managing dev tools preferences */
function useDevToolsSettings() {
  const [devtoolsStates, setDevtoolsStates] = useState<DevToolsPreferences>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getUserPreferences()
      .then(prefs => {
        setDevtoolsStates(prefs.devtools || {});
        setIsLoading(false);
      })
      .catch(err => {
        console.error('Failed to load devtools preferences:', err);
        setIsLoading(false);
      });
  }, []);

  const getSettingValue = <T extends DevToolSettingValue>(
    toolId: string,
    settingKey: string,
    defaultValue: T
  ): T => {
    const stored = devtoolsStates[toolId]?.[settingKey];
    return (stored !== undefined ? stored : defaultValue) as T;
  };

  const updateSetting = async (toolId: string, settingKey: string, newValue: DevToolSettingValue) => {
    let previousStates: DevToolsPreferences | null = null;
    let nextStates: DevToolsPreferences | null = null;

    setDevtoolsStates(prev => {
      previousStates = prev;
      const newToolSettings = {
        ...(prev[toolId] || {}),
        [settingKey]: newValue,
      };
      nextStates = { ...prev, [toolId]: newToolSettings };
      return nextStates;
    });

    try {
      if (nextStates) {
        await updatePreferenceKey('devtools', nextStates);
      }
    } catch (err) {
      console.error('Failed to save devtools preference:', err);
      if (previousStates) {
        setDevtoolsStates(previousStates);
      }
    }
  };

  return { devtoolsStates, isLoading, getSettingValue, updateSetting };
}

/** Debug category toggle list */
function DebugCategoryList({
  categories,
  debugStates,
  onToggle,
}: {
  categories: DebugCategory[];
  debugStates: DebugPreferences;
  onToggle: (id: keyof DebugPreferences) => void;
}) {
  return (
    <div className="space-y-2">
      {categories.map(category => (
        <div
          key={category.id}
          className="flex items-center justify-between p-3 rounded-md border border-neutral-200 dark:border-neutral-700 bg-neutral-50/60 dark:bg-neutral-900/40"
        >
          <div className="flex-1">
            <div className="text-[11px] font-semibold text-neutral-800 dark:text-neutral-100">
              {category.label}
            </div>
            <div className="text-[10px] text-neutral-600 dark:text-neutral-400">
              {category.description}
            </div>
          </div>

          <label className="flex items-center cursor-pointer ml-4">
            <input
              type="checkbox"
              checked={debugStates[category.id] ?? false}
              onChange={() => onToggle(category.id)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-neutral-300 dark:bg-neutral-700 rounded-full peer peer-checked:bg-blue-500 peer-checked:after:translate-x-5 after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all relative"></div>
          </label>
        </div>
      ))}
    </div>
  );
}

/** Frontend debug settings */
function DebugFrontendSettings() {
  const { debugStates, isLoading, handleToggle } = useDebugState();
  const frontendCategories = DEBUG_CATEGORIES.filter(c => c.location === 'frontend');

  if (isLoading) {
    return (
      <div className="flex-1 overflow-auto p-4 text-xs text-neutral-500 dark:text-neutral-400">
        Loading debug preferences...
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-4 space-y-4 text-xs text-neutral-800 dark:text-neutral-100">
      <p className="text-[11px] text-neutral-600 dark:text-neutral-400">
        Logs appear in browser console (F12). Useful for debugging UI, stores, and client-side logic.
      </p>
      <DebugCategoryList
        categories={frontendCategories}
        debugStates={debugStates}
        onToggle={handleToggle}
      />
    </div>
  );
}

/** Backend debug settings */
function DebugBackendSettings() {
  const { debugStates, isLoading, handleToggle } = useDebugState();
  const backendCategories = DEBUG_CATEGORIES.filter(c => c.location === 'backend');

  if (isLoading) {
    return (
      <div className="flex-1 overflow-auto p-4 text-xs text-neutral-500 dark:text-neutral-400">
        Loading debug preferences...
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-4 space-y-4 text-xs text-neutral-800 dark:text-neutral-100">
      <p className="text-[11px] text-neutral-600 dark:text-neutral-400">
        Logs appear in backend/worker console. Check terminal where backend is running.
      </p>
      <DebugCategoryList
        categories={backendCategories}
        debugStates={debugStates}
        onToggle={handleToggle}
      />
    </div>
  );
}

/** Render a boolean toggle setting */
function BooleanSettingControl({
  value,
  onUpdate,
}: {
  value: boolean;
  onUpdate: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center cursor-pointer ml-4">
      <input
        type="checkbox"
        checked={value}
        onChange={() => onUpdate(!value)}
        className="sr-only peer"
      />
      <div className="w-11 h-6 bg-neutral-300 dark:bg-neutral-700 rounded-full peer peer-checked:bg-blue-500 peer-checked:after:translate-x-5 after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all relative"></div>
    </label>
  );
}

/** Render a select dropdown setting */
function SelectSettingControl({
  setting,
  value,
  onUpdate,
}: {
  setting: DevToolSettingSelect;
  value: string;
  onUpdate: (value: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onUpdate(e.target.value)}
      className="ml-4 px-2 py-1 text-[11px] rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
    >
      {setting.options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/** Render a number input setting */
function NumberSettingControl({
  setting,
  value,
  onUpdate,
}: {
  setting: DevToolSettingNumber;
  value: number;
  onUpdate: (value: number) => void;
}) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => {
        const parsed = parseFloat(e.target.value);
        if (Number.isNaN(parsed)) {
          return;
        }
        onUpdate(parsed);
      }}
      min={setting.min}
      max={setting.max}
      step={setting.step}
      className="ml-4 w-20 px-2 py-1 text-[11px] rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
    />
  );
}

/** Render a single dev tool setting based on its type */
function DevToolSettingRow({
  toolId,
  setting,
  getSettingValue,
  updateSetting,
}: {
  toolId: string;
  setting: DevToolSetting;
  getSettingValue: <T extends DevToolSettingValue>(toolId: string, key: string, defaultValue: T) => T;
  updateSetting: (toolId: string, key: string, value: DevToolSettingValue) => void;
}) {
  const renderControl = () => {
    switch (setting.type) {
      case 'boolean': {
        const value = getSettingValue(toolId, setting.key, setting.defaultValue);
        return (
          <BooleanSettingControl
            value={value}
            onUpdate={(v) => updateSetting(toolId, setting.key, v)}
          />
        );
      }
      case 'select': {
        const value = getSettingValue(toolId, setting.key, setting.defaultValue);
        return (
          <SelectSettingControl
            setting={setting}
            value={value}
            onUpdate={(v) => updateSetting(toolId, setting.key, v)}
          />
        );
      }
      case 'number': {
        const value = getSettingValue(toolId, setting.key, setting.defaultValue);
        return (
          <NumberSettingControl
            setting={setting}
            value={value}
            onUpdate={(v) => updateSetting(toolId, setting.key, v)}
          />
        );
      }
      default:
        return null;
    }
  };

  return (
    <div className="flex items-center justify-between p-3 rounded-md border border-neutral-200 dark:border-neutral-700 bg-neutral-50/60 dark:bg-neutral-900/40">
      <div className="flex-1">
        <div className="text-[11px] font-semibold text-neutral-800 dark:text-neutral-100">
          {setting.label}
        </div>
        {setting.description && (
          <div className="text-[10px] text-neutral-600 dark:text-neutral-400">
            {setting.description}
          </div>
        )}
      </div>
      {renderControl()}
    </div>
  );
}

/** Dev tool settings section - renders settings from registry */
function DevToolsSettingsSection() {
  const { isLoading, getSettingValue, updateSetting } = useDevToolsSettings();
  const toolsWithSettings = devToolRegistry.getToolsWithSettings();

  if (toolsWithSettings.length === 0) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="text-xs text-neutral-500 dark:text-neutral-400">
        Loading dev tool settings...
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <h2 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        Dev Tool Settings
      </h2>
      <p className="text-[11px] text-neutral-600 dark:text-neutral-400">
        Settings exposed by individual dev tools.
      </p>

      {toolsWithSettings.map(tool => (
        <div key={tool.id} className="space-y-2">
          <h3 className="text-[11px] font-medium text-neutral-700 dark:text-neutral-300">
            {tool.label}
          </h3>
          <div className="space-y-2">
            {tool.settings!.map(setting => (
              <DevToolSettingRow
                key={setting.key}
                toolId={tool.id}
                setting={setting}
                getSettingValue={getSettingValue}
                updateSetting={updateSetting}
              />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

/** Default component - shows all debug settings */
export function DebugSettings() {
  const { debugStates, isLoading, handleToggle } = useDebugState();

  const frontendCategories = DEBUG_CATEGORIES.filter(c => c.location === 'frontend');
  const backendCategories = DEBUG_CATEGORIES.filter(c => c.location === 'backend');

  if (isLoading) {
    return (
      <div className="flex-1 overflow-auto p-4 text-xs text-neutral-500 dark:text-neutral-400">
        Loading debug preferences...
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-4 space-y-6 text-xs text-neutral-800 dark:text-neutral-100">
      {/* Info Banner */}
      <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded text-[11px] text-blue-700 dark:text-blue-300">
        <strong>Unified Debug System:</strong> All settings stored in backend user preferences.
        Changes sync across devices and sessions.
      </div>

      {/* Frontend Debug */}
      <section className="space-y-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Frontend Debug (Browser Console)
        </h2>
        <p className="text-[11px] text-neutral-600 dark:text-neutral-400">
          Logs appear in browser console (F12). Useful for debugging UI, stores, and client-side logic.
        </p>
        <div className="mt-3">
          <DebugCategoryList
            categories={frontendCategories}
            debugStates={debugStates}
            onToggle={handleToggle}
          />
        </div>
      </section>

      {/* Backend Debug */}
      <section className="space-y-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Backend Debug (Server Logs)
        </h2>
        <p className="text-[11px] text-neutral-600 dark:text-neutral-400">
          Logs appear in backend/worker console. Check terminal where backend is running.
        </p>
        <div className="mt-3">
          <DebugCategoryList
            categories={backendCategories}
            debugStates={debugStates}
            onToggle={handleToggle}
          />
        </div>
      </section>

      {/* Dev Tool Settings (from registry) */}
      <DevToolsSettingsSection />
    </div>
  );
}

// Register this module (only in development mode)
if (import.meta.env.DEV) {
  settingsRegistry.register({
    id: 'debug',
    label: 'Debug',
    icon: '🐛',
    component: DebugSettings,
    order: 90,
    subSections: [
      {
        id: 'frontend',
        label: 'Frontend',
        icon: '🖥️',
        component: DebugFrontendSettings,
      },
      {
        id: 'backend',
        label: 'Backend',
        icon: '🖧',
        component: DebugBackendSettings,
      },
    ],
  });
}
