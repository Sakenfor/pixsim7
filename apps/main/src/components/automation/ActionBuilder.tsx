import { useState } from 'react';
import { type ActionDefinition, type PresetVariable, type AutomationExecution, ActionType, AutomationStatus } from '@/types/automation';
import { Button } from '@pixsim7/shared.ui';
import { ActionParamsEditor } from './ActionParamsEditor';

interface ActionBuilderProps {
  actions: ActionDefinition[];
  onChange: (actions: ActionDefinition[]) => void;
  variables?: PresetVariable[];
  depth?: number;
  compact?: boolean;
  // Test functionality (works at any level)
  testAccountId?: number | null;
  onTestAction?: (actionsToTest: ActionDefinition[]) => void;
  testing?: boolean;
  testExecution?: AutomationExecution | null;
}

const EMPTY_PARAMS = {};

// Action types that support nested actions
const NESTED_ACTION_TYPES = [
  ActionType.IF_ELEMENT_EXISTS,
  ActionType.IF_ELEMENT_NOT_EXISTS,
  ActionType.REPEAT,
];

function hasNestedActions(type: ActionType): boolean {
  return NESTED_ACTION_TYPES.includes(type);
}

// Action category styling
type ActionCategory = 'timing' | 'app' | 'input' | 'navigation' | 'element' | 'control' | 'utility';

interface ActionMeta {
  icon: string;
  label: string;
  category: ActionCategory;
}

const ACTION_META: Record<ActionType, ActionMeta> = {
  [ActionType.WAIT]: { icon: '⏱️', label: 'Wait', category: 'timing' },
  [ActionType.LAUNCH_APP]: { icon: '🚀', label: 'Launch App', category: 'app' },
  [ActionType.EXIT_APP]: { icon: '🚪', label: 'Exit App', category: 'app' },
  [ActionType.CLICK_COORDS]: { icon: '👆', label: 'Click Coords', category: 'input' },
  [ActionType.TYPE_TEXT]: { icon: '⌨️', label: 'Type Text', category: 'input' },
  [ActionType.PRESS_BACK]: { icon: '◀️', label: 'Press Back', category: 'navigation' },
  [ActionType.EMULATOR_BACK]: { icon: '◀️', label: 'Emulator Back', category: 'navigation' },
  [ActionType.PRESS_HOME]: { icon: '🏠', label: 'Press Home', category: 'navigation' },
  [ActionType.SWIPE]: { icon: '👋', label: 'Swipe', category: 'input' },
  [ActionType.SCREENSHOT]: { icon: '📸', label: 'Screenshot', category: 'utility' },
  [ActionType.WAIT_FOR_ELEMENT]: { icon: '👁️', label: 'Wait for Element', category: 'element' },
  [ActionType.CLICK_ELEMENT]: { icon: '🎯', label: 'Click Element', category: 'element' },
  [ActionType.IF_ELEMENT_EXISTS]: { icon: '❓', label: 'If Element Exists', category: 'control' },
  [ActionType.IF_ELEMENT_NOT_EXISTS]: { icon: '❓', label: 'If Element Not Exists', category: 'control' },
  [ActionType.REPEAT]: { icon: '🔁', label: 'Repeat', category: 'control' },
};

const CATEGORY_COLORS: Record<ActionCategory, { bg: string; border: string; text: string }> = {
  timing: {
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    border: 'border-blue-300 dark:border-blue-700',
    text: 'text-blue-700 dark:text-blue-300',
  },
  app: {
    bg: 'bg-purple-50 dark:bg-purple-900/20',
    border: 'border-purple-300 dark:border-purple-700',
    text: 'text-purple-700 dark:text-purple-300',
  },
  input: {
    bg: 'bg-green-50 dark:bg-green-900/20',
    border: 'border-green-300 dark:border-green-700',
    text: 'text-green-700 dark:text-green-300',
  },
  navigation: {
    bg: 'bg-orange-50 dark:bg-orange-900/20',
    border: 'border-orange-300 dark:border-orange-700',
    text: 'text-orange-700 dark:text-orange-300',
  },
  element: {
    bg: 'bg-cyan-50 dark:bg-cyan-900/20',
    border: 'border-cyan-300 dark:border-cyan-700',
    text: 'text-cyan-700 dark:text-cyan-300',
  },
  control: {
    bg: 'bg-indigo-50 dark:bg-indigo-900/20',
    border: 'border-indigo-300 dark:border-indigo-700',
    text: 'text-indigo-700 dark:text-indigo-300',
  },
  utility: {
    bg: 'bg-gray-50 dark:bg-gray-800/50',
    border: 'border-gray-300 dark:border-gray-600',
    text: 'text-gray-700 dark:text-gray-300',
  },
};

