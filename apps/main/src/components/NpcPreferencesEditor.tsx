/**
 * NPC Preferences Editor
 * UI for viewing and editing NPC tool/pattern preferences
 */

import { useState, useEffect } from 'react';
import { Button, Panel, Badge } from '@pixsim7/shared.ui';
import type { GameNpcDetail } from '../lib/api/game';
import type { NpcPreferences, ToolPreference, PatternPreference } from '@pixsim7/scene.gizmos';
import { PREFERENCE_PRESETS, createDefaultPreferences } from '@pixsim7/scene.gizmos';
import { getAllTools } from '../lib/gizmos/loadDefaultPacks';
import {
  getNpcPreferences,
  setNpcPreferences,
  setToolPreference,
  setPatternPreference,
  addFavoriteTool,
  removeFavoriteTool,
} from '../lib/game/npcPreferences';
import { buildNpcBrainState, type NpcBrainState, type NpcPersona } from '@pixsim7/game.engine';
import { BrainShape } from './shapes/BrainShape';
import type { BrainFace } from '@pixsim7/scene.shapes';
import type { GameSessionDTO } from '@pixsim7/shared.types';

interface NpcPreferencesEditorProps {
  npc: GameNpcDetail;
  onChange: (npc: GameNpcDetail) => void;
}

const AVAILABLE_PATTERNS = ['linear', 'circular', 'tap', 'zigzag', 'spiral', 'wave'] as const;

