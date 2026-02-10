/**
 * Interaction Preset System
 *
 * App-specific storage and I/O layer. Pure logic (types, validation,
 * filtering, conflict detection, suggestions, playlist evaluation) is in
 * @pixsim7/game.engine — re-exported here for convenience.
 */

import {
  type InteractionPreset,
  type PresetWithScope,
  type PresetLibrary,
  type ConflictResolution,
  type ImportResult,
  type PresetUsageStats,
  type PresetPlaylist,
  type PlaylistWithScope,
  type SuggestionContext,
  type PresetSuggestion,
  type InteractionOutcome,
  generatePresetId,
  exportPresetsToLibrary,
  validatePresetLibrary,
  parsePresetLibrary,
  buildUsageDetails,
  getRecommendedPresets as getRecommendedPresetsCore,
} from '@pixsim7/game.engine';

import type { GameWorldDetail } from '../../api/game';
import { updateGameWorldMeta, saveGameWorldMeta } from '../../api/game';

// Re-export everything from the pure logic module
export {
  // Types
  type InteractionPreset,
  type PresetCategory,
  type PresetWithScope,
  type PresetLibrary,
  type ConflictResolution,
  type ImportResult,
  type ConflictSeverity,
  type ConflictWarning,
  type InteractionOutcome,
  type PresetOutcomeData,
  type PresetUsageStats,
  type PresetUsageDetail,
  type SuggestionContext,
  type PresetSuggestion,
  type PlaylistCondition,
  type PlaylistItem,
  type PresetPlaylist,
  type PlaylistWithScope,
  type PlaylistExecutionState,
  type PlaylistExecutionHandlers,
  // Constants
  PRESET_CATEGORIES,
  EXAMPLE_PRESETS,
  // Filtering & search
  getPresetsForInteraction,
  getPresetsByCategory,
  searchPresets,
  // Apply & validate
  applyPresetToSlot,
  validatePreset,
  generatePresetId,
  // Library format
  exportPresetsToLibrary,
  validatePresetLibrary,
  parsePresetLibrary,
  // Conflicts
  validateActivePresets,
  getConflictSummary,
  // Suggestions
  getSuggestedPresets,
  getRecommendedPresets as getRecommendedPresetsCore,
  buildUsageDetails,
  // Playlists
  generatePlaylistId,
  validatePlaylist,
  evaluatePlaylistCondition,
  executePlaylist,
} from '@pixsim7/game.engine';

// ============================================================================
// World Preset Storage
// ============================================================================

export function getWorldInteractionPresets(world: GameWorldDetail | null): InteractionPreset[] {
  if (!world?.meta) return [];
  const presets = (world.meta as any).interactionPresets;
  if (!Array.isArray(presets)) return [];
  return presets;
}

export function loadWorldInteractionPresets(world: GameWorldDetail | null): InteractionPreset[] {
  return getWorldInteractionPresets(world);
}

export function setWorldInteractionPresets(
  world: GameWorldDetail,
  presets: InteractionPreset[],
): GameWorldDetail {
  return { ...world, meta: { ...world.meta, interactionPresets: presets } };
}

export async function saveWorldInteractionPresets(
  worldId: number,
  presets: InteractionPreset[],
  currentMeta: Record<string, unknown>,
): Promise<GameWorldDetail> {
  return await updateGameWorldMeta(worldId, { ...currentMeta, interactionPresets: presets });
}

export async function addInteractionPreset(
  worldId: number,
  preset: InteractionPreset,
  currentWorld: GameWorldDetail,
): Promise<GameWorldDetail> {
  const existing = getWorldInteractionPresets(currentWorld);
  if (existing.some((p) => p.id === preset.id)) {
    throw new Error(`Preset with ID "${preset.id}" already exists`);
  }
  return await saveWorldInteractionPresets(worldId, [...existing, preset], currentWorld.meta || {});
}

export async function updateInteractionPreset(
  worldId: number,
  presetId: string,
  updates: Partial<InteractionPreset>,
  currentWorld: GameWorldDetail,
): Promise<GameWorldDetail> {
  const existing = getWorldInteractionPresets(currentWorld);
  const idx = existing.findIndex((p) => p.id === presetId);
  if (idx === -1) throw new Error(`Preset with ID "${presetId}" not found`);
  const updated = [...existing];
  updated[idx] = { ...updated[idx], ...updates };
  return await saveWorldInteractionPresets(worldId, updated, currentWorld.meta || {});
}

export async function deleteInteractionPreset(
  worldId: number,
  presetId: string,
  currentWorld: GameWorldDetail,
): Promise<GameWorldDetail> {
  const existing = getWorldInteractionPresets(currentWorld);
  return await saveWorldInteractionPresets(
    worldId,
    existing.filter((p) => p.id !== presetId),
    currentWorld.meta || {},
  );
}

// ============================================================================
// Global Preset Storage (localStorage)
// ============================================================================

const GLOBAL_PRESETS_KEY = 'pixsim7:global-interaction-presets';

