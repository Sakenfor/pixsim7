import React from 'react';
import { AppMapPanel } from '@features/panels/components/dev/AppMapPanel';

/**
 * AppMapDev Route
 *
 * Dev panel route for visualizing app architecture, features, and plugins.
 * Provides live view of:
 * - Capability registry (features, routes, actions)
 * - Plugin ecosystem (all plugin kinds with metadata)
 * - System health and statistics
 *
 * Route: /app-map
 */
export function AppMapDev() {
  return (
    <div className="flex flex-col h-screen bg-white dark:bg-neutral-900">
      {/* Page Header */}
      <div className="border-b border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-6 py-4">
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
          App Map & Architecture Explorer
        </h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
          Live view of registered features, routes, actions, and plugins. See{' '}
          <a
            href="https://github.com/Sakenfor/pixsim7/blob/main/docs/APP_MAP.md"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 hover:underline"
          >
            docs/APP_MAP.md
          </a>{' '}
          for the architecture index.
        </p>
      </div>

      {/* App Map Panel */}
      <div className="flex-1 overflow-hidden">
        <AppMapPanel />
      </div>
    </div>
  );
}

export default AppMapDev;
