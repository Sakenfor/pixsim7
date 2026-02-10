/**
 * Interaction Preset System — Pure Logic
 *
 * Types, validation, filtering, conflict detection, suggestions, playlist
 * evaluation, and import/export format helpers. No I/O or storage — callers
 * supply their own storage adapters.
 */

import type { BaseInteractionConfig } from './registry';

// ============================================================================
// Core Types
// ============================================================================

export interface InteractionPreset {
  id: string;
  name: string;
  interactionId: string;
  config: Record<string, any>;
  category?: string;
  description?: string;
  tags?: string[];
  icon?: string;
  recommendedRoles?: string[];
  worldTags?: string[];
  situationTags?: string[];
}

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

export interface PresetWithScope extends InteractionPreset {
  scope: 'global' | 'world';
}

// ============================================================================
// Filtering & Search
// ============================================================================

export function getPresetsForInteraction(
  presets: InteractionPreset[],
  interactionId: string,
): InteractionPreset[] {
  return presets.filter((p) => p.interactionId === interactionId);
}

export function getPresetsByCategory(
  presets: InteractionPreset[],
  category: string,
): InteractionPreset[] {
  return presets.filter((p) => p.category === category);
}

export function searchPresets(presets: InteractionPreset[], query: string): InteractionPreset[] {
  const lowerQuery = query.toLowerCase();
  return presets.filter(
    (p) =>
      p.name.toLowerCase().includes(lowerQuery) ||
      p.description?.toLowerCase().includes(lowerQuery) ||
      p.tags?.some((tag) => tag.toLowerCase().includes(lowerQuery)),
  );
}

// ============================================================================
// Apply & Validate
// ============================================================================

export function applyPresetToSlot(preset: InteractionPreset): BaseInteractionConfig {
  return {
    enabled: true,
    ...preset.config,
    __presetId: preset.id,
    __presetName: preset.name,
  };
}

export function validatePreset(preset: Partial<InteractionPreset>): string | null {
  if (!preset.id || preset.id.trim().length === 0) return 'Preset ID is required';
  if (!preset.name || preset.name.trim().length === 0) return 'Preset name is required';
  if (!preset.interactionId || preset.interactionId.trim().length === 0)
    return 'Interaction ID is required';
  if (!preset.config || typeof preset.config !== 'object') return 'Preset config must be an object';
  return null;
}

export function generatePresetId(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `${base}_${Date.now().toString(36)}`;
}

// ============================================================================
// Library Import/Export Format
// ============================================================================

export interface PresetLibrary {
  version: string;
  metadata: {
    exportDate: string;
    description?: string;
    source?: string;
    author?: string;
  };
  presets: InteractionPreset[];
}

export type ConflictResolution = 'skip' | 'rename' | 'overwrite';

export interface ImportResult {
  success: boolean;
  imported: number;
  skipped: number;
  renamed: number;
  errors: string[];
  presets: InteractionPreset[];
}

const LIBRARY_FORMAT_VERSION = '1.0';

