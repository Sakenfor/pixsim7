/**
 * Debug Settings Module
 *
 * Unified debug logging toggles stored in backend user preferences.
 * Controls both frontend (browser console) and backend (server logs) debug output.
 *
 * NOTE: Only visible in development mode.
 */
import { useState, useEffect } from 'react';
import { debugFlags } from '@lib/utils/debugFlags';
import { getUserPreferences, updatePreferenceKey, type DebugPreferences } from '@lib/api/userPreferences';
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

  // Backend categories (server logs)
  { id: 'generation', label: 'Generation Pipeline', description: 'Dedup, cache, params canonicalization', location: 'backend' },
  { id: 'provider', label: 'Provider API', description: 'Provider SDK calls and responses', location: 'backend' },
  { id: 'worker', label: 'Worker Jobs', description: 'Job processing and status polling', location: 'backend' },
];

export function DebugSettings() {
  const [debugStates, setDebugStates] = useState<DebugPreferences>({});
  const [isLoading, setIsLoading] = useState(true);

  // Load debug states from user preferences
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
    const newValue = !debugStates[categoryId];
    const newStates = { ...debugStates, [categoryId]: newValue };

    // Optimistic update
    setDebugStates(newStates);
    debugFlags.updateFromPreferences(newStates);

    try {
      await updatePreferenceKey('debug', newStates);
    } catch (err) {
      console.error('Failed to save debug preference:', err);
      // Revert on error
      setDebugStates(debugStates);
      debugFlags.updateFromPreferences(debugStates);
    }
  };

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

        <div className="mt-3 space-y-2">
          {frontendCategories.map(category => (
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
                  onChange={() => handleToggle(category.id)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-neutral-300 dark:bg-neutral-700 rounded-full peer peer-checked:bg-blue-500 peer-checked:after:translate-x-5 after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all relative"></div>
              </label>
            </div>
          ))}
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

        <div className="mt-3 space-y-2">
          {backendCategories.map(category => (
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
                  onChange={() => handleToggle(category.id)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-neutral-300 dark:bg-neutral-700 rounded-full peer peer-checked:bg-blue-500 peer-checked:after:translate-x-5 after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all relative"></div>
              </label>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// Register this module (only in development mode)
if (import.meta.env.DEV) {
  settingsRegistry.register({
    id: 'debug',
    label: 'Debug',
    component: DebugSettings,
    order: 90,
  });
}
