/**
 * Progression Arc Editor
 *
 * Visual timeline editor for designing relationship progression arcs.
 * Shows stages, gates, and progression flow in an intuitive way.
 *
 * @see packages/types/src/intimacy.ts
 * @see docs/RELATIONSHIPS_AND_ARCS.md
 * @see claude-tasks/12-intimacy-scene-composer-and-progression-editor.md
 */

import React, { useState, useMemo } from 'react';
import type {
  RelationshipProgressionArc,
  ProgressionStage,
  ProgressionArcState,
  RelationshipGate,
} from '@/types';
import { RelationshipGateBadge } from './RelationshipGateVisualizer';
import { validateProgressionArc } from '@/lib/intimacy/validation';
import { RelationshipStateEditor } from './RelationshipStateEditor';
import { ArcSaveLoadControls } from './SaveLoadControls';
import { ArcTemplateBrowser } from './TemplateBrowser';
import { PlaytestingPanel } from './PlaytestingPanel';
import { checkGate, createDefaultState, type SimulatedRelationshipState } from '@/lib/intimacy/gateChecking';
import { saveArcAsTemplate, type ArcTemplate } from '@/lib/intimacy/templates';
import { validateArcForTemplate } from '@/lib/intimacy/templateValidation';

interface ProgressionArcEditorProps {
  /** Current arc configuration */
  arc: RelationshipProgressionArc;

  /** Callback when arc is modified */
  onChange: (arc: RelationshipProgressionArc) => void;

  /** Optional runtime state for preview */
  state?: ProgressionArcState;

  /** World max content rating constraint */
  worldMaxRating?: 'sfw' | 'romantic' | 'mature_implied' | 'restricted';

  /** User max content rating constraint */
  userMaxRating?: 'sfw' | 'romantic' | 'mature_implied' | 'restricted';

  /** Whether the editor is read-only */
  readOnly?: boolean;

  /** Layout mode */
  layout?: 'horizontal' | 'vertical' | 'list';

  /** Available NPCs for arc assignment */
  availableNpcs?: Array<{ id: number; name: string }>;
}

const TIER_COLORS: Record<string, string> = {
  stranger: '#9ca3af',
  acquaintance: '#60a5fa',
  friend: '#34d399',
  close_friend: '#f59e0b',
  lover: '#ec4899',
};

