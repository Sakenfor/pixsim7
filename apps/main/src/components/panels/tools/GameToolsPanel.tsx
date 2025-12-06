import { useMemo, useState } from 'react';
import { panelRegistry } from '@/lib/panels/panelRegistry';
import { widgetRegistry } from '@/lib/widgets/widgetRegistry';
import { worldToolRegistry } from '@/lib/worldTools/registry';
import { interactionRegistry } from '@/lib/registries';
import { pluginCatalog } from '@/lib/plugins/pluginSystem';

type CategoryFilter = 'all' | 'world' | 'flow' | 'interactions' | 'hud' | 'tools' | 'debug';

export function GameToolsPanel() {
  const [filter, setFilter] = useState<CategoryFilter>('all');
  const [query, setQuery] = useState('');

  const panels = useMemo(() => panelRegistry.getAll(), []);
  const widgets = useMemo(() => widgetRegistry.getAll(), []);
  const worldTools = useMemo(() => worldToolRegistry.getAll(), []);
  const interactions = useMemo(() => interactionRegistry.getAll(), []);
  const plugins = useMemo(() => pluginCatalog.getAll(), []);

  const loweredQuery = query.trim().toLowerCase();

  const matchesQuery = (text?: string, tags?: string[]) => {
    if (!loweredQuery) return true;
    if (text && text.toLowerCase().includes(loweredQuery)) return true;
    if (tags && tags.some((t) => t.toLowerCase().includes(loweredQuery))) return true;
    return false;
  };

  return (
    <div className="h-full w-full flex flex-col bg-neutral-50 dark:bg-neutral-950">
      {/* Filters */}
      <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-800 flex items-center gap-2 text-xs">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tools, panels, widgets…"
          className="flex-1 px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs text-neutral-800 dark:text-neutral-100"
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as CategoryFilter)}
          className="px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs"
        >
          <option value="all">All</option>
          <option value="world">World</option>
          <option value="flow">Flow / Graph</option>
          <option value="interactions">Interactions</option>
          <option value="hud">HUD / Overlays</option>
          <option value="tools">Panels & Tools</option>
          <option value="debug">Debug / Dev</option>
        </select>
      </div>

      <div className="flex-1 overflow-auto px-3 py-2 space-y-4 text-xs">
        {/* World Tools */}
        {(filter === 'all' || filter === 'world') && (
          <section>
            <h3 className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-300 mb-1">
              World Tools
            </h3>
            {worldTools.length === 0 ? (
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                No world tools registered.
              </p>
            ) : (
              <div className="space-y-1">
                {worldTools
                  .filter((tool) => matchesQuery(tool.name, tool.tags))
                  .map((tool) => (
                    <div
                      key={tool.id}
                      className="px-2 py-1 rounded border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="font-medium truncate">{tool.name}</div>
                        {tool.description && (
                          <div className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
                            {tool.description}
                          </div>
                        )}
                      </div>
                      {tool.icon && (
                        <span className="text-neutral-400 dark:text-neutral-500 text-xs">
                          {tool.icon}
                        </span>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </section>
        )}

        {/* Flow / Graph Panels */}
        {(filter === 'all' || filter === 'flow') && (
          <section>
            <h3 className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-300 mb-1">
              Flow / Graph Panels
            </h3>
            <div className="space-y-1">
              {panels
                .filter((p) => p.category === 'workspace' || p.category === 'scene')
                .filter((p) => matchesQuery(p.title, p.tags))
                .map((panel) => (
                  <div
                    key={panel.id}
                    className="px-2 py-1 rounded border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">{panel.title}</div>
                      {panel.description && (
                        <div className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
                          {panel.description}
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] uppercase text-neutral-500 dark:text-neutral-400">
                      {panel.category}
                    </span>
                  </div>
                ))}
            </div>
          </section>
        )}

        {/* Interactions */}
        {(filter === 'all' || filter === 'interactions') && (
          <section>
            <h3 className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-300 mb-1">
              Interaction Plugins
            </h3>
            {interactions.length === 0 ? (
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                No interaction plugins registered.
              </p>
            ) : (
              <div className="space-y-1">
                {interactions
                  .filter((plugin) => matchesQuery(plugin.name, plugin.tags))
                  .map((plugin) => (
                    <div
                      key={plugin.id}
                      className="px-2 py-1 rounded border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="font-medium truncate">{plugin.name}</div>
                        {plugin.description && (
                          <div className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
                            {plugin.description}
                          </div>
                        )}
                      </div>
                      {plugin.icon && (
                        <span className="text-neutral-400 dark:text-neutral-500 text-xs">
                          {plugin.icon}
                        </span>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </section>
        )}

        {/* HUD / Widgets */}
        {(filter === 'all' || filter === 'hud') && (
          <section>
            <h3 className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-300 mb-1">
              HUD Widgets & Overlays
            </h3>
            {widgets.length === 0 ? (
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                No widgets registered.
              </p>
            ) : (
              <div className="space-y-1">
                {widgets
                  .filter((w) => matchesQuery(w.title, w.tags))
                  .map((w) => (
                    <div
                      key={w.id}
                      className="px-2 py-1 rounded border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="font-medium truncate">{w.title}</div>
                        {w.description && (
                          <div className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
                            {w.description}
                          </div>
                        )}
                      </div>
                      <span className="text-[10px] uppercase text-neutral-500 dark:text-neutral-400">
                        {w.category}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </section>
        )}

        {/* Panels & Tools (non-flow) */}
        {(filter === 'all' || filter === 'tools') && (
          <section>
            <h3 className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-300 mb-1">
              Panels & Tools
            </h3>
            <div className="space-y-1">
              {panels
                .filter((p) => p.category !== 'workspace' && p.category !== 'scene')
                .filter((p) => matchesQuery(p.title, p.tags))
                .map((panel) => (
                  <div
                    key={panel.id}
                    className="px-2 py-1 rounded border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">{panel.title}</div>
                      {panel.description && (
                        <div className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
                          {panel.description}
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] uppercase text-neutral-500 dark:text-neutral-400">
                      {panel.category}
                    </span>
                  </div>
                ))}
            </div>
          </section>
        )}

        {/* Debug / Dev plugins */}
        {(filter === 'all' || filter === 'debug') && (
          <section>
            <h3 className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-300 mb-1">
              Debug / Dev Plugins
            </h3>
            <div className="space-y-1">
              {plugins
                .filter((p) => matchesQuery(p.name, p.tags))
                .map((p) => (
                  <div
                    key={p.id}
                    className="px-2 py-1 rounded border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">{p.name}</div>
                      {p.description && (
                        <div className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
                          {p.description}
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] uppercase text-neutral-500 dark:text-neutral-400">
                      {p.family}
                    </span>
                  </div>
                ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
