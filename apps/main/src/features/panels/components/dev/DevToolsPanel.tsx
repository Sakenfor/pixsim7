/**
 * Dev Tools Panel
 *
 * Main navigation and discovery panel for developer tools.
 * Shows all registered dev tools grouped by category with search/filter.
 */

import type { DevToolDefinition, DevToolCategory } from "@pixsim7/shared.devtools";
import { useState, useMemo } from "react";

import { useDevToolContext } from "@lib/dev/devtools/devToolContext";
import { Icon, IconBadge, type IconName } from "@lib/icons";
import { devToolSelectors } from "@lib/plugins/catalogSelectors";

import { useWorkspaceStore } from "@features/workspace";


const CATEGORY_LABELS: Record<DevToolCategory, string> = {
  session: "Session & World",
  plugins: "Plugin Development",
  graph: "Architecture & Graphs",
  generation: "Content Generation",
  world: "World Tools",
  debug: "Debug & Diagnostics",
  misc: "Miscellaneous",
};

const CATEGORY_ORDER: DevToolCategory[] = [
  "session",
  "generation",
  "plugins",
  "graph",
  "debug",
  "world",
  "misc",
];

export function DevToolsPanel() {
  const [searchQuery, setSearchQuery] = useState("");
  const [showExperimental, setShowExperimental] = useState(false);
  const openFloatingPanel = useWorkspaceStore((s) => s.openFloatingPanel);
  const { addRecentTool, recentTools, clearRecentTools } = useDevToolContext();

  const allTools = useMemo(() => devToolSelectors.getAll(), []);

  const filteredTools = useMemo(() => {
    let tools = allTools;

    // Filter by search query
    if (searchQuery.trim()) {
      tools = devToolSelectors.search(searchQuery);
    }

    // Filter experimental tools unless showExperimental is enabled
    if (!showExperimental) {
      tools = tools.filter((tool) => tool.safeForNonDev !== false);
    }

    return tools;
  }, [allTools, searchQuery, showExperimental]);

  // Group tools by category
  const toolsByCategory = useMemo(() => {
    const grouped = new Map<DevToolCategory | "misc", DevToolDefinition[]>();

    filteredTools.forEach((tool) => {
      const category = tool.category ?? "misc";
      if (!grouped.has(category)) {
        grouped.set(category, []);
      }
      grouped.get(category)!.push(tool);
    });

    return grouped;
  }, [filteredTools]);

  const handleOpenTool = (tool: DevToolDefinition) => {
    // Add to recent tools
    addRecentTool(tool.id);

    if (tool.routePath) {
      // Navigate to route
      window.location.href = tool.routePath;
    } else if (tool.panelComponent) {
      // Open as floating panel using a special dev-tool panel ID
      // The panel ID format is: dev-tool:<toolId>
      const panelId = `dev-tool:${tool.id}` as any;

      openFloatingPanel(panelId, {
        width: 800,
        height: 600,
        context: {
          toolId: tool.id,
          toolDefinition: tool,
        },
      });
    }
  };

  return (
    <div className="dev-tools-panel h-full flex flex-col bg-gray-900 text-gray-100">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <IconBadge name="wrench" size={18} variant="primary" />
          Dev Tools
        </h2>

        {/* Search */}
        <input
          type="text"
          placeholder="Search dev tools..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        {/* Show experimental toggle */}
        <label className="flex items-center gap-2 mt-3 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={showExperimental}
            onChange={(e) => setShowExperimental(e.target.checked)}
            className="w-4 h-4 rounded"
          />
          <span className="text-gray-400">Show experimental tools</span>
        </label>
      </div>

      {/* Tool list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Recent Tools */}
        {recentTools.length > 0 && !searchQuery && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Recently Used
              </h3>
              <button
                onClick={clearRecentTools}
                className="text-xs text-gray-500 hover:text-gray-300"
              >
                Clear
              </button>
            </div>
            <div className="space-y-2">
              {recentTools.map((toolId) => {
                const tool = devToolSelectors.get(toolId);
                if (!tool) return null;
                return (
                  <DevToolCard
                    key={toolId}
                    tool={tool}
                    onOpen={handleOpenTool}
                  />
                );
              })}
            </div>
          </div>
        )}

        {CATEGORY_ORDER.map((category) => {
          const tools = toolsByCategory.get(category);
          if (!tools || tools.length === 0) return null;

          return (
            <div key={category} className="space-y-2">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                {CATEGORY_LABELS[category] ?? category}
              </h3>
              <div className="space-y-2">
                {tools.map((tool) => (
                  <DevToolCard
                    key={tool.id}
                    tool={tool}
                    onOpen={handleOpenTool}
                  />
                ))}
              </div>
            </div>
          );
        })}

        {/* Misc category (if any) */}
        {(() => {
          const miscTools = toolsByCategory.get("misc");
          if (!miscTools || miscTools.length === 0) return null;
          return (
            <div key="misc" className="space-y-2">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                {CATEGORY_LABELS.misc}
              </h3>
              <div className="space-y-2">
                {miscTools.map((tool) => (
                  <DevToolCard
                    key={tool.id}
                    tool={tool}
                    onOpen={handleOpenTool}
                  />
                ))}
              </div>
            </div>
          );
        })()}

        {/* Empty state */}
        {filteredTools.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <p>No dev tools found.</p>
            {searchQuery && (
              <p className="text-sm mt-2">
                Try a different search query or clear the search.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface DevToolCardProps {
  tool: DevToolDefinition;
  onOpen: (tool: DevToolDefinition) => void;
}

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

function DevToolCard({ tool, onOpen }: DevToolCardProps) {
  const hasAction = !!(tool.routePath || tool.panelComponent);
  const variant = CATEGORY_VARIANTS[tool.category ?? "misc"] ?? "primary";

  return (
    <button
      onClick={() => onOpen(tool)}
      disabled={!hasAction}
      className={`
        w-full text-left p-3 rounded-lg border border-gray-700 bg-gray-800
        transition-all group
        ${hasAction ? "hover:bg-gray-700/50 hover:border-gray-600 cursor-pointer" : "opacity-50 cursor-not-allowed"}
      `}
    >
      <div className="flex items-start gap-3">
        {/* Icon with badge */}
        {tool.icon && (
          <IconBadge
            name={tool.icon as IconName}
            size={18}
            variant={variant}
            className="flex-shrink-0"
          />
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm text-gray-100">{tool.label}</div>
          {tool.description && (
            <div className="text-xs text-gray-400 mt-1 line-clamp-2">
              {tool.description}
            </div>
          )}

          {/* Tags */}
          {tool.tags && tool.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {tool.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="px-1.5 py-0.5 bg-gray-700/50 text-gray-400 rounded text-[10px]"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Action indicator */}
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