function getActionMeta(type: ActionType): ActionMeta {
  return ACTION_META[type] || { icon: '❔', label: type, category: 'utility' };
}

function getCategoryColors(category: ActionCategory) {
  return CATEGORY_COLORS[category] || CATEGORY_COLORS.utility;
}

function getActionSummary(action: ActionDefinition): string {
  const params = action.params || {};

  switch (action.type) {
    case ActionType.WAIT:
      return `${params.seconds || 1}s`;
    case ActionType.LAUNCH_APP:
      return params.package || 'Default app';
    case ActionType.CLICK_COORDS:
      return `(${params.x || 0}, ${params.y || 0})`;
    case ActionType.TYPE_TEXT:
      return params.text ? `"${params.text.slice(0, 30)}${params.text.length > 30 ? '...' : ''}"` : 'No text';
    case ActionType.SWIPE:
      return `(${params.x1},${params.y1}) → (${params.x2},${params.y2})`;
    case ActionType.WAIT_FOR_ELEMENT:
    case ActionType.CLICK_ELEMENT:
    case ActionType.IF_ELEMENT_EXISTS:
    case ActionType.IF_ELEMENT_NOT_EXISTS: {
      const parts: string[] = [];
      if (params.resource_id) parts.push(`id: ${params.resource_id.split('/').pop()}`);
      if (params.text) parts.push(`text: "${params.text.slice(0, 20)}"`);
      if (params.content_desc) parts.push(`desc: "${params.content_desc.slice(0, 20)}"`);
      if (action.type === ActionType.WAIT_FOR_ELEMENT && params.timeout) {
        parts.push(`${params.timeout}s timeout`);
      }
      if ((action.type === ActionType.IF_ELEMENT_EXISTS || action.type === ActionType.IF_ELEMENT_NOT_EXISTS) && params.actions?.length) {
        parts.push(`${params.actions.length} nested`);
      }
      return parts.length > 0 ? parts.join(' • ') : 'No selector';
    }
    case ActionType.REPEAT:
      return `${params.count || 1}× • ${params.actions?.length || 0} nested`;
    case ActionType.PRESS_BACK:
    case ActionType.EMULATOR_BACK:
    case ActionType.PRESS_HOME:
    case ActionType.EXIT_APP:
    case ActionType.SCREENSHOT:
      return '';
    default:
      return Object.keys(params).length > 0 ? JSON.stringify(params) : '';
  }
}

// Helper to get condition result for IF actions
function getConditionResult(
  index: number,
  depth: number,
  execution: AutomationExecution | null | undefined
): boolean | null {
  if (!execution) return null;
  const conditionResults = execution.error_details?.condition_results as Record<string, boolean> | undefined;
  if (!conditionResults) return null;

  // Build path key like "2" or "2.0.1"
  // Note: We don't have access to the full path here, so we use index for top-level
  // For nested, this is trickier - we'd need to pass the path down
  const pathKey = String(index);
  if (pathKey in conditionResults) {
    return conditionResults[pathKey];
  }
  return null;
}