export function exportPresetsToLibrary(
  presets: InteractionPreset[],
  metadata?: Partial<PresetLibrary['metadata']>,
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

export function validatePresetLibrary(data: any): string | null {
  if (!data || typeof data !== 'object') return 'Invalid library format: must be an object';
  if (!data.version || typeof data.version !== 'string')
    return 'Invalid library format: missing or invalid version';
  const majorVersion = data.version.split('.')[0];
  if (majorVersion !== '1')
    return `Unsupported library version: ${data.version}. This tool supports version 1.x only.`;
  if (!data.metadata || typeof data.metadata !== 'object')
    return 'Invalid library format: missing or invalid metadata';
  if (!Array.isArray(data.presets)) return 'Invalid library format: presets must be an array';
  for (let i = 0; i < data.presets.length; i++) {
    const error = validatePreset(data.presets[i]);
    if (error) return `Invalid preset at index ${i}: ${error}`;
  }
  return null;
}

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

// ============================================================================
// Conflict Detection
// ============================================================================

export type ConflictSeverity = 'warning' | 'error' | 'info';

export interface ConflictWarning {
  severity: ConflictSeverity;
  message: string;
  presetIds: string[];
  suggestion?: string;
  type: string;
}

function checkDuplicateInteractions(
  activePresets: Array<{ presetId: string; interactionId: string; presetName: string }>,
): ConflictWarning[] {
  const warnings: ConflictWarning[] = [];
  const interactionGroups = new Map<string, Array<{ presetId: string; presetName: string }>>();

  for (const preset of activePresets) {
    if (!interactionGroups.has(preset.interactionId)) {
      interactionGroups.set(preset.interactionId, []);
    }
    interactionGroups.get(preset.interactionId)!.push({
      presetId: preset.presetId,
      presetName: preset.presetName,
    });
  }

  for (const [interactionId, group] of interactionGroups.entries()) {
    if (group.length > 1) {
      warnings.push({
        severity: 'warning',
        message: `Multiple presets configured for ${interactionId}: ${group.map((p) => p.presetName).join(', ')}`,
        presetIds: group.map((p) => p.presetId),
        suggestion:
          'Consider using only one preset per interaction type, or ensure configurations are compatible',
        type: 'duplicate-interaction',
      });
    }
  }

  return warnings;
}

function checkConfigConflicts(
  activePresets: Array<{
    presetId: string;
    presetName: string;
    config: Record<string, any>;
  }>,
): ConflictWarning[] {
  const warnings: ConflictWarning[] = [];

  const exclusiveFlags: Record<string, string[]> = {
    aggressive: ['friendly', 'passive'],
    friendly: ['aggressive', 'hostile'],
    hostile: ['friendly', 'passive'],
    stealth: ['loud', 'obvious'],
  };

  for (let i = 0; i < activePresets.length; i++) {
    for (let j = i + 1; j < activePresets.length; j++) {
      const preset1 = activePresets[i];
      const preset2 = activePresets[j];

      for (const [flag, exclusives] of Object.entries(exclusiveFlags)) {
        if (preset1.config[flag] && exclusives.some((ex) => preset2.config[ex])) {
          warnings.push({
            severity: 'error',
            message: `Conflicting flags: "${preset1.presetName}" has ${flag}, "${preset2.presetName}" has conflicting behavior`,
            presetIds: [preset1.presetId, preset2.presetId],
            suggestion: `Remove one of the conflicting presets or adjust their configurations`,
            type: 'config-conflict',
          });
        }
      }

      const sharedKeys = Object.keys(preset1.config).filter((k) =>
        Object.keys(preset2.config).includes(k),
      );
      for (const key of sharedKeys) {
        const val1 = preset1.config[key];
        const val2 = preset2.config[key];
        if (typeof val1 === 'boolean' && typeof val2 === 'boolean' && val1 !== val2) {
          warnings.push({
            severity: 'warning',
            message: `Contradictory setting "${key}": "${preset1.presetName}" sets to ${val1}, "${preset2.presetName}" sets to ${val2}`,
            presetIds: [preset1.presetId, preset2.presetId],
            suggestion: 'Verify which setting should take precedence',
            type: 'boolean-contradiction',
          });
        }
      }
    }
  }

  return warnings;
}

function checkPerformanceConcerns(
  activePresets: Array<{ presetId: string; presetName: string }>,
): ConflictWarning[] {
  const warnings: ConflictWarning[] = [];

  if (activePresets.length > 5) {
    warnings.push({
      severity: 'info',
      message: `${activePresets.length} presets active. This may impact performance.`,
      presetIds: activePresets.map((p) => p.presetId),
      suggestion: 'Consider consolidating presets or disabling unused ones',
      type: 'performance',
    });
  }

  return warnings;
}

export function validateActivePresets(interactions: Record<string, any>): ConflictWarning[] {
  const activePresets: Array<{
    presetId: string;
    presetName: string;
    interactionId: string;
    config: Record<string, any>;
  }> = [];

  for (const [interactionId, config] of Object.entries(interactions)) {
    if (config?.enabled && config?.__presetId) {
      activePresets.push({
        presetId: config.__presetId,
        presetName: config.__presetName || config.__presetId,
        interactionId,
        config,
      });
    }
  }

  if (activePresets.length === 0) return [];

  return [
    ...checkDuplicateInteractions(activePresets),
    ...checkConfigConflicts(activePresets),
    ...checkPerformanceConcerns(activePresets),
  ];
}

export function getConflictSummary(warnings: ConflictWarning[]): {
  errors: number;
  warnings: number;
  info: number;
  total: number;
} {
  return {
    errors: warnings.filter((w) => w.severity === 'error').length,
    warnings: warnings.filter((w) => w.severity === 'warning').length,
    info: warnings.filter((w) => w.severity === 'info').length,
    total: warnings.length,
  };
}

// ============================================================================
// Context-Aware Suggestions
// ============================================================================

export type InteractionOutcome = 'success' | 'failure' | 'neutral';

export interface PresetOutcomeData {
  success: number;
  failure: number;
  neutral: number;
}

export interface PresetUsageStats {
  [presetId: string]: {
    count: number;
    lastUsed: number;
    presetName?: string;
    outcomes?: PresetOutcomeData;
  };
}

export interface PresetUsageDetail {
  presetId: string;
  presetName: string;
  count: number;
  lastUsed: number;
  scope?: 'global' | 'world';
  outcomes: PresetOutcomeData;
  successRate: number | null;
  totalOutcomes: number;
}

export interface SuggestionContext {
  npcRole?: string;
  worldTags?: string[];
  situationTags?: string[];
  interactionId?: string;
}

export interface PresetSuggestion extends PresetWithScope {
  score: number;
  reasons: string[];
}

function calculateSuggestionScore(
  preset: PresetWithScope,
  context: SuggestionContext,
  usageDetails: PresetUsageDetail[],
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  if (context.interactionId && preset.interactionId !== context.interactionId) {
    return { score: 0, reasons: [] };
  }

  // NPC Role matching (30 points max)
  if (context.npcRole && preset.recommendedRoles?.length) {
    const roleMatch = preset.recommendedRoles.some(
      (role) => role.toLowerCase() === context.npcRole?.toLowerCase(),
    );
    if (roleMatch) {
      score += 30;
      reasons.push(`Matches NPC role: ${context.npcRole}`);
    }
  }

  // World tags matching (25 points max)
  if (context.worldTags?.length && preset.worldTags?.length) {
    const matchingWorldTags = preset.worldTags.filter((tag) =>
      context.worldTags?.some((wt) => wt.toLowerCase() === tag.toLowerCase()),
    );
    if (matchingWorldTags.length > 0) {
      score += Math.min(25, matchingWorldTags.length * 10);
      reasons.push(`World tags: ${matchingWorldTags.join(', ')}`);
    }
  }

  // Situation tags matching (25 points max)
  if (context.situationTags?.length && preset.situationTags?.length) {
    const matchingSituationTags = preset.situationTags.filter((tag) =>
      context.situationTags?.some((st) => st.toLowerCase() === tag.toLowerCase()),
    );
    if (matchingSituationTags.length > 0) {
      score += Math.min(25, matchingSituationTags.length * 10);
      reasons.push(`Situation: ${matchingSituationTags.join(', ')}`);
    }
  }

  // Recent usage (20 points max)
  const stats = usageDetails.find((s) => s.presetId === preset.id);
  if (stats && stats.count > 0) {
    const now = Date.now();
    const hoursSinceLastUse = (now - stats.lastUsed) / (1000 * 60 * 60);
    if (hoursSinceLastUse < 24) {
      score += 20;
      reasons.push('Used recently (< 24h)');
    } else if (hoursSinceLastUse < 168) {
      score += 15;
      reasons.push('Used this week');
    } else if (stats.count >= 3) {
      score += 10;
      reasons.push('Frequently used');
    }
  }

  // Success rate bonus (10 points max)
  if (stats?.successRate !== null && stats?.successRate !== undefined) {
    if (stats.successRate >= 70) {
      score += 10;
      reasons.push(`High success rate (${stats.successRate.toFixed(0)}%)`);
    } else if (stats.successRate >= 40) {
      score += 5;
      reasons.push(`Moderate success rate (${stats.successRate.toFixed(0)}%)`);
    }
  }

  if (score === 0) score = 10;

  return { score: Math.min(100, score), reasons };
}

export function getSuggestedPresets(
  presets: PresetWithScope[],
  context: SuggestionContext,
  usageDetails: PresetUsageDetail[],
  maxSuggestions: number = 5,
): PresetSuggestion[] {
  return presets
    .map((preset) => {
      const { score, reasons } = calculateSuggestionScore(preset, context, usageDetails);
      return { ...preset, score, reasons };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSuggestions);
}

export function getRecommendedPresets(
  presets: PresetWithScope[],
  context: SuggestionContext,
  usageDetails: PresetUsageDetail[],
  minScore: number = 30,
  maxResults: number = 3,
): PresetSuggestion[] {
  const suggestions = getSuggestedPresets(presets, context, usageDetails, maxResults * 2);
  return suggestions.filter((s) => s.score >= minScore).slice(0, maxResults);
}

/**
 * Enrich raw usage stats with preset details and computed metrics.
 */
export function buildUsageDetails(
  stats: PresetUsageStats,
  presets: PresetWithScope[],
): PresetUsageDetail[] {
  return Object.entries(stats)
    .map(([presetId, data]) => {
      const preset = presets.find((p) => p.id === presetId);
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
    .sort((a, b) => b.count - a.count);
}

// ============================================================================
// Playlist Types & Evaluation
// ============================================================================

export interface PlaylistCondition {
  type: 'always' | 'flag' | 'state' | 'random';
  flagName?: string;
  flagValue?: boolean;
  stateKey?: string;
  stateValue?: any;
  probability?: number;
}

export interface PlaylistItem {
  presetId: string;
  delayMs?: number;
  condition?: PlaylistCondition;
  stopOnFailure?: boolean;
}

export interface PresetPlaylist {
  id: string;
  name: string;
  description?: string;
  items: PlaylistItem[];
  loop?: boolean;
  maxLoops?: number;
  category?: string;
  tags?: string[];
}

export interface PlaylistWithScope extends PresetPlaylist {
  scope: 'global' | 'world';
}

export interface PlaylistExecutionState {
  playlistId: string;
  currentIndex: number;
  currentLoop: number;
  startedAt: number;
  paused: boolean;
  timeoutId?: ReturnType<typeof setTimeout>;
}

export function generatePlaylistId(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `playlist_${base}_${Date.now().toString(36)}`;
}

export function validatePlaylist(
  playlist: PresetPlaylist,
  availablePresets: PresetWithScope[],
): { valid: boolean; missingPresets: string[] } {
  const presetIds = new Set(availablePresets.map((p) => p.id));
  const missingPresets = playlist.items
    .map((item) => item.presetId)
    .filter((id) => !presetIds.has(id));
  return { valid: missingPresets.length === 0, missingPresets };
}

export function evaluatePlaylistCondition(
  condition: PlaylistCondition | undefined,
  context: { flags?: Record<string, boolean>; state?: Record<string, any> },
): boolean {
  if (!condition || condition.type === 'always') return true;
  if (condition.type === 'flag' && condition.flagName) {
    return context.flags?.[condition.flagName] === condition.flagValue;
  }
  if (condition.type === 'state' && condition.stateKey) {
    return context.state?.[condition.stateKey] === condition.stateValue;
  }
  if (condition.type === 'random' && condition.probability !== undefined) {
    return Math.random() < condition.probability;
  }
  return true;
}

export interface PlaylistExecutionHandlers {
  onPresetApply?: (presetId: string, itemIndex: number) => void;
  onPresetComplete?: (presetId: string, itemIndex: number, success: boolean) => void;
  onPlaylistComplete?: (playlistId: string, loopIteration: number) => void;
  onPlaylistError?: (error: string) => void;
  onConditionSkip?: (presetId: string, reason: string) => void;
}

export async function executePlaylist(
  playlist: PresetPlaylist,
  availablePresets: PresetWithScope[],
  applyPreset: (preset: InteractionPreset) => Promise<boolean>,
  context: { flags?: Record<string, boolean>; state?: Record<string, any> },
  handlers?: PlaylistExecutionHandlers,
): Promise<() => void> {
  const validation = validatePlaylist(playlist, availablePresets);
  if (!validation.valid && validation.missingPresets.length > 0) {
    const filteredItems = playlist.items.filter(
      (item) => !validation.missingPresets.includes(item.presetId),
    );
    if (filteredItems.length === 0) {
      handlers?.onPlaylistError?.(`All presets in playlist "${playlist.name}" are missing`);
      return () => {};
    }
    playlist = { ...playlist, items: filteredItems };
    handlers?.onPlaylistError?.(
      `Warning: ${validation.missingPresets.length} preset(s) missing from playlist "${playlist.name}"`,
    );
  }

  let stopped = false;
  const timeouts: Array<ReturnType<typeof setTimeout>> = [];

  const stopExecution = () => {
    stopped = true;
    timeouts.forEach((timeout) => clearTimeout(timeout));
    timeouts.length = 0;
  };

  const executeLoop = async (loopIndex: number) => {
    if (stopped) return;

    for (let i = 0; i < playlist.items.length; i++) {
      if (stopped) return;

      const item = playlist.items[i];
      const preset = availablePresets.find((p) => p.id === item.presetId);
      if (!preset) continue;

      if (item.condition && !evaluatePlaylistCondition(item.condition, context)) {
        handlers?.onConditionSkip?.(item.presetId, `Condition not met for ${preset.name}`);
        continue;
      }

      if (item.delayMs && item.delayMs > 0) {
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            timeouts.splice(timeouts.indexOf(timeout), 1);
            resolve();
          }, item.delayMs);
          timeouts.push(timeout);
        });
      }

      if (stopped) return;

      handlers?.onPresetApply?.(item.presetId, i);
      try {
        const success = await applyPreset(preset);
        handlers?.onPresetComplete?.(item.presetId, i, success);
        if (!success && item.stopOnFailure) {
          handlers?.onPlaylistError?.(`Playlist stopped due to failure at step ${i + 1}`);
          return;
        }
      } catch (e) {
        handlers?.onPresetComplete?.(item.presetId, i, false);
        if (item.stopOnFailure) {
          handlers?.onPlaylistError?.(
            `Playlist stopped due to error at step ${i + 1}: ${e}`,
          );
          return;
        }
      }
    }

    handlers?.onPlaylistComplete?.(playlist.id, loopIndex);

    if (playlist.loop) {
      const maxLoops = playlist.maxLoops || Infinity;
      if (loopIndex < maxLoops - 1) {
        await executeLoop(loopIndex + 1);
      }
    }
  };

  executeLoop(0).catch((e) => {
    handlers?.onPlaylistError?.(`Playlist execution failed: ${e}`);
  });

  return stopExecution;
}

// ============================================================================
// Built-in Examples
// ============================================================================

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
