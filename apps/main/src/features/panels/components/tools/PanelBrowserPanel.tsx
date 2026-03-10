import { useEffect, useMemo, useState } from "react";

import { getDockviewPanels, resolvePanelDefinitionId } from "@lib/dockview";
import { Icon } from "@lib/icons";
import { panelSelectors } from "@lib/plugins/catalogSelectors";

import { CATEGORY_LABELS, CATEGORY_ORDER, type PanelCategory } from "@features/panels/lib/panelConstants";
import {
  openFloatingWorkspacePanel,
  openWorkspacePanel,
  resolveWorkspaceDockview,
  useWorkspaceStore,
} from "@features/workspace";

type VisibilityFilter = "all" | "open" | "closed";

function parseUpdatedAt(value?: string): number {
  if (!value) return 0;
  const ts = Date.parse(value);
  return Number.isNaN(ts) ? 0 : ts;
}

function formatUpdatedAt(value?: string): string | null {
  const ts = parseUpdatedAt(value);
  if (!ts) return null;
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

  const filteredPanels = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const panels = allPanels.filter((panel) => {
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

      return haystacks.some((value) =>
        typeof value === "string" && value.toLowerCase().includes(query),
      );
    });

    return panels.sort((a, b) => {
      const tsDiff = parseUpdatedAt(b.updatedAt) - parseUpdatedAt(a.updatedAt);
      if (tsDiff !== 0) return tsDiff;
      const orderDiff = (a.order ?? 100) - (b.order ?? 100);
      if (orderDiff !== 0) return orderDiff;
      return a.title.localeCompare(b.title);
    });
  }, [allPanels, openPanels, searchQuery, visibilityFilter]);

  const groupedPanels = useMemo(() => {
    const groups = new Map<string, typeof filteredPanels>();

    for (const panel of filteredPanels) {
      const category = panel.category || "custom";
      if (!groups.has(category)) {
        groups.set(category, []);
      }
      groups.get(category)!.push(panel);
    }

    const orderedCategories = [...CATEGORY_ORDER, ...Array.from(groups.keys())]
      .filter((category, index, source) => source.indexOf(category) === index)
      .filter((category) => groups.has(category))
      .sort((a, b) => {
        const aIndex = CATEGORY_ORDER.indexOf(a as PanelCategory);
        const bIndex = CATEGORY_ORDER.indexOf(b as PanelCategory);
        if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
      });

    return orderedCategories.map((category) => ({
      category,
      label: CATEGORY_LABELS[category as PanelCategory] ?? category,
      panels: groups.get(category)!,
    }));
  }, [filteredPanels]);

  const handleOpenDocked = (panelId: string) => {
    openWorkspacePanel(panelId);
  };

  const handleOpenFloating = (panelId: string) => {
    openFloatingWorkspacePanel(panelId);
  };

  const openCount = openPanels.size;
  const floatingCount = floatingPanelIds.size;

  return (
    <div className="h-full flex flex-col bg-white dark:bg-neutral-900">
      <div className="p-4 border-b border-neutral-200 dark:border-neutral-700 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              Panel Browser
            </h2>
            <p className="text-xs text-neutral-600 dark:text-neutral-400">
              {openCount} docked | {floatingCount} floating | {allPanels.length} registered
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            placeholder="Search panels, tags, notes..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="flex-1 px-3 py-2 text-sm border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
          />
          <div className="flex items-center gap-1 rounded-lg border border-neutral-300 dark:border-neutral-700 p-1 bg-neutral-50 dark:bg-neutral-800/50">
            {(["all", "open", "closed"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setVisibilityFilter(mode)}
                className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                  visibilityFilter === mode
                    ? "bg-accent-subtle text-accent"
                    : "text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700/60"
                }`}
              >
                {mode === "all" ? "All" : mode === "open" ? "Open" : "Closed"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {groupedPanels.length === 0 ? (
          <div className="text-sm text-neutral-500 dark:text-neutral-400 text-center py-12">
            No panels match this filter.
          </div>
        ) : (
          groupedPanels.map((group) => (
            <section key={group.category} className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                {group.label}
              </h3>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                {group.panels.map((panel) => {
                  const isOpen = openPanels.has(panel.id);
                  const isFloating = floatingPanelIds.has(panel.id);
                  const updatedLabel = formatUpdatedAt(panel.updatedAt);
                  const highlights = panel.featureHighlights ?? [];

                  return (
                    <article
                      key={panel.id}
                      className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50/60 dark:bg-neutral-800/40 p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            {panel.icon && (
                              <Icon
                                name={panel.icon as string}
                                size={16}
                                className="text-neutral-500 dark:text-neutral-400"
                              />
                            )}
                            <h4 className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">
                              {panel.title}
                            </h4>
                          </div>
                          <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                            {panel.id}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {isOpen && (
                            <span className="px-2 py-0.5 text-[10px] rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                              Docked
                            </span>
                          )}
                          {isFloating && (
                            <span className="px-2 py-0.5 text-[10px] rounded-full bg-blue-500/15 text-blue-700 dark:text-blue-300">
                              Floating
                            </span>
                          )}
                        </div>
                      </div>

                      {panel.description && (
                        <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-300 line-clamp-2">
                          {panel.description}
                        </p>
                      )}

                      {panel.changeNote && (
                        <p className="mt-2 text-[11px] text-blue-700 dark:text-blue-300 line-clamp-1">
                          {panel.changeNote}
                        </p>
                      )}

                      <div className="mt-2 flex flex-wrap gap-1">
                        {updatedLabel && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-500/10 text-blue-700 dark:text-blue-300">
                            Updated {updatedLabel}
                          </span>
                        )}
                        {panel.supportsMultipleInstances && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-300">
                            Multi-instance
                          </span>
                        )}
                        {highlights.slice(0, 2).map((item) => (
                          <span
                            key={item}
                            className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                            title={item}
                          >
                            {item}
                          </span>
                        ))}
                        {(panel.tags ?? []).slice(0, 2).map((tag) => (
                          <span
                            key={tag}
                            className="px-1.5 py-0.5 rounded text-[10px] bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>

                      <div className="mt-3 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenDocked(panel.id)}
                          className="px-2.5 py-1 text-xs rounded-md bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 hover:opacity-90"
                        >
                          {isOpen ? "Focus Docked" : "Open Docked"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenFloating(panel.id)}
                          className="px-2.5 py-1 text-xs rounded-md border border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700/60"
                        >
                          {isFloating ? "Focus Floating" : "Open Floating"}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
