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

import { pixsimClient } from '@lib/api/client';
import { getUserPreferences, updatePreferenceKey, type DebugPreferences, type DevToolsPreferences, type DevToolSettingValue } from '@lib/api/userPreferences';
import { devToolRegistry } from '@lib/dev/devtools/devToolRegistry';
import { debugFlags } from '@lib/utils/debugFlags';

import { settingsRegistry } from '../../lib/core/registry';


interface DebugCategoryMeta {
  id: string;
  description: string;
  enabled: boolean;
  default: boolean;
}

interface DebugCategory {
  id: keyof DebugPreferences;
  label: string;
  description: string;
}

function useDebugCategories(): { categories: DebugCategory[]; loading: boolean } {
  const [categories, setCategories] = useState<DebugCategory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    pixsimClient
      .get<{ categories: DebugCategoryMeta[] }>('/users/me/debug/categories')
      .then((data) => {
        setCategories(
          data.categories.map((c) => ({
            id: c.id as keyof DebugPreferences,
            label: c.id.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()),
            description: c.description,
          })),
        );
      })
      .catch(() => {
        // Fallback — should not normally happen
        setCategories([]);
      })
      .finally(() => setLoading(false));
  }, []);

  return { categories, loading };
}

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

/** Debug log categories — fetched from backend DebugSettings */
function DebugLogCategories() {
  const { debugStates, isLoading: prefsLoading, handleToggle } = useDebugState();
  const { categories, loading: catsLoading } = useDebugCategories();

  if (prefsLoading || catsLoading) {
    return (
      <div className="flex-1 overflow-auto p-4 text-xs text-neutral-500 dark:text-neutral-400">
        Loading debug preferences...
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-4 space-y-4 text-xs text-neutral-800 dark:text-neutral-100">
      <p className="text-[11px] text-neutral-600 dark:text-neutral-400">
        Toggle debug categories. Logs appear in browser console (frontend) and backend terminal (server).
      </p>
      <DebugCategoryList
        categories={categories}
        debugStates={debugStates}
        onToggle={handleToggle}
      />
      <LogDbStats />
    </div>
  );
}

/** Log DB stats — read-only info about the logging database */
function LogDbStats() {
  const [stats, setStats] = useState<{
    config: { log_retention_days: number; log_level: string; log_domain_levels: Record<string, string> };
    db: { total_rows: number; oldest: string | null; newest: string | null } | null;
  } | null>(null);

  useEffect(() => {
    pixsimClient
      .get<any>('/users/me/debug/logging-config')
      .then(setStats)
      .catch(() => {});
  }, []);

  if (!stats) return null;

  const fmt = (iso: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="mt-4 pt-4 border-t border-neutral-200 dark:border-neutral-700 space-y-2">
      <div className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
        Log Database
      </div>
      {stats.db ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
          <span className="text-neutral-500 dark:text-neutral-400">Total entries</span>
          <span>{stats.db.total_rows.toLocaleString()}</span>
          <span className="text-neutral-500 dark:text-neutral-400">Oldest</span>
          <span>{fmt(stats.db.oldest)}</span>
          <span className="text-neutral-500 dark:text-neutral-400">Newest</span>
          <span>{fmt(stats.db.newest)}</span>
          <span className="text-neutral-500 dark:text-neutral-400">Retention</span>
          <span>{stats.config.log_retention_days} days</span>
          <span className="text-neutral-500 dark:text-neutral-400">Global level</span>
          <span>{stats.config.log_level}</span>
        </div>
      ) : (
        <p className="text-[11px] text-neutral-400">Log database not connected</p>
      )}
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

/** Dev Tools settings sub-section */
function DebugDevToolsSettings() {
  return (
    <div className="flex-1 overflow-auto p-4 space-y-4 text-xs text-neutral-800 dark:text-neutral-100">
      <DevToolsSettingsSection />
    </div>
  );
}

/** Default component - shows log categories (first sub-section) */
export function DebugSettings() {
  return <DebugLogCategories />;
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
        id: 'categories',
        label: 'Log Categories',
        icon: '📋',
        component: DebugLogCategories,
      },
      {
        id: 'devtools',
        label: 'Dev Tools',
        icon: '🔧',
        component: DebugDevToolsSettings,
      },
    ],
  });
}
