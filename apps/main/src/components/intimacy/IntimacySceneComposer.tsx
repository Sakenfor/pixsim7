/**
 * Intimacy Scene Composer
 *
 * Main editor panel for creating and configuring intimacy scenes.
 * Provides visual tools for setting up gates, content ratings, and generation settings.
 *
 * @see packages/types/src/intimacy.ts
 * @see docs/INTIMACY_AND_GENERATION.md
 * @see claude-tasks/12-intimacy-scene-composer-and-progression-editor.md
 */

import React, { useState } from 'react';
import type {
  IntimacySceneConfig,
  IntimacySceneType,
  IntimacyIntensity,
  RelationshipGate,
  GenerationSocialContext,
} from '@pixsim7/shared.types';
import { RelationshipGateVisualizer, RelationshipGateBadge } from './RelationshipGateVisualizer';
import { validateIntimacyScene } from '../../lib/intimacy/validation';
import { SocialContextPanel } from '../generation/SocialContextPanel';
import { RelationshipStateEditor } from './RelationshipStateEditor';
import { GatePreviewPanel } from './GatePreviewPanel';
import { GenerationPreviewPanel } from './GenerationPreviewPanel';
import { SceneSaveLoadControls, StateSaveLoadControls } from './SaveLoadControls';
import { SceneTemplateBrowser } from './TemplateBrowser';
import { createDefaultState, type SimulatedRelationshipState } from '../../lib/intimacy/gateChecking';

interface IntimacySceneComposerProps {
  /** Current scene configuration */
  scene: IntimacySceneConfig;

  /** Callback when scene is modified */
  onChange: (scene: IntimacySceneConfig) => void;

  /** World max content rating constraint */
  worldMaxRating?: 'sfw' | 'romantic' | 'mature_implied' | 'restricted';

  /** User max content rating constraint */
  userMaxRating?: 'sfw' | 'romantic' | 'mature_implied' | 'restricted';

  /** Available NPCs for selection */
  availableNpcs?: Array<{ id: number; name: string }>;

  /** Whether the composer is read-only */
  readOnly?: boolean;

  /** Workspace ID for generation preview */
  workspaceId?: number;
}

const SCENE_TYPES: Array<{ value: IntimacySceneType; label: string; description: string }> = [
  { value: 'flirt', label: 'Flirt', description: 'Light flirting, romantic interest' },
  { value: 'date', label: 'Date', description: 'Romantic date or outing' },
  { value: 'kiss', label: 'Kiss', description: 'Kissing scene' },
  { value: 'intimate', label: 'Intimate', description: 'Intimate/romantic scene (implied)' },
  { value: 'custom', label: 'Custom', description: 'Custom scene type' },
];

const INTENSITY_LEVELS: Array<{ value: IntimacyIntensity; label: string; color: string }> = [
  { value: 'subtle', label: 'Subtle', color: '#9ca3af' },
  { value: 'light', label: 'Light', color: '#f9a8d4' },
  { value: 'moderate', label: 'Moderate', color: '#f472b6' },
  { value: 'intense', label: 'Intense', color: '#ec4899' },
];

const CONTENT_RATINGS: Array<{
  value: 'sfw' | 'romantic' | 'mature_implied' | 'restricted';
  label: string;
  description: string;
}> = [
  { value: 'sfw', label: 'Safe for Work', description: 'No romantic content' },
  { value: 'romantic', label: 'Romantic', description: 'Light romance (kissing, hand-holding)' },
  { value: 'mature_implied', label: 'Mature (Implied)', description: 'Mature themes implied but not explicit' },
  { value: 'restricted', label: 'Restricted', description: 'Requires explicit user consent' },
];

