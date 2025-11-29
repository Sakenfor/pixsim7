/**
 * Save/Load Controls for Intimacy Scene Composer
 *
 * Provides UI controls for saving/loading scenes, arcs, and simulated states.
 * Supports both local storage and file import/export.
 *
 * @see frontend/src/lib/intimacy/saveLoad.ts
 * @see docs/INTIMACY_SCENE_COMPOSER.md - Phase 4
 */

import React, { useState } from 'react';
import type { IntimacySceneConfig, RelationshipProgressionArc } from '@pixsim7/shared.types';
import type { SimulatedRelationshipState } from '@/lib/intimacy/gateChecking';
import {
  downloadScenesAsFile,
  uploadScenesFromFile,
  downloadArcsAsFile,
  uploadArcsFromFile,
  saveSceneToLocalStorage,
  loadSceneFromLocalStorage,
  listSavedScenes,
  deleteSceneFromLocalStorage,
  saveArcToLocalStorage,
  loadArcFromLocalStorage,
  listSavedArcs,
  deleteArcFromLocalStorage,
  saveSimulatedState,
  loadSimulatedState,
  listSavedStates,
  deleteSimulatedState,
} from '@/lib/intimacy/saveLoad';

// ============================================================================
// Scene Save/Load Controls
// ============================================================================

interface SceneSaveLoadProps {
  /** Current scene */
  scene: IntimacySceneConfig;

  /** Callback when scene is loaded */
  onLoad: (scene: IntimacySceneConfig) => void;

  /** Whether controls are disabled */
  disabled?: boolean;
}

export function SceneSaveLoadControls({ scene, onLoad, disabled = false }: SceneSaveLoadProps) {
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSaveToFile = () => {
    try {
      downloadScenesAsFile([scene], `${scene.name || 'scene'}.json`, {
        name: scene.name || 'Unnamed Scene',
        description: scene.description,
      });
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to save scene');
    }
  };

  const handleLoadFromFile = async () => {
    try {
      const data = await uploadScenesFromFile();
      if (data.scenes.length === 0) {
        setError('No scenes found in file');
        return;
      }

      onLoad(data.scenes[0]);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load scene');
    }
  };

  const handleSaveToStorage = () => {
    try {
      const sceneId = scene.id || `scene_${Date.now()}`;
      saveSceneToLocalStorage(sceneId, scene);
      setError(null);
      alert('Scene saved to browser storage!');
    } catch (err: any) {
      setError(err.message || 'Failed to save to storage');
    }
  };

  const handleLoadFromStorage = () => {
    setShowLoadDialog(true);
  };

  return (
    <div className="space-y-2">
      {/* File Controls */}
      <div className="flex gap-2">
        <button
          onClick={handleSaveToFile}
          disabled={disabled}
          className="flex-1 px-3 py-2 text-sm font-medium rounded-lg bg-blue-600 dark:bg-blue-500 text-white hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          💾 Save to File
        </button>
        <button
          onClick={handleLoadFromFile}
          disabled={disabled}
          className="flex-1 px-3 py-2 text-sm font-medium rounded-lg border border-blue-600 dark:border-blue-500 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          📂 Load from File
        </button>
      </div>

      {/* Storage Controls */}
      <div className="flex gap-2">
        <button
          onClick={handleSaveToStorage}
          disabled={disabled}
          className="flex-1 px-3 py-2 text-sm font-medium rounded-lg bg-neutral-600 dark:bg-neutral-500 text-white hover:bg-neutral-700 dark:hover:bg-neutral-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          💾 Quick Save
        </button>
        <button
          onClick={handleLoadFromStorage}
          disabled={disabled}
          className="flex-1 px-3 py-2 text-sm font-medium rounded-lg border border-neutral-600 dark:border-neutral-500 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          📂 Quick Load
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-900 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Load Dialog */}
      {showLoadDialog && (
        <SceneLoadDialog
          onLoad={(loadedScene) => {
            onLoad(loadedScene);
            setShowLoadDialog(false);
          }}
          onClose={() => setShowLoadDialog(false)}
        />
      )}
    </div>
  );
}

/**
 * Scene load dialog
 */
