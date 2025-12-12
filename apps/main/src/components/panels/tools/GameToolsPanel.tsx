import { useMemo, useState, useEffect } from 'react';
import { panelRegistry } from '@lib/panels';
import { widgetRegistry } from '@lib/widgets';
import { worldToolRegistry } from '@features/worldTools';
import { interactionRegistry } from '@/lib/registries';
import { pluginCatalog } from '@/lib/plugins/pluginSystem';
import { useEditorContext, type EditorPrimaryView, type EditorMode } from '@/lib/context/editorContext';

type CategoryFilter = 'all' | 'world' | 'flow' | 'interactions' | 'hud' | 'tools' | 'debug';

/**
 * Get a suggested default filter based on the current editor primary view.
 * This helps highlight tools relevant to the current editing context.
 */
function getDefaultFilterForView(primaryView: EditorPrimaryView): CategoryFilter {
  switch (primaryView) {
    case 'flow':
      return 'flow';
    case 'world':
      return 'world';
    case 'game':
      return 'interactions';
    default:
      return 'all';
  }
}

/**
 * Get mode-specific section ordering.
 * Returns true if the section should be "pinned" (shown first) for the current mode.
 */
function isSectionPinned(section: CategoryFilter, mode: EditorMode, primaryView: EditorPrimaryView): boolean {
  // In play mode, prioritize interactions and HUD
  if (mode === 'play') {
    return section === 'interactions' || section === 'hud';
  }
  // In edit-flow mode, prioritize flow/graph tools
  if (mode === 'edit-flow') {
    return section === 'flow';
  }
  // In layout mode, prioritize HUD and world tools
  if (mode === 'layout') {
    return section === 'hud' || section === 'world';
  }
  // In debug mode, prioritize debug tools
  if (mode === 'debug') {
    return section === 'debug' || section === 'tools';
  }
  // Fallback based on primary view
  if (primaryView === 'flow') return section === 'flow';
  if (primaryView === 'world') return section === 'world';
  return false;
}

export function GameToolsPanel() {
  const ctx = useEditorContext();
  const { primaryView, mode } = ctx.editor;

  // Suggest a default filter based on the current editor context,
  // but allow user override
  const suggestedFilter = getDefaultFilterForView(primaryView);
  const [filter, setFilter] = useState<CategoryFilter>(suggestedFilter);
  const [query, setQuery] = useState('');
  const [hasUserOverride, setHasUserOverride] = useState(false);

  // Update filter suggestion when context changes (unless user has overridden)
  useEffect(() => {
    if (!hasUserOverride) {
      setFilter(suggestedFilter);
    }
  }, [suggestedFilter, hasUserOverride]);

  const handleFilterChange = (newFilter: CategoryFilter) => {
    setFilter(newFilter);
    setHasUserOverride(true);
  };

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

  // Mode label for context indicator
  const modeLabel = mode
    ? {
        play: 'Play Mode',
        'edit-flow': 'Flow Edit',
        layout: 'Layout Mode',
        debug: 'Debug Mode',
      }[mode]
    : null;

  const viewLabel = {
    game: 'Game View',
    flow: 'Flow View',
    world: 'World View',
    none: null,
  }[primaryView];

  const orderedSections: CategoryFilter[] = useMemo(() => {
    const baseOrder: CategoryFilter[] = ['world', 'flow', 'interactions', 'hud', 'tools', 'debug'];
    const pinned = baseOrder.filter((section) => isSectionPinned(section, mode, primaryView));
    const others = baseOrder.filter((section) => !isSectionPinned(section, mode, primaryView));
    return [...pinned, ...others];
  }, [mode, primaryView]);

  const shouldShowSection = (section: CategoryFilter) =>
    filter === 'all' || filter === section;

  return (
    <div className="h-full w-full flex flex-col bg-neutral-50 dark:bg-neutral-950">
      {/* Context Indicator - shows current editor mode */}
      {(modeLabel || viewLabel) && (
        <div className="px-3 py-1.5 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-900 flex items-center gap-2 text-[10px]">
          <span className="text-neutral-500 dark:text-neutral-400">Context:</span>
          {modeLabel && (
            <span className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 font-medium">
              {modeLabel}
            </span>
          )}
          {viewLabel && (
            <span className="px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300">
              {viewLabel}
            </span>
          )}
        </div>
      )}

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
          onChange={(e) => handleFilterChange(e.target.value as CategoryFilter)}
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
        {orderedSections.map((section) => {
          if (!shouldShowSection(section)) return null;

          if (section === 'world') {
            return (
              <section key={section}>
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
            );
          }

          if (section === 'flow') {
            return (
              <section key={section}>
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
            );
          }

          if (section === 'interactions') {
            return (
              <section key={section}>
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
            );
          }

          if (section === 'hud') {
            return (
              <section key={section}>
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
            );
          }

          if (section === 'tools') {
            return (
              <section key={section}>
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
            );
          }

          if (section === 'debug') {
            return (
              <section key={section}>
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
            );
          }

          return null;
        })}
      </div>
    </div>
  );
}