export function IntimacySceneComposer({
  scene,
  onChange,
  worldMaxRating,
  userMaxRating,
  availableNpcs = [],
  readOnly = false,
  workspaceId,
}: IntimacySceneComposerProps) {
  const [activeTab, setActiveTab] = useState<'basic' | 'gates' | 'generation' | 'validation' | 'save'>('basic');
  const [expandedGateId, setExpandedGateId] = useState<string | null>(null);
  const [simulatedState, setSimulatedState] = useState<SimulatedRelationshipState>(createDefaultState());
  const [showTemplateBrowser, setShowTemplateBrowser] = useState(false);

  // Validate scene
  const validation = validateIntimacyScene(scene, worldMaxRating, userMaxRating);

  // Update scene field
  const updateScene = (updates: Partial<IntimacySceneConfig>) => {
    onChange({ ...scene, ...updates });
  };

  // Add a new gate
  const addGate = () => {
    const newGate: RelationshipGate = {
      id: `gate_${Date.now()}`,
      name: 'New Gate',
      description: '',
      requiredTier: 'friend',
    };
    updateScene({ gates: [...scene.gates, newGate] });
    setExpandedGateId(newGate.id);
  };

  // Update a gate
  const updateGate = (gateId: string, updates: Partial<RelationshipGate>) => {
    updateScene({
      gates: scene.gates.map((g) => (g.id === gateId ? { ...g, ...updates } : g)),
    });
  };

  // Remove a gate
  const removeGate = (gateId: string) => {
    updateScene({
      gates: scene.gates.filter((g) => g.id !== gateId),
    });
    if (expandedGateId === gateId) {
      setExpandedGateId(null);
    }
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-neutral-900">
      {/* Header */}
      <div className="p-4 border-b dark:border-neutral-700">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
              <span>💕</span>
              Intimacy Scene Composer
            </h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
              Create relationship-gated intimate scenes with proper safety controls
            </p>
          </div>
          <button
            onClick={() => setShowTemplateBrowser(true)}
            disabled={readOnly}
            className="px-3 py-2 bg-purple-500 text-white text-sm rounded hover:bg-purple-600 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <span>📚</span>
            Load Template
          </button>
        </div>

        {/* Validation status */}
        {!validation.valid && (
          <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
            <div className="text-sm font-medium text-red-900 dark:text-red-300">
              ⚠️ Validation Errors ({validation.errors.length})
            </div>
            <ul className="text-sm text-red-800 dark:text-red-400 list-disc list-inside mt-1">
              {validation.errors.slice(0, 3).map((error, idx) => (
                <li key={idx}>{error}</li>
              ))}
              {validation.errors.length > 3 && (
                <li className="text-xs">... and {validation.errors.length - 3} more</li>
              )}
            </ul>
          </div>
        )}

        {validation.warnings.length > 0 && (
          <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded">
            <div className="text-xs font-medium text-amber-900 dark:text-amber-300">
              ⚠️ {validation.warnings.length} Warning(s) - Click Validation tab for details
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b dark:border-neutral-700">
        {[
          { id: 'basic' as const, label: 'Basic', icon: '⚙️' },
          { id: 'gates' as const, label: 'Gates', icon: '🚪', badge: scene.gates.length },
          { id: 'generation' as const, label: 'Generation', icon: '✨' },
          { id: 'validation' as const, label: 'Validation', icon: '✓', badge: validation.errors.length > 0 ? '!' : undefined },
          { id: 'save' as const, label: 'Save/Load', icon: '💾' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium transition-colors relative ${
              activeTab === tab.id
                ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100'
            }`}
          >
            <span className="mr-1">{tab.icon}</span>
            {tab.label}
            {tab.badge !== undefined && (
              <span className="ml-2 px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs rounded-full">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'basic' && (
          <div className="space-y-6">
            {/* Scene Type */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                Scene Type
              </label>
              <div className="grid grid-cols-2 gap-2">
                {SCENE_TYPES.map((type) => (
                  <button
                    key={type.value}
                    onClick={() => !readOnly && updateScene({ sceneType: type.value })}
                    disabled={readOnly}
                    className={`p-3 border rounded-lg text-left transition-all ${
                      scene.sceneType === type.value
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-neutral-300 dark:border-neutral-600 hover:border-blue-400'
                    } ${readOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <div className="font-medium text-sm">{type.label}</div>
                    <div className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
                      {type.description}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Intensity */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                Intensity Level
              </label>
              <div className="flex gap-2">
                {INTENSITY_LEVELS.map((level) => (
                  <button
                    key={level.value}
                    onClick={() => !readOnly && updateScene({ intensity: level.value })}
                    disabled={readOnly}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                      scene.intensity === level.value
                        ? 'ring-2 ring-offset-2 ring-blue-500 dark:ring-offset-neutral-900'
                        : ''
                    } ${readOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
                    style={{
                      backgroundColor: level.color + '30',
                      color: level.color,
                    }}
                  >
                    {level.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Content Rating */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                Content Rating
              </label>
              <div className="space-y-2">
                {CONTENT_RATINGS.map((rating) => (
                  <button
                    key={rating.value}
                    onClick={() => !readOnly && updateScene({ contentRating: rating.value })}
                    disabled={readOnly}
                    className={`w-full p-3 border rounded-lg text-left transition-all ${
                      scene.contentRating === rating.value
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-neutral-300 dark:border-neutral-600 hover:border-blue-400'
                    } ${readOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <div className="font-medium text-sm">{rating.label}</div>
                    <div className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
                      {rating.description}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Target NPCs */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                Target NPC(s)
              </label>
              <select
                multiple
                value={scene.targetNpcIds.map(String)}
                onChange={(e) => {
                  const selected = Array.from(e.target.selectedOptions).map((opt) =>
                    parseInt(opt.value)
                  );
                  updateScene({ targetNpcIds: selected });
                }}
                disabled={readOnly}
                className="w-full border rounded-lg p-2 dark:bg-neutral-800 dark:border-neutral-600"
                size={5}
              >
                {availableNpcs.map((npc) => (
                  <option key={npc.id} value={npc.id}>
                    {npc.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                Hold Ctrl/Cmd to select multiple NPCs
              </p>
            </div>

            {/* Consent */}
            {scene.contentRating === 'restricted' && (
              <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={scene.requiresConsent}
                    onChange={(e) => updateScene({ requiresConsent: e.target.checked })}
                    disabled={readOnly}
                    className="rounded"
                  />
                  <span className="text-sm font-medium text-amber-900 dark:text-amber-300">
                    Require explicit user consent before playing
                  </span>
                </label>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-1 ml-6">
                  Recommended for restricted content to ensure user awareness
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'gates' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                  Relationship Gates
                </h3>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  Configure requirements to unlock this scene
                </p>
              </div>
              {!readOnly && (
                <button
                  onClick={addGate}
                  className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
                >
                  + Add Gate
                </button>
              )}
            </div>

            {scene.gates.length === 0 ? (
              <div className="text-center py-12 text-neutral-500 dark:text-neutral-400">
                <div className="text-4xl mb-2">🚪</div>
                <p>No gates configured</p>
                <p className="text-sm mt-1">
                  {readOnly ? 'This scene has no access requirements' : 'Click "Add Gate" to create requirements'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {scene.gates.map((gate) => (
                  <div key={gate.id} className="relative">
                    <RelationshipGateVisualizer
                      gate={gate}
                      readOnly={readOnly}
                      onChange={(updatedGate) => updateGate(gate.id, updatedGate)}
                      expanded={expandedGateId === gate.id}
                      onToggleExpanded={() =>
                        setExpandedGateId(expandedGateId === gate.id ? null : gate.id)
                      }
                    />
                    {!readOnly && (
                      <button
                        onClick={() => removeGate(gate.id)}
                        className="absolute top-2 right-2 p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                        title="Remove gate"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'generation' && (
          <div className="space-y-6">
            {/* Top Row: State Editor & Gate Preview */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left: State Editor */}
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-1">
                    Simulate Relationship State
                  </h3>
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">
                    Adjust metrics to preview how gates will behave in different scenarios
                  </p>
                </div>

                <RelationshipStateEditor
                  state={simulatedState}
                  onChange={setSimulatedState}
                  readOnly={false}
                  showPresets={true}
                />

                {scene.socialContext && (
                  <div className="mt-4">
                    <h4 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-2">
                      Social Context (For Generation)
                    </h4>
                    <SocialContextPanel
                      socialContext={scene.socialContext}
                      readOnly={readOnly}
                      onConfigure={() => {
                        // TODO: Open social context configuration dialog
                        console.log('Configure social context');
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Right: Gate Preview */}
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-1">
                    Gate Preview
                  </h3>
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">
                    See which gates are satisfied with the current simulated state
                  </p>
                </div>

                {scene.gates.length === 0 ? (
                  <div className="p-6 border-2 border-dashed dark:border-neutral-700 rounded-lg text-center text-neutral-500 dark:text-neutral-400">
                    <div className="text-3xl mb-2">🚪</div>
                    <p className="text-sm">No gates configured</p>
                    <p className="text-xs mt-1">Add gates in the Gates tab to preview them here</p>
                  </div>
                ) : (
                  <GatePreviewPanel
                    gates={scene.gates}
                    simulatedState={simulatedState}
                    expandByDefault={false}
                    onGateClick={(gateId) => {
                      // Could switch to gates tab and highlight this gate
                      console.log('Gate clicked:', gateId);
                    }}
                  />
                )}
              </div>
            </div>

            {/* Bottom Row: Generation Preview (Full Width) */}
            <div className="border-t dark:border-neutral-700 pt-6">
              <GenerationPreviewPanel
                scene={scene}
                relationshipState={simulatedState}
                worldMaxRating={worldMaxRating}
                userMaxRating={userMaxRating}
                workspaceId={workspaceId}
              />
            </div>
          </div>
        )}

        {activeTab === 'validation' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-1">
                Validation Results
              </h3>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                Safety checks and configuration validation
              </p>
            </div>

            {/* Safety Status */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                Safety Checks
              </h4>
              {[
                {
                  label: 'Within world limits',
                  passed: validation.safety.withinWorldLimits,
                },
                {
                  label: 'Within user preferences',
                  passed: validation.safety.withinUserPreferences,
                },
                {
                  label: 'Consent configured',
                  passed: validation.safety.consentConfigured,
                },
                {
                  label: 'Gates valid',
                  passed: validation.safety.gatesValid,
                },
              ].map((check, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 p-2 rounded border dark:border-neutral-700"
                >
                  <span className={check.passed ? 'text-green-600' : 'text-red-600'}>
                    {check.passed ? '✓' : '✗'}
                  </span>
                  <span className="text-sm">{check.label}</span>
                </div>
              ))}
            </div>

            {/* Errors */}
            {validation.errors.length > 0 && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
                <h4 className="text-sm font-semibold text-red-900 dark:text-red-300 mb-2">
                  Errors ({validation.errors.length})
                </h4>
                <ul className="text-sm text-red-800 dark:text-red-400 list-disc list-inside space-y-1">
                  {validation.errors.map((error, idx) => (
                    <li key={idx}>{error}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Warnings */}
            {validation.warnings.length > 0 && (
              <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded">
                <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-300 mb-2">
                  Warnings ({validation.warnings.length})
                </h4>
                <ul className="text-sm text-amber-800 dark:text-amber-400 list-disc list-inside space-y-1">
                  {validation.warnings.map((warning, idx) => (
                    <li key={idx}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Success */}
            {validation.valid && validation.warnings.length === 0 && (
              <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded text-center">
                <div className="text-3xl mb-2">✓</div>
                <div className="text-sm font-semibold text-green-900 dark:text-green-300">
                  All validation checks passed!
                </div>
                <p className="text-xs text-green-700 dark:text-green-400 mt-1">
                  This scene is ready to use
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'save' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-1">
                Save & Load
              </h3>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                Save scene configurations and simulated states for later use
              </p>
            </div>

            {/* Scene Save/Load */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                Scene Configuration
              </h4>
              <div className="p-4 border dark:border-neutral-700 rounded-lg bg-neutral-50 dark:bg-neutral-800">
                <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-3">
                  Save this scene configuration to a file or browser storage for reuse.
                </p>
                <SceneSaveLoadControls
                  scene={scene}
                  onLoad={(loadedScene) => onChange(loadedScene)}
                  disabled={readOnly}
                />
              </div>
            </div>

            {/* Simulated State Save/Load */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                Simulated Relationship State
              </h4>
              <div className="p-4 border dark:border-neutral-700 rounded-lg bg-neutral-50 dark:bg-neutral-800">
                <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-3">
                  Save the current simulated state for testing different scenarios.
                </p>
                <StateSaveLoadControls
                  state={simulatedState}
                  onLoad={(loadedState) => setSimulatedState(loadedState)}
                  disabled={readOnly}
                />
              </div>
            </div>

            {/* Tips */}
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded">
              <div className="text-xs font-medium text-blue-900 dark:text-blue-300 mb-1">
                💡 Save/Load Tips
              </div>
              <ul className="text-xs text-blue-700 dark:text-blue-400 space-y-1 list-disc list-inside">
                <li><strong>Save to File:</strong> Export as JSON for backup or sharing</li>
                <li><strong>Quick Save:</strong> Save to browser storage for quick access</li>
                <li><strong>Simulated States:</strong> Save test scenarios to replay later</li>
                <li><strong>Load from File:</strong> Import previously exported configurations</li>
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* Template Browser Modal */}
      {showTemplateBrowser && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-xl w-full max-w-6xl h-5/6">
            <SceneTemplateBrowser
              onImport={(importedScene) => {
                onChange(importedScene);
                setShowTemplateBrowser(false);
              }}
              availableNpcs={availableNpcs}
              onClose={() => setShowTemplateBrowser(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
