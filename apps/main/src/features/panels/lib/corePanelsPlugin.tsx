/**
 * Core Panels Plugin
 *
 * Built-in plugin that registers all core workspace panels.
 * Part of Task 50 Phase 50.3 - Plugin-based Panel Registry
 */

import type { PanelPlugin } from "./panelPlugin";
import { registerBuiltinPanel } from "../../../lib/plugins/registryBridge";
import { AssetsRoute } from "../../../routes/Assets";
import { SceneBuilderPanel, SceneManagementPanel } from "@features/scene";
import { GraphEditorHost } from "@features/graph";
import { InspectorPanel } from "../../../components/inspector/InspectorPanel";
import { HealthPanel } from "../../../components/health/HealthPanel";
import { ProviderSettingsPanel } from "@features/providers/components/ProviderSettingsPanel";
import { SettingsPanel } from "@features/settings/components/SettingsPanel";
import { GameThemingPanel } from "@/components/game/panels/GameThemingPanel";
import { GizmoLab } from "../../../routes/GizmoLab";
import { NpcBrainLab } from "@features/brainTools";
import { DevToolsPanel } from "@features/panels/components/dev/DevToolsPanel";
import { HudDesignerPanel } from "../components/HudDesignerPanel";
import { WorldVisualRolesPanel } from "@features/worldTools";
import { GenerationsPanel } from "@features/generation";
import { GameToolsPanel } from "@features/panels/components/tools/GameToolsPanel";
import { SurfaceWorkbenchPanel } from "@features/panels/components/tools/SurfaceWorkbenchPanel";
import { GameViewPanel } from "@/components/game/panels/GameViewPanel";
import { WorldContextPanel } from "@/components/game/panels/WorldContextPanel";
import { EdgeEffectsPanel } from "@features/panels/components/tools/EdgeEffectsPanel";
import { ConsolePanel } from "@features/panels/components/console/ConsolePanel";
import { ModelInspectorPanel } from "@features/panels/components/tools/ModelInspectorPanel";
import { galleryPanelSettingsSections } from "@features/gallery/components/GalleryPanelSettings";
import { GraphPanelSettingsComponent } from "@features/graph/components/GraphPanelSettings";
import { AssetViewerPanel } from "@/components/media/AssetViewerPanel";
import { ControlCenterManager } from "@features/controlCenter";

