import dagre from "@dagrejs/dagre";
import React, { useMemo, useState, useCallback } from "react";
import ReactFlow, {
  type Node,
  type Edge,
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  useNodesState,
  useEdgesState,
  type NodeTypes,
} from "reactflow";

import { Icon } from "@lib/icons";


import "reactflow/dist/style.css";
import { type FeatureCapability } from "@lib/capabilities";
import type { UnifiedPluginDescriptor, UnifiedPluginFamily } from "@lib/plugins/descriptor";

import type { ArchitectureLink } from "@pixsim7/shared.api.model";

interface DependencyGraphPanelProps {
  features: FeatureCapability[];
  plugins: UnifiedPluginDescriptor[];
  backendLinks?: ArchitectureLink[];
}

const NODE_WIDTH = 200;
const NODE_HEIGHT = 70;
const GROUP_PADDING = 16;
const GROUP_LABEL_HEIGHT = 28;

// ============================================================================
// Family → Feature mapping (derived from family, can't be forgotten)
// ============================================================================

/**
 * Canonical mapping from plugin family to the features it naturally
 * consumes and provides.  This is the PRIMARY source for graph edges.
 *
 * `family` is required on every plugin, so every plugin gets edges
 * automatically — no per-plugin opt-in needed.
 *
 * Per-plugin `consumesFeatures`/`providesFeatures` are merged on top
 * as overrides for plugins with non-standard relationships.
 */
const FAMILY_FEATURE_MAP: Record<UnifiedPluginFamily, {
  consumes: string[];
  provides: string[];
}> = {
  "helper":          { consumes: ["game"],              provides: [] },
  "interaction":     { consumes: ["game"],              provides: [] },
  "node-type":       { consumes: ["graph", "game"],     provides: ["node-types"] },
  "renderer":        { consumes: ["graph"],             provides: ["rendering"] },
  "world-tool":      { consumes: ["game", "workspace"], provides: ["world-tools"] },
  "gallery-tool":    { consumes: ["assets"],            provides: [] },
  "brain-tool":      { consumes: ["game"],              provides: ["brain-tools"] },
  "gallery-surface": { consumes: ["assets"],            provides: ["gallery-surfaces"] },
  "generation-ui":   { consumes: ["generation"],        provides: ["generation-ui"] },
  "graph-editor":    { consumes: ["graph"],             provides: ["graph-editing"] },
  "dev-tool":        { consumes: ["workspace"],         provides: ["dev-tools"] },
  "workspace-panel": { consumes: ["workspace"],         provides: ["workspace-panels"] },
  "dock-widget":     { consumes: ["workspace"],         provides: ["dock-widgets"] },
  "gizmo-surface":   { consumes: ["workspace"],         provides: ["gizmo-surfaces"] },
  "scene-view":      { consumes: ["workspace"],         provides: ["ui-overlay", "scene-view"] },
  "control-center":  { consumes: ["assets", "workspace", "generation"], provides: ["ui-overlay", "control-center"] },
  "ui-plugin":       { consumes: ["workspace"],         provides: [] },
  "overlay-widget":  { consumes: ["workspace"],         provides: ["ui-overlay"] },
};

/** Prefer explicit plugin dependencies; fall back to family defaults when absent. */
function resolvePluginFeaturesInferred(plugin: UnifiedPluginDescriptor) {
  const explicitConsumes = plugin.consumesFeatures ?? [];
  const explicitProvides = plugin.providesFeatures ?? [];
  if (explicitConsumes.length > 0 || explicitProvides.length > 0) {
    return {
      consumes: [...new Set(explicitConsumes)],
      provides: [...new Set(explicitProvides)],
      unknown: [],
    };
  }

  const familyDefaults = FAMILY_FEATURE_MAP[plugin.family] ?? { consumes: [], provides: [] };
  const consumes = new Set(familyDefaults.consumes);
  const provides = new Set(familyDefaults.provides);
  return { consumes: [...consumes], provides: [...provides], unknown: [] };
}

type PluginFeatureResolution = { consumes: string[]; provides: string[]; unknown: string[] };
type PluginFeatureResolver = (plugin: UnifiedPluginDescriptor) => PluginFeatureResolution;
type LinkDirection = "consumes" | "provides" | "unknown";

function normalizeDirection(link: ArchitectureLink): LinkDirection {
  if (link.direction === "consumes" || link.direction === "provides" || link.direction === "unknown") {
    return link.direction;
  }
  return "unknown";
}

