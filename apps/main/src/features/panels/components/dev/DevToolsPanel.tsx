/**
 * Dev Tools Panel
 *
 * Main navigation and discovery panel for developer tools.
 * Left sidebar for category navigation, content area for tool cards.
 */

import type { DevToolDefinition, DevToolCategory } from "@pixsim7/shared.devtools.core";
import { Badge, Checkbox, EmptyState, SearchInput, SectionHeader, SidebarContentLayout, type SidebarContentLayoutSection, useSidebarNav, useTheme } from "@pixsim7/shared.ui";
import { useState, useMemo, useEffect } from "react";

import { useDevToolContext } from "@lib/dev/devtools/devToolContext";
import { Icon, IconBadge, type IconName } from "@lib/icons";
import { devToolSelectors, panelSelectors } from "@lib/plugins/catalogSelectors";

import type { PanelDefinition } from "@features/panels";
import { openFloatingWorkspacePanel, useWorkspaceStore } from "@features/workspace";



/** Marker on dev-tool entries that originated from a PanelDefinition. */
type DevToolEntry = DevToolDefinition & { __panelId?: string };

function panelToDevToolEntry(panel: PanelDefinition): DevToolEntry {
  const metadata = (panel as { metadata?: { devTool?: { category?: DevToolCategory; safeForNonDev?: boolean } | false } }).metadata;
  const devToolConfig = metadata?.devTool && metadata.devTool !== false ? metadata.devTool : {};
  return {
    id: panel.id as any,
    label: panel.title,
    description: panel.description,
    icon: panel.icon,
    category: devToolConfig.category ?? 'misc',
    panelComponent: panel.component,
    tags: panel.tags,
    safeForNonDev: devToolConfig.safeForNonDev,
    updatedAt: (panel as { updatedAt?: string }).updatedAt,
    changeNote: (panel as { changeNote?: string }).changeNote,
    featureHighlights: (panel as { featureHighlights?: string[] }).featureHighlights,
    __panelId: panel.id,
  } as DevToolEntry;
}

function collectDevToolEntries(): DevToolEntry[] {
  const legacy = devToolSelectors.getAll();
  const byId = new Map<string, DevToolEntry>();
  for (const tool of legacy) {
    byId.set(tool.id, tool as DevToolEntry);
  }
  for (const panel of panelSelectors.getAll()) {
    if (panel.category !== 'dev') continue;
    if (panel.isInternal) continue;
    if (panel.id === 'dev-tools') continue;
    const metadata = (panel as { metadata?: { devTool?: unknown } }).metadata;
    if (metadata?.devTool === false) continue;
    if (byId.has(panel.id)) continue;
    byId.set(panel.id, panelToDevToolEntry(panel));
  }
  return Array.from(byId.values());
}


const CATEGORY_META: Record<DevToolCategory, { label: string; icon: IconName }> = {
  session: { label: "Session & World", icon: "globe" },
  generation: { label: "Generation", icon: "image" },
  prompts: { label: "Prompts & Packs", icon: "fileText" },
  plugins: { label: "Plugins", icon: "plug" },
  graph: { label: "Architecture", icon: "graph" },
  debug: { label: "Debug", icon: "wrench" },
  world: { label: "World Tools", icon: "map" },
  misc: { label: "Misc", icon: "grid" },
};

const CATEGORY_ORDER: DevToolCategory[] = [
  "session",
  "generation",
  "prompts",
  "plugins",
  "graph",
  "debug",
  "world",
  "misc",
];

/** Map category to icon variant for visual distinction */
const CATEGORY_VARIANTS: Record<
  DevToolCategory | "misc",
  "primary" | "secondary" | "success" | "warning" | "info" | "error"
> = {
  session: "info",
  generation: "success",
  plugins: "secondary",
  graph: "primary",
  world: "warning",
  debug: "error",
  prompts: "success",
  misc: "muted" as any,
};

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

function sortToolsByRecency(tools: DevToolEntry[]): DevToolEntry[] {
  return [...tools].sort((a, b) => {
    const tsDiff = parseUpdatedAt(b.updatedAt) - parseUpdatedAt(a.updatedAt);
    if (tsDiff !== 0) return tsDiff;
    return a.label.localeCompare(b.label);
  });
}

type NavId = DevToolCategory | "recent" | "all";

