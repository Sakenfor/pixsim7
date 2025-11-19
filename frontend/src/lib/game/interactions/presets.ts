/**
 * Interaction Preset System
 *
 * Provides reusable interaction configurations that designers can apply
 * to NPC slots without manually configuring raw values each time.
 *
 * Presets are stored in GameWorld.meta.interactionPresets for per-world customization.
 */

import type { GameWorldDetail } from '../../api/game';
import { updateGameWorldMeta, saveGameWorldMeta } from '../../api/game';
import type { BaseInteractionConfig } from './types';

/**
 * Interaction preset configuration
 */
export interface InteractionPreset {
  /** Unique preset ID (e.g., 'flirt_friendly') */
  id: string;

  /** Display name (e.g., 'Flirt (Friendly)') */
  name: string;

  /** Plugin/interaction type this preset configures (e.g., 'persuade') */
  interactionId: string;

  /** Plugin-specific configuration */
  config: Record<string, any>;

  /** Category for organization/filtering */
  category?: string;

  /** Description of what this preset does */
  description?: string;

  /** Tags for searching/filtering */
  tags?: string[];

  /** Icon/emoji for visual identification */
  icon?: string;

  /** Phase 8: Context-aware suggestion metadata */

  /** Recommended NPC roles this preset works well with */
  recommendedRoles?: string[];

  /** World tags this preset is suitable for (e.g., 'fantasy', 'modern', 'sci-fi') */
  worldTags?: string[];

  /** Situation tags (e.g., 'intro', 'intense', 'casual', 'combat', 'romance') */
  situationTags?: string[];
}

/**
 * Preset category definitions
 */
export const PRESET_CATEGORIES = {
  romance: 'Romance',
  trade: 'Trade',
  combat: 'Combat',
  stealth: 'Stealth',
  social: 'Social',
  quest: 'Quest',
  utility: 'Utility',
  custom: 'Custom',
} as const;

export type PresetCategory = keyof typeof PRESET_CATEGORIES;

/**
 * Get interaction presets from world metadata
 */
export function getWorldInteractionPresets(world: GameWorldDetail | null): InteractionPreset[] {
  if (!world?.meta) return [];

  const presets = (world.meta as any).interactionPresets;
  if (!Array.isArray(presets)) return [];

  return presets;
}

/**
 * Load interaction presets from world (alias for getWorldInteractionPresets)
 */
export function loadWorldInteractionPresets(world: GameWorldDetail | null): InteractionPreset[] {
  return getWorldInteractionPresets(world);
}

/**
 * Set interaction presets on a world (returns updated world object without saving)
 */
export function setWorldInteractionPresets(
  world: GameWorldDetail,
  presets: InteractionPreset[]
): GameWorldDetail {
  return {
    ...world,
    meta: {
      ...world.meta,
      interactionPresets: presets,
    },
  };
}

/**
 * Save interaction presets to world metadata
 */
export async function saveWorldInteractionPresets(
  worldId: number,
  presets: InteractionPreset[],
  currentMeta: Record<string, unknown>
): Promise<GameWorldDetail> {
  const updatedMeta = {
    ...currentMeta,
    interactionPresets: presets,
  };

  return await updateGameWorldMeta(worldId, updatedMeta);
}

/**
 * Add a new preset to a world
 */
export async function addInteractionPreset(
  worldId: number,
  preset: InteractionPreset,
  currentWorld: GameWorldDetail
): Promise<GameWorldDetail> {
  const existingPresets = getWorldInteractionPresets(currentWorld);

  // Check for duplicate ID
  if (existingPresets.some((p) => p.id === preset.id)) {
    throw new Error(`Preset with ID "${preset.id}" already exists`);
  }

  const updatedPresets = [...existingPresets, preset];
  return await saveWorldInteractionPresets(worldId, updatedPresets, currentWorld.meta || {});
}

/**
 * Update an existing preset
 */