export function NpcPreferencesEditor({ npc, onChange }: NpcPreferencesEditorProps) {
  const preferences = getNpcPreferences(npc);
  const allTools = getAllTools();

  // Live brain preview state
  const [livePreview, setLivePreview] = useState(false);
  const [brainState, setBrainState] = useState<NpcBrainState | null>(null);
  const [activeFace, setActiveFace] = useState<BrainFace>('cortex');

  // Update brain state when preferences change (for live preview)
  useEffect(() => {
    if (!livePreview) return;

    // Create a mock persona from NPC data
    const basePersona: NpcPersona = {
      traits: {
        openness: 60,
        conscientiousness: 55,
        extraversion: 70,
        agreeableness: 65,
        neuroticism: 40,
      },
      tags: ['friendly', 'curious'],
      conversation_style: 'warm',
    };

    // Create mock session with preferences in flags
    const mockSession: GameSessionDTO = {
      id: 0,
      user_id: 0,
      scene_id: 0,
      current_node_id: null,
      world_time: 0,
      flags: {
        npcs: {
          [`npc:${npc.id}`]: {
            personality: {
              traits: basePersona.traits,
              tags: basePersona.tags,
              conversation_style: basePersona.conversation_style,
            },
            preferences,
          },
        },
      },
      relationships: {
        [`npc:${npc.id}`]: {
          affinity: npc.relationshipLevel || 50,
          trust: 50,
          chemistry: 50,
          tension: 20,
        },
      },
    };

    // Create mock relationship state
    const relationshipState = {
      affinity: npc.relationshipLevel || 50,
      trust: 50,
      chemistry: 50,
      tension: 20,
      flags: [],
      tierId: 'acquaintance',
      intimacyLevelId: '0',
    };

    // Build brain state with current preferences
    const brain = buildNpcBrainState({
      npcId: npc.id,
      session: mockSession,
      relationship: relationshipState,
      persona: basePersona,
    });

    setBrainState(brain);
  }, [preferences, livePreview, npc.id, npc.relationshipLevel]);

  const handlePresetApply = (presetName: keyof typeof PREFERENCE_PRESETS) => {
    const preset = PREFERENCE_PRESETS[presetName]();
    const updated = setNpcPreferences(npc, preset);
    onChange(updated);
  };

  const handleToolAffinityChange = (toolId: string, affinity: number) => {
    const toolPref: ToolPreference = {
      toolId,
      affinity,
      preferredPressure: preferences.tools.find(t => t.toolId === toolId)?.preferredPressure,
      preferredSpeed: preferences.tools.find(t => t.toolId === toolId)?.preferredSpeed,
    };
    const updated = setToolPreference(npc, toolPref);
    onChange(updated);
  };

  const handlePatternAffinityChange = (pattern: string, affinity: number) => {
    const patternPref: PatternPreference = {
      pattern: pattern as any,
      affinity,
    };
    const updated = setPatternPreference(npc, patternPref);
    onChange(updated);
  };

  const handleToggleFavorite = (toolId: string) => {
    const isFavorite = preferences.favorites.includes(toolId);
    const updated = isFavorite
      ? removeFavoriteTool(npc, toolId)
      : addFavoriteTool(npc, toolId);
    onChange(updated);
  };

  const handleSensitivityChange = (key: keyof NpcPreferences['sensitivity'], value: number) => {
    const updated = setNpcPreferences(npc, {
      ...preferences,
      sensitivity: {
        ...preferences.sensitivity,
        [key]: value,
      },
    });
    onChange(updated);
  };

  const handleCreateDefault = () => {
    const updated = setNpcPreferences(npc, createDefaultPreferences());
    onChange(updated);
  };

  const getToolAffinity = (toolId: string): number => {
    return preferences.tools.find(t => t.toolId === toolId)?.affinity ?? 0.5;
  };

  const getPatternAffinity = (pattern: string): number => {
    return preferences.patterns.find(p => p.pattern === pattern)?.affinity ?? 0.5;
  };

  const hasPreferences = preferences.version > 0 || preferences.tools.length > 0;

  return (
    <div className="space-y-4">
      {/* Header with presets */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">NPC Preferences</h2>
        <div className="flex gap-2">
          {!hasPreferences && (
            <Button variant="secondary" size="sm" onClick={handleCreateDefault}>
              Initialize Preferences
            </Button>
          )}
          <div className="flex gap-1">
            <Button variant="secondary" size="sm" onClick={() => handlePresetApply('gentle')}>
              Gentle
            </Button>
            <Button variant="secondary" size="sm" onClick={() => handlePresetApply('intense')}>
              Intense
            </Button>
            <Button variant="secondary" size="sm" onClick={() => handlePresetApply('playful')}>
              Playful
            </Button>
          </div>
          <Button
            variant={livePreview ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setLivePreview(!livePreview)}
            title="Toggle live brain preview"
          >
            {livePreview ? '🧠 Preview ON' : '🧠 Preview OFF'}
          </Button>
        </div>
      </div>

      {!hasPreferences && (
        <Panel className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800">
          <p className="text-sm text-yellow-800 dark:text-yellow-200">
            No preferences configured yet. Click "Initialize Preferences" or apply a preset to get started.
          </p>
        </Panel>
      )}

      {hasPreferences && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Tool Preferences */}
          <Panel className="space-y-3 lg:col-span-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Tool Affinities</h3>
              <div className="text-sm">
                <span className="text-neutral-500 dark:text-neutral-400">Relationship:</span>{' '}
                <span className="font-semibold text-blue-600 dark:text-blue-400">
                  Lv. {npc.relationshipLevel || 0}
                </span>
              </div>
            </div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400">
              0.0 = Dislikes, 0.5 = Neutral, 1.0 = Loves • 🔒 = Locked tool
            </div>

            <div className="space-y-3">
              {allTools.map(tool => {
                const affinity = getToolAffinity(tool.id);
                const isFavorite = preferences.favorites.includes(tool.id);
                const relationshipRequired = preferences.relationshipGates?.[tool.id];
                const isLocked = relationshipRequired !== undefined && (npc.relationshipLevel || 0) < relationshipRequired;
                const isUnlocked = preferences.unlockedTools?.includes(tool.id);

                return (
                  <div
                    key={tool.id}
                    className={`flex items-center gap-3 p-2 rounded ${
                      isLocked
                        ? 'bg-neutral-100 dark:bg-neutral-900 opacity-60'
                        : 'bg-neutral-50 dark:bg-neutral-800'
                    }`}
                  >
                    <button
                      onClick={() => handleToggleFavorite(tool.id)}
                      className={`text-lg ${
                        isFavorite
                          ? 'text-yellow-500'
                          : 'text-neutral-300 dark:text-neutral-600 hover:text-yellow-400'
                      }`}
                      title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                    >
                      {isFavorite ? '★' : '☆'}
                    </button>

                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium capitalize">{tool.id}</span>
                        {isLocked && (
                          <span className="text-xs text-red-600 dark:text-red-400" title={`Unlock at relationship level ${relationshipRequired}`}>
                            🔒 Lv.{relationshipRequired}
                          </span>
                        )}
                        {!isLocked && relationshipRequired && (
                          <span className="text-xs text-green-600 dark:text-green-400" title="Unlocked!">
                            ✓
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-neutral-500 dark:text-neutral-400">
                        {tool.type} • {tool.visual.model}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.1"
                        value={affinity}
                        onChange={e => handleToolAffinityChange(tool.id, parseFloat(e.target.value))}
                        className="w-24"
                      />
                      <span
                        className={`text-xs font-medium w-8 text-right ${
                          affinity >= 0.7
                            ? 'text-green-600 dark:text-green-400'
                            : affinity <= 0.3
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-neutral-600 dark:text-neutral-400'
                        }`}
                      >
                        {affinity.toFixed(1)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>

          {/* Sensitivity & Patterns */}
          <div className="space-y-4">
            <Panel className="space-y-3">
              <h3 className="text-sm font-semibold">Sensitivity</h3>

              <div>
                <label className="block text-xs mb-1">Overall: {preferences.sensitivity.overall.toFixed(1)}x</label>
                <input
                  type="range"
                  min="0.1"
                  max="3"
                  step="0.1"
                  value={preferences.sensitivity.overall}
                  onChange={e => handleSensitivityChange('overall', parseFloat(e.target.value))}
                  className="w-full"
                />
              </div>

              <div>
                <label className="block text-xs mb-1">Touch: {preferences.sensitivity.touch.toFixed(1)}x</label>
                <input
                  type="range"
                  min="0.1"
                  max="3"
                  step="0.1"
                  value={preferences.sensitivity.touch}
                  onChange={e => handleSensitivityChange('touch', parseFloat(e.target.value))}
                  className="w-full"
                />
              </div>

              <div>
                <label className="block text-xs mb-1">Temperature: {preferences.sensitivity.temperature.toFixed(1)}x</label>
                <input
                  type="range"
                  min="0.1"
                  max="3"
                  step="0.1"
                  value={preferences.sensitivity.temperature}
                  onChange={e => handleSensitivityChange('temperature', parseFloat(e.target.value))}
                  className="w-full"
                />
              </div>

              <div>
                <label className="block text-xs mb-1">Rhythm: {preferences.sensitivity.rhythm.toFixed(1)}x</label>
                <input
                  type="range"
                  min="0.1"
                  max="3"
                  step="0.1"
                  value={preferences.sensitivity.rhythm}
                  onChange={e => handleSensitivityChange('rhythm', parseFloat(e.target.value))}
                  className="w-full"
                />
              </div>
            </Panel>

            <Panel className="space-y-3">
              <h3 className="text-sm font-semibold">Pattern Preferences</h3>

              <div className="space-y-2">
                {AVAILABLE_PATTERNS.map(pattern => {
                  const affinity = getPatternAffinity(pattern);

                  return (
                    <div key={pattern} className="flex items-center gap-2">
                      <span className="text-xs capitalize flex-1">{pattern}</span>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.1"
                        value={affinity}
                        onChange={e => handlePatternAffinityChange(pattern, parseFloat(e.target.value))}
                        className="w-16"
                      />
                      <span className="text-xs w-8 text-right">{affinity.toFixed(1)}</span>
                    </div>
                  );
                })}
              </div>
            </Panel>

            <Panel className="space-y-2">
              <h3 className="text-sm font-semibold">Favorites</h3>
              {preferences.favorites.length === 0 ? (
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Click ★ next to tools to add favorites
                </p>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {preferences.favorites.map(toolId => (
                    <Badge key={toolId} color="yellow" className="text-xs">
                      {toolId}
                    </Badge>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        </div>
      )}

      <div className="text-xs text-neutral-500 dark:text-neutral-400">
        💡 These preferences control how the NPC responds to different tools and interaction patterns.
        Higher affinity = more positive reactions.
      </div>

      {/* Live Brain Preview */}
      {livePreview && brainState && (
        <Panel className="p-6">
          <h3 className="text-sm font-semibold mb-4">Live Brain Preview</h3>
          <div className="flex items-center justify-center">
            <BrainShape
              npcId={npc.id}
              brainState={brainState}
              onFaceClick={setActiveFace}
              activeFace={activeFace}
              showConnections={true}
              style="holographic"
              size={300}
            />
          </div>
          <div className="mt-4 text-center">
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Click on brain regions to inspect • Active: <span className="capitalize font-medium">{activeFace}</span>
            </p>
          </div>
        </Panel>
      )}
    </div>
  );
}
