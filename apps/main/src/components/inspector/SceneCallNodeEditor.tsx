import { Button } from '@pixsim7/shared.ui';
import { useNodeEditor } from './useNodeEditor';
import type { NodeEditorProps } from './useNodeEditor';
import { useGraphStore, type GraphState } from '@/stores/graphStore';
import type { SceneCallNodeData } from '@/modules/scene-builder';

interface SceneCallConfig {
  targetSceneId: string;
  parameterBindings: Record<string, any>;
  returnRouting: Record<string, string>;
  captureReturnValues?: Record<string, string>;
  inheritParentState?: boolean;
}

export function SceneCallNodeEditor({ node, onUpdate }: NodeEditorProps) {
  const scenes = useGraphStore((s: GraphState) => s.scenes);
  const listScenes = useGraphStore((s: GraphState) => s.listScenes);
  const currentSceneId = useGraphStore((s: GraphState) => s.currentSceneId);
  const getCurrentScene = useGraphStore((s: GraphState) => s.getCurrentScene);

  const { formState, updateField, setFormState, handleApply } = useNodeEditor<SceneCallConfig>({
    node,
    onUpdate,
    initialState: {
      targetSceneId: '',
      parameterBindings: {},
      returnRouting: {},
      captureReturnValues: {},
      inheritParentState: false,
    },
    loadFromNode: (node) => {
      const sceneCallNode = node as SceneCallNodeData;
      return {
        targetSceneId: sceneCallNode.targetSceneId || '',
        parameterBindings: sceneCallNode.parameterBindings || {},
        returnRouting: sceneCallNode.returnRouting || {},
        captureReturnValues: sceneCallNode.captureReturnValues,
        inheritParentState: sceneCallNode.inheritParentState,
      };
    },
    saveToNode: (formState, node) => ({
      targetSceneId: formState.targetSceneId,
      parameterBindings: formState.parameterBindings,
      returnRouting: formState.returnRouting,
      captureReturnValues: formState.captureReturnValues,
      inheritParentState: formState.inheritParentState,
    } as Partial<SceneCallNodeData>),
  });

  // Get available scenes (excluding current scene to prevent recursion)
  const availableScenes = listScenes().filter(s => s.id !== currentSceneId);

  // Get target scene and its signature
  const targetScene = formState.targetSceneId ? scenes[formState.targetSceneId] : null;
  const targetSignature = targetScene?.signature;

  // Get current scene nodes for return routing
  const currentScene = getCurrentScene();
  const currentNodes = currentScene?.nodes || [];

  const handleTargetSceneChange = (sceneId: string) => {
    updateField('targetSceneId', sceneId);
    // Reset bindings and routing when changing scene
    updateField('parameterBindings', {});
    updateField('returnRouting', {});
  };

  const handleParameterBindingChange = (paramName: string, value: any) => {
    setFormState(prev => ({
      ...prev,
      parameterBindings: {
        ...prev.parameterBindings,
        [paramName]: value,
      },
    }));
  };

  const handleReturnRoutingChange = (returnPointId: string, targetNodeId: string) => {
    setFormState(prev => ({
      ...prev,
      returnRouting: {
        ...prev.returnRouting,
        [returnPointId]: targetNodeId,
      },
    }));
  };

  return (
    <div className="space-y-4">
      <div className="text-sm text-neutral-600 dark:text-neutral-400">
        Call another scene as a reusable function
      </div>

      {/* Target Scene Selection */}
      <div>
        <label className="block text-sm font-medium mb-1">Target Scene</label>
        <select
          value={formState.targetSceneId}
          onChange={(e) => handleTargetSceneChange(e.target.value)}
          className="w-full px-3 py-2 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
        >
          <option value="">-- Select a scene --</option>
          {availableScenes.map((scene) => (
            <option key={scene.id} value={scene.id}>
              {scene.title} {scene.signature?.isReusable ? '🔄' : ''}
            </option>
          ))}
        </select>
        {availableScenes.length === 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
            No other scenes available. Create more scenes to call them.
          </p>
        )}
      </div>

      {/* Scene Info */}
      {targetScene && targetSignature && (
        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded">
          <div className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1">
            📋 Scene Info
          </div>
          {targetSignature.description && (
            <p className="text-xs text-blue-600 dark:text-blue-400 mb-2">
              {targetSignature.description}
            </p>
          )}
          <div className="text-xs text-blue-600 dark:text-blue-400">
            Parameters: {targetSignature.parameters?.length || 0} | Return Points: {targetSignature.returnPoints?.length || 0}
          </div>
        </div>
      )}

      {/* Parameter Bindings */}
      {targetSignature && targetSignature.parameters && targetSignature.parameters.length > 0 && (
        <div className="border-t pt-3 dark:border-neutral-700">
          <label className="block text-sm font-medium mb-2">Parameter Bindings</label>
          <div className="space-y-2">
            {targetSignature.parameters.map((param) => (
              <div key={param.name} className="p-3 border rounded bg-neutral-50 dark:bg-neutral-800/50 dark:border-neutral-700">
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-sm font-medium">{param.name}</span>
                  <span className="text-xs px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded">
                    {param.type}
                  </span>
                </div>
                {param.description && (
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
                    {param.description}
                  </p>
                )}
                <input
                  type="text"
                  value={formState.parameterBindings[param.name] || ''}
                  onChange={(e) => handleParameterBindingChange(param.name, e.target.value)}
                  placeholder={param.required ? 'Required' : `Default: ${param.defaultValue || 'none'}`}
                  className="w-full px-2 py-1 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
                />
                {param.required && !formState.parameterBindings[param.name] && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">⚠️ Required parameter</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Return Routing */}
      {targetSignature && targetSignature.returnPoints && targetSignature.returnPoints.length > 0 && (
        <div className="border-t pt-3 dark:border-neutral-700">
          <label className="block text-sm font-medium mb-2">Return Routing</label>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
            Map return points to target nodes in your current scene
          </p>
          <div className="space-y-2">
            {targetSignature.returnPoints.map((returnPoint) => (
              <div key={returnPoint.id} className="p-3 border rounded bg-neutral-50 dark:bg-neutral-800/50 dark:border-neutral-700">
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-sm font-medium">{returnPoint.label}</span>
                  {returnPoint.color && (
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: returnPoint.color }}
                    />
                  )}
                </div>
                {returnPoint.description && (
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
                    {returnPoint.description}
                  </p>
                )}
                <select
                  value={formState.returnRouting[returnPoint.id] || ''}
                  onChange={(e) => handleReturnRoutingChange(returnPoint.id, e.target.value)}
                  className="w-full px-2 py-1 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
                >
                  <option value="">-- No routing --</option>
                  {currentNodes.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.metadata?.label || n.id} ({n.type})
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Advanced Options */}
      <div className="border-t pt-3 dark:border-neutral-700">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={formState.inheritParentState || false}
            onChange={(e) => updateField('inheritParentState', e.target.checked)}
            className="rounded"
          />
          <span>Inherit parent scene state</span>
        </label>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 ml-6">
          Pass current scene's game state to the called scene
        </p>
      </div>

      {/* Info Box */}
      {!targetScene && (
        <div className="text-xs text-neutral-500 dark:text-neutral-400 bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 rounded p-3">
          💡 Select a scene to configure parameter bindings and return routing
        </div>
      )}

      <Button variant="primary" onClick={handleApply} className="w-full">
        Apply Changes
      </Button>
    </div>
  );
}

// Default export for dynamic loading via nodeEditorRegistry
export default SceneCallNodeEditor;
