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
  manifestToolToInteractiveTool,
  type InteractiveTool,
  type ManifestToolDefinition,
  type ManifestToolPack,
} from '@pixsim7/scene.gizmos';

import { ensureBackendPluginCatalogEntry } from '@lib/plugins/backendCatalog';
import type { PluginOrigin } from '@lib/plugins/pluginSystem';

// Re-export for backward compatibility
export { manifestToolToInteractiveTool, type ManifestToolDefinition, type ManifestToolPack } from '@pixsim7/scene.gizmos';

/**
 * Frontend plugin manifest with tools (supports both flat tools and toolPacks)
 */
interface FrontendPluginManifestWithTools {
  pluginId: string;
  pluginName: string;
  version: string;
  description?: string;
  icon?: string;
  tags?: string[];
  interactions?: unknown[];
  tools?: ManifestToolDefinition[];       // Flat tool list (legacy)
  toolPacks?: ManifestToolPack[];          // Grouped tool packs (new)
}

/**
 * Response from /admin/plugins/frontend/all
 */
interface AllFrontendManifestsResponse {
  manifests: Array<{
    pluginId: string;
    enabled: boolean;
    kind?: string;
    required?: boolean;
    origin?: PluginOrigin;
    author?: string;
    description?: string;
    version?: string;
    tags?: string[];
    permissions?: string[];
    manifest: FrontendPluginManifestWithTools;
  }>;
  total: number;
}

// =============================================================================
// Tool Loader
// =============================================================================

/** Track which plugin tools have been loaded */
const loadedToolPlugins = new Set<string>();

/** Store tool pack metadata */
const toolPackMetadata = new Map<
  string,
  { name: string; description?: string; icon?: string; pluginId: string }
>();

/** Store tool metadata (unlock levels, descriptions, pack info) */
const toolMetadata = new Map<
  string,
  {
    name?: string;
    description?: string;
    unlockLevel?: number;
    pluginId: string;
    packId?: string;
  }
>();

/**
 * Register a single tool from a manifest
 */
function registerManifestTool(
  manifestTool: ManifestToolDefinition,
  pluginId: string,
  packId?: string
): boolean {
  // Check if already registered
  if (getTool(manifestTool.id)) {
    console.debug(`[dynamicToolLoader] Tool already registered: ${manifestTool.id}`);
    return false;
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
    packId,
  });

  console.info(
    `[dynamicToolLoader] Registered tool: ${manifestTool.id} from ${pluginId}${packId ? ` (pack: ${packId})` : ''}`
  );
  return true;
}

/**
 * Load all plugin tools from the backend
 *
 * Fetches frontend manifests and registers tools from each plugin.
 * Supports both flat `tools` array and grouped `toolPacks`.
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

    for (const entry of data.manifests) {
      const { pluginId, enabled, manifest } = entry;
      if (!enabled) {
        console.debug(`[dynamicToolLoader] Skipping disabled plugin: ${pluginId}`);
        continue;
      }

      await ensureBackendPluginCatalogEntry(entry);

      // Skip if already loaded
      if (loadedToolPlugins.has(pluginId)) {
        console.debug(`[dynamicToolLoader] Plugin tools already loaded: ${pluginId}`);
        continue;
      }

      const hasTools = manifest.tools && manifest.tools.length > 0;
      const hasToolPacks = manifest.toolPacks && manifest.toolPacks.length > 0;

      // Skip if no tools defined
      if (!hasTools && !hasToolPacks) {
        continue;
      }

      // Process tool packs (new structure)
      if (hasToolPacks) {
        for (const pack of manifest.toolPacks!) {
          // Store pack metadata
          toolPackMetadata.set(pack.id, {
            name: pack.name,
            description: pack.description,
            icon: pack.icon,
            pluginId,
          });

          console.info(
            `[dynamicToolLoader] Loading tool pack: ${pack.name} (${pack.tools.length} tools)`
          );

          // Register each tool in the pack
          for (const manifestTool of pack.tools) {
            if (registerManifestTool(manifestTool, pluginId, pack.id)) {
              loadedCount++;
            }
          }
        }
      }

      // Process flat tools array (legacy/simple structure)
      if (hasTools) {
        for (const manifestTool of manifest.tools!) {
          if (registerManifestTool(manifestTool, pluginId)) {
            loadedCount++;
          }
        }
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
 * Get all tools from a specific pack
 */
export function getToolsByPack(packId: string): InteractiveTool[] {
  const allTools = getAllTools();
  return allTools.filter((tool) => {
    const meta = toolMetadata.get(tool.id);
    return meta?.packId === packId;
  });
}

/**
 * Get pack metadata by ID
 */
export function getToolPackMetadata(packId: string) {
  return toolPackMetadata.get(packId);
}

/**
 * Get all tool packs from a plugin
 */
export function getToolPacksByPlugin(pluginId: string): Array<{
  id: string;
  name: string;
  description?: string;
  icon?: string;
  tools: InteractiveTool[];
}> {
  const packs: Array<{
    id: string;
    name: string;
    description?: string;
    icon?: string;
    tools: InteractiveTool[];
  }> = [];

  for (const [packId, meta] of toolPackMetadata.entries()) {
    if (meta.pluginId === pluginId) {
      packs.push({
        id: packId,
        name: meta.name,
        description: meta.description,
        icon: meta.icon,
        tools: getToolsByPack(packId),
      });
    }
  }

  return packs;
}

/**
 * Clear the loaded plugins cache (for testing)
 */
export function clearLoadedToolPluginsCache(): void {
  loadedToolPlugins.clear();
  toolMetadata.clear();
  toolPackMetadata.clear();
}
