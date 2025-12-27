/**
 * Quest Trigger Node Editor
 *
 * UI component for configuring quest trigger nodes in the arc graph.
 * Allows designers to create quest trigger events with objectives, conditions, and rewards.
 */

import { useState, useEffect } from 'react';
import { Button } from '@pixsim7/shared.ui';
import { nodeTypeRegistry } from '@lib/registries';
import type { DraftSceneNode } from '@domain/sceneBuilder';
import type { QuestTriggerNodeData, QuestObjective } from '@lib/plugins/questTriggerNode';

interface QuestTriggerEditorProps {
  node: DraftSceneNode;
  onUpdate: (patch: Partial<DraftSceneNode>) => void;
}

export function QuestTriggerEditor({ node, onUpdate }: QuestTriggerEditorProps) {
  // Form state
  const [questId, setQuestId] = useState('');
  const [questTitle, setQuestTitle] = useState('New Quest');
  const [questDescription, setQuestDescription] = useState('Quest description');
  const [objectives, setObjectives] = useState<QuestObjective[]>([
    {
      id: 'obj1',
      description: 'Complete the objective',
      optional: false,
      completionFlag: 'quest_objective_1_complete',
    },
  ]);
  const [action, setAction] = useState<'start' | 'complete' | 'fail' | 'update'>('start');
  const [experience, setExperience] = useState(100);
  const [requiredFlags, setRequiredFlags] = useState<string[]>([]);
  const [forbiddenFlags, setForbiddenFlags] = useState<string[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Load configuration from node metadata
  useEffect(() => {
    const config = (node.metadata as any)?.questTriggerConfig as QuestTriggerNodeData | undefined;
    if (config) {
      setQuestId(config.questId || '');
      setQuestTitle(config.questTitle || 'New Quest');
      setQuestDescription(config.questDescription || 'Quest description');
      setObjectives(config.objectives || []);
      setAction(config.action || 'start');
      setExperience(config.rewards?.experience || 100);
      setRequiredFlags(config.conditions?.requiredFlags || []);
      setForbiddenFlags(config.conditions?.forbiddenFlags || []);
    }
  }, [node]);

  // Clear validation error when key fields change
  useEffect(() => {
    if (validationError) {
      setValidationError(null);
    }
  }, [questId, questTitle, objectives]);

  // Objective management
  function handleAddObjective() {
    setObjectives([
      ...objectives,
      {
        id: `obj${objectives.length + 1}`,
        description: 'New objective',
        optional: false,
        completionFlag: `quest_objective_${objectives.length + 1}_complete`,
      },
    ]);
  }

  function handleUpdateObjective(index: number, field: keyof QuestObjective, value: any) {
    const updated = [...objectives];
    updated[index] = { ...updated[index], [field]: value };
    setObjectives(updated);
  }

  function handleRemoveObjective(index: number) {
    if (objectives.length > 1) {
      setObjectives(objectives.filter((_, i) => i !== index));
    }
  }

  // Save configuration
  function handleApply() {
    const config: QuestTriggerNodeData = {
      questId,
      questTitle,
      questDescription,
      objectives,
      action,
      conditions: {
        requiredFlags,
        forbiddenFlags,
      },
      rewards: {
        experience,
        items: [],
        unlockFlags: [],
      },
    };

    // Validate before saving
    const nodeTypeDef = nodeTypeRegistry.getSync('quest-trigger');
    if (nodeTypeDef?.validate) {
      const error = nodeTypeDef.validate(config);
      if (error) {
        setValidationError(error);
        return; // Don't save if validation fails
      }
    }

    // Clear validation error on success
    setValidationError(null);

    onUpdate({
      metadata: {
        ...node.metadata,
        questTriggerConfig: config,
      },
    });
  }

  return (
    <div className="space-y-4">
      {/* Description */}
      <div className="text-sm text-neutral-600 dark:text-neutral-400">
        Configure quest trigger node. This arc-level node affects quest progression across scenes.
      </div>

      {/* Quest Basic Info */}
      <div className="border-t pt-3 dark:border-neutral-700 space-y-3">
        <div>
          <label className="block text-sm font-medium mb-1">Quest ID</label>
          <input
            type="text"
            value={questId}
            onChange={(e) => setQuestId(e.target.value)}
            className="w-full px-3 py-2 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
            placeholder="e.g., main_quest_1"
          />
          <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Unique identifier for this quest
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Quest Title</label>
          <input
            type="text"
            value={questTitle}
            onChange={(e) => setQuestTitle(e.target.value)}
            className="w-full px-3 py-2 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
            placeholder="e.g., The Lost Artifact"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Quest Description</label>
          <textarea
            value={questDescription}
            onChange={(e) => setQuestDescription(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
            placeholder="Describe the quest..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Action</label>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value as any)}
            className="w-full px-3 py-2 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
          >
            <option value="start">Start Quest</option>
            <option value="update">Update Progress</option>
            <option value="complete">Complete Quest</option>
            <option value="fail">Fail Quest</option>
          </select>
        </div>
      </div>

      {/* Objectives */}
      <div className="border-t pt-3 dark:border-neutral-700">
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium">Quest Objectives</label>
          <Button size="sm" variant="secondary" onClick={handleAddObjective}>
            + Add Objective
          </Button>
        </div>

        <div className="space-y-3">
          {objectives.map((obj, index) => (
            <div
              key={index}
              className="p-3 border rounded bg-neutral-50 dark:bg-neutral-800/50 dark:border-neutral-700"
            >
              {/* Objective Header */}
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Objective {index + 1}
                </div>
                <button
                  onClick={() => handleRemoveObjective(index)}
                  className="text-red-600 hover:text-red-700 text-xs px-2 py-1"
                  disabled={objectives.length === 1}
                >
                  Remove
                </button>
              </div>

              {/* Objective Fields */}
              <div className="space-y-2">
                <div>
                  <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1">
                    Objective ID
                  </label>
                  <input
                    type="text"
                    value={obj.id}
                    onChange={(e) => handleUpdateObjective(index, 'id', e.target.value)}
                    className="w-full px-2 py-1 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
                    placeholder="e.g., obj1"
                  />
                </div>

                <div>
                  <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1">
                    Description
                  </label>
                  <textarea
                    value={obj.description}
                    onChange={(e) => handleUpdateObjective(index, 'description', e.target.value)}
                    rows={2}
                    className="w-full px-2 py-1 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
                    placeholder="What needs to be done?"
                  />
                </div>

                <div>
                  <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1">
                    Completion Flag
                  </label>
                  <input
                    type="text"
                    value={obj.completionFlag || ''}
                    onChange={(e) => handleUpdateObjective(index, 'completionFlag', e.target.value)}
                    className="w-full px-2 py-1 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
                    placeholder="e.g., quest_obj_1_complete"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id={`obj-optional-${index}`}
                    checked={obj.optional}
                    onChange={(e) => handleUpdateObjective(index, 'optional', e.target.checked)}
                    className="rounded border-neutral-300 dark:border-neutral-600"
                  />
                  <label htmlFor={`obj-optional-${index}`} className="text-xs">
                    Optional objective
                  </label>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Rewards */}
      <div className="border-t pt-3 dark:border-neutral-700">
        <label className="block text-sm font-medium mb-2">Rewards</label>
        <div>
          <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1">
            Experience Points
          </label>
          <input
            type="number"
            min="0"
            value={experience}
            onChange={(e) => setExperience(parseInt(e.target.value) || 0)}
            className="w-full px-3 py-2 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
          />
        </div>
      </div>

      {/* Conditions */}
      <div className="border-t pt-3 dark:border-neutral-700">
        <label className="block text-sm font-medium mb-2">Conditions</label>
        <div className="space-y-2">
          <div>
            <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1">
              Required Flags (comma-separated)
            </label>
            <input
              type="text"
              value={requiredFlags.join(', ')}
              onChange={(e) =>
                setRequiredFlags(
                  e.target.value
                    .split(',')
                    .map((f) => f.trim())
                    .filter(Boolean)
                )
              }
              className="w-full px-3 py-2 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
              placeholder="e.g., met_npc, talked_to_guard"
            />
          </div>

          <div>
            <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1">
              Forbidden Flags (comma-separated)
            </label>
            <input
              type="text"
              value={forbiddenFlags.join(', ')}
              onChange={(e) =>
                setForbiddenFlags(
                  e.target.value
                    .split(',')
                    .map((f) => f.trim())
                    .filter(Boolean)
                )
              }
              className="w-full px-3 py-2 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
              placeholder="e.g., quest_already_completed"
            />
          </div>
        </div>
      </div>

      {/* Info Box */}
      <div className="text-xs text-neutral-500 dark:text-neutral-400 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded p-2 space-y-1">
        <div className="font-medium">💡 How it works:</div>
        <ul className="list-disc list-inside space-y-0.5 ml-1">
          <li>Quest triggers affect the entire arc (cross-scene)</li>
          <li>Conditions are checked before triggering the action</li>
          <li>Objectives track what needs to be completed</li>
          <li>Rewards are granted when the quest completes</li>
        </ul>
      </div>

      {/* Validation Error */}
      {validationError && (
        <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-3">
          <div className="font-medium">⚠️ Validation Error</div>
          <div className="mt-1">{validationError}</div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <Button variant="primary" onClick={handleApply} className="flex-1">
          Apply Changes
        </Button>
      </div>
    </div>
  );
}

// Default export for dynamic loading via nodeEditorRegistry
export default QuestTriggerEditor;