export async function updateInteractionPreset(
  worldId: number,
  presetId: string,
  updates: Partial<InteractionPreset>,
  currentWorld: GameWorldDetail
): Promise<GameWorldDetail> {
  const existingPresets = getWorldInteractionPresets(currentWorld);
  const presetIndex = existingPresets.findIndex((p) => p.id === presetId);

  if (presetIndex === -1) {
    throw new Error(`Preset with ID "${presetId}" not found`);
  }

  const updatedPresets = [...existingPresets];
  updatedPresets[presetIndex] = {
    ...updatedPresets[presetIndex],
    ...updates,
  };

  return await saveWorldInteractionPresets(worldId, updatedPresets, currentWorld.meta || {});
}

/**
 * Delete a preset from a world
 */
export async function deleteInteractionPreset(
  worldId: number,
  presetId: string,
  currentWorld: GameWorldDetail
): Promise<GameWorldDetail> {
  const existingPresets = getWorldInteractionPresets(currentWorld);
  const updatedPresets = existingPresets.filter((p) => p.id !== presetId);

  return await saveWorldInteractionPresets(worldId, updatedPresets, currentWorld.meta || {});
}

/**
 * Find presets by interaction ID
 */
export function getPresetsForInteraction(
  presets: InteractionPreset[],
  interactionId: string
): InteractionPreset[] {
  return presets.filter((p) => p.interactionId === interactionId);
}

/**
 * Find presets by category
 */
export function getPresetsByCategory(
  presets: InteractionPreset[],
  category: string
): InteractionPreset[] {
  return presets.filter((p) => p.category === category);
}

/**
 * Search presets by name or tags
 */
export function searchPresets(presets: InteractionPreset[], query: string): InteractionPreset[] {
  const lowerQuery = query.toLowerCase();
  return presets.filter(
    (p) =>
      p.name.toLowerCase().includes(lowerQuery) ||
      p.description?.toLowerCase().includes(lowerQuery) ||
      p.tags?.some((tag) => tag.toLowerCase().includes(lowerQuery))
  );
}

/**
 * Apply a preset to a slot's interaction config
 * Attaches preset ID for usage tracking
 */
export function applyPresetToSlot(preset: InteractionPreset): BaseInteractionConfig {
  return {
    enabled: true,
    ...preset.config,
    __presetId: preset.id, // Metadata for usage tracking
    __presetName: preset.name, // Store name for reference
  };
}

/**
 * Validate preset structure
 */
export function validatePreset(preset: Partial<InteractionPreset>): string | null {
  if (!preset.id || preset.id.trim().length === 0) {
    return 'Preset ID is required';
  }

  if (!preset.name || preset.name.trim().length === 0) {
    return 'Preset name is required';
  }

  if (!preset.interactionId || preset.interactionId.trim().length === 0) {
    return 'Interaction ID is required';
  }

  if (!preset.config || typeof preset.config !== 'object') {
    return 'Preset config must be an object';
  }

  return null;
}

/**
 * Generate a unique preset ID from name
 */
export function generatePresetId(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return `${base}_${Date.now().toString(36)}`;
}

/**
 * Preset with scope information
 */
export interface PresetWithScope extends InteractionPreset {
  scope: 'global' | 'world';
}

/**
 * PHASE 4: Global Preset Support
 * Global presets are stored in localStorage and available across all worlds
 */

const GLOBAL_PRESETS_KEY = 'pixsim7:global-interaction-presets';

/**
 * Get global presets from localStorage
 */
export function getGlobalInteractionPresets(): InteractionPreset[] {
  try {
    const stored = localStorage.getItem(GLOBAL_PRESETS_KEY);
    if (!stored) return [];

    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];

    return parsed;
  } catch (e) {
    console.error('Failed to load global presets:', e);
    return [];
  }
}

/**
 * Save global presets to localStorage
 */
export function saveGlobalInteractionPresets(presets: InteractionPreset[]): void {
  try {
    localStorage.setItem(GLOBAL_PRESETS_KEY, JSON.stringify(presets));
  } catch (e) {
    console.error('Failed to save global presets:', e);
    throw new Error('Failed to save global presets');
  }
}

/**
 * Add a global preset
 */
