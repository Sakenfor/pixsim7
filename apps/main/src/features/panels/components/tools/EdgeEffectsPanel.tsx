import { useState, useEffect, useRef } from "react";
import { useGraphStore, type GraphState } from "@features/graph";
import type { DraftEdge } from "@/modules/scene-builder";
import { Button, useToast } from "@pixsim7/shared.ui";
import {
  type EdgeEffect,
  createRelationshipEffect,
  createArcEffect,
  createQuestEffect,
  createInventoryEffect,
  formatEffect,
  validateEffect,
} from "@pixsim7/game.engine";

/**
 * EdgeEffectsPanel
 *
 * Modern, compact UI for inspecting and editing edge effects
 * (relationship/arc/quest/inventory updates applied when traversing an edge).
 */
export function EdgeEffectsPanel() {
  const toast = useToast();
  const getCurrentScene = useGraphStore((s: GraphState) => s.getCurrentScene);
  const attachEdgeMeta = useGraphStore((s: GraphState) => s.attachEdgeMeta);

  const currentScene = getCurrentScene();

  const [isOpen, setIsOpen] = useState(false);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [effects, setEffects] = useState<EdgeEffect[]>([]);
  const [showAddEffect, setShowAddEffect] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);

  // New effect form state
  const [effectType, setEffectType] = useState<
    "relationship" | "arc" | "quest" | "inventory"
  >("relationship");
  const [targetNpcId, setTargetNpcId] = useState<string>("");
  const [relationshipField, setRelationshipField] = useState<
    "affinity" | "trust"
  >("affinity");
  const [arcId, setArcId] = useState<string>("");
  const [arcField, setArcField] = useState<string>("stage");
  const [questId, setQuestId] = useState<string>("");
  const [questField, setQuestField] = useState<"status" | "stepsCompleted">(
    "status",
  );
  const [itemId, setItemId] = useState<string>("");
  const [itemQty, setItemQty] = useState<number>(1);
  const [effectOp, setEffectOp] = useState<"set" | "inc" | "dec" | "push">(
    "inc",
  );
  const [effectValue, setEffectValue] = useState<string>("10");

  // Load effects when edge selection changes
  useEffect(() => {
    if (selectedEdgeId && currentScene) {
      const edge = currentScene.edges.find(
        (e: DraftEdge) => e.id === selectedEdgeId,
      );
      if (edge && edge.meta?.effects) {
        setEffects(edge.meta.effects);
      } else {
        setEffects([]);
      }
    } else {
      setEffects([]);
    }
  }, [selectedEdgeId, currentScene]);

  // Close panel when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setShowAddEffect(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  const saveEffects = (updatedEffects: EdgeEffect[]) => {
    if (!selectedEdgeId) return;
    attachEdgeMeta(selectedEdgeId, { effects: updatedEffects });
  };

  const resetForm = () => {
    setTargetNpcId("");
    setArcId("");
    setQuestId("");
    setItemId("");
    setEffectValue("10");
    setItemQty(1);
  };

  const handleAddEffect = () => {
    let newEffect: EdgeEffect | null = null;

    try {
      if (effectType === "relationship") {
        const npcId = Number(targetNpcId);
        if (!Number.isFinite(npcId)) {
          toast.error("Invalid NPC ID");
          return;
        }
        const value =
          effectOp === "set"
            ? parseFloat(effectValue)
            : parseInt(effectValue, 10);
        newEffect = createRelationshipEffect(
          npcId,
          relationshipField,
          effectOp as "inc" | "dec" | "set",
          value,
        );
      } else if (effectType === "arc") {
        if (!arcId.trim()) {
          toast.error("Arc ID is required");
          return;
        }
        const value =
          effectOp === "set" || effectOp === "inc"
            ? parseFloat(effectValue)
            : effectValue;
        newEffect = createArcEffect(
          arcId.trim(),
          arcField,
          effectOp as "inc" | "set" | "push",
          value,
        );
      } else if (effectType === "quest") {
        if (!questId.trim()) {
          toast.error("Quest ID is required");
          return;
        }
        const value =
          questField === "stepsCompleted" && effectOp === "inc"
            ? parseInt(effectValue, 10)
            : effectValue;
        newEffect = createQuestEffect(
          questId.trim(),
          questField,
          effectOp as "set" | "inc" | "push",
          value,
        );
      } else if (effectType === "inventory") {
        if (!itemId.trim()) {
          toast.error("Item ID is required");
          return;
        }
        newEffect = createInventoryEffect(
          itemId.trim(),
          itemQty,
          effectOp as "inc" | "dec" | "push",
        );
      }

      if (newEffect && validateEffect(newEffect)) {
        const updatedEffects = [...effects, newEffect];
        setEffects(updatedEffects);
        saveEffects(updatedEffects);
        setShowAddEffect(false);
        resetForm();
        toast.success("Effect added");
      }
    } catch (error) {
      toast.error(
        `Failed to add effect: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  };

  const handleRemoveEffect = (index: number) => {
    const updatedEffects = effects.filter((_, i) => i !== index);
    setEffects(updatedEffects);
    saveEffects(updatedEffects);
    toast.success("Effect removed");
  };

  const edges = currentScene?.edges || [];

  const badge = (
    <div
      className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded text-xs font-medium text-purple-700 dark:text-purple-300 cursor-pointer hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
      onClick={() => setIsOpen((prev) => !prev)}
    >
      <span>ƒsT</span>
      <span>Edge Effects</span>
    </div>
  );

  if (!currentScene) {
    return (
      <div className="relative" ref={panelRef}>
        {badge}
      </div>
    );
  }

  return (
    <div className="relative" ref={panelRef}>
      {badge}

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-96 max-h-[26rem] bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 rounded-lg shadow-2xl overflow-hidden z-50 flex flex-col">
          <div className="p-3 bg-neutral-100 dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-700 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
              Edge Effects
            </h3>
            <button
              onClick={() => setIsOpen(false)}
              className="text-neutral-600 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors text-xs"
              title="Close"
            >
              ƒo
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3 text-xs">
            {/* Edge selection */}
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <label className="font-medium text-neutral-700 dark:text-neutral-200">
                  Select Edge
                </label>
                <select
                  value={selectedEdgeId ?? ""}
                  onChange={(e) => setSelectedEdgeId(e.target.value || null)}
                  className="flex-1 px-2 py-1 border rounded bg-white dark:bg-neutral-900 border-neutral-300 dark:border-neutral-700"
                >
                  <option value="">None</option>
                  {edges.map((edge: DraftEdge) => (
                    <option key={edge.id} value={edge.id}>
                      {edge.id} ({edge.from} → {edge.to})
                    </option>
                  ))}
                </select>
              </div>
              {edges.length === 0 && (
                <p className="text-neutral-500 dark:text-neutral-400 mt-1">
                  No edges in scene. Connect nodes in the graph to create edges.
                </p>
              )}
            </div>

            {selectedEdgeId && (
              <>
                {/* Effects list */}
                <div className="border-t pt-2 mt-2 dark:border-neutral-700">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-neutral-800 dark:text-neutral-100">
                      Effects
                    </span>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setShowAddEffect((prev) => !prev)}
                    >
                      {showAddEffect ? "Cancel" : "+ Add Effect"}
                    </Button>
                  </div>

                  {effects.length > 0 ? (
                    <div className="space-y-2 mb-2">
                      {effects.map((effect, index) => (
                        <div
                          key={`${effect.key}-${index}`}
                          className="p-2 border rounded bg-neutral-50 dark:bg-neutral-800/50 dark:border-neutral-700 flex items-start justify-between gap-2"
                        >
                          <div className="flex-1">
                            <div className="font-medium text-neutral-800 dark:text-neutral-100">
                              {formatEffect(effect)}
                            </div>
                            <div className="text-neutral-500 dark:text-neutral-400 mt-0.5">
                              Key: {effect.key} | Op: {effect.op} | Value:{" "}
                              {JSON.stringify(effect.value)}
                            </div>
                          </div>
                          <button
                            onClick={() => handleRemoveEffect(index)}
                            className="text-red-600 hover:text-red-700 text-[11px] px-2 py-1"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    !showAddEffect && (
                      <p className="text-neutral-500 dark:text-neutral-400 text-center py-3">
                        No effects on this edge yet. Click "+ Add Effect" to add
                        one.
                      </p>
                    )
                  )}
                </div>

                {/* Add effect form */}
                {showAddEffect && (
                  <div className="border rounded p-3 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-800 space-y-3">
                    <div>
                      <label className="block text-[11px] font-medium mb-1">
                        Effect Type
                      </label>
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

                    {effectType === "relationship" && (
                      <>
                        <div>
                          <label className="block text-[11px] font-medium mb-1">
                            NPC ID
                          </label>
                          <input
                            type="number"
                            value={targetNpcId}
                            onChange={(e) => setTargetNpcId(e.target.value)}
                            className="w-full px-2 py-1 border rounded text-xs bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
                            placeholder="e.g., 12"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium mb-1">
                            Field
                          </label>
                          <select
                            value={relationshipField}
                            onChange={(e) =>
                              setRelationshipField(e.target.value as any)
                            }
                            className="w-full px-2 py-1 border rounded text-xs bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
                          >
                            <option value="affinity">Affinity</option>
                            <option value="trust">Trust</option>
                          </select>
                        </div>
                      </>
                    )}

                    {effectType === "arc" && (
                      <>
                        <div>
                          <label className="block text-[11px] font-medium mb-1">
                            Arc ID
                          </label>
                          <input
                            type="text"
                            value={arcId}
                            onChange={(e) => setArcId(e.target.value)}
                            className="w-full px-2 py-1 border rounded text-xs bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
                            placeholder="e.g., main_romance_alex"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium mb-1">
                            Field
                          </label>
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

                    {effectType === "quest" && (
                      <>
                        <div>
                          <label className="block text-[11px] font-medium mb-1">
                            Quest ID
                          </label>
                          <input
                            type="text"
                            value={questId}
                            onChange={(e) => setQuestId(e.target.value)}
                            className="w-full px-2 py-1 border rounded text-xs bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
                            placeholder="e.g., find_lost_cat"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium mb-1">
                            Field
                          </label>
                          <select
                            value={questField}
                            onChange={(e) =>
                              setQuestField(e.target.value as any)
                            }
                            className="w-full px-2 py-1 border rounded text-xs bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
                          >
                            <option value="status">Status</option>
                            <option value="stepsCompleted">
                              Steps Completed
                            </option>
                          </select>
                        </div>
                      </>
                    )}

                    {effectType === "inventory" && (
                      <>
                        <div>
                          <label className="block text-[11px] font-medium mb-1">
                            Item ID
                          </label>
                          <input
                            type="text"
                            value={itemId}
                            onChange={(e) => setItemId(e.target.value)}
                            className="w-full px-2 py-1 border rounded text-xs bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
                            placeholder="e.g., flower, key_basement"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium mb-1">
                            Quantity
                          </label>
                          <input
                            type="number"
                            value={itemQty}
                            onChange={(e) =>
                              setItemQty(parseInt(e.target.value, 10) || 1)
                            }
                            className="w-full px-2 py-1 border rounded text-xs bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
                            min={1}
                          />
                        </div>
                      </>
                    )}

                    <div>
                      <label className="block text-[11px] font-medium mb-1">
                        Operation
                      </label>
                      <select
                        value={effectOp}
                        onChange={(e) => setEffectOp(e.target.value as any)}
                        className="w-full px-2 py-1 border rounded text-xs bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
                      >
                        <option value="set">Set</option>
                        <option value="inc">Increment</option>
                        {effectType !== "arc" && (
                          <option value="dec">Decrement</option>
                        )}
                        {(effectType === "arc" ||
                          effectType === "inventory") && (
                          <option value="push">Push (array)</option>
                        )}
                      </select>
                    </div>

                    {effectType !== "inventory" && (
                      <div>
                        <label className="block text-[11px] font-medium mb-1">
                          Value
                        </label>
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
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={handleAddEffect}
                      >
                        Add Effect
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
