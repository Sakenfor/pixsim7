import { useState, useEffect } from 'react';
import { Button } from '@pixsim7/ui';
import type { DraftSceneNode } from '../../modules/scene-builder';

interface ChoiceNodeEditorProps {
  node: DraftSceneNode;
  onUpdate: (patch: Partial<DraftSceneNode>) => void;
}

interface Choice {
  id: string;
  text: string;
  targetNodeId?: string;
  color?: string; // Custom port color
}

export function ChoiceNodeEditor({ node, onUpdate }: ChoiceNodeEditorProps) {
  const [choices, setChoices] = useState<Choice[]>([
    { id: 'choice_1', text: '', targetNodeId: '' }
  ]);

  useEffect(() => {
    // Load choices from node metadata
    const metadata = node.metadata as Record<string, unknown> | undefined;
    const savedChoices = metadata?.choices;

    // Validate that savedChoices is an array of the expected type
    if (Array.isArray(savedChoices) && savedChoices.length > 0) {
      // Type guard: check if each item has the expected structure
      const isValidChoiceArray = savedChoices.every(
        (choice) =>
          typeof choice === 'object' &&
          choice !== null &&
          'id' in choice &&
          'text' in choice
      );

      if (isValidChoiceArray) {
        setChoices(savedChoices as Choice[]);
      } else {
        console.warn('[ChoiceNodeEditor] Saved choices have invalid structure, using defaults');
      }
    }
  }, [node]);

  const availableColors = [
    { value: '#8b5cf6', label: 'Purple' },
    { value: '#3b82f6', label: 'Blue' },
    { value: '#10b981', label: 'Green' },
    { value: '#f59e0b', label: 'Orange' },
    { value: '#ef4444', label: 'Red' },
    { value: '#ec4899', label: 'Pink' },
    { value: '#06b6d4', label: 'Cyan' },
  ];

  function handleAddChoice() {
    const nextIndex = choices.length + 1;
    setChoices([...choices, { id: `choice_${nextIndex}`, text: '', targetNodeId: '', color: '#8b5cf6' }]);
  }

  function handleUpdateChoice(index: number, field: keyof Choice, value: string) {
    const updated = [...choices];
    updated[index][field] = value;
    setChoices(updated);
  }

  function handleRemoveChoice(index: number) {
    setChoices(choices.filter((_, i) => i !== index));
  }

  function handleApply() {
    onUpdate({
      metadata: {
        ...node.metadata,
        choices: choices,
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="text-sm text-neutral-600 dark:text-neutral-400">
        Configure player choices that branch to different nodes
      </div>

      <div className="border-t pt-3 dark:border-neutral-700">
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium">Choices</label>
          <Button size="sm" variant="secondary" onClick={handleAddChoice}>
            + Add Choice
          </Button>
        </div>

        <div className="space-y-2">
          {choices.map((choice, index) => (
            <div key={index} className="p-3 border rounded bg-neutral-50 dark:bg-neutral-800/50 dark:border-neutral-700">
              <div className="flex items-start gap-2">
                <div className="flex-1 space-y-2">
                  <input
                    type="text"
                    value={choice.text}
                    onChange={(e) => handleUpdateChoice(index, 'text', e.target.value)}
                    className="w-full px-2 py-1 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
                    placeholder="Choice text (e.g., 'Accept the quest')"
                  />

                  {/* Port Color Picker */}
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-neutral-600 dark:text-neutral-400">Port Color:</label>
                    <select
                      value={choice.color || '#8b5cf6'}
                      onChange={(e) => handleUpdateChoice(index, 'color', e.target.value)}
                      className="px-2 py-1 border rounded text-xs bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
                    >
                      {availableColors.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    <div
                      className="w-4 h-4 rounded-full border-2 border-white shadow"
                      style={{ backgroundColor: choice.color || '#8b5cf6' }}
                    />
                  </div>
                </div>
                <button
                  onClick={() => handleRemoveChoice(index)}
                  className="text-red-600 hover:text-red-700 text-xs px-2 py-1"
                  disabled={choices.length === 1}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="text-xs text-neutral-500 dark:text-neutral-400 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded p-2">
        💡 Each choice creates a separate output port. Connect them to define where each choice leads.
      </div>

      <Button variant="primary" onClick={handleApply} className="w-full">
        Apply Changes
      </Button>
    </div>
  );
}

// Default export for dynamic loading via nodeEditorRegistry
export default ChoiceNodeEditor;