export function DevToolsPanel() {
  const [searchQuery, setSearchQuery] = useState("");
  const [showExperimental, setShowExperimental] = useState(false);
  const openFloatingPanel = useWorkspaceStore((s) => s.openFloatingPanel);
  const { addRecentTool, recentTools, clearRecentTools } = useDevToolContext();
  const { theme: variant } = useTheme();

  const [allTools, setAllTools] = useState<DevToolEntry[]>(() => sortToolsByRecency(collectDevToolEntries()));

  useEffect(() => {
    const refresh = () => setAllTools(sortToolsByRecency(collectDevToolEntries()));
    const unsubDevTools = devToolSelectors.subscribe(refresh);
    const unsubPanels = panelSelectors.subscribe(refresh);
    return () => {
      unsubDevTools();
      unsubPanels();
    };
  }, []);

  // Build visible tools (respecting experimental toggle)
  const visibleTools = useMemo(() => {
    if (showExperimental) return allTools;
    return allTools.filter((tool) => tool.safeForNonDev !== false);
  }, [allTools, showExperimental]);

  // Count tools per category for sidebar badges
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const tool of visibleTools) {
      const cat = tool.category ?? "misc";
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
    return counts;
  }, [visibleTools]);

  // Build sidebar sections from categories that have tools
  const sections = useMemo<SidebarContentLayoutSection[]>(() => {
    const result: SidebarContentLayoutSection[] = [];

    if (recentTools.length > 0) {
      result.push({
        id: "recent",
        label: "Recent",
        icon: <Icon name="clock" size={13} />,
      });
    }

    const totalVisible = visibleTools.length;
    if (totalVisible > 0) {
      result.push({
        id: "all",
        label: `All (${totalVisible})`,
        icon: <Icon name="grid" size={13} />,
      });
    }

    for (const cat of CATEGORY_ORDER) {
      const count = categoryCounts.get(cat) ?? 0;
      if (count === 0) continue;
      const meta = CATEGORY_META[cat];
      result.push({
        id: cat,
        label: `${meta.label} (${count})`,
        icon: <Icon name={meta.icon} size={13} />,
      });
    }

    return result;
  }, [recentTools.length, visibleTools.length, categoryCounts]);

  const nav = useSidebarNav<NavId, never>({
    sections,
    initial: recentTools.length > 0 ? "recent" : "all",
    storageKey: "dev-tools:nav",
  });

  // Get tools for the active category (or recent tools)
  const activeTools = useMemo(() => {
    if (nav.activeId === "recent") {
      const byId = new Map(allTools.map((t) => [t.id, t] as const));
      return recentTools
        .map((id) => byId.get(id))
        .filter((t): t is DevToolEntry => !!t);
    }

    const categoryTools = nav.activeId === "all"
      ? visibleTools
      : visibleTools.filter((tool) => (tool.category ?? "misc") === nav.activeId);

    if (!searchQuery.trim()) return sortToolsByRecency(categoryTools);

    const lq = searchQuery.toLowerCase();
    return sortToolsByRecency(
      categoryTools.filter(
        (tool) =>
          tool.label.toLowerCase().includes(lq) ||
          tool.description?.toLowerCase().includes(lq) ||
          tool.tags?.some((t) => t.toLowerCase().includes(lq))
      )
    );
  }, [nav.activeId, visibleTools, recentTools, searchQuery]);

  const handleOpenTool = (tool: DevToolEntry) => {
    addRecentTool(tool.id);

    if (tool.__panelId) {
      openFloatingWorkspacePanel(tool.__panelId);
      return;
    }

    if (tool.panelComponent) {
      const panelId = `dev-tool:${tool.id}` as any;
      openFloatingPanel(panelId, {
        width: 800,
        height: 600,
        context: { toolId: tool.id, toolDefinition: tool },
      });
    } else if (tool.routePath) {
      window.location.href = tool.routePath;
    }
  };

  const activeCategory = nav.activeId as NavId;
  const activeMeta = activeCategory !== "recent" && activeCategory !== "all"
    ? CATEGORY_META[activeCategory]
    : null;

  return (
    <SidebarContentLayout
      sections={sections}
      activeSectionId={nav.activeSectionId}
      onSelectSection={nav.selectSection}
      sidebarWidth="w-40"
      variant={variant}
      collapsible
      expandedWidth={160}
      persistKey="dev-tools-sidebar"
      className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
      contentClassName="overflow-y-auto"
    >
      {/* Content header */}
      <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 p-3 space-y-2">
        <SectionHeader
          trailing={activeCategory === "recent" ? (
            <button
              onClick={clearRecentTools}
              className="text-xs text-gray-500 hover:text-gray-300"
            >
              Clear
            </button>
          ) : undefined}
        >
          {activeMeta && <Icon name={activeMeta.icon} size={14} className="inline-block mr-1 align-middle" />}
          {activeCategory === "recent" ? "Recently Used" : activeCategory === "all" ? "All Tools" : activeMeta?.label ?? activeCategory}
        </SectionHeader>

        <div className="flex items-center gap-2">
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Filter..."
            size="sm"
          />
          <label className="flex items-center gap-1 text-[11px] text-gray-500 cursor-pointer whitespace-nowrap" title="Show experimental tools">
            <Checkbox
              checked={showExperimental}
              onChange={(e) => setShowExperimental(e.target.checked)}
              size="sm"
            />
            Exp
          </label>
        </div>
      </div>

      {/* Tool cards */}
      <div className="p-3 space-y-2">
        {activeTools.map((tool) => (
          <DevToolCard key={tool.id} tool={tool} onOpen={handleOpenTool} />
        ))}

        {activeTools.length === 0 && (
          <EmptyState
            message={searchQuery ? "No matching tools" : activeCategory === "all" ? "No tools available" : "No tools in this category"}
            size="sm"
          />
        )}
      </div>
    </SidebarContentLayout>
  );
}

