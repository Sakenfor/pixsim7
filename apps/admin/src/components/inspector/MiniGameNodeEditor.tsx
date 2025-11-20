import { useMemo } from 'react';
import { Button } from '@pixsim7/shared.ui';
import { useNodeEditor } from './useNodeEditor';
import type { NodeEditorProps, MiniGameConfig } from './editorTypes';
import { validateMiniGameConfig, logValidationError } from './editorValidation';
import { getAllGizmos } from '../../lib/gizmos/loadDefaultPacks';

export function MiniGameNodeEditor({ node, onUpdate }: NodeEditorProps) {
  const availableGizmos = useMemo(() => getAllGizmos(), []);

  const { formState, updateField, setFormState, handleApply } = useNodeEditor<MiniGameConfig>({
    node,
    onUpdate,
    initialState: {
      gameType: 'reflex',
      rounds: 3,
      difficulty: 'medium',
      timeLimit: 30,
      gizmoConfig: {
        type: availableGizmos[0]?.id || 'orb',
        zoneCount: 6,
      },
    },
    loadFromNode: (node) => {
      const metadata = node.metadata as Record<string, unknown> | undefined;
      const savedConfig = metadata?.miniGameConfig as MiniGameConfig | undefined;

      if (savedConfig) {
        return {
          gameType: savedConfig.gameType || 'reflex',
          rounds: savedConfig.rounds || 3,
          difficulty: savedConfig.difficulty || 'medium',
          timeLimit: savedConfig.timeLimit || 30,
          gizmoConfig: savedConfig.gizmoConfig || {
            type: availableGizmos[0]?.id || 'orb',
            zoneCount: 6,
          },
        };
      }

      return {};
    },
    saveToNode: (formState, node) => ({
      metadata: {
        ...node.metadata,
        miniGameConfig: formState,
      }
    })
  });

  function handleApplyWithValidation() {
    const validation = validateMiniGameConfig(formState);
    if (!validation.isValid) {
      validation.errors.forEach(error => logValidationError('MiniGameNodeEditor', error));
      return;
    }
    handleApply();
  }

  return (
    <div className="space-y-3">
      <div className="text-sm text-neutral-600 dark:text-neutral-400">
        Configure an interactive mini-game segment
      </div>

      {/* Game Type */}
      <div>
        <label className="block text-sm font-medium mb-1">Game Type</label>
        <select
          value={formState.gameType}
          onChange={(e) => updateField('gameType', e.target.value as MiniGameConfig['gameType'])}
          className="w-full px-3 py-2 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
        >
          <option value="reflex">Reflex Test</option>
          <option value="memory">Memory Challenge</option>
          <option value="puzzle">Puzzle Game</option>
          <option value="sceneGizmo">Scene Gizmo Controller</option>
        </select>
      </div>

      {/* Scene Gizmo Settings */}
      {formState.gameType === 'sceneGizmo' && (
        <>
          <div>
            <label className="block text-sm font-medium mb-1">Gizmo Type</label>
            <select
              value={formState.gizmoConfig?.type || 'orb'}
              onChange={(e) => setFormState({
                ...formState,
                gizmoConfig: { ...formState.gizmoConfig!, type: e.target.value }
              })}
              className="w-full px-3 py-2 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
            >
              {availableGizmos.map(gizmo => (
                <option key={gizmo.id} value={gizmo.id}>
                  {gizmo.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Zone Count</label>
            <input
              type="number"
              value={formState.gizmoConfig?.zoneCount || 6}
              onChange={(e) => setFormState({
                ...formState,
                gizmoConfig: { ...formState.gizmoConfig!, zoneCount: Number(e.target.value) }
              })}
              min="1"
              max="20"
              className="w-full px-3 py-2 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
            />
            <p className="text-xs text-neutral-500 mt-1">
              Number of zones around the circumference (1-20)
            </p>
          </div>
        </>
      )}

      {/* Rounds */}
      <div>
        <label className="block text-sm font-medium mb-1">Rounds</label>
        <input
          type="number"
          value={formState.rounds}
          onChange={(e) => updateField('rounds', Number(e.target.value))}
          min="1"
          max="100"
          className="w-full px-3 py-2 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
        />
        <p className="text-xs text-neutral-500 mt-1">
          Number of rounds to play (1-100)
        </p>
      </div>

      {/* Difficulty */}
      <div>
        <label className="block text-sm font-medium mb-1">Difficulty</label>
        <select
          value={formState.difficulty}
          onChange={(e) => updateField('difficulty', e.target.value as MiniGameConfig['difficulty'])}
          className="w-full px-3 py-2 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
        >
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>
      </div>

      {/* Time Limit */}
      <div>
        <label className="block text-sm font-medium mb-1">Time Limit (seconds)</label>
        <input
          type="number"
          value={formState.timeLimit}
          onChange={(e) => updateField('timeLimit', Number(e.target.value))}
          min="1"
          max="600"
          className="w-full px-3 py-2 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
        />
        <p className="text-xs text-neutral-500 mt-1">
          Time allowed per round (1-600 seconds)
        </p>
      </div>

      <div className="text-xs text-neutral-500 dark:text-neutral-400 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded p-2">
        💡 Mini-games can branch based on success/failure outcome
      </div>

      <Button variant="primary" onClick={handleApplyWithValidation} className="w-full">
        Apply Changes
      </Button>
    </div>
  );
}

// Default export for dynamic loading via nodeEditorRegistry
export default MiniGameNodeEditor;
