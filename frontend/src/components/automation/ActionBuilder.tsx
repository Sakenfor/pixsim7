import { useState } from 'react';
import { ActionDefinition, ActionType } from '../../types/automation';
import { Button, Panel } from '@pixsim7/ui';
import { ActionTypeSelect } from './ActionTypeSelect';
import { ActionParamsEditor } from './ActionParamsEditor';

interface ActionBuilderProps {
  actions: ActionDefinition[];
  onChange: (actions: ActionDefinition[]) => void;
}

export function ActionBuilder({ actions, onChange }: ActionBuilderProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const addAction = () => {
    const newAction: ActionDefinition = {
      type: ActionType.WAIT,
      params: { seconds: 1 },
    };
    onChange([...actions, newAction]);
    setSelectedIndex(actions.length);
  };

  const updateAction = (index: number, action: ActionDefinition) => {
    const updated = [...actions];
    updated[index] = action;
    onChange(updated);
  };

  const deleteAction = (index: number) => {
    const updated = actions.filter((_, i) => i !== index);
    onChange(updated);
    if (selectedIndex === index) {
      setSelectedIndex(null);
    } else if (selectedIndex !== null && selectedIndex > index) {
      setSelectedIndex(selectedIndex - 1);
    }
  };

  const moveAction = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === actions.length - 1) return;

    const updated = [...actions];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [updated[index], updated[targetIndex]] = [updated[targetIndex], updated[index]];
    onChange(updated);

    if (selectedIndex === index) {
      setSelectedIndex(targetIndex);
    } else if (selectedIndex === targetIndex) {
      setSelectedIndex(index);
    }
  };

  const duplicateAction = (index: number) => {
    const actionToDuplicate = actions[index];
    const duplicated: ActionDefinition = {
      ...actionToDuplicate,
      params: { ...actionToDuplicate.params },
    };
    const updated = [...actions];
    updated.splice(index + 1, 0, duplicated);
    onChange(updated);
    setSelectedIndex(index + 1);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Action Sequence ({actions.length})
        </h3>
        <Button size="sm" variant="primary" onClick={addAction}>
          ➕ Add Action
        </Button>
      </div>

      {actions.length === 0 ? (
        <Panel className="text-center py-8">
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            No actions yet. Click "Add Action" to start building your automation.
          </p>
        </Panel>
      ) : (
        <div className="space-y-2">
          {actions.map((action, index) => (
            <Panel
              key={index}
              padded={false}
              className={`cursor-pointer transition-colors ${
                selectedIndex === index
                  ? 'ring-2 ring-blue-500 border-blue-500'
                  : 'hover:border-gray-400 dark:hover:border-gray-500'
              }`}
              onClick={() => setSelectedIndex(index)}
            >
              <div className="flex items-start gap-3 p-3">
                {/* Index */}
                <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded text-sm font-medium text-gray-600 dark:text-gray-400">
                  {index + 1}
                </div>

                {/* Action info */}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    {action.type}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {Object.keys(action.params).length > 0
                      ? JSON.stringify(action.params)
                      : 'No parameters'}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      moveAction(index, 'up');
                    }}
                    disabled={index === 0}
                    className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 disabled:opacity-30"
                    title="Move up"
                  >
                    ⬆️
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      moveAction(index, 'down');
                    }}
                    disabled={index === actions.length - 1}
                    className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 disabled:opacity-30"
                    title="Move down"
                  >
                    ⬇️
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      duplicateAction(index);
                    }}
                    className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    title="Duplicate"
                  >
                    📋
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteAction(index);
                    }}
                    className="p-1 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-200"
                    title="Delete"
                  >
                    🗑️
                  </button>
                </div>
              </div>

              {/* Expanded details */}
              {selectedIndex === index && (
                <div className="border-t border-gray-200 dark:border-gray-700 p-3 bg-gray-50 dark:bg-gray-800/50">
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Action Type
                      </label>
                      <ActionTypeSelect
                        value={action.type}
                        onChange={(type) => {
                          updateAction(index, {
                            type,
                            params: getDefaultParams(type),
                          });
                        }}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Parameters
                      </label>
                      <ActionParamsEditor
                        actionType={action.type}
                        params={action.params}
                        onChange={(params) => {
                          updateAction(index, { ...action, params });
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}

// Helper function to get default parameters for each action type
function getDefaultParams(type: ActionType): Record<string, any> {
  switch (type) {
    case ActionType.WAIT:
      return { seconds: 1 };
    case ActionType.LAUNCH_APP:
      return { package: '' };
    case ActionType.CLICK_COORDS:
      return { x: 0, y: 0 };
    case ActionType.TYPE_TEXT:
      return { text: '' };
    case ActionType.SWIPE:
      return { x1: 0, y1: 0, x2: 0, y2: 0, duration_ms: 300 };
    case ActionType.WAIT_FOR_ELEMENT:
      return { timeout: 10, interval: 1 };
    case ActionType.CLICK_ELEMENT:
      return {};
    case ActionType.IF_ELEMENT_EXISTS:
    case ActionType.IF_ELEMENT_NOT_EXISTS:
      return { actions: [] };
    case ActionType.REPEAT:
      return { count: 1, actions: [] };
    case ActionType.PRESS_BACK:
    case ActionType.PRESS_HOME:
    case ActionType.EXIT_APP:
    case ActionType.SCREENSHOT:
      return {};
    default:
      return {};
  }
}