function mergeDirection(existing: LinkDirection, incoming: LinkDirection): LinkDirection {
  if (existing === incoming) return existing;
  return "unknown";
}

function buildBackendFeatureLinkMap(links: ArchitectureLink[]): Map<string, Map<string, LinkDirection>> {
  const byPlugin = new Map<string, Map<string, LinkDirection>>();

  for (const link of links) {
    if (link.kind !== "plugin_to_feature") continue;
    if (!link.from.startsWith("plugin:")) continue;
    if (!link.to.startsWith("frontend:")) continue;

    const pluginId = link.from.slice("plugin:".length);
    const featureId = link.to.slice("frontend:".length);
    if (!pluginId || !featureId) continue;

    if (!byPlugin.has(pluginId)) {
      byPlugin.set(pluginId, new Map<string, LinkDirection>());
    }

    const direction = normalizeDirection(link);
    const featureDirectionMap = byPlugin.get(pluginId)!;
    const existingDirection = featureDirectionMap.get(featureId);
    if (!existingDirection) {
      featureDirectionMap.set(featureId, direction);
    } else {
      featureDirectionMap.set(featureId, mergeDirection(existingDirection, direction));
    }
  }

  return byPlugin;
}

function resolvePluginFeaturesFromBackendLinks(
  plugin: UnifiedPluginDescriptor,
  linksByPluginId: Map<string, Map<string, LinkDirection>>,
): PluginFeatureResolution {
  const explicitConsumes = new Set(plugin.consumesFeatures ?? []);
  const explicitProvides = new Set(plugin.providesFeatures ?? []);
  const linkedFeatures = linksByPluginId.get(plugin.id) ?? new Map<string, LinkDirection>();

  if (linkedFeatures.size === 0) {
    return {
      consumes: [...explicitConsumes],
      provides: [...explicitProvides],
      unknown: [],
    };
  }

  const consumes = new Set<string>();
  const provides = new Set<string>();
  const unknown = new Set<string>();

  for (const [featureId, direction] of linkedFeatures.entries()) {
    if (direction === "consumes") {
      consumes.add(featureId);
      continue;
    }
    if (direction === "provides") {
      provides.add(featureId);
      continue;
    }

    const hasExplicitConsume = explicitConsumes.has(featureId);
    const hasExplicitProvide = explicitProvides.has(featureId);
    if (hasExplicitConsume && !hasExplicitProvide) {
      consumes.add(featureId);
      continue;
    }
    if (hasExplicitProvide && !hasExplicitConsume) {
      provides.add(featureId);
      continue;
    }
    unknown.add(featureId);
  }

  for (const featureId of explicitConsumes) {
    if (provides.has(featureId)) {
      provides.delete(featureId);
      unknown.add(featureId);
      continue;
    }
    if (!unknown.has(featureId)) {
      consumes.add(featureId);
    }
  }

  for (const featureId of explicitProvides) {
    if (consumes.has(featureId)) {
      consumes.delete(featureId);
      unknown.add(featureId);
      continue;
    }
    if (!unknown.has(featureId)) {
      provides.add(featureId);
    }
  }

  return {
    consumes: [...consumes],
    provides: [...provides],
    unknown: [...unknown],
  };
}

// ============================================================================
// Group color palettes
// ============================================================================

const FEATURE_GROUP_STYLE = {
  bg: "rgba(59,130,246,0.06)",
  border: "rgba(59,130,246,0.25)",
  text: "#3b82f6",
};