export function ProgressionArcEditor({
  arc,
  onChange,
  state,
  worldMaxRating,
  userMaxRating,
  readOnly = false,
  layout = 'horizontal',
  availableNpcs = [],
}: ProgressionArcEditorProps) {
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [showValidation, setShowValidation] = useState(false);
  const [showSaveLoad, setShowSaveLoad] = useState(false);
  const [showTemplateBrowser, setShowTemplateBrowser] = useState(false);
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
  const [showPlaytest, setShowPlaytest] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [simulatedState, setSimulatedState] = useState<SimulatedRelationshipState>(createDefaultState());

  // Validate arc
  const validation = validateProgressionArc(arc, worldMaxRating, userMaxRating);

  // Compute which stages are unlocked in preview mode
  const previewStageStatus = useMemo(() => {
    if (!previewMode) return {};

    const status: Record<string, 'completed' | 'current' | 'unlocked' | 'locked'> = {};
    let reachedCurrent = false;

    for (const stage of arc.stages) {
      const gateResult = checkGate(stage.gate, simulatedState);

      if (gateResult.satisfied && !reachedCurrent) {
        status[stage.id] = 'current';
        reachedCurrent = true;
      } else if (gateResult.satisfied) {
        status[stage.id] = 'unlocked';
      } else {
        status[stage.id] = 'locked';
      }
    }

    return status;
  }, [previewMode, arc.stages, simulatedState]);

  // Update arc field
  const updateArc = (updates: Partial<RelationshipProgressionArc>) => {
    onChange({ ...arc, ...updates });
  };

  // Add a new stage
  const addStage = () => {
    const newStage: ProgressionStage = {
      id: `stage_${Date.now()}`,
      name: 'New Stage',
      description: '',
      tier: 'friend',
      gate: {
        id: `gate_${Date.now()}`,
        name: 'Stage Gate',
        requiredTier: 'friend',
      },
      timelinePosition: {
        x: arc.stages.length * 200,
        y: 0,
      },
    };
    updateArc({ stages: [...arc.stages, newStage] });
    setSelectedStageId(newStage.id);
  };

  // Update a stage
  const updateStage = (stageId: string, updates: Partial<ProgressionStage>) => {
    updateArc({
      stages: arc.stages.map((s) => (s.id === stageId ? { ...s, ...updates } : s)),
    });
  };

  // Remove a stage
  const removeStage = (stageId: string) => {
    updateArc({
      stages: arc.stages.filter((s) => s.id !== stageId),
    });
    if (selectedStageId === stageId) {
      setSelectedStageId(null);
    }
  };

  // Get stage status
  const getStageStatus = (stageId: string): 'completed' | 'current' | 'unlocked' | 'locked' => {
    // Use preview status if in preview mode
    if (previewMode && previewStageStatus[stageId]) {
      return previewStageStatus[stageId];
    }
    // Otherwise use provided state
    if (!state) return 'locked';
    if (state.completedStages.includes(stageId)) return 'completed';
    if (state.currentStageId === stageId) return 'current';
    if (state.unlockedStages.includes(stageId)) return 'unlocked';
    return 'locked';
  };

  const selectedStage = arc.stages.find((s) => s.id === selectedStageId);

  return (
    <div className="h-full flex flex-col bg-white dark:bg-neutral-900">
      {/* Header */}
      <div className="p-4 border-b dark:border-neutral-700">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
              <span>⭐</span>
              {readOnly ? (
                arc.name
              ) : (
                <input
                  type="text"
                  value={arc.name}
                  onChange={(e) => updateArc({ name: e.target.value })}
                  className="bg-transparent border-b border-neutral-300 dark:border-neutral-600 focus:outline-none focus:border-blue-500"
                  placeholder="Arc Name"
                />
              )}
            </h2>
            {arc.description && (
              <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
                {arc.description}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const duplicated: RelationshipProgressionArc = {
                  ...arc,
                  id: `${arc.id}_copy_${Date.now()}`,
                  name: `${arc.name} (Copy)`,
                  stages: arc.stages.map((stage, idx) => ({
                    ...stage,
                    id: `${stage.id}_copy_${Date.now()}_${idx}`,
                    gate: {
                      ...stage.gate,
                      id: `${stage.gate.id}_copy_${Date.now()}_${idx}`,
                    },
                  })),
                };
                onChange(duplicated);
              }}
              disabled={readOnly}
              className="px-3 py-1 rounded text-sm font-medium bg-blue-500 text-white hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              📋 Duplicate
            </button>
            <button
              onClick={() => setShowTemplateBrowser(true)}
              disabled={readOnly}
              className="px-3 py-1 rounded text-sm font-medium bg-purple-500 text-white hover:bg-purple-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              📚 Load Template
            </button>
            <button
              onClick={() => setShowSaveTemplateModal(true)}
              disabled={readOnly}
              className="px-3 py-1 rounded text-sm font-medium bg-green-500 text-white hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              💾 Save as Template
            </button>
            <button
              onClick={() => setShowSaveLoad(true)}
              className="px-3 py-1 rounded text-sm font-medium bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700"
            >
              💾 Save/Load
            </button>
            <button
              onClick={() => setShowPlaytest(true)}
              className="px-3 py-1 rounded text-sm font-medium bg-green-500 text-white hover:bg-green-600"
            >
              🎮 Playtest
            </button>
            <button
              onClick={() => setPreviewMode(!previewMode)}
              className={`px-3 py-1 rounded text-sm font-medium transition-all ${
                previewMode
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                  : 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'
              }`}
            >
              {previewMode ? '👁️ Preview Mode' : '👁️ Preview'}
            </button>
            <button
              onClick={() => setShowValidation(!showValidation)}
              className={`px-3 py-1 rounded text-sm font-medium ${
                validation.valid
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                  : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
              }`}
            >
              {validation.valid ? '✓ Valid' : `✗ ${validation.errors.length} Error(s)`}
            </button>
            {!readOnly && (
              <button
                onClick={addStage}
                className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
              >
                + Add Stage
              </button>
            )}
          </div>
        </div>

        {/* Progress indicator */}
        {state && (
          <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-blue-900 dark:text-blue-300">
                Progress: {state.progress.completionPercent}%
              </span>
              <span className="text-xs text-blue-700 dark:text-blue-400">
                {state.progress.currentTier}
                {state.progress.currentIntimacyLevel && ` • ${state.progress.currentIntimacyLevel}`}
              </span>
            </div>
            <div className="h-2 bg-blue-200 dark:bg-blue-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 dark:bg-blue-400 transition-all"
                style={{ width: `${state.progress.completionPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Validation errors */}
        {showValidation && !validation.valid && (
          <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
            <h4 className="text-sm font-semibold text-red-900 dark:text-red-300 mb-1">
              Validation Errors
            </h4>
            <ul className="text-sm text-red-800 dark:text-red-400 list-disc list-inside">
              {validation.errors.slice(0, 5).map((error, idx) => (
                <li key={idx}>{error}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Preview Panel */}
      {previewMode && (
        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800">
          <div className="max-w-md">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-300">
                Simulate Progression
              </h4>
              <button
                onClick={() => setPreviewMode(false)}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                Exit Preview
              </button>
            </div>
            <RelationshipStateEditor
              state={simulatedState}
              onChange={setSimulatedState}
              readOnly={false}
              showPresets={true}
            />
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Timeline View */}
        <div className="flex-1 overflow-auto p-6">
          {arc.stages.length === 0 ? (
            <div className="h-full flex items-center justify-center text-neutral-500 dark:text-neutral-400">
              <div className="text-center">
                <div className="text-4xl mb-2">⭐</div>
                <p>No stages defined</p>
                <p className="text-sm mt-1">
                  {readOnly ? 'This arc has no progression stages' : 'Click "Add Stage" to create the first milestone'}
                </p>
              </div>
            </div>
          ) : (
            <div
              className={`flex ${layout === 'vertical' ? 'flex-col' : 'flex-row'} gap-6 ${
                layout === 'list' ? 'flex-col' : ''
              }`}
            >
              {arc.stages.map((stage, idx) => {
                const status = getStageStatus(stage.id);
                const isSelected = selectedStageId === stage.id;

                return (
                  <div
                    key={stage.id}
                    className={`relative ${layout === 'list' ? 'w-full' : 'flex-shrink-0'}`}
                  >
                    {/* Stage card */}
                    <div
                      onClick={() => setSelectedStageId(stage.id)}
                      className={`w-64 p-4 border-2 rounded-lg cursor-pointer transition-all ${
                        isSelected
                          ? 'border-blue-500 shadow-lg'
                          : 'border-neutral-300 dark:border-neutral-600 hover:border-blue-400'
                      } ${
                        status === 'completed'
                          ? 'bg-green-50 dark:bg-green-900/20'
                          : status === 'current'
                          ? 'bg-blue-50 dark:bg-blue-900/20'
                          : status === 'unlocked'
                          ? 'bg-white dark:bg-neutral-800'
                          : 'bg-neutral-50 dark:bg-neutral-900 opacity-60'
                      }`}
                    >
                      {/* Stage number & status */}
                      <div className="flex items-center justify-between mb-2">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm"
                          style={{
                            backgroundColor: TIER_COLORS[stage.tier] || '#9ca3af',
                          }}
                        >
                          {idx + 1}
                        </div>
                        <div className="text-xs px-2 py-1 rounded-full font-medium">
                          {status === 'completed' && (
                            <span className="text-green-600 dark:text-green-400">✓ Complete</span>
                          )}
                          {status === 'current' && (
                            <span className="text-blue-600 dark:text-blue-400">► Current</span>
                          )}
                          {status === 'unlocked' && (
                            <span className="text-amber-600 dark:text-amber-400">🔓 Unlocked</span>
                          )}
                          {status === 'locked' && (
                            <span className="text-neutral-500 dark:text-neutral-400">🔒 Locked</span>
                          )}
                        </div>
                      </div>

                      {/* Stage name */}
                      <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 mb-1">
                        {stage.name}
                      </h3>

                      {/* Stage description */}
                      {stage.description && (
                        <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-2">
                          {stage.description}
                        </p>
                      )}

                      {/* Tier badge */}
                      <div
                        className="inline-block px-2 py-1 rounded text-xs font-medium mb-2"
                        style={{
                          backgroundColor: (TIER_COLORS[stage.tier] || '#9ca3af') + '30',
                          color: TIER_COLORS[stage.tier] || '#9ca3af',
                        }}
                      >
                        {stage.tier.replace('_', ' ').toUpperCase()}
                      </div>

                      {/* Gate badge */}
                      <div className="mt-2">
                        <RelationshipGateBadge gate={stage.gate} />
                      </div>

                      {/* Available scenes */}
                      {stage.availableScenes && stage.availableScenes.length > 0 && (
                        <div className="mt-2 text-xs text-neutral-600 dark:text-neutral-400">
                          {stage.availableScenes.length} scene(s) available
                        </div>
                      )}

                      {/* Delete button */}
                      {!readOnly && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeStage(stage.id);
                          }}
                          className="absolute top-2 right-2 p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Remove stage"
                        >
                          🗑️
                        </button>
                      )}
                    </div>

                    {/* Connector */}
                    {idx < arc.stages.length - 1 && layout !== 'list' && (
                      <div
                        className={`absolute ${
                          layout === 'vertical'
                            ? 'left-1/2 top-full w-0.5 h-6 -translate-x-1/2'
                            : 'top-1/2 left-full h-0.5 w-6 -translate-y-1/2'
                        } bg-neutral-300 dark:bg-neutral-600`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Side Panel (when stage selected) */}
        {selectedStage && (
          <div className="w-80 border-l dark:border-neutral-700 overflow-y-auto">
            <div className="p-4">
              <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
                Stage Details
              </h3>

              {/* Stage name */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Name
                </label>
                {readOnly ? (
                  <div className="text-sm">{selectedStage.name}</div>
                ) : (
                  <input
                    type="text"
                    value={selectedStage.name}
                    onChange={(e) => updateStage(selectedStage.id, { name: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg dark:bg-neutral-800 dark:border-neutral-600"
                  />
                )}
              </div>

              {/* Stage description */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Description
                </label>
                {readOnly ? (
                  <div className="text-sm">{selectedStage.description || 'No description'}</div>
                ) : (
                  <textarea
                    value={selectedStage.description || ''}
                    onChange={(e) =>
                      updateStage(selectedStage.id, { description: e.target.value })
                    }
                    className="w-full px-3 py-2 border rounded-lg dark:bg-neutral-800 dark:border-neutral-600"
                    rows={3}
                  />
                )}
              </div>

              {/* Tier selection */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Relationship Tier
                </label>
                {readOnly ? (
                  <div className="text-sm capitalize">{selectedStage.tier.replace('_', ' ')}</div>
                ) : (
                  <select
                    value={selectedStage.tier}
                    onChange={(e) => updateStage(selectedStage.id, { tier: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg dark:bg-neutral-800 dark:border-neutral-600"
                  >
                    {Object.keys(TIER_COLORS).map((tier) => (
                      <option key={tier} value={tier}>
                        {tier.replace('_', ' ').toUpperCase()}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Effects */}
              {selectedStage.onEnterEffects && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                    On Enter Effects
                  </label>
                  <div className="p-3 bg-neutral-50 dark:bg-neutral-800 rounded border dark:border-neutral-700 space-y-2">
                    {selectedStage.onEnterEffects.affinityDelta !== undefined && (
                      <div className="text-sm">
                        <span className="text-neutral-600 dark:text-neutral-400">Affinity:</span>{' '}
                        <span
                          className={
                            selectedStage.onEnterEffects.affinityDelta > 0
                              ? 'text-green-600'
                              : 'text-red-600'
                          }
                        >
                          {selectedStage.onEnterEffects.affinityDelta > 0 ? '+' : ''}
                          {selectedStage.onEnterEffects.affinityDelta}
                        </span>
                      </div>
                    )}
                    {selectedStage.onEnterEffects.trustDelta !== undefined && (
                      <div className="text-sm">
                        <span className="text-neutral-600 dark:text-neutral-400">Trust:</span>{' '}
                        <span
                          className={
                            selectedStage.onEnterEffects.trustDelta > 0
                              ? 'text-green-600'
                              : 'text-red-600'
                          }
                        >
                          {selectedStage.onEnterEffects.trustDelta > 0 ? '+' : ''}
                          {selectedStage.onEnterEffects.trustDelta}
                        </span>
                      </div>
                    )}
                    {selectedStage.onEnterEffects.setFlags &&
                      selectedStage.onEnterEffects.setFlags.length > 0 && (
                        <div className="text-sm">
                          <span className="text-neutral-600 dark:text-neutral-400">
                            Set Flags:
                          </span>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {selectedStage.onEnterEffects.setFlags.map((flag) => (
                              <span
                                key={flag}
                                className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-xs rounded"
                              >
                                {flag}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                  </div>
                </div>
              )}

              {/* Close button */}
              <button
                onClick={() => setSelectedStageId(null)}
                className="w-full px-3 py-2 border rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800 dark:border-neutral-600"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* Save/Load Modal */}
        {showSaveLoad && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-neutral-800 rounded-lg p-6 max-w-md w-full">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                  Save & Load Arc
                </h3>
                <button
                  onClick={() => setShowSaveLoad(false)}
                  className="text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 text-xl"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  Save this progression arc to a file or browser storage for reuse.
                </p>

                <ArcSaveLoadControls
                  arc={arc}
                  onLoad={(loadedArc) => {
                    onChange(loadedArc);
                    setShowSaveLoad(false);
                  }}
                  disabled={readOnly}
                />
              </div>
            </div>
          </div>
        )}

        {/* Template Browser Modal */}
        {showTemplateBrowser && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-xl w-full max-w-6xl h-5/6">
              <ArcTemplateBrowser
                onImport={(importedArc) => {
                  onChange(importedArc);
                  setShowTemplateBrowser(false);
                }}
                availableNpcs={availableNpcs}
                onClose={() => setShowTemplateBrowser(false)}
              />
            </div>
          </div>
        )}

        {/* Playtest Panel Modal */}
        {showPlaytest && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-xl w-full max-w-6xl h-5/6">
              <PlaytestingPanel
                arc={arc}
                onClose={() => setShowPlaytest(false)}
              />
            </div>
          </div>
        )}

        {/* Save as Template Modal */}
        {showSaveTemplateModal && (
          <SaveArcTemplateModal
            arc={arc}
            onClose={() => setShowSaveTemplateModal(false)}
          />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Save Arc Template Modal
// ============================================================================

interface SaveArcTemplateModalProps {
  arc: RelationshipProgressionArc;
  onClose: () => void;
}

function SaveArcTemplateModal({ arc, onClose }: SaveArcTemplateModalProps) {
  const [name, setName] = useState(arc.name || '');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ArcTemplate['category']>('custom');
  const [difficulty, setDifficulty] = useState<ArcTemplate['difficulty']>('medium');
  const [estimatedDuration, setEstimatedDuration] = useState<ArcTemplate['estimatedDuration']>('medium');
  const [tags, setTags] = useState<string>('');
  const [validationResult, setValidationResult] = useState(validateArcForTemplate(arc));

  const handleSave = () => {
    if (!name.trim()) {
      alert('Please enter a template name');
      return;
    }

    if (!validationResult.valid) {
      const proceed = confirm(
        `This arc has validation errors:\n${validationResult.errors.join('\n')}\n\nSave anyway?`
      );
      if (!proceed) return;
    }

    try {
      saveArcAsTemplate(arc, {
        name: name.trim(),
        description: description.trim(),
        category,
        difficulty,
        estimatedDuration,
        tags: tags.split(',').map((t) => t.trim()).filter((t) => t.length > 0),
      });

      alert('Template saved successfully!');
      onClose();
    } catch (error) {
      alert(`Failed to save template: ${error}`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-xl w-full max-w-2xl">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">
              💾 Save Arc as Template
            </h2>
            <button
              onClick={onClose}
              className="text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 text-xl"
            >
              ✕
            </button>
          </div>

          {/* Validation Status */}
          {!validationResult.valid && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
              <div className="text-sm font-medium text-red-900 dark:text-red-300 mb-1">
                ⚠️ Validation Errors ({validationResult.errors.length})
              </div>
              <ul className="text-sm text-red-800 dark:text-red-400 list-disc list-inside">
                {validationResult.errors.map((error, idx) => (
                  <li key={idx}>{error}</li>
                ))}
              </ul>
            </div>
          )}

          {validationResult.warnings.length > 0 && (
            <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded">
              <div className="text-sm font-medium text-yellow-900 dark:text-yellow-300 mb-1">
                ⚠️ Warnings ({validationResult.warnings.length})
              </div>
              <ul className="text-sm text-yellow-800 dark:text-yellow-400 list-disc list-inside">
                {validationResult.warnings.map((warning, idx) => (
                  <li key={idx}>{warning}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-4">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Template Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
                placeholder="e.g., Friends to Lovers Arc"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
                placeholder="Describe what this progression arc is for..."
              />
            </div>

            {/* Category, Difficulty, Duration */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as ArcTemplate['category'])}
                  className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
                >
                  <option value="romance">Romance</option>
                  <option value="friendship">Friendship</option>
                  <option value="rivalry">Rivalry</option>
                  <option value="custom">Custom</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Difficulty
                </label>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as ArcTemplate['difficulty'])}
                  className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
                >
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Duration
                </label>
                <select
                  value={estimatedDuration}
                  onChange={(e) => setEstimatedDuration(e.target.value as ArcTemplate['estimatedDuration'])}
                  className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
                >
                  <option value="short">Short</option>
                  <option value="medium">Medium</option>
                  <option value="long">Long</option>
                </select>
              </div>
            </div>

            {/* Tags */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Tags (comma-separated)
              </label>
              <input
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
                placeholder="e.g., slow-burn, comedy, dramatic"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 mt-6">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm border border-neutral-300 dark:border-neutral-700 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 text-sm bg-green-500 text-white rounded hover:bg-green-600"
            >
              Save Template
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
