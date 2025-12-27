import { Button } from '@pixsim7/shared.ui';
import { useNodeEditor } from './useNodeEditor';
import type { NodeEditorProps } from './useNodeEditor';
import { useGraphStore, type GraphState } from '@features/graph';
import type { ReturnNodeData } from '@domain/sceneBuilder';

interface ReturnConfig {
  returnPointId: string;
  returnValues: Record<string, any>;
}

export function ReturnNodeEditor({ node, onUpdate }: NodeEditorProps) {
  const getCurrentScene = useGraphStore((s: GraphState) => s.getCurrentScene);

  const { formState, updateField, setFormState, handleApply } = useNodeEditor<ReturnConfig>({
    node,
    onUpdate,
    initialState: {
      returnPointId: '',
      returnValues: {},
    },
    loadFromNode: (node) => {
      const returnNode = node as ReturnNodeData;
      return {
        returnPointId: returnNode.returnPointId || '',
        returnValues: returnNode.returnValues || {},
      };
    },
    saveToNode: (formState, node) => ({
      returnPointId: formState.returnPointId,
      returnValues: formState.returnValues,
    } as Partial<ReturnNodeData>),
  });

  // Get current scene signature
  const currentScene = getCurrentScene();
  const signature = currentScene?.signature;
  const returnPoints = signature?.returnPoints || [];

  // Get selected return point
  const selectedReturnPoint = returnPoints.find(rp => rp.id === formState.returnPointId);

  const handleReturnValueChange = (valueName: string, value: any) => {
    setFormState(prev => ({
      ...prev,
      returnValues: {
        ...prev.returnValues,
        [valueName]: value,
      },
    }));
  };

  return (
    <div className="space-y-4">
      <div className="text-sm text-neutral-600 dark:text-neutral-400">
        Exit current scene through a return point
      </div>

      {/* Return Point Selection */}
      {returnPoints.length > 0 ? (
        <>
          <div>
            <label className="block text-sm font-medium mb-1">Return Point</label>
            <select
              value={formState.returnPointId}
              onChange={(e) => updateField('returnPointId', e.target.value)}
              className="w-full px-3 py-2 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
            >
              <option value="">-- Select return point --</option>
              {returnPoints.map((rp) => (
                <option key={rp.id} value={rp.id}>
                  {rp.label}
                </option>
              ))}
            </select>
            {selectedReturnPoint?.description && (
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                {selectedReturnPoint.description}
              </p>
            )}
          </div>

          {/* Return Point Info */}
          {selectedReturnPoint && (
            <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-green-700 dark:text-green-300">
                  🔙 Return Point: {selectedReturnPoint.label}
                </div>
                {selectedReturnPoint.color && (
                  <span
                    className="w-4 h-4 rounded-full border-2 border-green-700 dark:border-green-300"
                    style={{ backgroundColor: selectedReturnPoint.color }}
                  />
                )}
              </div>
            </div>
          )}

          {/* Return Values */}
          {selectedReturnPoint && selectedReturnPoint.returnValues && Object.keys(selectedReturnPoint.returnValues).length > 0 && (
            <div className="border-t pt-3 dark:border-neutral-700">
              <label className="block text-sm font-medium mb-2">Return Values</label>
              <div className="space-y-2">
                {Object.entries(selectedReturnPoint.returnValues).map(([valueName, param]) => (
                  <div key={valueName} className="p-3 border rounded bg-neutral-50 dark:bg-neutral-800/50 dark:border-neutral-700">
                    <div className="flex items-baseline justify-between mb-1">
                      <span className="text-sm font-medium">{valueName}</span>
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
                      value={formState.returnValues[valueName] || ''}
                      onChange={(e) => handleReturnValueChange(valueName, e.target.value)}
                      placeholder={param.required ? 'Required' : `Default: ${param.defaultValue || 'none'}`}
                      className="w-full px-2 py-1 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
                    />
                    {param.required && !formState.returnValues[valueName] && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">⚠️ Required value</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Warning Box */}
          {!formState.returnPointId && (
            <div className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded p-3">
              ⚠️ Select a return point to specify how this scene exits
            </div>
          )}
        </>
      ) : (
        <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded">
          <div className="text-sm font-medium text-amber-700 dark:text-amber-300 mb-2">
            ⚠️ No Return Points Defined
          </div>
          <p className="text-xs text-amber-600 dark:text-amber-400 mb-2">
            This scene doesn't have any return points configured. Return nodes are only useful in reusable scenes.
          </p>
          <p className="text-xs text-amber-600 dark:text-amber-400">
            To use return nodes:
          </p>
          <ol className="text-xs text-amber-600 dark:text-amber-400 list-decimal list-inside ml-2 mt-1">
            <li>Mark this scene as reusable in scene settings</li>
            <li>Define return points (e.g., "success", "failure", "cancel")</li>
            <li>Return nodes will exit through those points</li>
          </ol>
        </div>
      )}

      {/* Info Box */}
      <div className="text-xs text-neutral-500 dark:text-neutral-400 bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 rounded p-3">
        💡 Return nodes have no outgoing connections. They exit the current scene and return control to the calling scene.
      </div>

      <Button
        variant="primary"
        onClick={handleApply}
        className="w-full"
        disabled={returnPoints.length > 0 && !formState.returnPointId}
      >
        Apply Changes
      </Button>
    </div>
  );
}

// Default export for dynamic loading via nodeEditorRegistry
export default ReturnNodeEditor;