export function addGlobalPreset(preset: InteractionPreset): void {
  const existing = getGlobalInteractionPresets();

  if (existing.some((p) => p.id === preset.id)) {
    throw new Error(`Global preset with ID "${preset.id}" already exists`);
  }

  saveGlobalInteractionPresets([...existing, preset]);
}

/**
 * Update a global preset
 */
export function updateGlobalPreset(
  presetId: string,
  updates: Partial<InteractionPreset>
): void {
  const existing = getGlobalInteractionPresets();
  const index = existing.findIndex((p) => p.id === presetId);

  if (index === -1) {
    throw new Error(`Global preset with ID "${presetId}" not found`);
  }

  const updated = [...existing];
  updated[index] = { ...updated[index], ...updates };

  saveGlobalInteractionPresets(updated);
}

/**
 * Delete a global preset
 */
export function deleteGlobalPreset(presetId: string): void {
  const existing = getGlobalInteractionPresets();
  const filtered = existing.filter((p) => p.id !== presetId);

  saveGlobalInteractionPresets(filtered);
}

/**
 * Get combined presets (global + world) with scope information
 */
export function getCombinedPresets(world: GameWorldDetail | null): PresetWithScope[] {
  const globalPresets = getGlobalInteractionPresets().map((p) => ({
    ...p,
    scope: 'global' as const,
  }));

  const worldPresets = getWorldInteractionPresets(world).map((p) => ({
    ...p,
    scope: 'world' as const,
  }));

  return [...globalPresets, ...worldPresets];
}

/**
 * Copy a world preset to global
 */
export function promotePresetToGlobal(preset: InteractionPreset): void {
  const global = getGlobalInteractionPresets();

  // Check for conflicts
  if (global.some((p) => p.id === preset.id)) {
    // Generate new ID to avoid conflicts
    const newId = generatePresetId(preset.name);
    addGlobalPreset({ ...preset, id: newId });
  } else {
    addGlobalPreset(preset);
  }
}

/**
 * Copy a global preset to world
 */
export async function copyPresetToWorld(
  preset: InteractionPreset,
  worldId: number,
  currentWorld: GameWorldDetail
): Promise<GameWorldDetail> {
  const worldPresets = getWorldInteractionPresets(currentWorld);

  // Check for conflicts
  if (worldPresets.some((p) => p.id === preset.id)) {
    // Generate new ID to avoid conflicts
    const newId = generatePresetId(preset.name);
    return await addInteractionPreset(worldId, { ...preset, id: newId }, currentWorld);
  } else {
    return await addInteractionPreset(worldId, preset, currentWorld);
  }
}

/**
 * PHASE 5: Preset Usage Tracking (Dev-Only)
 * Tracks how often presets are used in interactions
 */

const PRESET_USAGE_KEY = 'pixsim7:preset-usage-stats';

/**
 * PHASE 7: Outcome tracking for presets
 */
export type InteractionOutcome = 'success' | 'failure' | 'neutral';

export interface PresetOutcomeData {
  success: number;
  failure: number;
  neutral: number;
}

export interface PresetUsageStats {
  [presetId: string]: {
    count: number;
    lastUsed: number; // timestamp
    presetName?: string;
    outcomes?: PresetOutcomeData; // Phase 7: outcome tracking
  };
}

/**
 * Get preset usage statistics
 */
export function getPresetUsageStats(): PresetUsageStats {
  try {
    const stored = localStorage.getItem(PRESET_USAGE_KEY);
    if (!stored) return {};

    return JSON.parse(stored);
  } catch (e) {
    console.error('Failed to load preset usage stats:', e);
    return {};
  }
}

/**
 * Save preset usage statistics
 */
function savePresetUsageStats(stats: PresetUsageStats): void {
  try {
    localStorage.setItem(PRESET_USAGE_KEY, JSON.stringify(stats));
  } catch (e) {
    console.error('Failed to save preset usage stats:', e);
  }
}

/**
 * Track a preset usage
 */
