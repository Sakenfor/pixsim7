/**
 * Dynamic Plugin Tool Loader
 *
 * Fetches plugin manifests from the backend and dynamically registers
 * interactive tools with the gizmo registry.
 *
 * This enables plugins to contribute new tools (e.g., candle, ice, silk)
 * without modifying the core application.
 */

import {
  registerTool,
  getTool,
  getAllTools,
  type InteractiveTool,
  type TouchPattern,
  type ParticleEffect,
  type HapticPattern,
  type ReactionType,
  type TrailEffect,
} from '@pixsim7/scene.gizmos';

// =============================================================================
// Manifest Types
// =============================================================================

/**
 * Tool type from manifest
 */
type ManifestToolType =
  | 'touch'
  | 'caress'
  | 'tease'
  | 'pleasure'
  | 'temperature'
  | 'energy'
  | 'liquid'
  | 'object';

/**
 * Visual model from manifest
 */
type ManifestVisualModel =
  | 'hand'
  | 'feather'
  | 'ice'
  | 'flame'
  | 'silk'
  | 'electric'
  | 'water'
  | 'banana'
  | 'candle';

/**
 * Tool definition in plugin manifest
 */
export interface ManifestToolDefinition {
  id: string;
  type: ManifestToolType;
  name?: string;
  description?: string;
  unlockLevel?: number;

  visual: {
    model: ManifestVisualModel;
    baseColor: string;
    activeColor: string;
    glow?: boolean;
    trail?: boolean;
    distortion?: boolean;
    particles?: {
      type: string;
      density: number;
      color?: string;
      size?: number;
      lifetime?: number;
      velocity?: { x: number; y: number; z: number };
    };
  };

  physics: {
    pressure: number;
    speed: number;
    temperature?: number;
    pattern?: TouchPattern;
    vibration?: number;
    viscosity?: number;
    elasticity?: number;
    bendFactor?: number;
    heat?: number;
  };

  feedback: {
    haptic?: {
      type: string;
      intensity: number;
      duration: number;
      frequency?: number;
    };
    audio?: {
      sound: string;
      volume: number;
      pitch?: number;
      loop?: boolean;
    };
    npcReaction?: {
      expression?: string;
      vocalization?: string;
      animation?: string;
      intensity: number;
    };
    trail?: {
      type: string;
      color: string;
      width: number;
      lifetime: number;
    };
    impact?: {
      type: 'squish' | 'bounce' | 'splash';
      intensity: number;
      ripples?: boolean;
    };
  };

  constraints?: {
    minPressure?: number;
    maxSpeed?: number;
    allowedZones?: string[];
    cooldown?: number;
  };
}

/**
 * Frontend plugin manifest with tools
 */
interface FrontendPluginManifestWithTools {
  pluginId: string;
  pluginName: string;
  version: string;
  interactions?: unknown[];
  tools?: ManifestToolDefinition[];
}

/**
 * Response from /admin/plugins/frontend/all
 */
interface AllFrontendManifestsResponse {
  manifests: Array<{
    pluginId: string;
    enabled: boolean;
    manifest: FrontendPluginManifestWithTools;
  }>;
  total: number;
}

// =============================================================================
// Manifest to Tool Converter
// =============================================================================

/**
 * Convert a manifest tool definition to an InteractiveTool
 */
export function manifestToolToInteractiveTool(
  manifestTool: ManifestToolDefinition
): InteractiveTool {
  return {
    id: manifestTool.id,
    type: manifestTool.type,

    visual: {
      model: manifestTool.visual.model as InteractiveTool['visual']['model'],
      baseColor: manifestTool.visual.baseColor,
      activeColor: manifestTool.visual.activeColor,
      glow: manifestTool.visual.glow,
      trail: manifestTool.visual.trail,
      distortion: manifestTool.visual.distortion,
      particles: manifestTool.visual.particles
        ? ({
            type: manifestTool.visual.particles.type,
            density: manifestTool.visual.particles.density,
            color: manifestTool.visual.particles.color,
            size: manifestTool.visual.particles.size,
            lifetime: manifestTool.visual.particles.lifetime,
            velocity: manifestTool.visual.particles.velocity,
          } as ParticleEffect)
        : undefined,
    },

    physics: {
      pressure: manifestTool.physics.pressure,
      speed: manifestTool.physics.speed,
      temperature: manifestTool.physics.temperature,
      pattern: manifestTool.physics.pattern,
      vibration: manifestTool.physics.vibration,
      viscosity: manifestTool.physics.viscosity,
      elasticity: manifestTool.physics.elasticity,
      bendFactor: manifestTool.physics.bendFactor,
    },

    feedback: {
      haptic: manifestTool.feedback.haptic
        ? ({
            type: manifestTool.feedback.haptic.type,
            intensity: manifestTool.feedback.haptic.intensity,
            duration: manifestTool.feedback.haptic.duration,
            frequency: manifestTool.feedback.haptic.frequency,
          } as HapticPattern)
        : undefined,
      audio: manifestTool.feedback.audio,
      npcReaction: manifestTool.feedback.npcReaction
        ? ({
            expression: manifestTool.feedback.npcReaction.expression,
            vocalization: manifestTool.feedback.npcReaction.vocalization,
            animation: manifestTool.feedback.npcReaction.animation,
            intensity: manifestTool.feedback.npcReaction.intensity,
          } as ReactionType)
        : undefined,
      trail: manifestTool.feedback.trail
        ? ({
            type: manifestTool.feedback.trail.type,
            color: manifestTool.feedback.trail.color,
            width: manifestTool.feedback.trail.width,
            lifetime: manifestTool.feedback.trail.lifetime,
          } as TrailEffect)
        : undefined,
      impact: manifestTool.feedback.impact,
    },

    constraints: manifestTool.constraints,
  };
}