// Helper to get test status for an action (supports nested path matching)
function getActionTestStatus(
  index: number,
  execution: AutomationExecution | null | undefined,
  depth: number = 0,
  errorPath?: number[]
): 'idle' | 'pending' | 'running' | 'completed' | 'failed' {
  if (!execution) return 'idle';

  // For FAILED status, check if this action matches the error path
  if (execution.status === AutomationStatus.FAILED) {
    if (errorPath && errorPath.length > depth) {
      // Check if this action is in the error path
      if (errorPath[depth] === index) {
        return 'failed';
      }
    }
    // Not in error path - for top level, mark earlier actions as completed
    if (depth === 0) {
      const errorTopIndex = errorPath?.[0] ?? execution.error_action_index ?? 0;
      if (index < errorTopIndex) return 'completed';
    }
    return 'idle';
  }

  // For COMPLETED status
  if (execution.status === AutomationStatus.COMPLETED) {
    // All actions (including nested) are completed
    return 'completed';
  }

  // For RUNNING status - only track at top level since we don't have nested progress
  if (execution.status === AutomationStatus.RUNNING) {
    if (depth === 0) {
      const currentIndex = execution.current_action_index ?? 0;
      if (index < currentIndex) return 'completed';
      if (index === currentIndex) return 'running';
      return 'pending';
    }
    // For nested: if parent is running, nested are part of it
    return 'idle';
  }

  if (execution.status === AutomationStatus.PENDING) {
    return depth === 0 ? 'pending' : 'idle';
  }

  return 'idle';
}