const FAMILY_PALETTE: Record<string, { bg: string; border: string; text: string }> = {
  "world-tool":       { bg: "rgba(168,85,247,0.06)", border: "rgba(168,85,247,0.25)", text: "#a855f7" },
  "gallery-tool":     { bg: "rgba(217,70,239,0.06)", border: "rgba(217,70,239,0.25)", text: "#d946ef" },
  "brain-tool":       { bg: "rgba(139,92,246,0.06)", border: "rgba(139,92,246,0.25)", text: "#8b5cf6" },
  "interaction":      { bg: "rgba(249,115,22,0.06)", border: "rgba(249,115,22,0.25)", text: "#f97316" },
  "helper":           { bg: "rgba(34,197,94,0.06)",  border: "rgba(34,197,94,0.25)",  text: "#22c55e" },
  "gallery-surface":  { bg: "rgba(236,72,153,0.06)", border: "rgba(236,72,153,0.25)", text: "#ec4899" },
  "scene-view":       { bg: "rgba(14,165,233,0.06)", border: "rgba(14,165,233,0.25)", text: "#0ea5e9" },
  "ui-plugin":        { bg: "rgba(99,102,241,0.06)", border: "rgba(99,102,241,0.25)", text: "#6366f1" },
  "dev-tool":         { bg: "rgba(107,114,128,0.06)",border: "rgba(107,114,128,0.25)",text: "#6b7280" },
  "control-center":   { bg: "rgba(245,158,11,0.06)", border: "rgba(245,158,11,0.25)", text: "#f59e0b" },
  "workspace-panel":  { bg: "rgba(20,184,166,0.06)", border: "rgba(20,184,166,0.25)", text: "#14b8a6" },
  "dock-widget":      { bg: "rgba(244,63,94,0.06)",  border: "rgba(244,63,94,0.25)",  text: "#f43f5e" },
  "gizmo-surface":    { bg: "rgba(251,146,60,0.06)", border: "rgba(251,146,60,0.25)", text: "#fb923c" },
  "generation-ui":    { bg: "rgba(56,189,248,0.06)", border: "rgba(56,189,248,0.25)", text: "#38bdf8" },
  "node-type":        { bg: "rgba(74,222,128,0.06)", border: "rgba(74,222,128,0.25)", text: "#4ade80" },
  "renderer":         { bg: "rgba(192,132,252,0.06)",border: "rgba(192,132,252,0.25)",text: "#c084fc" },
  "graph-editor":     { bg: "rgba(45,212,191,0.06)", border: "rgba(45,212,191,0.25)", text: "#2dd4bf" },
};

function getFamilyStyle(family: string) {
  return FAMILY_PALETTE[family] ?? {
    bg: "rgba(139,92,246,0.06)",
    border: "rgba(139,92,246,0.25)",
    text: "#8b5cf6",
  };
}

