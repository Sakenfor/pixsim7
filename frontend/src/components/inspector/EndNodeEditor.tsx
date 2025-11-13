import { Button } from '@pixsim7/ui';
import { useNodeEditor } from './useNodeEditor';
import type { NodeEditorProps } from './useNodeEditor';

interface EndConfig {
  endType: 'success' | 'failure' | 'neutral';
  message: string;
}

export function EndNodeEditor({ node, onUpdate }: NodeEditorProps) {
  const { formState, updateField, handleApply } = useNodeEditor<EndConfig>({
    node,
    onUpdate,
    initialState: { endType: 'neutral', message: '' },
    loadFromNode: (node) => {
      const config = (node.metadata as any)?.endConfig;
      return config ? { endType: config.endType || 'neutral', message: config.message || '' } : {};
    },
    saveToNode: (formState, node) => ({
      metadata: {
        ...node.metadata,
        endConfig: formState
      }
    })
  });

  return (
    <div className="space-y-3">
      <div className="text-sm text-neutral-600 dark:text-neutral-400">
        Terminal node - ends the scene
      </div>

      {/* End Type */}
      <div>
        <label className="block text-sm font-medium mb-1">End Type</label>
        <select
          value={formState.endType}
          onChange={(e) => updateField('endType', e.target.value as EndConfig['endType'])}
          className="w-full px-3 py-2 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
        >
          <option value="success">Success (positive ending)</option>
          <option value="failure">Failure (negative ending)</option>
          <option value="neutral">Neutral (standard ending)</option>
        </select>
      </div>

      {/* End Message */}
      <div>
        <label className="block text-sm font-medium mb-1">End Message (optional)</label>
        <textarea
          value={formState.message}
          onChange={(e) => updateField('message', e.target.value)}
          rows={3}
          className="w-full px-3 py-2 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
          placeholder="Enter a message to display when this ending is reached..."
        />
      </div>

      <div className="text-xs text-neutral-500 dark:text-neutral-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded p-2">
        ⚠️ End nodes have no outgoing connections
      </div>

      <Button variant="primary" onClick={handleApply} className="w-full">
        Apply Changes
      </Button>
    </div>
  );
}