function SceneLoadDialog({
  onLoad,
  onClose,
}: {
  onLoad: (scene: IntimacySceneConfig) => void;
  onClose: () => void;
}) {
  const savedScenes = listSavedScenes();

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-neutral-800 rounded-lg p-6 max-w-md w-full max-h-[80vh] overflow-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            Load Saved Scene
          </h3>
          <button
            onClick={onClose}
            className="text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
          >
            ✕
          </button>
        </div>

        {savedScenes.length === 0 ? (
          <p className="text-neutral-600 dark:text-neutral-400 text-sm">
            No saved scenes found. Use "Quick Save" to save a scene.
          </p>
        ) : (
          <div className="space-y-2">
            {savedScenes.map((sceneId) => {
              const scene = loadSceneFromLocalStorage(sceneId);
              if (!scene) return null;

              return (
                <div
                  key={sceneId}
                  className="p-3 border dark:border-neutral-700 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-700"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="font-medium text-neutral-900 dark:text-neutral-100">
                        {scene.name || 'Unnamed Scene'}
                      </div>
                      {scene.description && (
                        <div className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
                          {scene.description}
                        </div>
                      )}
                      <div className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">
                        {scene.sceneType} • {scene.contentRating}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => onLoad(scene)}
                        className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                      >
                        Load
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('Delete this saved scene?')) {
                            deleteSceneFromLocalStorage(sceneId);
                            // Force re-render by closing and reopening
                            onClose();
                            setTimeout(() => {
                              // User can click load again
                            }, 100);
                          }
                        }}
                        className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Arc Save/Load Controls
// ============================================================================

interface ArcSaveLoadProps {
  /** Current arc */
  arc: RelationshipProgressionArc;

  /** Callback when arc is loaded */
  onLoad: (arc: RelationshipProgressionArc) => void;

  /** Whether controls are disabled */
  disabled?: boolean;
}

export function ArcSaveLoadControls({ arc, onLoad, disabled = false }: ArcSaveLoadProps) {
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSaveToFile = () => {
    try {
      downloadArcsAsFile([arc], `${arc.name || 'arc'}.json`, {
        name: arc.name || 'Unnamed Arc',
        description: arc.description,
      });
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to save arc');
    }
  };

  const handleLoadFromFile = async () => {
    try {
      const data = await uploadArcsFromFile();
      if (data.arcs.length === 0) {
        setError('No arcs found in file');
        return;
      }

      onLoad(data.arcs[0]);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load arc');
    }
  };

  const handleSaveToStorage = () => {
    try {
      saveArcToLocalStorage(arc.id, arc);
      setError(null);
      alert('Arc saved to browser storage!');
    } catch (err: any) {
      setError(err.message || 'Failed to save to storage');
    }
  };

  const handleLoadFromStorage = () => {
    setShowLoadDialog(true);
  };

  return (
    <div className="space-y-2">
      {/* File Controls */}
      <div className="flex gap-2">
        <button
          onClick={handleSaveToFile}
          disabled={disabled}
          className="flex-1 px-3 py-2 text-sm font-medium rounded-lg bg-blue-600 dark:bg-blue-500 text-white hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          💾 Save to File
        </button>
        <button
          onClick={handleLoadFromFile}
          disabled={disabled}
          className="flex-1 px-3 py-2 text-sm font-medium rounded-lg border border-blue-600 dark:border-blue-500 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          📂 Load from File
        </button>
      </div>

      {/* Storage Controls */}
      <div className="flex gap-2">
        <button
          onClick={handleSaveToStorage}
          disabled={disabled}
          className="flex-1 px-3 py-2 text-sm font-medium rounded-lg bg-neutral-600 dark:bg-neutral-500 text-white hover:bg-neutral-700 dark:hover:bg-neutral-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          💾 Quick Save
        </button>
        <button
          onClick={handleLoadFromStorage}
          disabled={disabled}
          className="flex-1 px-3 py-2 text-sm font-medium rounded-lg border border-neutral-600 dark:border-neutral-500 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          📂 Quick Load
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-900 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Load Dialog */}
      {showLoadDialog && (
        <ArcLoadDialog
          onLoad={(loadedArc) => {
            onLoad(loadedArc);
            setShowLoadDialog(false);
          }}
          onClose={() => setShowLoadDialog(false)}
        />
      )}
    </div>
  );
}

/**
 * Arc load dialog
 */
function ArcLoadDialog({
  onLoad,
  onClose,
}: {
  onLoad: (arc: RelationshipProgressionArc) => void;
  onClose: () => void;
}) {
  const savedArcs = listSavedArcs();

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-neutral-800 rounded-lg p-6 max-w-md w-full max-h-[80vh] overflow-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            Load Saved Arc
          </h3>
          <button
            onClick={onClose}
            className="text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
          >
            ✕
          </button>
        </div>

        {savedArcs.length === 0 ? (
          <p className="text-neutral-600 dark:text-neutral-400 text-sm">
            No saved arcs found. Use "Quick Save" to save an arc.
          </p>
        ) : (
          <div className="space-y-2">
            {savedArcs.map((arcId) => {
              const arc = loadArcFromLocalStorage(arcId);
              if (!arc) return null;

              return (
                <div
                  key={arcId}
                  className="p-3 border dark:border-neutral-700 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-700"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="font-medium text-neutral-900 dark:text-neutral-100">
                        {arc.name || 'Unnamed Arc'}
                      </div>
                      {arc.description && (
                        <div className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
                          {arc.description}
                        </div>
                      )}
                      <div className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">
                        {arc.stages.length} stages
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => onLoad(arc)}
                        className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                      >
                        Load
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('Delete this saved arc?')) {
                            deleteArcFromLocalStorage(arcId);
                            onClose();
                          }
                        }}
                        className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Simulated State Save/Load
// ============================================================================

interface StateSaveLoadProps {
  /** Current state */
  state: SimulatedRelationshipState;

  /** Callback when state is loaded */
  onLoad: (state: SimulatedRelationshipState) => void;

  /** Whether controls are disabled */
  disabled?: boolean;
}

export function StateSaveLoadControls({ state, onLoad, disabled = false }: StateSaveLoadProps) {
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveDescription, setSaveDescription] = useState('');

  const handleSave = () => {
    if (!saveName.trim()) {
      alert('Please enter a name for this state');
      return;
    }

    saveSimulatedState({
      name: saveName.trim(),
      description: saveDescription.trim() || undefined,
      state,
    });

    setShowSaveDialog(false);
    setSaveName('');
    setSaveDescription('');
    alert('State saved!');
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button
          onClick={() => setShowSaveDialog(true)}
          disabled={disabled}
          className="flex-1 px-3 py-1.5 text-xs font-medium rounded bg-neutral-600 dark:bg-neutral-500 text-white hover:bg-neutral-700 dark:hover:bg-neutral-600 disabled:opacity-50"
        >
          💾 Save State
        </button>
        <button
          onClick={() => setShowLoadDialog(true)}
          disabled={disabled}
          className="flex-1 px-3 py-1.5 text-xs font-medium rounded border border-neutral-600 dark:border-neutral-500 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-900/20 disabled:opacity-50"
        >
          📂 Load State
        </button>
      </div>

      {/* Save Dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-neutral-800 rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
              Save Simulated State
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="e.g., Lover State Test"
                  className="w-full px-3 py-2 border dark:border-neutral-600 rounded bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Description
                </label>
                <textarea
                  value={saveDescription}
                  onChange={(e) => setSaveDescription(e.target.value)}
                  placeholder="Optional description"
                  rows={2}
                  className="w-full px-3 py-2 border dark:border-neutral-600 rounded bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleSave}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setShowSaveDialog(false);
                    setSaveName('');
                    setSaveDescription('');
                  }}
                  className="flex-1 px-4 py-2 border border-neutral-300 dark:border-neutral-600 rounded hover:bg-neutral-50 dark:hover:bg-neutral-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Load Dialog */}
      {showLoadDialog && (
        <StateLoadDialog
          onLoad={(loadedState) => {
            onLoad(loadedState);
            setShowLoadDialog(false);
          }}
          onClose={() => setShowLoadDialog(false)}
        />
      )}
    </div>
  );
}

/**
 * State load dialog
 */
function StateLoadDialog({
  onLoad,
  onClose,
}: {
  onLoad: (state: SimulatedRelationshipState) => void;
  onClose: () => void;
}) {
  const savedStates = listSavedStates();

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-neutral-800 rounded-lg p-6 max-w-md w-full max-h-[80vh] overflow-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            Load Saved State
          </h3>
          <button
            onClick={onClose}
            className="text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
          >
            ✕
          </button>
        </div>

        {savedStates.length === 0 ? (
          <p className="text-neutral-600 dark:text-neutral-400 text-sm">
            No saved states found. Use "Save State" to save a simulated state.
          </p>
        ) : (
          <div className="space-y-2">
            {savedStates.map((save) => (
              <div
                key={save.name}
                className="p-3 border dark:border-neutral-700 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-700"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="font-medium text-neutral-900 dark:text-neutral-100">
                      {save.name}
                    </div>
                    {save.description && (
                      <div className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
                        {save.description}
                      </div>
                    )}
                    <div className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">
                      {save.state.tier} • {save.state.intimacyLevel || 'No intimacy'}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => onLoad(save.state)}
                      className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      Load
                    </button>
                    <button
                      onClick={() => {
                        if (confirm('Delete this saved state?')) {
                          deleteSimulatedState(save.name);
                          onClose();
                        }
                      }}
                      className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