export function getGlobalInteractionPresets(): InteractionPreset[] {
  try {
    const stored = localStorage.getItem(GLOBAL_PRESETS_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('Failed to load global presets:', e);
    return [];
  }
}

export function saveGlobalInteractionPresets(presets: InteractionPreset[]): void {
  try {
    localStorage.setItem(GLOBAL_PRESETS_KEY, JSON.stringify(presets));
  } catch (e) {
    console.error('Failed to save global presets:', e);
    throw new Error('Failed to save global presets');
  }
}

export function addGlobalPreset(preset: InteractionPreset): void {
  const existing = getGlobalInteractionPresets();
  if (existing.some((p) => p.id === preset.id)) {
    throw new Error(`Global preset with ID "${preset.id}" already exists`);
  }
  saveGlobalInteractionPresets([...existing, preset]);
}

export function updateGlobalPreset(presetId: string, updates: Partial<InteractionPreset>): void {
  const existing = getGlobalInteractionPresets();
  const idx = existing.findIndex((p) => p.id === presetId);
  if (idx === -1) throw new Error(`Global preset with ID "${presetId}" not found`);
  const updated = [...existing];
  updated[idx] = { ...updated[idx], ...updates };
  saveGlobalInteractionPresets(updated);
}

export function deleteGlobalPreset(presetId: string): void {
  const existing = getGlobalInteractionPresets();
  saveGlobalInteractionPresets(existing.filter((p) => p.id !== presetId));
}

// ============================================================================
// Combined Presets
// ============================================================================

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

export function promotePresetToGlobal(preset: InteractionPreset): void {
  const global = getGlobalInteractionPresets();
  if (global.some((p) => p.id === preset.id)) {
    addGlobalPreset({ ...preset, id: generatePresetId(preset.name) });
  } else {
    addGlobalPreset(preset);
  }
}

export async function copyPresetToWorld(
  preset: InteractionPreset,
  worldId: number,
  currentWorld: GameWorldDetail,
): Promise<GameWorldDetail> {
  const worldPresets = getWorldInteractionPresets(currentWorld);
  if (worldPresets.some((p) => p.id === preset.id)) {
    return await addInteractionPreset(
      worldId,
      { ...preset, id: generatePresetId(preset.name) },
      currentWorld,
    );
  }
  return await addInteractionPreset(worldId, preset, currentWorld);
}

// ============================================================================
// Usage Tracking (localStorage)
// ============================================================================

const PRESET_USAGE_KEY = 'pixsim7:preset-usage-stats';

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

function savePresetUsageStats(stats: PresetUsageStats): void {
  try {
    localStorage.setItem(PRESET_USAGE_KEY, JSON.stringify(stats));
  } catch (e) {
    console.error('Failed to save preset usage stats:', e);
  }
}

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
  if (presetName) stats[presetId].presetName = presetName;
  if (!stats[presetId].outcomes) {
    stats[presetId].outcomes = { success: 0, failure: 0, neutral: 0 };
  }
  savePresetUsageStats(stats);
}

export function trackPresetOutcome(
  presetId: string,
  outcome: InteractionOutcome,
  presetName?: string,
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
  if (!stats[presetId].outcomes) {
    stats[presetId].outcomes = { success: 0, failure: 0, neutral: 0 };
  }
  stats[presetId].outcomes![outcome] += 1;
  if (presetName) stats[presetId].presetName = presetName;
  savePresetUsageStats(stats);
}

export function clearPresetUsageStats(): void {
  try {
    localStorage.removeItem(PRESET_USAGE_KEY);
  } catch (e) {
    console.error('Failed to clear preset usage stats:', e);
  }
}

/**
 * Get usage stats enriched with preset details (convenience wrapper).
 */
export function getPresetUsageStatsWithDetails(
  world: GameWorldDetail | null,
) {
  return buildUsageDetails(getPresetUsageStats(), getCombinedPresets(world));
}

/**
 * App-level wrapper that auto-resolves usage stats from localStorage.
 */
export function getRecommendedPresets(
  presets: PresetWithScope[],
  context: SuggestionContext & { world?: GameWorldDetail | null },
  minScore: number = 30,
  maxResults: number = 3,
): PresetSuggestion[] {
  const usageDetails = getPresetUsageStatsWithDetails(context.world || null);
  return getRecommendedPresetsCore(presets, context, usageDetails, minScore, maxResults);
}

// ============================================================================
// File I/O (Browser)
// ============================================================================

