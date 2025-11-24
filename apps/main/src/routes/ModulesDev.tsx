/**
 * Modules Dev Page
 *
 * Development tool to view all registered modules and their status
 */

import { useState, useMemo } from 'react';
import { moduleRegistry } from '../modules';
import { Panel, Button } from '@pixsim7/shared.ui';
import { Icon } from '../lib/icons';

interface ModuleInfo {
  id: string;
  name: string;
  priority: number;
  dependsOn?: string[];
  isReady: boolean;
  hasPage: boolean;
  pageRoute?: string;
  pageCategory?: string;
  hasInit: boolean;
  hasCleanup: boolean;
}

export function ModulesDev() {
  const [sortBy, setSortBy] = useState<'priority' | 'name' | 'category'>('priority');

  // Get all modules from registry
  const modules = useMemo(() => {
    const allModules = moduleRegistry.list();
    const moduleInfos: ModuleInfo[] = allModules.map(module => ({
      id: module.id,
      name: module.name,
      priority: module.priority ?? 50,
      dependsOn: module.dependsOn,
      isReady: module.isReady?.() ?? true,
      hasPage: !!module.page,
      pageRoute: module.page?.route,
      pageCategory: module.page?.category,
      hasInit: !!module.initialize,
      hasCleanup: !!module.cleanup,
    }));

    // Sort based on selection
    if (sortBy === 'priority') {
      return moduleInfos.sort((a, b) => b.priority - a.priority);
    } else if (sortBy === 'name') {
      return moduleInfos.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      // Sort by category, then by name
      return moduleInfos.sort((a, b) => {
        const catA = a.pageCategory || 'zzz';
        const catB = b.pageCategory || 'zzz';
        if (catA !== catB) return catA.localeCompare(catB);
        return a.name.localeCompare(b.name);
      });
    }
  }, [sortBy]);

  // Group modules by priority
  const byPriority = useMemo(() => {
    const grouped: Record<number, ModuleInfo[]> = {};
    modules.forEach(module => {
      if (!grouped[module.priority]) {
        grouped[module.priority] = [];
      }
      grouped[module.priority].push(module);
    });
    return grouped;
  }, [modules]);

  // Group modules by category
  const byCategory = useMemo(() => {
    const grouped: Record<string, ModuleInfo[]> = {};
    modules.forEach(module => {
      const category = module.pageCategory || 'no-page';
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(module);
    });
    return grouped;
  }, [modules]);

  const stats = useMemo(() => {
    return {
      total: modules.length,
      withPages: modules.filter(m => m.hasPage).length,
      ready: modules.filter(m => m.isReady).length,
      withInit: modules.filter(m => m.hasInit).length,
    };
  }, [modules]);

  return (
    <div className="mx-auto max-w-7xl p-6 space-y-6 content-with-dock min-h-screen">
      {/* Header */}
      <header className="border-b border-neutral-200 dark:border-neutral-800 pb-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Icon name="code" size={24} className="text-cyan-500" />
              Modules Overview
            </h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Development tool to inspect registered modules and their configuration
            </p>
          </div>
          <Button variant="secondary" onClick={() => window.open('/', '_self')}>
            <Icon name="home" size={14} /> Home
          </Button>
        </div>
      </header>

      {/* Stats */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Panel className="space-y-2">
          <div className="text-3xl font-bold text-blue-500">{stats.total}</div>
          <div className="text-sm text-neutral-500">Total Modules</div>
        </Panel>
        <Panel className="space-y-2">
          <div className="text-3xl font-bold text-green-500">{stats.ready}</div>
          <div className="text-sm text-neutral-500">Ready Modules</div>
        </Panel>
        <Panel className="space-y-2">
          <div className="text-3xl font-bold text-purple-500">{stats.withPages}</div>
          <div className="text-sm text-neutral-500">With Pages</div>
        </Panel>
        <Panel className="space-y-2">
          <div className="text-3xl font-bold text-orange-500">{stats.withInit}</div>
          <div className="text-sm text-neutral-500">With Init</div>
        </Panel>
      </section>

      {/* Sort Controls */}
      <section className="flex gap-2">
        <span className="text-sm text-neutral-500 self-center">Sort by:</span>
        <Button
          size="sm"
          variant={sortBy === 'priority' ? 'primary' : 'secondary'}
          onClick={() => setSortBy('priority')}
        >
          Priority
        </Button>
        <Button
          size="sm"
          variant={sortBy === 'name' ? 'primary' : 'secondary'}
          onClick={() => setSortBy('name')}
        >
          Name
        </Button>
        <Button
          size="sm"
          variant={sortBy === 'category' ? 'primary' : 'secondary'}
          onClick={() => setSortBy('category')}
        >
          Category
        </Button>
      </section>

      {/* Modules List */}
      {sortBy === 'priority' && (
        <section className="space-y-6">
          {Object.entries(byPriority)
            .sort(([a], [b]) => Number(b) - Number(a))
            .map(([priority, mods]) => (
              <div key={priority} className="space-y-3">
                <h2 className="text-lg font-semibold">Priority {priority}</h2>
                <div className="grid gap-3 grid-cols-1 lg:grid-cols-2">
                  {mods.map(module => (
                    <ModuleCard key={module.id} module={module} />
                  ))}
                </div>
              </div>
            ))}
        </section>
      )}

      {sortBy === 'category' && (
        <section className="space-y-6">
          {Object.entries(byCategory)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([category, mods]) => (
              <div key={category} className="space-y-3">
                <h2 className="text-lg font-semibold capitalize">
                  {category === 'no-page' ? 'No Page' : category}
                </h2>
                <div className="grid gap-3 grid-cols-1 lg:grid-cols-2">
                  {mods.map(module => (
                    <ModuleCard key={module.id} module={module} />
                  ))}
                </div>
              </div>
            ))}
        </section>
      )}

      {sortBy === 'name' && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">All Modules</h2>
          <div className="grid gap-3 grid-cols-1 lg:grid-cols-2">
            {modules.map(module => (
              <ModuleCard key={module.id} module={module} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ModuleCard({ module }: { module: ModuleInfo }) {
  return (
    <Panel className="space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="font-medium">{module.name}</h3>
          <p className="text-xs text-neutral-500 font-mono">{module.id}</p>
        </div>
        <div className="flex gap-1">
          {module.isReady ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
              READY
            </span>
          ) : (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400">
              NOT READY
            </span>
          )}
        </div>
      </div>

      {/* Details */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-neutral-500">Priority:</span>{' '}
          <span className="font-medium">{module.priority}</span>
        </div>
        <div>
          <span className="text-neutral-500">Category:</span>{' '}
          <span className="font-medium capitalize">{module.pageCategory || 'N/A'}</span>
        </div>
      </div>

      {/* Page Info */}
      {module.hasPage && (
        <div className="pt-2 border-t border-neutral-200 dark:border-neutral-700">
          <div className="flex items-center gap-2 text-xs">
            <Icon name="link" size={12} className="text-blue-500" />
            <a
              href={module.pageRoute}
              className="text-blue-500 hover:underline font-mono"
              target="_self"
            >
              {module.pageRoute}
            </a>
          </div>
        </div>
      )}

      {/* Dependencies */}
      {module.dependsOn && module.dependsOn.length > 0 && (
        <div className="pt-2 border-t border-neutral-200 dark:border-neutral-700">
          <div className="text-xs text-neutral-500">Depends on:</div>
          <div className="flex flex-wrap gap-1 mt-1">
            {module.dependsOn.map(dep => (
              <span
                key={dep}
                className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 font-mono"
              >
                {dep}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Lifecycle */}
      <div className="flex gap-2 text-[10px]">
        {module.hasInit && (
          <span className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
            initialize()
          </span>
        )}
        {module.hasCleanup && (
          <span className="px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400">
            cleanup()
          </span>
        )}
      </div>
    </Panel>
  );
}
