/**
 * HUD Layout Management
 *
 * Utilities for managing per-world HUD layouts in Game2D.
 * Reads layout configuration from GameWorld.meta.ui.hud and organizes tools by region.
 */

import type { GameWorldDetail } from '@lib/api/game';
import type {
  WorldToolPlugin,
  WorldToolContext,
  HudToolPlacement,
  HudRegion,
  WorldUiConfig,
  HudVisibilityCondition,
} from './types';
import { applyPlayerPreferences, getPlayerPreferences } from './playerHudPreferences';
import { getProfileLayout, getActiveProfileId } from './hudProfiles';

/**
 * Tools grouped by HUD region
 */
export interface HudRegionTools {
  region: HudRegion;
  tools: WorldToolPlugin[];
  placements: HudToolPlacement[];
}

/**
 * HUD layout structure
 */
export interface HudLayout {
  regions: HudRegionTools[];
  unusedTools: WorldToolPlugin[]; // Tools available but not in layout
}

/**
 * Default HUD layout when no configuration is present
 * Places all tools in the 'top' region in registration order
 */
function getDefaultLayout(tools: WorldToolPlugin[]): HudToolPlacement[] {
  return tools.map((tool, index) => ({
    toolId: tool.id,
    region: 'top' as HudRegion,
    order: index,
  }));
}

/**
 * Check if a visibility condition is met
 */
function checkVisibilityCondition(
  condition: HudVisibilityCondition | undefined,
  context: WorldToolContext
): boolean {
  if (!condition) return true;

  switch (condition.kind) {
    case 'capability':
      // Check if capability is enabled (placeholder - implement based on your capability system)
      // For now, always return true
      return true;

    case 'flag':
      // Check session flag
      const flagPath = condition.id.split('.');
      let value: any = context.sessionFlags;
      for (const key of flagPath) {
        if (value == null) return false;
        value = value[key];
      }
      return Boolean(value);

    case 'session':
      // Check if session exists
      return context.session != null;

    case 'location':
      // Check if at specific location
      if (!context.selectedLocationId) return false;
      const targetLocationIds = condition.id.split(',').map(id => parseInt(id.trim(), 10));
      return targetLocationIds.includes(context.selectedLocationId);

    case 'time':
      // Check world time conditions
      if (!context.worldTime) return false;
      const { day, hour } = context.worldTime;

      // Check day of week (if specified)
      if (condition.dayOfWeek !== undefined && condition.dayOfWeek !== 'any') {
        if (day !== condition.dayOfWeek) return false;
      }

      // Check hour range (if specified)
      if (condition.hourRange) {
        const [startHour, endHour] = condition.hourRange;
        if (hour < startHour || hour > endHour) return false;
      }

      return true;

    case 'quest':
      // Check if specific quest is active
      const questFlags = context.sessionFlags.quests as any;
      if (!questFlags) return false;
      const questId = condition.id;
      const questStatus = questFlags[questId]?.status;
      return questStatus === 'active' || questStatus === 'completed';

    case 'relationship':
      // Check NPC relationship level
      if (!condition.id || !context.relationships) return false;
      const npcRelationship = context.relationships[condition.id] as any;
      if (!npcRelationship?.level) return false;
      const minLevel = condition.minRelationship || 0;
      return npcRelationship.level >= minLevel;

    case 'composite':
      // Evaluate composite conditions with AND/OR logic
      if (!condition.conditions || condition.conditions.length === 0) return true;
      const operator = condition.operator || 'AND';

      if (operator === 'AND') {
        return condition.conditions.every(c => checkVisibilityCondition(c, context));
      } else {
        return condition.conditions.some(c => checkVisibilityCondition(c, context));
      }

    default:
      console.warn(`Unknown visibility condition kind: ${(condition as any).kind}`);
      return false;
  }
}

/**
 * Get HUD configuration from world metadata
 * Phase 6: Now considers active profile and view mode
 */
export function getHudConfig(
  worldDetail: GameWorldDetail | null,
  profileId?: string,
  viewMode?: 'cinematic' | 'hud-heavy' | 'debug'
): HudToolPlacement[] | null {
  if (!worldDetail?.meta) return null;

  // Phase 6: Check for profile-specific layout first
  if (profileId) {
    const profileLayout = getProfileLayout(worldDetail, profileId, viewMode);
    if (profileLayout) {
      return profileLayout;
    }
  }

  const ui = worldDetail.meta.ui as WorldUiConfig | undefined;
  return ui?.hud || null;
}

/**
 * Build HUD layout from world configuration and available tools
 * Phase 6: Automatically resolves active profile
 */
export function buildHudLayout(
  tools: WorldToolPlugin[],
  worldDetail: GameWorldDetail | null,
  context: WorldToolContext
): HudLayout {
  // Phase 6: Get active profile and view mode
  const activeProfileId = worldDetail ? getActiveProfileId(worldDetail.id) : undefined;
  const viewMode = context.viewMode as 'cinematic' | 'hud-heavy' | 'debug' | undefined;

  // Get HUD configuration or use default
  const hudConfig = getHudConfig(worldDetail, activeProfileId, viewMode) || getDefaultLayout(tools);

  // Filter placements by visibility conditions
  let visiblePlacements = hudConfig.filter((placement) =>
    checkVisibilityCondition(placement.visibleWhen, context)
  );

  // Apply player preferences (hide tools, apply overrides)
  if (context.selectedWorldId != null) {
    visiblePlacements = applyPlayerPreferences(visiblePlacements, context.selectedWorldId);
  }

  // Create a map of tool ID to tool
  const toolMap = new Map(tools.map((tool) => [tool.id, tool]));

  // Group tools by region
  const regionMap = new Map<HudRegion, { tools: WorldToolPlugin[]; placements: HudToolPlacement[] }>();

  for (const placement of visiblePlacements) {
    const tool = toolMap.get(placement.toolId);
    if (!tool) {
      console.warn(`HUD layout references unknown tool: ${placement.toolId}`);
      continue;
    }

    const region = placement.region;
    if (!regionMap.has(region)) {
      regionMap.set(region, { tools: [], placements: [] });
    }

    const regionData = regionMap.get(region)!;
    regionData.tools.push(tool);
    regionData.placements.push(placement);
  }

  // Sort tools within each region by order
  for (const regionData of regionMap.values()) {
    const indices = regionData.placements.map((p, i) => ({
      index: i,
      order: p.order ?? 0,
    }));
    indices.sort((a, b) => a.order - b.order);

    const sortedTools = indices.map((item) => regionData.tools[item.index]);
    const sortedPlacements = indices.map((item) => regionData.placements[item.index]);

    regionData.tools = sortedTools;
    regionData.placements = sortedPlacements;
  }

  // Find unused tools (tools that are visible but not in layout)
  const usedToolIds = new Set(visiblePlacements.map((p) => p.toolId));
  const unusedTools = tools.filter((tool) => !usedToolIds.has(tool.id));

  // Build final layout
  const regions: HudRegionTools[] = Array.from(regionMap.entries()).map(([region, data]) => ({
    region,
    tools: data.tools,
    placements: data.placements,
  }));

  return {
    regions,
    unusedTools,
  };
}

/**
 * Get all tools for a specific region
 */
export function getToolsForRegion(
  layout: HudLayout,
  region: HudRegion
): WorldToolPlugin[] {
  const regionData = layout.regions.find((r) => r.region === region);
  return regionData?.tools || [];
}

/**
 * Check if a layout has any tools in a specific region
 */
export function hasToolsInRegion(layout: HudLayout, region: HudRegion): boolean {
  return getToolsForRegion(layout, region).length > 0;
}
