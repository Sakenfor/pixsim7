import { useState, useEffect } from 'react';
import { Button, useToast } from '@pixsim7/shared.ui';
import { useGraphStore, type GraphState } from '../stores/graphStore';
import type { DraftEdge } from '../modules/scene-builder';
import {
  type EdgeEffect,
  createRelationshipEffect,
  createArcEffect,
  createQuestEffect,
  createInventoryEffect,
  formatEffect,
  validateEffect,
} from '@pixsim7/game.engine';

export function EdgeEffectsEditor() {
  const toast = useToast();
  const getCurrentScene = useGraphStore((s: GraphState) => s.getCurrentScene);
  const attachEdgeMeta = useGraphStore((s: GraphState) => s.attachEdgeMeta);

  const currentScene = getCurrentScene();

  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [effects, setEffects] = useState<EdgeEffect[]>([]);
  const [showAddEffect, setShowAddEffect] = useState(false);

  // New effect form
  const [effectType, setEffectType] = useState<'relationship' | 'arc' | 'quest' | 'inventory'>('relationship');
  const [targetNpcId, setTargetNpcId] = useState<string>('');
  const [relationshipField, setRelationshipField] = useState<'affinity' | 'trust'>('affinity');
  const [arcId, setArcId] = useState<string>('');
  const [arcField, setArcField] = useState<string>('stage');
  const [questId, setQuestId] = useState<string>('');
  const [questField, setQuestField] = useState<'status' | 'stepsCompleted'>('status');
  const [itemId, setItemId] = useState<string>('');
  const [itemQty, setItemQty] = useState<number>(1);
  const [effectOp, setEffectOp] = useState<'set' | 'inc' | 'dec' | 'push'>('inc');
  const [effectValue, setEffectValue] = useState<string>('10');

  // Load effects when edge selection changes
  useEffect(() => {
    if (selectedEdgeId && currentScene) {
      const edge = currentScene.edges.find((e: DraftEdge) => e.id === selectedEdgeId);
      if (edge && edge.meta?.effects) {
        setEffects(edge.meta.effects);
      } else {
        setEffects([]);
      }
    } else {
      setEffects([]);
    }
  }, [selectedEdgeId, currentScene]);

  const handleAddEffect = () => {
    let newEffect: EdgeEffect | null = null;

    try {
      if (effectType === 'relationship') {
        const npcId = Number(targetNpcId);
        if (!Number.isFinite(npcId)) {
          toast.error('Invalid NPC ID');
          return;
        }
        const value = effectOp === 'set' ? parseFloat(effectValue) : parseInt(effectValue, 10);
        newEffect = createRelationshipEffect(npcId, relationshipField, effectOp as 'inc' | 'dec' | 'set', value);
      } else if (effectType === 'arc') {
        if (!arcId.trim()) {
          toast.error('Arc ID is required');
          return;
        }
        const value = effectOp === 'set' || effectOp === 'inc' ? parseFloat(effectValue) : effectValue;
        newEffect = createArcEffect(arcId.trim(), arcField, effectOp as 'inc' | 'set' | 'push', value);
      } else if (effectType === 'quest') {
        if (!questId.trim()) {
          toast.error('Quest ID is required');
          return;
        }
        const value = questField === 'stepsCompleted' && effectOp === 'inc' ? parseInt(effectValue, 10) : effectValue;
        newEffect = createQuestEffect(questId.trim(), questField, effectOp as 'set' | 'inc' | 'push', value);
      } else if (effectType === 'inventory') {
        if (!itemId.trim()) {
          toast.error('Item ID is required');
          return;
        }
        newEffect = createInventoryEffect(itemId.trim(), itemQty, effectOp as 'inc' | 'dec' | 'push');
      }

      if (newEffect && validateEffect(newEffect)) {
        const updatedEffects = [...effects, newEffect];
        setEffects(updatedEffects);
        saveEffects(updatedEffects);
        setShowAddEffect(false);
        resetForm();
        toast.success('Effect added');
      }
    } catch (error) {
      toast.error(`Failed to add effect: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleRemoveEffect = (index: number) => {
    const updatedEffects = effects.filter((_, i) => i !== index);
    setEffects(updatedEffects);
    saveEffects(updatedEffects);
    toast.success('Effect removed');
  };

  const saveEffects = (updatedEffects: EdgeEffect[]) => {
    if (!selectedEdgeId) return;
    attachEdgeMeta(selectedEdgeId, { effects: updatedEffects });
  };

  const resetForm = () => {
    setTargetNpcId('');
    setArcId('');
    setQuestId('');
    setItemId('');
    setEffectValue('10');
    setItemQty(1);
  };

  if (!currentScene) {
    return (
      <div className="p-4 text-sm text-neutral-500">
        No active scene. Create or load a scene first.
      </div>
    );
  }

  const edges = currentScene.edges || [];

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full">
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">Edge Effects Editor</h3>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Configure relationship, arc, and quest effects for scene edges
        </p>
      </div>

      {/* Edge Selection */}
      <div>
        <label className="block text-sm font-medium mb-1">Select Edge</label>
        <select
          value={selectedEdgeId || ''}
          onChange={(e) => setSelectedEdgeId(e.target.value || null)}
          className="w-full px-3 py-2 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
        >
          <option value="">-- Select an edge --</option>
          {edges.map((edge: DraftEdge) => (
            <option key={edge.id} value={edge.id}>
              {edge.from} → {edge.to} ({edge.meta?.fromPort || 'default'})
            </option>
          ))}
        </select>
        {edges.length === 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
            No edges in scene. Connect nodes in the graph to create edges.
          </p>
        )}
      </div>

      {selectedEdgeId && (
        <>
          {/* Effects List */}
          <div className="border-t pt-3 dark:border-neutral-700">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold">Effects</h4>
              <Button size="sm" variant="secondary" onClick={() => setShowAddEffect(!showAddEffect)}>
                {showAddEffect ? 'Cancel' : '+ Add Effect'}
              </Button>
            </div>

            {effects.length > 0 && (
              <div className="space-y-2 mb-3">
                {effects.map((effect, index) => (
                  <div
                    key={index}
                    className="p-2 border rounded bg-neutral-50 dark:bg-neutral-800/50 dark:border-neutral-700 flex items-start justify-between gap-2"
                  >
                    <div className="flex-1 text-xs">
                      <div className="font-medium">{formatEffect(effect)}</div>
                      <div className="text-neutral-500 dark:text-neutral-400 mt-0.5">
                        Key: {effect.key} | Op: {effect.op} | Value: {JSON.stringify(effect.value)}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveEffect(index)}
                      className="text-red-600 hover:text-red-700 text-xs px-2 py-1"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}

            {effects.length === 0 && !showAddEffect && (
              <p className="text-xs text-neutral-500 text-center py-4">
                No effects on this edge yet. Click "+ Add Effect" to add one.
              </p>
            )}

            {/* Add Effect Form */}
            {showAddEffect && (
              <div className="border rounded p-3 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-800 space-y-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Effect Type</label>
                  <select
                    value={effectType}
                    onChange={(e) => setEffectType(e.target.value as any)}
                    className="w-full px-2 py-1 border rounded text-xs bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
                  >
                    <option value="relationship">NPC Relationship</option>
                    <option value="arc">Story Arc</option>
                    <option value="quest">Quest</option>
                    <option value="inventory">Inventory</option>
                  </select>
                </div>

                {effectType === 'relationship' && (
                  <>
                    <div>
                      <label className="block text-xs font-medium mb-1">NPC ID</label>
                      <input
                        type="number"
                        value={targetNpcId}
                        onChange={(e) => setTargetNpcId(e.target.value)}
                        className="w-full px-2 py-1 border rounded text-xs bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
                        placeholder="e.g., 12"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Field</label>
                      <select
                        value={relationshipField}
                        onChange={(e) => setRelationshipField(e.target.value as any)}
                        className="w-full px-2 py-1 border rounded text-xs bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
                      >
                        <option value="affinity">Affinity</option>
                        <option value="trust">Trust</option>
                      </select>
                    </div>
                  </>
                )}

                {effectType === 'arc' && (
                  <>
                    <div>
                      <label className="block text-xs font-medium mb-1">Arc ID</label>
                      <input
                        type="text"
                        value={arcId}
                        onChange={(e) => setArcId(e.target.value)}
                        className="w-full px-2 py-1 border rounded text-xs bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
                        placeholder="e.g., main_romance_alex"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Field</label>
                      <input
                        type="text"
                        value={arcField}
                        onChange={(e) => setArcField(e.target.value)}
                        className="w-full px-2 py-1 border rounded text-xs bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
                        placeholder="e.g., stage, seenScenes"
                      />
                    </div>
                  </>
                )}

                {effectType === 'quest' && (
                  <>
                    <div>
                      <label className="block text-xs font-medium mb-1">Quest ID</label>
                      <input
                        type="text"
                        value={questId}
                        onChange={(e) => setQuestId(e.target.value)}
                        className="w-full px-2 py-1 border rounded text-xs bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
                        placeholder="e.g., find_lost_cat"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Field</label>
                      <select
                        value={questField}
                        onChange={(e) => setQuestField(e.target.value as any)}
                        className="w-full px-2 py-1 border rounded text-xs bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
                      >
                        <option value="status">Status</option>
                        <option value="stepsCompleted">Steps Completed</option>
                      </select>
                    </div>
                  </>
                )}

                {effectType === 'inventory' && (
                  <>
                    <div>
                      <label className="block text-xs font-medium mb-1">Item ID</label>
                      <input
                        type="text"
                        value={itemId}
                        onChange={(e) => setItemId(e.target.value)}
                        className="w-full px-2 py-1 border rounded text-xs bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
                        placeholder="e.g., flower, key_basement"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Quantity</label>
                      <input
                        type="number"
                        value={itemQty}
                        onChange={(e) => setItemQty(parseInt(e.target.value, 10) || 1)}
                        className="w-full px-2 py-1 border rounded text-xs bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
                        min="1"
                      />
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-xs font-medium mb-1">Operation</label>
                  <select
                    value={effectOp}
                    onChange={(e) => setEffectOp(e.target.value as any)}
                    className="w-full px-2 py-1 border rounded text-xs bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
                  >
                    <option value="set">Set</option>
                    <option value="inc">Increment</option>
                    {effectType !== 'arc' && <option value="dec">Decrement</option>}
                    {(effectType === 'arc' || effectType === 'inventory') && <option value="push">Push (array)</option>}
                  </select>
                </div>

                {effectType !== 'inventory' && (
                  <div>
                    <label className="block text-xs font-medium mb-1">Value</label>
                    <input
                      type="text"
                      value={effectValue}
                      onChange={(e) => setEffectValue(e.target.value)}
                      className="w-full px-2 py-1 border rounded text-xs bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
                      placeholder="e.g., 10, 2, in_progress"
                    />
                  </div>
                )}

                <div className="flex gap-2 justify-end">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setShowAddEffect(false);
                      resetForm();
                    }}
                  >
                    Cancel
                  </Button>
                  <Button size="sm" variant="primary" onClick={handleAddEffect}>
                    Add Effect
                  </Button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
