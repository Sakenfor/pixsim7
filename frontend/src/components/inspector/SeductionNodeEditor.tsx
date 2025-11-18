/**
 * Seduction Node Editor
 *
 * UI component for configuring seduction nodes in the scene builder.
 * Allows designers to create multi-stage seduction scenarios with affinity checks.
 */

import { useState, useEffect } from 'react';
import { Button } from '@pixsim7/ui';
import type { DraftSceneNode } from '../../modules/scene-builder';
import type { SeductionStage, SeductionNodeData } from '../../lib/plugins/seductionNode';
import { DEFAULT_SEDUCTION_STAGES } from '../../lib/plugins/seductionNode';

interface SeductionNodeEditorProps {
  node: DraftSceneNode;
  onUpdate: (patch: Partial<DraftSceneNode>) => void;
}

export function SeductionNodeEditor({ node, onUpdate }: SeductionNodeEditorProps) {
  // Form state
  const [stages, setStages] = useState<SeductionStage[]>(DEFAULT_SEDUCTION_STAGES);
  const [affinityCheckFlag, setAffinityCheckFlag] = useState('npc_affinity');
  const [allowRetry, setAllowRetry] = useState(false);

  // Load configuration from node metadata
  useEffect(() => {
    const config = (node.metadata as any)?.seductionConfig as SeductionNodeData | undefined;
    if (config) {
      if (config.stages && config.stages.length > 0) {
        setStages(config.stages);
      }
      if (config.affinityCheckFlag) {
        setAffinityCheckFlag(config.affinityCheckFlag);
      }
      if (config.allowRetry !== undefined) {
        setAllowRetry(config.allowRetry);
      }
    }
  }, [node]);

  // Stage management
  function handleAddStage() {
    const prevStage = stages[stages.length - 1];
    const nextAffinity = prevStage ? prevStage.requiredAffinity + 20 : 20;

    setStages([
      ...stages,
      {
        id: `stage_${stages.length + 1}`,
        name: `Stage ${stages.length + 1}`,
        description: '',
        requiredAffinity: Math.min(nextAffinity, 100),
      },
    ]);
  }

  function handleUpdateStage(index: number, field: keyof SeductionStage, value: any) {
    const updated = [...stages];
    updated[index] = { ...updated[index], [field]: value };
    setStages(updated);
  }

  function handleRemoveStage(index: number) {
    if (stages.length > 1) {
      setStages(stages.filter((_, i) => i !== index));
    }
  }

  function handleResetToDefaults() {
    setStages(DEFAULT_SEDUCTION_STAGES);
    setAffinityCheckFlag('npc_affinity');
    setAllowRetry(false);
  }

  // Save configuration
  function handleApply() {
    const config: SeductionNodeData = {
      stages,
      currentStage: 0,
      affinityCheckFlag,
      allowRetry,
    };

    onUpdate({
      metadata: {
        ...node.metadata,
        seductionConfig: config,
      },
    });
  }

  return (
    <div className="space-y-4">
      {/* Description */}
      <div className="text-sm text-neutral-600 dark:text-neutral-400">
        Multi-stage seduction node. Players progress through stages based on NPC affinity.
      </div>

      {/* Affinity Configuration */}
      <div className="border-t pt-3 dark:border-neutral-700">
        <label className="block text-sm font-medium mb-1">Affinity Flag</label>
        <input
          type="text"
          value={affinityCheckFlag}
          onChange={(e) => setAffinityCheckFlag(e.target.value)}
          className="w-full px-3 py-2 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
          placeholder="e.g., npc_emma_affinity"
        />
        <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          Session flag name to check for affinity value (0-100)
        </div>
      </div>

      {/* Retry Option */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="allowRetry"
          checked={allowRetry}
          onChange={(e) => setAllowRetry(e.target.checked)}
          className="rounded border-neutral-300 dark:border-neutral-600"
        />
        <label htmlFor="allowRetry" className="text-sm">
          Allow retry after failure
        </label>
      </div>

      {/* Stages Configuration */}
      <div className="border-t pt-3 dark:border-neutral-700">
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium">Seduction Stages</label>
          <Button size="sm" variant="secondary" onClick={handleAddStage}>
            + Add Stage
          </Button>
        </div>

        <div className="space-y-3">
          {stages.map((stage, index) => (
            <div
              key={index}
              className="p-3 border rounded bg-neutral-50 dark:bg-neutral-800/50 dark:border-neutral-700"
            >
              {/* Stage Header */}
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Stage {index + 1}
                </div>
                <button
                  onClick={() => handleRemoveStage(index)}
                  className="text-red-600 hover:text-red-700 text-xs px-2 py-1"
                  disabled={stages.length === 1}
                >
                  Remove
                </button>
              </div>

              {/* Stage Fields */}
              <div className="space-y-2">
                {/* Name */}
                <div>
                  <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1">
                    Name
                  </label>
                  <input
                    type="text"
                    value={stage.name}
                    onChange={(e) => handleUpdateStage(index, 'name', e.target.value)}
                    className="w-full px-2 py-1 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
                    placeholder="e.g., Flirt"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1">
                    Description
                  </label>
                  <textarea
                    value={stage.description}
                    onChange={(e) => handleUpdateStage(index, 'description', e.target.value)}
                    rows={2}
                    className="w-full px-2 py-1 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
                    placeholder="What happens at this stage?"
                  />
                </div>

                {/* Required Affinity */}
                <div>
                  <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1">
                    Required Affinity (0-100)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={stage.requiredAffinity}
                    onChange={(e) =>
                      handleUpdateStage(index, 'requiredAffinity', parseInt(e.target.value) || 0)
                    }
                    className="w-full px-2 py-1 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
                  />
                  <div className="mt-1 flex items-center gap-2">
                    <div className="flex-1 bg-neutral-200 dark:bg-neutral-700 rounded h-1.5">
                      <div
                        className="bg-pink-500 h-full rounded transition-all"
                        style={{ width: `${stage.requiredAffinity}%` }}
                      />
                    </div>
                    <span className="text-xs text-neutral-500 dark:text-neutral-400 min-w-[3ch]">
                      {stage.requiredAffinity}%
                    </span>
                  </div>
                </div>

                {/* Success Message */}
                <div>
                  <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1">
                    Success Message (optional)
                  </label>
                  <input
                    type="text"
                    value={stage.successMessage || ''}
                    onChange={(e) => handleUpdateStage(index, 'successMessage', e.target.value)}
                    className="w-full px-2 py-1 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
                    placeholder="Message shown on success"
                  />
                </div>

                {/* Failure Message */}
                <div>
                  <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1">
                    Failure Message (optional)
                  </label>
                  <input
                    type="text"
                    value={stage.failureMessage || ''}
                    onChange={(e) => handleUpdateStage(index, 'failureMessage', e.target.value)}
                    className="w-full px-2 py-1 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
                    placeholder="Message shown on failure"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Info Box */}
      <div className="text-xs text-neutral-500 dark:text-neutral-400 bg-pink-50 dark:bg-pink-900/20 border border-pink-200 dark:border-pink-800 rounded p-2 space-y-1">
        <div className="font-medium">💡 How it works:</div>
        <ul className="list-disc list-inside space-y-0.5 ml-1">
          <li>Player progresses through stages sequentially</li>
          <li>Each stage checks if affinity meets requirement</li>
          <li>Success advances to next stage; failure routes to failure path</li>
          <li>Connect success/failure ports to define routing</li>
        </ul>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button variant="secondary" onClick={handleResetToDefaults} className="flex-1">
          Reset to Defaults
        </Button>
        <Button variant="primary" onClick={handleApply} className="flex-1">
          Apply Changes
        </Button>
      </div>
    </div>
  );
}

// Default export for dynamic loading via nodeEditorRegistry
export default SeductionNodeEditor;
