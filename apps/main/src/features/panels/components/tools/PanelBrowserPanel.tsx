import { useEffect, useMemo, useState } from "react";

import { getDockviewPanels, resolvePanelDefinitionId } from "@lib/dockview";
import { Icon } from "@lib/icons";
import { panelSelectors } from "@lib/plugins/catalogSelectors";

import {
  CATEGORY_ICONS,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  getCategoryColorClasses,
  type PanelCategory,
} from "@features/panels/lib/panelConstants";
import {
  openFloatingWorkspacePanel,
  openWorkspacePanel,
  resolveWorkspaceDockview,
  useWorkspaceStore,
} from "@features/workspace";

type VisibilityFilter = "all" | "open" | "closed";

function formatUpdatedAt(value?: string): string | null {
  if (!value) return null;
  const ts = Date.parse(value);
  if (Number.isNaN(ts)) return null;
  return new Date(ts).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function PanelBrowserPanel() {
  const floatingPanels = useWorkspaceStore((s) => s.floatingPanels);
  const [allPanels, setAllPanels] = useState(() => panelSelectors.getPublicPanels());
  const [searchQuery, setSearchQuery] = useState("");
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>("all");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [openPanels, setOpenPanels] = useState<Set<string>>(new Set());

  useEffect(() => {
    return panelSelectors.subscribe(() => {
      setAllPanels(panelSelectors.getPublicPanels());
    });
  }, []);

  useEffect(() => {
    const host = resolveWorkspaceDockview().host;
    const api = host?.api;
    if (!api) return;

    const updateOpenPanels = () => {
      const ids = new Set<string>();
      for (const panel of getDockviewPanels(api)) {
        const panelId = resolvePanelDefinitionId(panel);
        if (typeof panelId === "string") {
          ids.add(panelId);
        }
      }
      setOpenPanels(ids);
    };

    updateOpenPanels();
    const disposable = api.onDidLayoutChange(updateOpenPanels);
    return () => disposable.dispose();
  }, []);

  const floatingPanelIds = useMemo(
    () => new Set(floatingPanels.map((panel) => panel.id)),
    [floatingPanels],
  );

  // Build category counts from all panels (before search filter)
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const panel of allPanels) {
      const cat = panel.category || "custom";
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
    return counts;
  }, [allPanels]);

  // Categories that actually have panels
  const availableCategories = useMemo(() => {
    return CATEGORY_ORDER.filter((cat) => (categoryCounts.get(cat) ?? 0) > 0);
  }, [categoryCounts]);

  const filteredPanels = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return allPanels
      .filter((panel) => {
        if (activeCategory && (panel.category || "custom") !== activeCategory) return false;
        if (visibilityFilter === "open" && !openPanels.has(panel.id)) return false;
        if (visibilityFilter === "closed" && openPanels.has(panel.id)) return false;

        if (!query) return true;

        const haystacks = [
          panel.id,
          panel.title,
          panel.description,
          panel.category,
          panel.changeNote,
          ...(panel.tags ?? []),
          ...(panel.featureHighlights ?? []),
        ];
        return haystacks.some(
          (value) => typeof value === "string" && value.toLowerCase().includes(query),
        );
      })
      .sort((a, b) => {
        const orderDiff = (a.order ?? 100) - (b.order ?? 100);
        if (orderDiff !== 0) return orderDiff;
        return a.title.localeCompare(b.title);
      });
  }, [allPanels, activeCategory, openPanels, searchQuery, visibilityFilter]);

  // When searching, clear the category filter so results show across all categories
  useEffect(() => {
    if (searchQuery.trim()) {
      setActiveCategory(null);
    }
  }, [searchQuery]);

  const handleOpenDocked = (panelId: string) => {
    openWorkspacePanel(panelId);
  };

  const handleOpenFloating = (panelId: string) => {
    openFloatingWorkspacePanel(panelId);
  };

  return (
    <div className="h-full flex bg-white dark:bg-neutral-900">
      {/* Sidebar */}
      <div className="w-44 shrink-0 border-r border-neutral-200 dark:border-neutral-700 flex flex-col">
        <div className="p-3 pb-2">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Panels</h2>
          <p className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-0.5">
            {openPanels.size} open · {allPanels.length} total
          </p>
        </div>

        <nav className="flex-1 overflow-y-auto px-1.5 pb-2">
          {/* All category */}
          <button
            type="button"
            onClick={() => setActiveCategory(null)}
            className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs transition-colors mb-0.5 ${
              activeCategory === null
                ? "bg-accent-subtle text-accent font-medium"
                : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            }`}
          >
            <Icon name="grid" size={13} className="shrink-0 opacity-70" />
            <span className="truncate">All</span>
            <span className="ml-auto text-[10px] opacity-60">{allPanels.length}</span>
          </button>

          <div className="h-px bg-neutral-200 dark:bg-neutral-700 my-1.5 mx-2" />

          {availableCategories.map((cat) => {
            const count = categoryCounts.get(cat) ?? 0;
            const isActive = activeCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(isActive ? null : cat)}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs transition-colors mb-0.5 ${
                  isActive
                    ? "bg-accent-subtle text-accent font-medium"
                    : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                }`}
              >
                <Icon
                  name={CATEGORY_ICONS[cat] ?? "layers"}
                  size={13}
                  className="shrink-0 opacity-70"
                />
                <span className="truncate">{CATEGORY_LABELS[cat]}</span>
                <span className="ml-auto text-[10px] opacity-60">{count}</span>
              </button>
            );
          })}
        </nav>

        {/* Visibility filter at bottom of sidebar */}
        <div className="border-t border-neutral-200 dark:border-neutral-700 p-2">
          <div className="flex items-center gap-0.5 rounded-md border border-neutral-200 dark:border-neutral-700 p-0.5 bg-neutral-50 dark:bg-neutral-800/50">
            {(["all", "open", "closed"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setVisibilityFilter(mode)}
                className={`flex-1 px-1 py-0.5 text-[10px] rounded transition-colors ${
                  visibilityFilter === mode
                    ? "bg-accent-subtle text-accent font-medium"
                    : "text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700/60"
                }`}
              >
                {mode === "all" ? "All" : mode === "open" ? "Open" : "Closed"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Search bar */}
        <div className="p-3 border-b border-neutral-200 dark:border-neutral-700">
          <input
            type="text"
            placeholder="Search panels..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="w-full px-3 py-1.5 text-sm border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
          />
        </div>

        {/* Panel grid */}
        <div className="flex-1 overflow-y-auto p-3">
          {activeCategory && !searchQuery.trim() && (
            <div className="flex items-center gap-2 mb-3">
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium ${getCategoryColorClasses(activeCategory as PanelCategory)}`}
              >
                <Icon name={CATEGORY_ICONS[activeCategory as PanelCategory] ?? "layers"} size={12} />
                {CATEGORY_LABELS[activeCategory as PanelCategory] ?? activeCategory}
              </span>
              <span className="text-[11px] text-neutral-400">
                {filteredPanels.length} panel{filteredPanels.length !== 1 ? "s" : ""}
              </span>
            </div>
          )}

          {filteredPanels.length === 0 ? (
            <div className="text-sm text-neutral-500 dark:text-neutral-400 text-center py-12">
              No panels match this filter.
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
              {filteredPanels.map((panel) => {
                const isOpen = openPanels.has(panel.id);
                const isFloating = floatingPanelIds.has(panel.id);
                const updatedLabel = formatUpdatedAt(panel.updatedAt);

                return (
                  <article
                    key={panel.id}
                    className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50/60 dark:bg-neutral-800/40 p-2.5 group/panel hover:border-neutral-300 dark:hover:border-neutral-600 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {panel.icon && (
                          <div className="shrink-0 w-7 h-7 rounded-md bg-neutral-100 dark:bg-neutral-700/60 flex items-center justify-center">
                            <Icon
                              name={panel.icon as string}
                              size={14}
                              className="text-neutral-500 dark:text-neutral-400"
                            />
                          </div>
                        )}
                        <div className="min-w-0">
                          <h4 className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate leading-tight">
                            {panel.title}
                          </h4>
                          {panel.description && (
                            <p className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate mt-0.5">
                              {panel.description}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {isOpen && (
                          <span className="px-1.5 py-0.5 text-[9px] rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-medium">
                            Docked
                          </span>
                        )}
                        {isFloating && (
                          <span className="px-1.5 py-0.5 text-[9px] rounded-full bg-blue-500/15 text-blue-700 dark:text-blue-300 font-medium">
                            Float
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Meta badges */}
                    {(updatedLabel || panel.changeNote) && (
                      <div className="mt-1.5 flex items-center gap-1.5">
                        {updatedLabel && (
                          <span className="text-[10px] text-blue-600 dark:text-blue-400">
                            Updated {updatedLabel}
                          </span>
                        )}
                        {panel.changeNote && (
                          <span className="text-[10px] text-neutral-400 dark:text-neutral-500 truncate">
                            — {panel.changeNote}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Action buttons — visible on hover */}
                    <div className="mt-2 flex items-center gap-1.5 opacity-0 group-hover/panel:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => handleOpenDocked(panel.id)}
                        className="px-2 py-0.5 text-[11px] rounded-md bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 hover:opacity-90"
                      >
                        {isOpen ? "Focus" : "Dock"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenFloating(panel.id)}
                        className="px-2 py-0.5 text-[11px] rounded-md border border-neutral-300 dark:border-neutral-600 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700/60"
                      >
                        Float
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