export function trackPresetUsage(presetId: string, presetName?: string): void {
  const stats = getPresetUsageStats();

  if (!stats[presetId]) {
    stats[presetId] = {
      count: 0,
      lastUsed: Date.now(),
      presetName,
      outcomes: { success: 0, failure: 0, neutral: 0 },
    };
  }

  stats[presetId].count += 1;
  stats[presetId].lastUsed = Date.now();
  if (presetName) {
    stats[presetId].presetName = presetName;
  }

  // Ensure outcomes object exists (for backward compatibility)
  if (!stats[presetId].outcomes) {
    stats[presetId].outcomes = { success: 0, failure: 0, neutral: 0 };
  }

  savePresetUsageStats(stats);
}

/**
 * PHASE 7: Track preset outcome (success/failure/neutral)
 */
export function trackPresetOutcome(
  presetId: string,
  outcome: InteractionOutcome,
  presetName?: string
): void {
  const stats = getPresetUsageStats();

  if (!stats[presetId]) {
    stats[presetId] = {
      count: 0,
      lastUsed: Date.now(),
      presetName,
      outcomes: { success: 0, failure: 0, neutral: 0 },
    };
  }

  // Ensure outcomes object exists
  if (!stats[presetId].outcomes) {
    stats[presetId].outcomes = { success: 0, failure: 0, neutral: 0 };
  }

  // Increment the specific outcome counter
  stats[presetId].outcomes[outcome] += 1;

  if (presetName) {
    stats[presetId].presetName = presetName;
  }

  savePresetUsageStats(stats);
}

/**
 * Clear preset usage statistics
 */
export function clearPresetUsageStats(): void {
  try {
    localStorage.removeItem(PRESET_USAGE_KEY);
  } catch (e) {
    console.error('Failed to clear preset usage stats:', e);
  }
}

/**
 * Get preset usage statistics with preset details (Phase 7: includes outcome data)
 */
export function getPresetUsageStatsWithDetails(
  world: GameWorldDetail | null
): Array<{
  presetId: string;
  presetName: string;
  count: number;
  lastUsed: number;
  scope?: 'global' | 'world';
  outcomes: PresetOutcomeData;
  successRate: number | null;
  totalOutcomes: number;
}> {
  const stats = getPresetUsageStats();
  const presets = getCombinedPresets(world);

  return Object.entries(stats)
    .map(([presetId, data]) => {
      const preset = presets.find((p) => p.id === presetId);

      // Phase 7: Calculate outcome metrics
      const outcomes = data.outcomes || { success: 0, failure: 0, neutral: 0 };
      const totalOutcomes = outcomes.success + outcomes.failure + outcomes.neutral;
      const successRate =
        totalOutcomes > 0 ? (outcomes.success / totalOutcomes) * 100 : null;

      return {
        presetId,
        presetName: preset?.name || data.presetName || presetId,
        count: data.count,
        lastUsed: data.lastUsed,
        scope: preset?.scope,
        outcomes,
        successRate,
        totalOutcomes,
      };
    })
    .sort((a, b) => b.count - a.count); // Sort by usage count descending
}

/**
 * PHASE 6: Cross-World / Cross-Project Preset Libraries
 * Export and import presets to share across worlds and projects
 */

/**
 * Preset library export format
 */
export interface PresetLibrary {
  /** Format version for compatibility checking */
  version: string;

  /** Export metadata */
  metadata: {
    exportDate: string;
    description?: string;
    source?: string;
    author?: string;
  };

  /** Preset collection */
  presets: InteractionPreset[];
}

/**
 * Conflict resolution strategy for imports
 */
export type ConflictResolution =
  | 'skip'      // Skip presets with conflicting IDs
  | 'rename'    // Rename conflicting presets with new IDs
  | 'overwrite'; // Replace existing presets with imported ones

/**
 * Import result details
 */
export interface ImportResult {
  success: boolean;
  imported: number;
  skipped: number;
  renamed: number;
  errors: string[];
  presets: InteractionPreset[];
}

const LIBRARY_FORMAT_VERSION = '1.0';

/**
 * Export presets to a library JSON format
 */