function formatGroupLabel(key: string): string {
  return key.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ============================================================================
// Partition: connected vs orphan
// ============================================================================

interface PartitionResult {
  connectedFeatures: FeatureCapability[];
  connectedPlugins: UnifiedPluginDescriptor[];
  orphanFeatures: FeatureCapability[];
  orphanPlugins: UnifiedPluginDescriptor[];
}

function partitionByConnectivity(
  features: FeatureCapability[],
  plugins: UnifiedPluginDescriptor[],
  resolvePluginFeatures: PluginFeatureResolver,
): PartitionResult {
  const connectedFeatureIds = new Set<string>();
  const connectedPluginIndices = new Set<number>();
  const featureIdSet = new Set(features.map((f) => f.id));

  plugins.forEach((plugin, idx) => {
    const { consumes, provides, unknown } = resolvePluginFeatures(plugin);
    let hasEdge = false;
    for (const fId of consumes) {
      if (featureIdSet.has(fId)) { connectedFeatureIds.add(fId); hasEdge = true; }
    }
    for (const fId of provides) {
      if (featureIdSet.has(fId)) { connectedFeatureIds.add(fId); hasEdge = true; }
    }
    for (const fId of unknown) {
      if (featureIdSet.has(fId)) { connectedFeatureIds.add(fId); hasEdge = true; }
    }
    if (hasEdge) connectedPluginIndices.add(idx);
  });

  const connectedFeatures: FeatureCapability[] = [];
  const orphanFeatures: FeatureCapability[] = [];
  for (const f of features) {
    if (connectedFeatureIds.has(f.id)) connectedFeatures.push(f);
    else orphanFeatures.push(f);
  }

  const connectedPlugins: UnifiedPluginDescriptor[] = [];
  const orphanPlugins: UnifiedPluginDescriptor[] = [];
  plugins.forEach((p, idx) => {
    if (connectedPluginIndices.has(idx)) connectedPlugins.push(p);
    else orphanPlugins.push(p);
  });

  return { connectedFeatures, connectedPlugins, orphanFeatures, orphanPlugins };
}

// ============================================================================
// Layout
// ============================================================================

function buildGroupedGraph(
  features: FeatureCapability[],
  plugins: UnifiedPluginDescriptor[],
  resolvePluginFeatures: PluginFeatureResolver,
) {
  const g = new dagre.graphlib.Graph({ compound: true });
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: "LR",
    nodesep: 30,
    ranksep: 180,
    marginx: 40,
    marginy: 40,
  });

  // ---- group features by category ----
  const featuresByCategory = new Map<string, FeatureCapability[]>();
  for (const f of features) {
    const cat = f.category || "other";
    if (!featuresByCategory.has(cat)) featuresByCategory.set(cat, []);
    featuresByCategory.get(cat)!.push(f);
  }

  for (const cat of featuresByCategory.keys()) {
    g.setNode(`gf-${cat}`, {});
  }

  const featureNodes: Node[] = [];
  for (const feature of features) {
    const nodeId = `feature-${feature.id}`;
    const cat = feature.category || "other";
    g.setNode(nodeId, { width: NODE_WIDTH, height: NODE_HEIGHT });
    g.setParent(nodeId, `gf-${cat}`);
    featureNodes.push({
      id: nodeId,
      type: "featureNode",
      position: { x: 0, y: 0 },
      data: {
        label: feature.name,
        featureId: feature.id,
        icon: feature.icon,
        category: cat,
      },
    });
  }

  // ---- group plugins by family ----
  const pluginsByFamily = new Map<string, UnifiedPluginDescriptor[]>();
  for (const p of plugins) {
    if (!pluginsByFamily.has(p.family)) pluginsByFamily.set(p.family, []);
    pluginsByFamily.get(p.family)!.push(p);
  }

  for (const family of pluginsByFamily.keys()) {
    g.setNode(`gp-${family}`, {});
  }

  const pluginNodes: Node[] = [];
  const edges: Edge[] = [];
  // Dedupe edges at the dagre level (many plugins in the same family → same feature)
  const dagreEdgeSet = new Set<string>();

  for (const plugin of plugins) {
    const pluginId = `${plugin.family}-${plugin.id}`;
    const nodeId = `plugin-${pluginId}`;
    g.setNode(nodeId, { width: NODE_WIDTH, height: NODE_HEIGHT });
    g.setParent(nodeId, `gp-${plugin.family}`);

    pluginNodes.push({
      id: nodeId,
      type: "pluginNode",
      position: { x: 0, y: 0 },
      data: {
        label: plugin.name,
        pluginId: plugin.id,
        family: plugin.family,
        origin: plugin.origin,
        icon: plugin.icon,
      },
    });

    const { consumes, provides, unknown } = resolvePluginFeatures(plugin);

    for (const featureId of consumes) {
      if (!g.hasNode(`feature-${featureId}`)) continue;
      edges.push({
        id: `${pluginId}-consumes-${featureId}`,
        source: `plugin-${pluginId}`,
        target: `feature-${featureId}`,
        type: "smoothstep",
        animated: true,
        style: { stroke: "#8b5cf6", opacity: 0.6 },
      });
      const ek = `${nodeId}->feature-${featureId}`;
      if (!dagreEdgeSet.has(ek)) {
        dagreEdgeSet.add(ek);
        g.setEdge(nodeId, `feature-${featureId}`);
      }
    }

    for (const featureId of provides) {
      if (!g.hasNode(`feature-${featureId}`)) continue;
      edges.push({
        id: `${pluginId}-provides-${featureId}`,
        source: `plugin-${pluginId}`,
        target: `feature-${featureId}`,
        type: "smoothstep",
        style: { stroke: "#10b981", opacity: 0.6 },
      });
      const ek = `${nodeId}->feature-${featureId}`;
      if (!dagreEdgeSet.has(ek)) {
        dagreEdgeSet.add(ek);
        g.setEdge(nodeId, `feature-${featureId}`);
      }
    }

    for (const featureId of unknown) {
      if (!g.hasNode(`feature-${featureId}`)) continue;
      edges.push({
        id: `${pluginId}-relates-${featureId}`,
        source: `plugin-${pluginId}`,
        target: `feature-${featureId}`,
        type: "smoothstep",
        style: { stroke: "#f59e0b", opacity: 0.65, strokeDasharray: "4 3" },
      });
      const ek = `${nodeId}->feature-${featureId}`;
      if (!dagreEdgeSet.has(ek)) {
        dagreEdgeSet.add(ek);
        g.setEdge(nodeId, `feature-${featureId}`);
      }
    }
  }

  dagre.layout(g);

  // ---- position leaf nodes ----
  const allLeafNodes = [...featureNodes, ...pluginNodes].map((node) => {
    const pos = g.node(node.id);
    return {
      ...node,
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
    };
  });

  // ---- compute group bounding boxes ----
  const groupNodes: Node[] = [];

  for (const [cat, catFeatures] of featuresByCategory) {
    const childIds = catFeatures.map((f) => `feature-${f.id}`);
    const positions = childIds.map((id) => g.node(id));
    if (positions.length === 0) continue;

    const minX = Math.min(...positions.map((p) => p.x - NODE_WIDTH / 2)) - GROUP_PADDING;
    const minY = Math.min(...positions.map((p) => p.y - NODE_HEIGHT / 2)) - GROUP_PADDING - GROUP_LABEL_HEIGHT;
    const maxX = Math.max(...positions.map((p) => p.x + NODE_WIDTH / 2)) + GROUP_PADDING;
    const maxY = Math.max(...positions.map((p) => p.y + NODE_HEIGHT / 2)) + GROUP_PADDING;

    groupNodes.push({
      id: `gf-${cat}`,
      type: "groupNode",
      position: { x: minX, y: minY },
      data: { label: formatGroupLabel(cat), variant: "feature" as const },
      style: { width: maxX - minX, height: maxY - minY },
      selectable: false,
      draggable: false,
      zIndex: -1,
    });
  }

  for (const [family, familyPlugins] of pluginsByFamily) {
    const childIds = familyPlugins.map((p) => `plugin-${p.family}-${p.id}`);
    const positions = childIds.map((id) => g.node(id));
    if (positions.length === 0) continue;

    const minX = Math.min(...positions.map((p) => p.x - NODE_WIDTH / 2)) - GROUP_PADDING;
    const minY = Math.min(...positions.map((p) => p.y - NODE_HEIGHT / 2)) - GROUP_PADDING - GROUP_LABEL_HEIGHT;
    const maxX = Math.max(...positions.map((p) => p.x + NODE_WIDTH / 2)) + GROUP_PADDING;
    const maxY = Math.max(...positions.map((p) => p.y + NODE_HEIGHT / 2)) + GROUP_PADDING;

    groupNodes.push({
      id: `gp-${family}`,
      type: "groupNode",
      position: { x: minX, y: minY },
      data: {
        label: `${formatGroupLabel(family)} (${familyPlugins.length})`,
        variant: "plugin" as const,
        family,
      },
      style: { width: maxX - minX, height: maxY - minY },
      selectable: false,
      draggable: false,
      zIndex: -1,
    });
  }

  return {
    nodes: [...groupNodes, ...allLeafNodes],
    edges,
    featureCategories: [...featuresByCategory.keys()],
    pluginFamilies: [...pluginsByFamily.keys()],
  };
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * DependencyGraphPanel - Visualizes relationships between features and plugins.
 *
 * Backend mode uses backend-authored `plugin_to_feature` links (with direction).
 * Inferred mode uses explicit plugin dependencies first, and only then
 * falls back to `FAMILY_FEATURE_MAP`.
 *
 * Plugins whose resolved edges don't match any existing feature are shown
 * in a collapsible orphan sidebar.
 */