// =============================================================================
// Tool Loader
// =============================================================================

/** Track which plugin tools have been loaded */
const loadedToolPlugins = new Set<string>();

/** Store tool metadata (unlock levels, descriptions) */
const toolMetadata = new Map<
  string,
  { name?: string; description?: string; unlockLevel?: number; pluginId: string }
>();

/**
 * Load all plugin tools from the backend
 *
 * Fetches frontend manifests and registers tools from each plugin.
 *
 * @returns Promise resolving to number of newly loaded tools
 */
export async function loadPluginTools(): Promise<number> {
  try {
    const response = await fetch('/api/v1/admin/plugins/frontend/all');

    if (!response.ok) {
      console.warn('[dynamicToolLoader] Failed to fetch plugin manifests:', response.status);
      return 0;
    }

    const data: AllFrontendManifestsResponse = await response.json();

    let loadedCount = 0;

    for (const { pluginId, enabled, manifest } of data.manifests) {
      if (!enabled) {
        console.debug(`[dynamicToolLoader] Skipping disabled plugin: ${pluginId}`);
        continue;
      }

      // Skip if no tools defined
      if (!manifest.tools || manifest.tools.length === 0) {
        continue;
      }

      // Skip if already loaded
      if (loadedToolPlugins.has(pluginId)) {
        console.debug(`[dynamicToolLoader] Plugin tools already loaded: ${pluginId}`);
        continue;
      }

      // Register each tool from the manifest
      for (const manifestTool of manifest.tools) {
        // Check if already registered
        if (getTool(manifestTool.id)) {
          console.debug(
            `[dynamicToolLoader] Tool already registered: ${manifestTool.id}`
          );
          continue;
        }

        // Convert and register
        const tool = manifestToolToInteractiveTool(manifestTool);
        registerTool(tool);

        // Store metadata
        toolMetadata.set(manifestTool.id, {
          name: manifestTool.name,
          description: manifestTool.description,
          unlockLevel: manifestTool.unlockLevel,
          pluginId,
        });

        loadedCount++;
        console.info(
          `[dynamicToolLoader] Registered tool: ${manifestTool.id} from ${pluginId}`
        );
      }

      loadedToolPlugins.add(pluginId);
    }

    if (loadedCount > 0) {
      console.info(`[dynamicToolLoader] Loaded ${loadedCount} new tools`);
    }

    return loadedCount;
  } catch (error) {
    console.error('[dynamicToolLoader] Error loading plugin tools:', error);
    return 0;
  }
}

/**
 * Get tool metadata (name, description, unlock level)
 */
export function getToolMetadata(toolId: string) {
  return toolMetadata.get(toolId);
}

/**
 * Get all tools from a specific plugin
 */
export function getToolsByPlugin(pluginId: string): InteractiveTool[] {
  const allTools = getAllTools();
  return allTools.filter((tool) => {
    const meta = toolMetadata.get(tool.id);
    return meta?.pluginId === pluginId;
  });
}

/**
 * Get tools that are unlocked at a given affinity level
 */
export function getUnlockedPluginTools(affinity: number): InteractiveTool[] {
  const allTools = getAllTools();
  return allTools.filter((tool) => {
    const meta = toolMetadata.get(tool.id);
    // If no unlock level specified, assume always available
    const unlockLevel = meta?.unlockLevel ?? 0;
    return affinity >= unlockLevel;
  });
}

/**
 * Clear the loaded plugins cache (for testing)
 */
export function clearLoadedToolPluginsCache(): void {
  loadedToolPlugins.clear();
  toolMetadata.clear();
}