// ---------------------------------------------------------------------------
// DevToolCard
// ---------------------------------------------------------------------------

interface DevToolCardProps {
  tool: DevToolEntry;
  onOpen: (tool: DevToolEntry) => void;
}

function DevToolCard({ tool, onOpen }: DevToolCardProps) {
  const hasAction = !!(tool.routePath || tool.panelComponent || tool.__panelId);
  const variant = CATEGORY_VARIANTS[tool.category ?? "misc"] ?? "primary";
  const updatedAtLabel = formatUpdatedAt(tool.updatedAt);
  const highlights = tool.featureHighlights ?? [];

  return (
    <button
      onClick={() => onOpen(tool)}
      disabled={!hasAction}
      className={`
        w-full text-left p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800
        transition-all group
        ${hasAction ? "hover:bg-gray-100 dark:hover:bg-gray-700/50 hover:border-gray-300 dark:hover:border-gray-600 cursor-pointer" : "opacity-50 cursor-not-allowed"}
      `}
    >
      <div className="flex items-start gap-3">
        {tool.icon && (
          <IconBadge
            name={tool.icon as IconName}
            size={18}
            variant={variant}
            className="flex-shrink-0"
          />
        )}

        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm text-gray-900 dark:text-gray-100">{tool.label}</div>
          {tool.description && (
            <div className="text-xs text-gray-400 mt-1 line-clamp-2">
              {tool.description}
            </div>
          )}

          {tool.changeNote && (
            <div className="text-[11px] text-blue-300/90 mt-2 line-clamp-1">
              {tool.changeNote}
            </div>
          )}

          {(updatedAtLabel || highlights.length > 0 || (tool.tags && tool.tags.length > 0)) && (
            <div className="flex flex-wrap gap-1 mt-2">
              {updatedAtLabel && (
                <Badge color="blue" className="text-[10px]">Updated {updatedAtLabel}</Badge>
              )}
              {highlights.slice(0, 2).map((item) => (
                <Badge key={item} color="green" className="text-[10px]">
                  {item}
                </Badge>
              ))}
              {highlights.length > 2 && (
                <Badge color="green" className="text-[10px]">
                  +{highlights.length - 2} more
                </Badge>
              )}
              {(tool.tags ?? []).slice(0, 3).map((tag) => (
                <Badge key={tag} color="gray" className="text-[10px]">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {hasAction && (
          <div className="flex-shrink-0 text-gray-600 group-hover:text-gray-400 transition-colors">
            <Icon
              name={tool.routePath ? "chevronRight" : "externalLink"}
              size={16}
            />
          </div>
        )}
      </div>
    </button>
  );
}