export function DependencyGraphPanel({
  features,
  plugins,
  backendLinks = [],
}: DependencyGraphPanelProps) {
  const hasBackendLinks = useMemo(
    () => backendLinks.some((link) => link.kind === "plugin_to_feature"),
    [backendLinks],
  );
  const [edgeSource, setEdgeSource] = useState<"inferred" | "backend">(() => {
    if (typeof window === "undefined") return "inferred";
    const stored = window.localStorage.getItem("app-map:dep-graph-edge-source");
    return stored === "backend" ? "backend" : "inferred";
  });
  const [showOrphans, setShowOrphans] = useState(false);
  const [hiddenGroups, setHiddenGroups] = useState<Set<string>>(new Set());

  const backendLinksByPluginId = useMemo(
    () => buildBackendFeatureLinkMap(backendLinks),
    [backendLinks],
  );

  const resolvePluginFeatures = useCallback<PluginFeatureResolver>(
    (plugin) => {
      if (edgeSource === "backend" && hasBackendLinks) {
        return resolvePluginFeaturesFromBackendLinks(plugin, backendLinksByPluginId);
      }
      return resolvePluginFeaturesInferred(plugin);
    },
    [edgeSource, hasBackendLinks, backendLinksByPluginId],
  );

  React.useEffect(() => {
    if (edgeSource === "backend" && !hasBackendLinks) {
      setEdgeSource("inferred");
    }
  }, [edgeSource, hasBackendLinks]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("app-map:dep-graph-edge-source", edgeSource);
  }, [edgeSource]);

  const { connectedFeatures, connectedPlugins, orphanFeatures, orphanPlugins } = useMemo(
    () => partitionByConnectivity(features, plugins, resolvePluginFeatures),
    [features, plugins, resolvePluginFeatures],
  );

  const { allNodes, allEdges, featureCategories, pluginFamilies } = useMemo(() => {
    const result = buildGroupedGraph(connectedFeatures, connectedPlugins, resolvePluginFeatures);
    return {
      allNodes: result.nodes,
      allEdges: result.edges,
      featureCategories: result.featureCategories,
      pluginFamilies: result.pluginFamilies,
    };
  }, [connectedFeatures, connectedPlugins, resolvePluginFeatures]);

  // Filter out hidden groups and their children
  const { visibleNodes, visibleEdges } = useMemo(() => {
    if (hiddenGroups.size === 0) {
      return { visibleNodes: allNodes, visibleEdges: allEdges };
    }

    const hiddenNodeIds = new Set<string>();
    const vNodes = allNodes.filter((node) => {
      if (hiddenGroups.has(node.id)) {
        hiddenNodeIds.add(node.id);
        return false;
      }
      const isFeature = node.id.startsWith("feature-");
      const isPlugin = node.id.startsWith("plugin-");
      if (isFeature && node.data.category) {
        const groupId = `gf-${node.data.category}`;
        if (hiddenGroups.has(groupId)) {
          hiddenNodeIds.add(node.id);
          return false;
        }
      }
      if (isPlugin && node.data.family) {
        const groupId = `gp-${node.data.family}`;
        if (hiddenGroups.has(groupId)) {
          hiddenNodeIds.add(node.id);
          return false;
        }
      }
      return true;
    });

    const vEdges = allEdges.filter(
      (edge) => !hiddenNodeIds.has(edge.source) && !hiddenNodeIds.has(edge.target),
    );

    return { visibleNodes: vNodes, visibleEdges: vEdges };
  }, [allNodes, allEdges, hiddenGroups]);

  const [nodes, , onNodesChange] = useNodesState(visibleNodes);
  const [edges, , onEdgesChange] = useEdgesState(visibleEdges);

  React.useEffect(() => {
    onNodesChange(visibleNodes.map((n) => ({ type: "reset" as const, item: n })));
    onEdgesChange(visibleEdges.map((e) => ({ type: "reset" as const, item: e })));
  }, [visibleNodes, visibleEdges, onNodesChange, onEdgesChange]);

  const toggleGroup = useCallback((groupId: string) => {
    setHiddenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }, []);

  const nodeTypes = useMemo<NodeTypes>(
    () => ({
      featureNode: FeatureNode,
      pluginNode: PluginNode,
      groupNode: GroupNode,
    }),
    [],
  );

  // Group orphans by family for the sidebar
  const orphansByFamily = useMemo(() => {
    const grouped = new Map<string, UnifiedPluginDescriptor[]>();
    for (const p of orphanPlugins) {
      if (!grouped.has(p.family)) grouped.set(p.family, []);
      grouped.get(p.family)!.push(p);
    }
    return grouped;
  }, [orphanPlugins]);

  const orphanFeaturesByCategory = useMemo(() => {
    const grouped = new Map<string, FeatureCapability[]>();
    for (const f of orphanFeatures) {
      const cat = f.category || "other";
      if (!grouped.has(cat)) grouped.set(cat, []);
      grouped.get(cat)!.push(f);
    }
    return grouped;
  }, [orphanFeatures]);

  const totalOrphans = orphanFeatures.length + orphanPlugins.length;
  const hasConnected = connectedFeatures.length > 0 || connectedPlugins.length > 0;

  return (
    <div className="w-full h-full bg-neutral-50 dark:bg-neutral-900 flex flex-col">
      {/* Toolbar */}
      <div className="flex-none border-b border-neutral-200 dark:border-neutral-700 px-3 py-2 flex flex-wrap gap-x-3 gap-y-1.5 items-center text-xs overflow-x-auto">
        <div className="inline-flex rounded border border-neutral-300 dark:border-neutral-600 p-0.5">
          <button
            onClick={() => setEdgeSource("inferred")}
            className={`px-2 py-0.5 rounded ${
              edgeSource === "inferred"
                ? "bg-neutral-800 text-white dark:bg-neutral-100 dark:text-neutral-900"
                : "text-neutral-500 dark:text-neutral-400"
            }`}
          >
            Inferred
          </button>
          <button
            onClick={() => setEdgeSource("backend")}
            disabled={!hasBackendLinks}
            title={hasBackendLinks ? "Use backend-authored plugin links" : "Backend plugin links unavailable"}
            className={`px-2 py-0.5 rounded ${
              edgeSource === "backend"
                ? "bg-neutral-800 text-white dark:bg-neutral-100 dark:text-neutral-900"
                : "text-neutral-500 dark:text-neutral-400"
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            Backend
          </button>
        </div>

        <div className="h-4 border-l border-neutral-300 dark:border-neutral-600" />

        {featureCategories.length > 0 && (
          <>
            <span className="font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
              Features
            </span>
            {featureCategories.map((cat) => {
              const groupId = `gf-${cat}`;
              const hidden = hiddenGroups.has(groupId);
              return (
                <button
                  key={groupId}
                  onClick={() => toggleGroup(groupId)}
                  className={`px-2 py-0.5 rounded border transition-colors ${
                    hidden
                      ? "border-neutral-300 dark:border-neutral-600 text-neutral-400 dark:text-neutral-500 line-through"
                      : "border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20"
                  }`}
                >
                  {formatGroupLabel(cat)}
                </button>
              );
            })}
          </>
        )}

        {pluginFamilies.length > 0 && (
          <>
            <span className="font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide ml-1">
              Plugins
            </span>
            {pluginFamilies.map((family) => {
              const groupId = `gp-${family}`;
              const hidden = hiddenGroups.has(groupId);
              const style = getFamilyStyle(family);
              return (
                <button
                  key={groupId}
                  onClick={() => toggleGroup(groupId)}
                  className={`px-2 py-0.5 rounded border transition-colors ${
                    hidden ? "border-neutral-300 dark:border-neutral-600 text-neutral-400 dark:text-neutral-500 line-through" : ""
                  }`}
                  style={
                    hidden
                      ? undefined
                      : { borderColor: style.border, color: style.text, backgroundColor: style.bg }
                  }
                >
                  {formatGroupLabel(family)}
                </button>
              );
            })}
          </>
        )}

        {totalOrphans > 0 && (
          <>
            <div className="mx-1 h-4 border-l border-neutral-300 dark:border-neutral-600" />
            <button
              onClick={() => setShowOrphans((v) => !v)}
              className={`px-2 py-0.5 rounded border transition-colors ${
                showOrphans
                  ? "border-amber-400 dark:border-amber-600 text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20"
                  : "border-neutral-300 dark:border-neutral-600 text-neutral-500 dark:text-neutral-400"
              }`}
            >
              {totalOrphans} unconnected
            </button>
          </>
        )}
      </div>

      <div className="flex-1 min-h-0 flex">
        {/* Graph */}
        <div className="flex-1 min-w-0">
          {hasConnected ? (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              nodeTypes={nodeTypes}
              fitView
              attributionPosition="bottom-left"
            >
              <Background />
              <Controls />
              <MiniMap
                nodeColor={(node) => {
                  if (node.type === "groupNode") return "transparent";
                  if (node.type === "featureNode") return "#3b82f6";
                  if (node.type === "pluginNode") {
                    return getFamilyStyle(node.data?.family ?? "").text;
                  }
                  return "#6b7280";
                }}
              />
            </ReactFlow>
          ) : (
            <div className="flex items-center justify-center h-full text-neutral-500 dark:text-neutral-400 text-sm">
              No dependency edges found ({edgeSource} mode). All {totalOrphans} nodes are unconnected.
            </div>
          )}
        </div>

        {/* Orphan sidebar */}
        {showOrphans && totalOrphans > 0 && (
          <div className="w-64 flex-none border-l border-neutral-200 dark:border-neutral-700 overflow-y-auto bg-neutral-50 dark:bg-neutral-900">
            <div className="p-3 space-y-4">
              <div className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
                Unconnected ({totalOrphans})
              </div>

              {orphanFeaturesByCategory.size > 0 && (
                <div className="space-y-3">
                  {[...orphanFeaturesByCategory.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([cat, catFeatures]) => (
                    <OrphanGroup
                      key={`of-${cat}`}
                      label={formatGroupLabel(cat)}
                      count={catFeatures.length}
                      color="#3b82f6"
                      items={catFeatures.map((f) => ({ id: f.id, name: f.name, sub: f.id }))}
                    />
                  ))}
                </div>
              )}

              {orphansByFamily.size > 0 && (
                <div className="space-y-3">
                  {[...orphansByFamily.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([family, familyPlugins]) => {
                    const style = getFamilyStyle(family);
                    return (
                      <OrphanGroup
                        key={`op-${family}`}
                        label={formatGroupLabel(family)}
                        count={familyPlugins.length}
                        color={style.text}
                        items={familyPlugins.map((p) => ({ id: p.id, name: p.name, sub: p.id }))}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Orphan Group (compact sidebar section)
// ============================================================================

function OrphanGroup({
  label,
  count,
  color,
  items,
}: {
  label: string;
  count: number;
  color: string;
  items: { id: string; name: string; sub: string }[];
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1.5 w-full text-left"
      >
        <span
          className="w-2 h-2 rounded-full flex-none"
          style={{ backgroundColor: color }}
        />
        <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300 flex-1 truncate">
          {label}
        </span>
        <span className="text-[10px] text-neutral-400 dark:text-neutral-500">
          {count}
        </span>
        <span className="text-[10px] text-neutral-400 dark:text-neutral-500">
          {expanded ? "\u25B4" : "\u25BE"}
        </span>
      </button>
      {expanded && (
        <div className="mt-1 ml-3.5 space-y-0.5">
          {items.map((item) => (
            <div key={item.id} className="text-[11px] text-neutral-600 dark:text-neutral-400 truncate">
              {item.name}
              <span className="ml-1 text-[10px] text-neutral-400 dark:text-neutral-500 font-mono">
                {item.sub}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Group Node Component
// ============================================================================

interface GroupNodeData {
  label: string;
  variant: "feature" | "plugin";
  family?: string;
}

function GroupNode({ data }: { data: GroupNodeData }) {
  const isFeature = data.variant === "feature";
  const style = isFeature ? FEATURE_GROUP_STYLE : getFamilyStyle(data.family ?? "");

  return (
    <div
      className="w-full h-full rounded-xl pointer-events-none"
      style={{
        backgroundColor: style.bg,
        border: `1.5px dashed ${style.border}`,
      }}
    >
      <div
        className="absolute top-0 left-3 px-2 py-0.5 text-xs font-semibold rounded-b"
        style={{ color: style.text, backgroundColor: style.bg }}
      >
        {data.label}
      </div>
    </div>
  );
}

// ============================================================================
// Feature Node Component
// ============================================================================

interface FeatureNodeData {
  label: string;
  featureId: string;
  icon?: string;
  category?: string;
}

function FeatureNode({ data }: { data: FeatureNodeData }) {
  return (
    <div className="px-3 py-2.5 rounded-lg border-2 border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-md min-w-[180px]">
      <Handle type="target" position={Position.Left} className="!bg-blue-500" />
      <Handle type="source" position={Position.Right} className="!bg-blue-500" />
      <div className="flex items-center gap-2 mb-0.5">
        {data.icon && <Icon name={data.icon} size={16} />}
        <div className="font-semibold text-sm text-blue-900 dark:text-blue-100 truncate">
          {data.label}
        </div>
      </div>
      <div className="text-[10px] font-mono text-blue-700 dark:text-blue-300 truncate">
        {data.featureId}
      </div>
    </div>
  );
}

// ============================================================================
// Plugin Node Component
// ============================================================================

interface PluginNodeData {
  label: string;
  pluginId: string;
  family: string;
  origin: string;
  icon?: string;
}

function PluginNode({ data }: { data: PluginNodeData }) {
  const style = getFamilyStyle(data.family);

  return (
    <div
      className="px-3 py-2.5 rounded-lg border-2 shadow-md min-w-[180px]"
      style={{ borderColor: style.text, backgroundColor: style.bg }}
    >
      <Handle type="target" position={Position.Left} style={{ background: style.text }} />
      <Handle type="source" position={Position.Right} style={{ background: style.text }} />
      <div className="flex items-center gap-2 mb-0.5">
        {data.icon && <Icon name={data.icon} size={16} />}
        <div className="font-semibold text-sm text-neutral-900 dark:text-neutral-100 truncate">
          {data.label}
        </div>
      </div>
      <div className="text-[10px] font-mono text-neutral-600 dark:text-neutral-400 truncate mb-1">
        {data.pluginId}
      </div>
      <div className="flex gap-1">
        <span
          className="text-[10px] px-1.5 py-0.5 rounded"
          style={{ backgroundColor: style.border, color: style.text }}
        >
          {data.origin}
        </span>
      </div>
    </div>
  );
}
