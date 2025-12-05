/**
 * Debug Settings Module
 *
 * Frontend and backend debug logging toggles.
 */
import { useState, useEffect } from 'react';
import { debugFlags } from '@/lib/debugFlags';
import { updateUserPreferences, getUserPreferences, type DebugPreferences } from '@/lib/api/userPreferences';
import { settingsRegistry } from '@/lib/settingsRegistry';

const FRONTEND_DEBUG_CATEGORIES = [
  { id: 'persistence', label: 'Persistence', description: 'localStorage read/write operations' },
  { id: 'rehydration', label: 'Rehydration', description: 'Store rehydration from localStorage' },
  { id: 'stores', label: 'Stores', description: 'Store initialization and creation' },
  { id: 'backend', label: 'Backend Sync', description: 'Backend API synchronization' },
  { id: '*', label: 'All Frontend Logs', description: 'Enable all frontend debug logging' },
] as const;

const BACKEND_DEBUG_CATEGORIES = [
  { id: 'generation', label: 'Generation Pipeline', description: 'Dedup, cache, params canonicalization' },
  { id: 'provider', label: 'Provider API', description: 'Provider SDK calls and responses' },
  { id: 'worker', label: 'Worker Jobs', description: 'Job processing and status polling' },
] as const;

export function DebugSettings() {
  const [frontendDebugStates, setFrontendDebugStates] = useState<Record<string, boolean>>(() => {
    const states: Record<string, boolean> = {};
    FRONTEND_DEBUG_CATEGORIES.forEach(cat => {
      states[cat.id] = debugFlags.isEnabled(cat.id as any);
    });
    return states;
  });
  const [backendDebugStates, setBackendDebugStates] = useState<DebugPreferences>({});

  // Load backend debug states from user preferences
  useEffect(() => {
    getUserPreferences().then(prefs => {
      if (prefs.debug) {
        setBackendDebugStates(prefs.debug);
      }
    }).catch(err => console.error('Failed to load debug preferences:', err));
  }, []);

  return (
    <div className="flex-1 overflow-auto p-4 space-y-6 text-xs text-neutral-800 dark:text-neutral-100">
      {/* Frontend Debug */}
      <section className="space-y-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Frontend Debug (Browser Console)
        </h2>
        <p className="text-[11px] text-neutral-600 dark:text-neutral-400">
          Logs appear in browser console (F12). Stored in localStorage.
        </p>

        <div className="mt-3 space-y-2">
          {FRONTEND_DEBUG_CATEGORIES.map(category => (
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
                  checked={frontendDebugStates[category.id]}
                  onChange={(e) => {
                    const enabled = e.target.checked;
                    if (enabled) {
                      debugFlags.enable(category.id as any);
                    } else {
                      debugFlags.disable(category.id as any);
                    }
                    setFrontendDebugStates(prev => ({ ...prev, [category.id]: enabled }));
                  }}
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
          Logs appear in backend/worker console. Stored in user preferences.
        </p>

        <div className="mt-3 space-y-2">
          {BACKEND_DEBUG_CATEGORIES.map(category => (
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
                  checked={backendDebugStates[category.id as keyof DebugPreferences] ?? false}
                  onChange={async (e) => {
                    const enabled = e.target.checked;
                    const newStates = { ...backendDebugStates, [category.id]: enabled };
                    setBackendDebugStates(newStates);
                    try {
                      await updateUserPreferences({ debug: newStates });
                    } catch (err) {
                      console.error('Failed to save debug preference:', err);
                    }
                  }}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-neutral-300 dark:bg-neutral-700 rounded-full peer peer-checked:bg-blue-500 peer-checked:after:translate-x-5 after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all relative"></div>
              </label>
            </div>
          ))}
        </div>

        <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded text-[10px] text-amber-700 dark:text-amber-300">
          ⚠️ <strong>Note:</strong> Backend debug requires the backend to check your preferences. Changes take effect on next request.
        </div>
      </section>
    </div>
  );
}

// Register this module
settingsRegistry.register({
  id: 'debug',
  label: 'Debug',
  component: DebugSettings,
  order: 90,
});