export function downloadPresetsAsJSON(
  presets: InteractionPreset[],
  filename: string = 'interaction-presets.json',
  metadata?: Partial<PresetLibrary['metadata']>,
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

export async function importPresetsFromLibrary(
  library: PresetLibrary,
  target: 'global' | number,
  conflictResolution: ConflictResolution = 'skip',
  currentWorld?: GameWorldDetail,
): Promise<ImportResult> {
  const result: ImportResult = {
    success: false,
    imported: 0,
    skipped: 0,
    renamed: 0,
    errors: [],
    presets: [],
  };

  const validationError = validatePresetLibrary(library);
  if (validationError) {
    result.errors.push(validationError);
    return result;
  }

  const existingPresets =
    target === 'global'
      ? getGlobalInteractionPresets()
      : getWorldInteractionPresets(currentWorld || null);
  const existingIds = new Set(existingPresets.map((p) => p.id));

  for (const preset of library.presets) {
    const hasConflict = existingIds.has(preset.id);

    if (hasConflict) {
      if (conflictResolution === 'skip') {
        result.skipped++;
        continue;
      } else if (conflictResolution === 'rename') {
        const newId = generatePresetId(preset.name);
        const renamedPreset = { ...preset, id: newId };
        try {
          if (target === 'global') {
            addGlobalPreset(renamedPreset);
          } else if (currentWorld) {
            await addInteractionPreset(target, renamedPreset, currentWorld);
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
      try {
        if (target === 'global') {
          addGlobalPreset(preset);
        } else if (currentWorld) {
          await addInteractionPreset(target, preset, currentWorld);
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

export async function importPresetsFromFile(
  file: File,
  target: 'global' | number,
  conflictResolution: ConflictResolution = 'skip',
  currentWorld?: GameWorldDetail,
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

// ============================================================================
// Playlist Storage
// ============================================================================

const GLOBAL_PLAYLISTS_KEY = 'pixsim7:interaction-playlists:global';

export function getGlobalPlaylists(): PresetPlaylist[] {
  try {
    const data = localStorage.getItem(GLOBAL_PLAYLISTS_KEY);
    if (!data) return [];
    return JSON.parse(data);
  } catch (e) {
    console.error('Failed to load global playlists:', e);
    return [];
  }
}

export function saveGlobalPlaylists(playlists: PresetPlaylist[]): void {
  try {
    localStorage.setItem(GLOBAL_PLAYLISTS_KEY, JSON.stringify(playlists));
  } catch (e) {
    console.error('Failed to save global playlists:', e);
  }
}

export function getWorldPlaylists(world: GameWorldDetail | null): PresetPlaylist[] {
  if (!world?.meta) return [];
  return (world.meta as any).interactionPlaylists || [];
}

export function setWorldPlaylists(
  world: GameWorldDetail,
  playlists: PresetPlaylist[],
): GameWorldDetail {
  return { ...world, meta: { ...(world.meta || {}), interactionPlaylists: playlists } };
}

export function getCombinedPlaylists(world: GameWorldDetail | null): PlaylistWithScope[] {
  const global = getGlobalPlaylists().map((p) => ({ ...p, scope: 'global' as const }));
  const worldPlaylists = getWorldPlaylists(world).map((p) => ({ ...p, scope: 'world' as const }));
  return [...global, ...worldPlaylists];
}

export function addGlobalPlaylist(playlist: PresetPlaylist): void {
  const playlists = getGlobalPlaylists();
  playlists.push(playlist);
  saveGlobalPlaylists(playlists);
}

export async function addWorldPlaylist(
  worldId: number,
  playlist: PresetPlaylist,
  currentWorld: GameWorldDetail,
): Promise<void> {
  const playlists = getWorldPlaylists(currentWorld);
  playlists.push(playlist);
  const updatedWorld = setWorldPlaylists(currentWorld, playlists);
  await saveGameWorldMeta(worldId, updatedWorld.meta);
}

export function updateGlobalPlaylist(id: string, updates: Partial<PresetPlaylist>): void {
  const playlists = getGlobalPlaylists();
  const idx = playlists.findIndex((p) => p.id === id);
  if (idx >= 0) {
    playlists[idx] = { ...playlists[idx], ...updates };
    saveGlobalPlaylists(playlists);
  }
}

export async function updateWorldPlaylist(
  worldId: number,
  id: string,
  updates: Partial<PresetPlaylist>,
  currentWorld: GameWorldDetail,
): Promise<void> {
  const playlists = getWorldPlaylists(currentWorld);
  const idx = playlists.findIndex((p) => p.id === id);
  if (idx >= 0) {
    playlists[idx] = { ...playlists[idx], ...updates };
    const updatedWorld = setWorldPlaylists(currentWorld, playlists);
    await saveGameWorldMeta(worldId, updatedWorld.meta);
  }
}

export function deleteGlobalPlaylist(id: string): void {
  const playlists = getGlobalPlaylists();
  saveGlobalPlaylists(playlists.filter((p) => p.id !== id));
}

export async function deleteWorldPlaylist(
  worldId: number,
  id: string,
  currentWorld: GameWorldDetail,
): Promise<void> {
  const playlists = getWorldPlaylists(currentWorld);
  const updatedWorld = setWorldPlaylists(
    currentWorld,
    playlists.filter((p) => p.id !== id),
  );
  await saveGameWorldMeta(worldId, updatedWorld.meta);
}