export const corePanelsPlugin: PanelPlugin = {
  id: "core-panels",
  name: "Core Workspace Panels",
  version: "1.0.0",
  description: "Built-in workspace panels for PixSim7",
  author: "PixSim7 Team",

  panels: [
    {
      id: "controlCenter",
      title: "Control Center",
      component: ControlCenterManager,
      category: "system",
      tags: ["control-center", "generation", "modules"],
      icon: "dY-д",
      description: "Control Center dock and generation modules",
      isInternal: true,
      supportsCompactMode: false,
      supportsMultipleInstances: false,
      orchestration: {
        type: "dockview-container",
        defaultZone: "left",
        canChangeZone: false,
        retraction: {
          canRetract: true,
          retractedWidth: 48,
          animationDuration: 200,
        },
        dockview: {
          hasDockview: true,
          subPanelRegistry: "quickGenPanelRegistry",
          subPanelsCanBreakout: false,
          persistLayout: true,
          storageKey: "quickGenerate-dockview-layout",
        },
        priority: 40,
        interactionRules: {
          whenOpens: {
            assetViewer: "retract",
            gallery: "nothing",
          },
          whenCloses: {
            assetViewer: "expand",
          },
        },
      },
    },
    {
      id: "assetViewer",
      title: "Asset Viewer",
      component: AssetViewerPanel,
      category: "workspace",
      tags: ["assets", "viewer", "media"],
      icon: "dY-п",
      description: "Asset viewer with docked sub-panels",
      isInternal: true,
      supportsCompactMode: false,
      supportsMultipleInstances: false,
      orchestration: {
        type: "dockview-container",
        defaultZone: "center",
        canChangeZone: true,
        dockview: {
          hasDockview: true,
          subPanelRegistry: "viewerPanelRegistry",
          subPanelsCanBreakout: true,
          persistLayout: true,
          storageKey: "asset-viewer-dockview-layout",
        },
        priority: 80,
      },
    },
    {
      id: "gallery",
      title: "Gallery",
      component: AssetsRoute,
      category: "workspace",
      tags: ["assets", "media", "images"],
      icon: "🖼️",
      description: "Browse and manage project assets",
      supportsCompactMode: false,
      supportsMultipleInstances: false,
      orchestration: {
        type: "zone-panel",
        defaultZone: "center",
        canChangeZone: false,
        priority: 60,
        interactionRules: {
          whenOpens: {
            assetViewer: "minimize",
          },
          whenCloses: {
            assetViewer: "restore",
          },
        },
      },
      settingsSections: galleryPanelSettingsSections,
    },
    {
      id: "scene",
      title: "Scene Builder",
      component: SceneBuilderPanel,
      category: "scene",
      tags: ["scene", "builder", "editor"],
      icon: "🎬",
      description: "Build and edit individual scenes",
      contextLabel: "scene",
      supportsCompactMode: false,
      supportsMultipleInstances: false,
    },
    {
      id: "graph",
      title: "Graph",
      component: GraphEditorHost,
      category: "workspace",
      tags: ["graph", "nodes", "flow"],
      icon: "🕸️",
      description: "Visual node-based editor",
      orchestration: {
        type: "zone-panel",
        defaultZone: "center",
        canChangeZone: true,
        priority: 55,
        interactionRules: {
          whenOpens: {
            assetViewer: "minimize",
          },
        },
      },
      // Core Flow View: The canonical logic/flow editor for designing scenes, nodes, choices, transitions
      coreEditorRole: "flow-view",
      contextLabel: (ctx) =>
        ctx.scene.title
          ? `Scene: ${ctx.scene.title}${ctx.world.id ? ` • World #${ctx.world.id}` : ""}`
          : ctx.world.id
            ? `World #${ctx.world.id}`
            : undefined,
      supportsCompactMode: false,
      supportsMultipleInstances: false,
      settingsComponent: GraphPanelSettingsComponent,
    },
    {
      id: "inspector",
      title: "Inspector",
      component: InspectorPanel,
      category: "workspace",
      tags: ["inspector", "properties", "details"],
      icon: "🔍",
      description: "Inspect and edit node properties",
      supportsCompactMode: false,
      supportsMultipleInstances: false,
    },
    {
      id: "health",
      title: "Health",
      component: HealthPanel,
      category: "system",
      tags: ["health", "monitoring", "validation", "diagnostics"],
      icon: "❤️",
      description: "System health and validation",
      contextLabel: "preset",
      supportsCompactMode: true,
      supportsMultipleInstances: false,
    },
    {
      id: "game",
      title: "Game",
      component: GameViewPanel,
      category: "game",
      tags: ["game", "preview", "play"],
      icon: "🎮",
      description: "Core Game View (Game2D) embedded in the workspace.",
      // Core Game View: The canonical runtime/play viewport (Game2D)
      coreEditorRole: "game-view",
      contextLabel: "session",
      supportsCompactMode: false,
      supportsMultipleInstances: false,
    },
    {
      id: "providers",
      title: "Provider Settings",
      component: ProviderSettingsPanel,
      category: "system",
      tags: ["providers", "api", "settings"],
      icon: "⚙️",
      description: "API provider settings and configuration",
      supportsCompactMode: false,
      supportsMultipleInstances: false,
    },
    {
      id: "settings",
      title: "Settings",
      component: SettingsPanel,
      category: "utilities",
      tags: ["settings", "configuration", "preferences"],
      icon: "🔧",
      description: "Application settings and preferences",
      supportsCompactMode: false,
      supportsMultipleInstances: false,
    },
    {
      id: "gizmo-lab",
      title: "Gizmo Lab",
      component: GizmoLab,
      category: "tools",
      tags: ["gizmos", "lab", "experimental", "testing"],
      icon: "🧪",
      description: "Gizmo testing laboratory",
      supportsCompactMode: false,
      supportsMultipleInstances: false,
    },
    {
      id: "npc-brain-lab",
      title: "NPC Brain Lab",
      component: NpcBrainLab,
      category: "tools",
      tags: ["npc", "ai", "brain", "behavior"],
      icon: "🧠",
      description: "NPC behavior testing and debugging",
      supportsCompactMode: false,
      supportsMultipleInstances: false,
    },
    {
      id: "game-theming",
      title: "Game Theming",
      component: GameThemingPanel,
      category: "game",
      tags: ["theming", "customization", "appearance"],
      icon: "🎨",
      description: "Game theme and appearance customization",
      contextLabel: "world",
      supportsCompactMode: false,
      supportsMultipleInstances: false,
    },
    {
      id: "scene-management",
      title: "Scene Management",
      component: SceneManagementPanel,
      category: "scene",
      tags: ["scene", "management", "workflow", "organization"],
      icon: "🗂️",
      description: "Unified scene workflow management",
      contextLabel: "scene",
      supportsCompactMode: false,
      supportsMultipleInstances: false,
    },
    {
      id: "dev-tools",
      title: "Dev Tools",
      component: DevToolsPanel,
      category: "dev",
      tags: ["dev", "debug", "tools", "diagnostics", "developer"],
      icon: "🛠️",
      description: "Developer tools and diagnostics",
      supportsCompactMode: false,
      supportsMultipleInstances: false,
    },
    {
      id: "hud-designer",
      title: "HUD Designer",
      component: HudDesignerPanel,
      category: "tools",
      tags: ["hud", "designer", "layout", "ui", "widgets"],
      icon: "🧩",
      description: "Design HUD layouts using widget compositions",
      supportsCompactMode: false,
      supportsMultipleInstances: false,
    },
    {
      id: "world-visual-roles",
      title: "World Visual Roles",
      component: WorldVisualRolesPanel,
      category: "game",
      tags: ["world", "assets", "visual", "binding", "roles", "portraits"],
      icon: "🌍",
      description:
        "Bind gallery assets to world visual roles (portraits, POV, backgrounds)",
      contextLabel: "world",
      supportsCompactMode: false,
      supportsMultipleInstances: false,
    },
    {
      id: "world-context",
      title: "World Context",
      component: WorldContextPanel,
      category: "game",
      tags: ["world", "location", "context"],
      icon: "🧭",
      description: "Select active world and location for the editor context.",
      contextLabel: "world",
      supportsCompactMode: true,
      supportsMultipleInstances: false,
    },
    {
      id: "generations",
      title: "Generations",
      component: GenerationsPanel,
      category: "workspace",
      tags: ["generations", "jobs", "status", "monitoring", "tracking"],
      icon: "📈",
      description: "Track and manage generation jobs",
      supportsCompactMode: false,
      supportsMultipleInstances: false,
    },
    {
      id: "game-tools",
      title: "Game Tools",
      component: GameToolsPanel,
      category: "tools",
      tags: ["game", "tools", "catalog", "world", "interactions", "widgets"],
      icon: "🧰",
      description:
        "Browse world tools, interactions, HUD widgets, and dev plugins",
      supportsCompactMode: false,
      supportsMultipleInstances: false,
    },
    {
      id: "surface-workbench",
      title: "Surface Workbench",
      component: SurfaceWorkbenchPanel,
      category: "tools",
      tags: ["surfaces", "hud", "overlay", "gizmo", "editor"],
      icon: "🧊",
      description:
        "Inspect available surfaces (HUD, overlay, gizmo) for the active context",
      contextLabel: (ctx) =>
        ctx.scene.title
          ? `Scene: ${ctx.scene.title}`
          : ctx.world.id
            ? `World #${ctx.world.id}`
            : undefined,
      supportsCompactMode: false,
      supportsMultipleInstances: false,
    },
    {
      id: "edge-effects",
      title: "Edge Effects",
      component: EdgeEffectsPanel,
      category: "scene",
      tags: [
        "scene",
        "edges",
        "effects",
        "relationships",
        "quests",
        "inventory",
      ],
      icon: "✨",
      description: "Inspect and edit edge effects for the active scene graph.",
      contextLabel: "scene",
      supportsCompactMode: false,
      supportsMultipleInstances: false,
    },
    {
      id: "console",
      title: "Console",
      component: ConsolePanel,
      category: "dev",
      tags: ["console", "command", "scripting", "debug", "developer"],
      icon: "💻",
      description:
        "Interactive command console for the pixsim namespace (Blender-style)",
      supportsCompactMode: false,
      supportsMultipleInstances: false,
    },
    {
      id: "model-inspector",
      title: "Model Inspector",
      component: ModelInspectorPanel,
      category: "tools",
      tags: ["3d", "model", "gltf", "zones", "tools", "animation"],
      icon: "📦",
      description: "View 3D models, animations, and configure contact zones",
      supportsCompactMode: false,
      supportsMultipleInstances: true,
    },
  ],

  initialize(registry) {
    console.log("Initializing core panels plugin...");

    // Register all built-in panels with the unified plugin system
    for (const panel of this.panels) {
      registerBuiltinPanel(panel);
    }

    console.log(`Registered ${this.panels.length} core panels as plugins`);
  },

  cleanup() {
    console.log("Cleaning up core panels plugin...");
    // Cleanup is handled by the plugin manager
  },
};