export function exportPresetsToLibrary(
  presets: InteractionPreset[],
  metadata?: Partial<PresetLibrary['metadata']>
): PresetLibrary {
  return {
    version: LIBRARY_FORMAT_VERSION,
    metadata: {
      exportDate: new Date().toISOString(),
      description: metadata?.description,
      source: metadata?.source,
      author: metadata?.author,
    },
    presets,
  };
}

/**
 * Download presets as a JSON file
 */
export function downloadPresetsAsJSON(
  presets: InteractionPreset[],
  filename: string = 'interaction-presets.json',
  metadata?: Partial<PresetLibrary['metadata']>
): void {
  const library = exportPresetsToLibrary(presets, metadata);
  const json = JSON.stringify(library, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}

/**
 * Validate preset library format
 */
export function validatePresetLibrary(data: any): string | null {
  if (!data || typeof data !== 'object') {
    return 'Invalid library format: must be an object';
  }

  if (!data.version || typeof data.version !== 'string') {
    return 'Invalid library format: missing or invalid version';
  }

  // Check version compatibility (currently only support 1.x)
  const majorVersion = data.version.split('.')[0];
  if (majorVersion !== '1') {
    return `Unsupported library version: ${data.version}. This tool supports version 1.x only.`;
  }

  if (!data.metadata || typeof data.metadata !== 'object') {
    return 'Invalid library format: missing or invalid metadata';
  }

  if (!Array.isArray(data.presets)) {
    return 'Invalid library format: presets must be an array';
  }

  // Validate each preset
  for (let i = 0; i < data.presets.length; i++) {
    const preset = data.presets[i];
    const error = validatePreset(preset);
    if (error) {
      return `Invalid preset at index ${i}: ${error}`;
    }
  }

  return null;
}

/**
 * Import presets from library with conflict resolution
 *
 * @param library - Preset library to import
 * @param target - 'global' or world ID for world-specific import
 * @param conflictResolution - How to handle ID conflicts
 * @param currentWorld - Current world (required for world imports)
 * @returns Import result with details
 */
export async function importPresetsFromLibrary(
  library: PresetLibrary,
  target: 'global' | number,
  conflictResolution: ConflictResolution = 'skip',
  currentWorld?: GameWorldDetail
): Promise<ImportResult> {
  const result: ImportResult = {
    success: false,
    imported: 0,
    skipped: 0,
    renamed: 0,
    errors: [],
    presets: [],
  };

  // Validate library format
  const validationError = validatePresetLibrary(library);
  if (validationError) {
    result.errors.push(validationError);
    return result;
  }

  // Get existing presets based on target
  const existingPresets = target === 'global'
    ? getGlobalInteractionPresets()
    : getWorldInteractionPresets(currentWorld || null);

  const existingIds = new Set(existingPresets.map(p => p.id));

  // Process each preset
  for (const preset of library.presets) {
    const hasConflict = existingIds.has(preset.id);

    if (hasConflict) {
      if (conflictResolution === 'skip') {
        result.skipped++;
        continue;
      } else if (conflictResolution === 'rename') {
        // Generate new ID
        const newId = generatePresetId(preset.name);
        const renamedPreset = { ...preset, id: newId };

        try {
          if (target === 'global') {
            addGlobalPreset(renamedPreset);
          } else if (currentWorld) {
            await addInteractionPreset(target, renamedPreset, currentWorld);
            // Update currentWorld reference for next iteration
            currentWorld = setWorldInteractionPresets(currentWorld, [
              ...getWorldInteractionPresets(currentWorld),
              renamedPreset,
            ]);
          }
          result.imported++;
          result.renamed++;
          result.presets.push(renamedPreset);
          existingIds.add(newId);
        } catch (e) {
          result.errors.push(`Failed to import renamed preset "${preset.name}": ${e}`);
        }
      } else if (conflictResolution === 'overwrite') {
        try {
          if (target === 'global') {
            updateGlobalPreset(preset.id, preset);
          } else if (currentWorld) {
            await updateInteractionPreset(target, preset.id, preset, currentWorld);
          }
          result.imported++;
          result.presets.push(preset);
        } catch (e) {
          result.errors.push(`Failed to overwrite preset "${preset.name}": ${e}`);
        }
      }
    } else {
      // No conflict, add normally
      try {
        if (target === 'global') {
          addGlobalPreset(preset);
        } else if (currentWorld) {
          await addInteractionPreset(target, preset, currentWorld);
          // Update currentWorld reference for next iteration
          currentWorld = setWorldInteractionPresets(currentWorld, [
            ...getWorldInteractionPresets(currentWorld),
            preset,
          ]);
        }
        result.imported++;
        result.presets.push(preset);
        existingIds.add(preset.id);
      } catch (e) {
        result.errors.push(`Failed to import preset "${preset.name}": ${e}`);
      }
    }
  }

  result.success = result.errors.length === 0;
  return result;
}

/**
 * Parse preset library from JSON string
 */
export function parsePresetLibrary(json: string): PresetLibrary | null {
  try {
    const data = JSON.parse(json);
    const error = validatePresetLibrary(data);
    if (error) {
      console.error('Library validation failed:', error);
      return null;
    }
    return data as PresetLibrary;
  } catch (e) {
    console.error('Failed to parse preset library:', e);
    return null;
  }
}

/**
 * Import presets from a JSON file
 */
export async function importPresetsFromFile(
  file: File,
  target: 'global' | number,
  conflictResolution: ConflictResolution = 'skip',
  currentWorld?: GameWorldDetail
): Promise<ImportResult> {
  try {
    const text = await file.text();
    const library = parsePresetLibrary(text);

    if (!library) {
      return {
        success: false,
        imported: 0,
        skipped: 0,
        renamed: 0,
        errors: ['Failed to parse preset library file'],
        presets: [],
      };
    }

    return await importPresetsFromLibrary(library, target, conflictResolution, currentWorld);
  } catch (e) {
    return {
      success: false,
      imported: 0,
      skipped: 0,
      renamed: 0,
      errors: [`Failed to read file: ${e}`],
      presets: [],
    };
  }
}

/**
 * PHASE 8: Context-Aware Preset Suggestions
 * Suggest relevant presets based on NPC roles, world tags, and usage patterns
 */

export interface SuggestionContext {
  /** Current NPC role (if applicable) */
  npcRole?: string;

  /** World tags from current world metadata */
  worldTags?: string[];

  /** Situation tags describing current context */
  situationTags?: string[];

  /** Current world detail for usage stats */
  world?: GameWorldDetail | null;

  /** Selected interaction ID to filter by */
  interactionId?: string;
}

export interface PresetSuggestion extends PresetWithScope {
  /** Suggestion score (0-100, higher is better) */
  score: number;

  /** Reasons why this preset was suggested */
  reasons: string[];
}

/**
 * Calculate suggestion score for a preset based on context
 */
function calculateSuggestionScore(
  preset: PresetWithScope,
  context: SuggestionContext,
  usageStats: ReturnType<typeof getPresetUsageStatsWithDetails>
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  // Filter by interaction type (essential)
  if (context.interactionId && preset.interactionId !== context.interactionId) {
    return { score: 0, reasons: [] };
  }

  // 1. NPC Role matching (30 points max)
  if (context.npcRole && preset.recommendedRoles?.length) {
    const roleMatch = preset.recommendedRoles.some(
      (role) => role.toLowerCase() === context.npcRole?.toLowerCase()
    );
    if (roleMatch) {
      score += 30;
      reasons.push(`Matches NPC role: ${context.npcRole}`);
    }
  }

  // 2. World tags matching (25 points max)
  if (context.worldTags?.length && preset.worldTags?.length) {
    const matchingWorldTags = preset.worldTags.filter((tag) =>
      context.worldTags?.some((wt) => wt.toLowerCase() === tag.toLowerCase())
    );
    if (matchingWorldTags.length > 0) {
      const tagScore = Math.min(25, matchingWorldTags.length * 10);
      score += tagScore;
      reasons.push(`World tags: ${matchingWorldTags.join(', ')}`);
    }
  }

  // 3. Situation tags matching (25 points max)
  if (context.situationTags?.length && preset.situationTags?.length) {
    const matchingSituationTags = preset.situationTags.filter((tag) =>
      context.situationTags?.some((st) => st.toLowerCase() === tag.toLowerCase())
    );
    if (matchingSituationTags.length > 0) {
      const tagScore = Math.min(25, matchingSituationTags.length * 10);
      score += tagScore;
      reasons.push(`Situation: ${matchingSituationTags.join(', ')}`);
    }
  }

  // 4. Recent usage in current world (20 points max)
  const stats = usageStats.find((s) => s.presetId === preset.id);
  if (stats && stats.count > 0) {
    // More recent usage gets higher score
    const now = Date.now();
    const hoursSinceLastUse = (now - stats.lastUsed) / (1000 * 60 * 60);

    if (hoursSinceLastUse < 24) {
      score += 20;
      reasons.push('Used recently (< 24h)');
    } else if (hoursSinceLastUse < 168) {
      // < 1 week
      score += 15;
      reasons.push('Used this week');
    } else if (stats.count >= 3) {
      score += 10;
      reasons.push('Frequently used');
    }
  }

  // 5. Success rate bonus (Phase 7 integration, max 10 points)
  if (stats?.successRate !== null && stats.successRate !== undefined) {
    if (stats.successRate >= 70) {
      score += 10;
      reasons.push(`High success rate (${stats.successRate.toFixed(0)}%)`);
    } else if (stats.successRate >= 40) {
      score += 5;
      reasons.push(`Moderate success rate (${stats.successRate.toFixed(0)}%)`);
    }
  }

  // 6. Base score for any preset without context (ensures all presets get some score)
  if (score === 0) {
    score = 10; // Minimum score for any valid preset
  }

  return { score: Math.min(100, score), reasons };
}

/**
 * Get suggested presets for a given context, sorted by relevance
 */
export function getSuggestedPresets(
  presets: PresetWithScope[],
  context: SuggestionContext,
  maxSuggestions: number = 5
): PresetSuggestion[] {
  const usageStats = getPresetUsageStatsWithDetails(context.world || null);

  const suggestions = presets
    .map((preset) => {
      const { score, reasons } = calculateSuggestionScore(preset, context, usageStats);
      return {
        ...preset,
        score,
        reasons,
      };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSuggestions);

  return suggestions;
}

/**
 * Get top N recommended presets with a minimum score threshold
 */
export function getRecommendedPresets(
  presets: PresetWithScope[],
  context: SuggestionContext,
  minScore: number = 30,
  maxResults: number = 3
): PresetSuggestion[] {
  const suggestions = getSuggestedPresets(presets, context, maxResults * 2);
  return suggestions.filter((s) => s.score >= minScore).slice(0, maxResults);
}

/**
 * Built-in preset examples (can be used as templates)
 */
export const EXAMPLE_PRESETS: InteractionPreset[] = [
  {
    id: 'flirt_friendly',
    name: 'Flirt (Friendly)',
    interactionId: 'persuade',
    category: 'romance',
    description: 'A friendly, low-pressure flirtation attempt',
    icon: '💕',
    tags: ['romance', 'friendly', 'low-risk'],
    config: {
      persuasionType: 'flirt',
      difficulty: 'easy',
      baseSuccessChance: 0.7,
      relationshipChange: 5,
    },
  },
  {
    id: 'trade_basic',
    name: 'Trade (Basic)',
    interactionId: 'trade',
    category: 'trade',
    description: 'Basic item trading with fair prices',
    icon: '🛒',
    tags: ['trade', 'shop', 'merchant'],
    config: {
      priceMultiplier: 1.0,
      canBuyBack: true,
      acceptedItemTypes: ['common', 'uncommon'],
    },
  },
  {
    id: 'pickpocket_novice',
    name: 'Pickpocket (Novice)',
    interactionId: 'pickpocket',
    category: 'stealth',
    description: 'Easy pickpocket attempt for beginners',
    icon: '🤏',
    tags: ['stealth', 'theft', 'easy'],
    config: {
      baseSuccessChance: 0.5,
      detectionChance: 0.3,
      onSuccessFlags: ['pickpocket_success'],
      onFailFlags: ['pickpocket_fail'],
    },
  },
];