export function ActionBuilder({
  actions,
  onChange,
  variables = [],
  depth = 0,
  compact = false,
  testAccountId,
  onTestAction,
  testing = false,
  testExecution,
}: ActionBuilderProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const isNested = depth > 0;
  const canTest = testAccountId && onTestAction;

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
    // Add a slight delay to allow the drag image to be captured
    setTimeout(() => {
      (e.target as HTMLElement).style.opacity = '0.5';
    }, 0);
  };

  const handleDragEnd = (e: React.DragEvent) => {
    (e.target as HTMLElement).style.opacity = '1';
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedIndex !== null && draggedIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDragOverIndex(null);
      return;
    }

    const updated = [...actions];
    const [draggedItem] = updated.splice(draggedIndex, 1);
    updated.splice(targetIndex, 0, draggedItem);
    onChange(updated);

    // Update selected index if needed
    if (selectedIndex === draggedIndex) {
      setSelectedIndex(targetIndex);
    } else if (selectedIndex !== null) {
      if (draggedIndex < selectedIndex && targetIndex >= selectedIndex) {
        setSelectedIndex(selectedIndex - 1);
      } else if (draggedIndex > selectedIndex && targetIndex <= selectedIndex) {
        setSelectedIndex(selectedIndex + 1);
      }
    }

    setDraggedIndex(null);
    setDragOverIndex(null);
  };

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

  const toggleEnabled = (index: number) => {
    const action = actions[index];
    const isCurrentlyEnabled = action.enabled !== false; // default is true
    updateAction(index, { ...action, enabled: !isCurrentlyEnabled });
  };

  return (
    <div className={isNested ? "space-y-2" : "space-y-4"}>
      <div className="flex items-center justify-between">
        {isNested ? (
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Nested Actions ({actions.length})
          </span>
        ) : (
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Action Sequence ({actions.length})
          </h3>
        )}
        <Button type="button" size={isNested ? "xs" : "sm"} variant={isNested ? "secondary" : "primary"} onClick={addAction}>
          {isNested ? "+ Add" : "➕ Add Action"}
        </Button>
      </div>

      {actions.length === 0 ? (
        <div className={`text-center ${isNested ? "py-3 text-xs" : "py-8"} text-gray-500 dark:text-gray-400 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg`}>
          {isNested ? "No nested actions" : "No actions yet. Click \"Add Action\" to start building your automation."}
        </div>
      ) : (
        <div className="space-y-2">
          {actions.map((action, index) => {
            const isEnabled = action.enabled !== false;
            const meta = getActionMeta(action.type);
            const colors = getCategoryColors(meta.category);
            const errorPath = testExecution?.error_details?.action_path as number[] | undefined;
            const testStatus = getActionTestStatus(index, testExecution, depth, errorPath);
            const isConditional = action.type === ActionType.IF_ELEMENT_EXISTS || action.type === ActionType.IF_ELEMENT_NOT_EXISTS;
            const conditionResult = isConditional ? getConditionResult(index, depth, testExecution) : null;

            // Determine border/background based on test status
            const getTestStatusStyles = () => {
              if (testStatus === 'running') {
                return 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20 shadow-md shadow-yellow-500/20';
              }
              if (testStatus === 'failed') {
                return 'border-red-500 bg-red-50 dark:bg-red-900/20 shadow-md shadow-red-500/20';
              }
              if (testStatus === 'completed') {
                return 'border-green-500 bg-green-50 dark:bg-green-900/20';
              }
              return '';
            };

            const testStyles = testStatus !== 'idle' && testStatus !== 'pending' ? getTestStatusStyles() : '';

            return (
            <div
              key={index}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, index)}
              className={`border-2 rounded-lg ${
                dragOverIndex === index
                  ? 'border-blue-500 border-dashed bg-blue-50 dark:bg-blue-900/30'
                  : testStyles ? testStyles : (
                    !isEnabled
                      ? 'bg-gray-100 dark:bg-gray-800/50 opacity-60 border-gray-300 dark:border-gray-600'
                      : selectedIndex === index
                        ? `${colors.bg} border-blue-500 shadow-lg shadow-blue-500/20`
                        : `${colors.bg} ${colors.border} hover:border-gray-400 dark:hover:border-gray-500`
                  )
              } ${draggedIndex === index ? 'opacity-50' : ''} cursor-pointer`}
              style={{
                transition: 'border-color 0.2s, box-shadow 0.2s, opacity 0.2s, transform 0.1s',
              }}
              onClick={() => setSelectedIndex(selectedIndex === index ? null : index)}
            >
              <div className="flex items-start gap-3 p-3">
                {/* Drag handle + Index + Enable Toggle + Test Status */}
                <div className="flex-shrink-0 flex items-center gap-1">
                  {/* Drag handle */}
                  <span className="text-gray-400 dark:text-gray-500 cursor-grab active:cursor-grabbing select-none" title="Drag to reorder">
                    ⋮⋮
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleEnabled(index);
                    }}
                    className={`w-8 h-8 flex items-center justify-center rounded text-sm font-medium transition-colors ${
                      isEnabled
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 hover:bg-gray-300 dark:hover:bg-gray-600'
                    }`}
                    title={isEnabled ? 'Click to disable' : 'Click to enable'}
                  >
                    {index + 1}
                  </button>
                  {/* Test status indicator */}
                  {testStatus === 'running' && (
                    <span className="text-yellow-500" title="Running...">⏳</span>
                  )}
                  {testStatus === 'completed' && (
                    <span className="text-green-500" title="Completed">✓</span>
                  )}
                  {testStatus === 'failed' && (
                    <span className="text-red-500" title="Failed">✕</span>
                  )}
                  {/* Condition result indicator for IF actions */}
                  {isConditional && conditionResult !== null && (
                    <span
                      className={`text-xs px-1 rounded ${
                        conditionResult
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                      }`}
                      title={conditionResult ? 'Condition met - nested actions ran' : 'Condition not met - skipped'}
                    >
                      {conditionResult ? '✓ met' : '⊘ skip'}
                    </span>
                  )}
                </div>

                {/* Action info */}
                <div className="flex-1 min-w-0">
                  {selectedIndex === index ? (
                    /* When expanded: show dropdown (icons in options) */
                    <div className="flex items-center gap-2">
                      <div className="relative inline-flex items-center">
                        <select
                          value={action.type}
                          onChange={(e) => {
                            e.stopPropagation();
                            updateAction(index, {
                              type: e.target.value as ActionType,
                              params: getDefaultParams(e.target.value as ActionType),
                              enabled: action.enabled,
                            });
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className={`font-medium bg-transparent border-none focus:ring-0 focus:outline-none cursor-pointer appearance-none ${isEnabled ? colors.text : 'text-gray-500 dark:text-gray-400'} p-0 pr-5`}
                        >
                          {Object.values(ActionType).map((type) => {
                            const typeMeta = getActionMeta(type);
                            return (
                              <option key={type} value={type}>
                                {typeMeta.icon} {typeMeta.label}
                              </option>
                            );
                          })}
                        </select>
                        <span className="pointer-events-none absolute right-0 text-gray-400">
                          ▼
                        </span>
                      </div>
                    </div>
                  ) : (
                    /* When collapsed: show icon + label + comment */
                    <div className={`font-medium flex items-center gap-2 ${isEnabled ? colors.text : 'text-gray-500 dark:text-gray-400 line-through'}`}>
                      <span className="text-base">{meta.icon}</span>
                      <span>{meta.label}</span>
                      {action.comment && (
                        <span className="text-gray-500 dark:text-gray-400 font-normal text-sm">
                          — {action.comment}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {getActionSummary(action)}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-1">
                  {/* Test buttons */}
                  {canTest && (
                    <>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          onTestAction([actions[index]]);
                        }}
                        disabled={testing || !isEnabled}
                        className="p-1 text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-200 disabled:opacity-30"
                        title="Run this action only"
                      >
                        ▶️
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          onTestAction(actions.slice(index));
                        }}
                        disabled={testing || !isEnabled}
                        className="p-1 text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-200 disabled:opacity-30"
                        title="Run from here to end"
                      >
                        ⏩
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setSelectedIndex(selectedIndex === index ? null : index);
                    }}
                    className={`p-1 ${
                      selectedIndex === index
                        ? 'text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-200'
                        : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                    }`}
                    title={selectedIndex === index ? "Collapse" : "Edit"}
                  >
                    {selectedIndex === index ? '✏️' : '✏️'}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      moveAction(index, 'up');
                    }}
                    disabled={index === 0}
                    className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 disabled:opacity-30"
                    title="Move up"
                  >
                    ⬆️
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      moveAction(index, 'down');
                    }}
                    disabled={index === actions.length - 1}
                    className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 disabled:opacity-30"
                    title="Move down"
                  >
                    ⬇️
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      duplicateAction(index);
                    }}
                    className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    title="Duplicate"
                  >
                    📋
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
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
                <div
                  className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="space-y-3">
                    {/* Comment field */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Comment
                      </label>
                      <input
                        type="text"
                        value={action.comment ?? ''}
                        onChange={(e) => updateAction(index, { ...action, comment: e.target.value || undefined })}
                        placeholder="Optional note about this action..."
                        className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Parameters
                      </label>
                      <ActionParamsEditor
                        actionType={action.type}
                        params={action.params ?? EMPTY_PARAMS}
                        onChange={(params) => {
                          updateAction(index, { ...action, params });
                        }}
                        variables={variables}
                      />
                    </div>

                    {/* Error handling option */}
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={action.continue_on_error !== false}
                          onChange={(e) => {
                            e.stopPropagation();
                            updateAction(index, { ...action, continue_on_error: e.target.checked });
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                        />
                        Continue on error
                      </label>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {action.continue_on_error !== false ? '(won\'t stop automation if this fails)' : '(will stop automation if this fails)'}
                      </span>
                    </div>

                    {/* Nested Actions for conditional/loop types */}
                    {hasNestedActions(action.type) && (
                      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                        <div className="pl-4 border-l-2 border-blue-400 dark:border-blue-500">
                          <ActionBuilder
                            actions={action.params?.actions ?? []}
                            onChange={(nestedActions) => {
                              updateAction(index, {
                                ...action,
                                params: { ...action.params, actions: nestedActions },
                              });
                            }}
                            variables={variables}
                            depth={depth + 1}
                            testAccountId={testAccountId}
                            onTestAction={onTestAction}
                            testing={testing}
                            testExecution={testExecution}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
          })}
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
