/**
 * Gizmo Surfaces Panel
 *
 * Dev tools panel for managing gizmo surfaces - enabling/disabling them
 * per context and viewing their status.
 */

import { Panel, Button, Badge } from "@pixsim7/shared.ui";
import { useMemo, useState } from "react";

import {
  gizmoSurfaceRegistry,
  type GizmoSurfaceDefinition,
  type GizmoSurfaceCategory,
  type GizmoSurfaceContext,
} from "@features/gizmos";
import { useGizmoSurfaceStore } from "@features/gizmos/stores/gizmoSurfaceStore";

interface GizmoSurfacesPanelProps {
  /** Optional callback when panel is closed */
  onClose?: () => void;
}

/**
 * Panel for managing gizmo surfaces in dev tools
 */
export function GizmoSurfacesPanel({ onClose }: GizmoSurfacesPanelProps) {
  const [selectedCategory, setSelectedCategory] = useState<
    GizmoSurfaceCategory | "all"
  >("all");
  const [selectedContext, setSelectedContext] = useState<
    GizmoSurfaceContext | "all"
  >("all");

  // Get all surfaces
  const allSurfaces = useMemo(() => {
    return gizmoSurfaceRegistry.getSortedByPriority();
  }, []);

  // Filter surfaces based on selected category and context
  const filteredSurfaces = useMemo(() => {
    let surfaces = allSurfaces;

    if (selectedCategory !== "all") {
      surfaces = surfaces.filter((s) => s.category === selectedCategory);
    }

    if (selectedContext !== "all") {
      surfaces = surfaces.filter((s) =>
        s.supportsContexts?.includes(selectedContext),
      );
    }

    return surfaces;
  }, [allSurfaces, selectedCategory, selectedContext]);

  // Count surfaces by category
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: allSurfaces.length,
      scene: 0,
      world: 0,
      npc: 0,
      debug: 0,
      custom: 0,
    };

    allSurfaces.forEach((surface) => {
      const category = surface.category || "custom";
      counts[category] = (counts[category] || 0) + 1;
    });

    return counts;
  }, [allSurfaces]);

  return (
    <Panel className="space-y-4" padded={true}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-neutral-800 dark:text-neutral-200">
            Gizmo Surfaces
          </h2>
          <p className="text-xs text-neutral-600 dark:text-neutral-400">
            Manage gizmo overlays and debug dashboards
          </p>
        </div>
        {onClose && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="space-y-2">
        {/* Category Filter */}
        <div>
          <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1 block">
            Category
          </label>
          <div className="flex flex-wrap gap-1">
            <Button
              size="xs"
              variant={selectedCategory === "all" ? "primary" : "secondary"}
              onClick={() => setSelectedCategory("all")}
            >
              All ({categoryCounts.all})
            </Button>
            {(["scene", "world", "npc", "debug", "custom"] as const).map(
              (category) => (
                <Button
                  key={category}
                  size="xs"
                  variant={
                    selectedCategory === category ? "primary" : "secondary"
                  }
                  onClick={() => setSelectedCategory(category)}
                  disabled={categoryCounts[category] === 0}
                >
                  {category.charAt(0).toUpperCase() + category.slice(1)} (
                  {categoryCounts[category]})
                </Button>
              ),
            )}
          </div>
        </div>

        {/* Context Filter */}
        <div>
          <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1 block">
            Context
          </label>
          <div className="flex flex-wrap gap-1">
            <Button
              size="xs"
              variant={selectedContext === "all" ? "primary" : "secondary"}
              onClick={() => setSelectedContext("all")}
            >
              All Contexts
            </Button>
            {(
              [
                "scene-editor",
                "game-2d",
                "game-3d",
                "playground",
                "workspace",
              ] as GizmoSurfaceContext[]
            ).map((context) => (
              <Button
                key={context}
                size="xs"
                variant={selectedContext === context ? "primary" : "secondary"}
                onClick={() => setSelectedContext(context)}
              >
                {context}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Surfaces List */}
      <div className="space-y-2">
        <div className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
          Surfaces ({filteredSurfaces.length})
        </div>

        {filteredSurfaces.length === 0 ? (
          <div className="text-sm text-neutral-500 dark:text-neutral-400 p-4 text-center">
            No gizmo surfaces match the selected filters
          </div>
        ) : (
          <div className="space-y-2">
            {filteredSurfaces.map((surface) => (
              <SurfaceCard key={surface.id} surface={surface} />
            ))}
          </div>
        )}
      </div>

      {/* Stats Footer */}
      <div className="pt-4 border-t border-neutral-200 dark:border-neutral-700">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="text-neutral-600 dark:text-neutral-400">
            Total Surfaces:{" "}
            <span className="font-semibold">{allSurfaces.length}</span>
          </div>
          <div className="text-neutral-600 dark:text-neutral-400">
            Shown:{" "}
            <span className="font-semibold">{filteredSurfaces.length}</span>
          </div>
        </div>
      </div>
    </Panel>
  );
}

/**
 * Card for individual gizmo surface
 */
function SurfaceCard({ surface }: { surface: GizmoSurfaceDefinition }) {
  const [expanded, setExpanded] = useState(false);

  const getCategoryVariant = (category?: GizmoSurfaceCategory) => {
    switch (category) {
      case "scene":
        return "info";
      case "world":
        return "success";
      case "npc":
        return "warning";
      case "debug":
        return "error";
      default:
        return "secondary";
    }
  };

  const hasPanel = !!surface.panelComponent;
  const hasOverlay = !!surface.overlayComponent;
  const hasHud = !!surface.hudComponent;

  return (
    <div className="border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden">
      {/* Surface Header */}
      <div
        className="p-3 bg-neutral-50 dark:bg-neutral-800/50 cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              {surface.icon && <span className="text-lg">{surface.icon}</span>}
              <div>
                <div className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
                  {surface.label}
                </div>
                <div className="text-xs text-neutral-600 dark:text-neutral-400">
                  {surface.id}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {surface.category && (
              <Badge variant={getCategoryVariant(surface.category)} size="sm">
                {surface.category}
              </Badge>
            )}
            <span className="text-xs text-neutral-500">
              {expanded ? "▼" : "▶"}
            </span>
          </div>
        </div>

        {/* Description (always visible) */}
        {surface.description && (
          <div className="text-xs text-neutral-600 dark:text-neutral-400 mt-2">
            {surface.description}
          </div>
        )}
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="p-3 space-y-3 bg-white dark:bg-neutral-900">
          {/* Component Types */}
          <div>
            <div className="text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              Components
            </div>
            <div className="flex gap-1">
              {hasPanel && (
                <Badge variant="info" size="sm">
                  Panel
                </Badge>
              )}
              {hasOverlay && (
                <Badge variant="success" size="sm">
                  Overlay
                </Badge>
              )}
              {hasHud && (
                <Badge variant="warning" size="sm">
                  HUD
                </Badge>
              )}
              {!hasPanel && !hasOverlay && !hasHud && (
                <span className="text-xs text-neutral-500">None</span>
              )}
            </div>
          </div>

          {/* Supported Contexts */}
          {surface.supportsContexts && surface.supportsContexts.length > 0 && (
            <div>
              <div className="text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Supported Contexts
              </div>
              <div className="flex flex-wrap gap-1">
                {surface.supportsContexts.map((context) => (
                  <Badge key={context} variant="secondary" size="sm">
                    {context}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Tags */}
          {surface.tags && surface.tags.length > 0 && (
            <div>
              <div className="text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Tags
              </div>
              <div className="flex flex-wrap gap-1">
                {surface.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" size="sm">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Priority */}
          {surface.priority !== undefined && (
            <div className="text-xs text-neutral-600 dark:text-neutral-400">
              Priority:{" "}
              <span className="font-semibold">{surface.priority}</span>
            </div>
          )}

          {/* Requirements */}
          {surface.requires && (
            <div>
              <div className="text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Requirements
              </div>
              <div className="text-xs text-neutral-600 dark:text-neutral-400">
                {surface.requires.features && (
                  <div>Features: {surface.requires.features.join(", ")}</div>
                )}
                {surface.requires.permissions && (
                  <div>
                    Permissions: {surface.requires.permissions.join(", ")}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Enable/Disable Toggles per Context */}
          {surface.supportsContexts && surface.supportsContexts.length > 0 && (
            <div className="pt-2 border-t border-neutral-200 dark:border-neutral-700">
              <div className="text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                Enable/Disable per Context
              </div>
              <div className="space-y-1">
                {surface.supportsContexts.map((context) => (
                  <ContextToggle
                    key={context}
                    surfaceId={surface.id}
                    context={context}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Toggle control for enabling/disabling a surface in a specific context
 */
function ContextToggle({
  surfaceId,
  context,
}: {
  surfaceId: string;
  context: GizmoSurfaceContext;
}) {
  const isEnabled = useGizmoSurfaceStore((state) =>
    state.isSurfaceEnabled(context, surfaceId),
  );
  const toggleSurface = useGizmoSurfaceStore((state) => state.toggleSurface);

  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs text-neutral-600 dark:text-neutral-400">
        {context}
      </span>
      <Button
        size="xs"
        variant={isEnabled ? "primary" : "secondary"}
        onClick={() => toggleSurface(context, surfaceId)}
      >
        {isEnabled ? "✓ Enabled" : "Disabled"}
      </Button>
    </div>
  );
}
