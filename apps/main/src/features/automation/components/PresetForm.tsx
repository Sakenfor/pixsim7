import { useState, useEffect, useCallback } from 'react';
import { type AppActionPreset, type ActionDefinition, type PresetVariable, type AutomationExecution, AutomationStatus, ActionType } from '../types';
import { Button, Panel, Modal, useToast } from '@pixsim7/shared.ui';
import { ActionBuilder } from './ActionBuilder';
import { VariablesEditor } from './VariablesEditor';
import { getAccounts } from '@/lib/api/accounts';
import type { ProviderAccount } from '@/hooks/useProviderAccounts';
import { automationService } from '@/lib/automation/automationService';
import { API_BASE_URL } from '@/lib/api/client';

interface PresetFormProps {
  preset?: AppActionPreset;
  onSave: (data: Partial<AppActionPreset>) => void;
  onCancel: () => void;
}

// Format action path for display: [2, 0, 1] -> "3 > 1 > 2" (1-indexed for users)
function formatActionPath(path?: number[]): string {
  if (!path || path.length === 0) return '?';
  return path.map(i => i + 1).join(' > ');
}

export function PresetForm({ preset, onSave, onCancel }: PresetFormProps) {
  const [name, setName] = useState(preset?.name ?? '');
  const [description, setDescription] = useState(preset?.description ?? '');
  const [category, setCategory] = useState(preset?.category ?? '');
  const [isShared, setIsShared] = useState(preset?.is_shared ?? false);
  const [variables, setVariables] = useState<PresetVariable[]>(preset?.variables ?? []);
  const [actions, setActions] = useState<ActionDefinition[]>(preset?.actions ?? []);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  // Test execution state
  const [accounts, setAccounts] = useState<ProviderAccount[]>([]);
  const [testAccountId, setTestAccountId] = useState<number | null>(null);
  const [testExecution, setTestExecution] = useState<AutomationExecution | null>(null);
  const [testing, setTesting] = useState(false);

  // UI Inspector state
  const [uiElements, setUiElements] = useState<any[]>([]);
  const [uiFilter, setUiFilter] = useState('');
  const [loadingUi, setLoadingUi] = useState(false);
  const [showUiInspector, setShowUiInspector] = useState(false);

  // Create Preset from Selection state
  const [showCreatePresetModal, setShowCreatePresetModal] = useState(false);
  const [extractedActions, setExtractedActions] = useState<ActionDefinition[]>([]);
  const [newPresetName, setNewPresetName] = useState('');
  const [newPresetCategory, setNewPresetCategory] = useState('Snippet');
  const [replaceWithCall, setReplaceWithCall] = useState(true);
  const [creatingPreset, setCreatingPreset] = useState(false);

  // Load accounts for testing
  useEffect(() => {
    getAccounts().then(setAccounts).catch(console.error);
  }, []);

  // Poll for test execution status
  useEffect(() => {
    if (!testExecution || testExecution.status === AutomationStatus.COMPLETED || testExecution.status === AutomationStatus.FAILED) {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const updated = await automationService.getExecution(testExecution.id);
        setTestExecution(updated);
        if (updated.status === AutomationStatus.COMPLETED) {
          toast.success(`Test completed: ${updated.total_actions} actions executed`);
          setTesting(false);
        } else if (updated.status === AutomationStatus.FAILED) {
          toast.error(`Test failed at action ${(updated.error_action_index ?? 0) + 1}: ${updated.error_message}`);
          setTesting(false);
        }
      } catch (err) {
        console.error('Error polling execution:', err);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [testExecution, toast]);

  // Test actions handler - accepts actions array directly (for nested support)
  const handleTestActions = useCallback(async (actionsToTest: ActionDefinition[]) => {
    if (!testAccountId) {
      toast.error('Please select a test account first');
      return;
    }

    if (actionsToTest.length === 0) {
      toast.error('No actions to test');
      return;
    }

    setTesting(true);
    try {
      const result = await automationService.testActions(testAccountId, actionsToTest, {
        variables: variables.length > 0 ? variables : undefined,
      });

      if (result.status === 'queued') {
        // Fetch the execution to start polling
        const execution = await automationService.getExecution(result.execution_id);
        setTestExecution(execution);
        toast.info(`Testing ${result.actions_count} action(s)...`);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to start test');
      setTesting(false);
    }
  }, [testAccountId, variables, toast]);

  // Handle creating a new preset from selected actions
  const handleCreatePresetFromSelection = useCallback((selectedActions: ActionDefinition[]) => {
    setExtractedActions(selectedActions);
    setNewPresetName('');
    setNewPresetCategory('Snippet');
    setReplaceWithCall(true);
    setShowCreatePresetModal(true);
  }, []);

  const handleConfirmCreatePreset = useCallback(async () => {
    if (!newPresetName.trim()) {
      toast.error('Please enter a preset name');
      return;
    }

    setCreatingPreset(true);
    try {
      // Create the new preset with extracted actions
      const created = await automationService.createPreset({
        name: newPresetName.trim(),
        category: newPresetCategory.trim() || 'Snippet',
        actions: extractedActions,
        is_shared: false,
      });

      let replaced = false;

      // If replaceWithCall is true, try to replace the selected actions with a call_preset action
      if (replaceWithCall && created.id) {
        // Find indices of extracted actions in current top-level actions array
        const indicesToRemove = new Set<number>();
        extractedActions.forEach((extAction) => {
          const idx = actions.findIndex(
            (a) => a.type === extAction.type && JSON.stringify(a.params) === JSON.stringify(extAction.params)
          );
          if (idx !== -1 && !indicesToRemove.has(idx)) {
            indicesToRemove.add(idx);
          }
        });

        // Remove the actions and insert call_preset at the first removed index
        const sortedIndices = Array.from(indicesToRemove).sort((a, b) => a - b);
        if (sortedIndices.length > 0) {
          const insertIdx = sortedIndices[0];
          const newActions = actions.filter((_, i) => !indicesToRemove.has(i));
          const callAction: ActionDefinition = {
            type: ActionType.CALL_PRESET,
            params: { preset_id: created.id, inherit_variables: true },
            comment: `Calls: ${created.name}`,
          };
          newActions.splice(insertIdx, 0, callAction);
          setActions(newActions);
          replaced = true;
        }
      }

      if (replaced) {
        toast.success(`Created "${created.name}" and replaced with Call Preset`);
      } else {
        toast.success(`Created snippet "${created.name}" (ID: ${created.id}). Add a Call Preset action to use it.`);
      }

      setShowCreatePresetModal(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to create preset');
    } finally {
      setCreatingPreset(false);
    }
  }, [newPresetName, newPresetCategory, extractedActions, replaceWithCall, actions, toast]);

  // Fetch UI elements from device for debugging
  const handleInspectUi = useCallback(async () => {
    const account = accounts.find(a => a.id === testAccountId);
    if (!account) {
      toast.error('Please select a test account first');
      return;
    }

    setLoadingUi(true);
    try {
      // Get first available device (or we could add device selection)
      const devices = await automationService.getDevices();
      const device = devices.find(d => d.status === 'online') || devices[0];
      if (!device) {
        toast.error('No device available');
        return;
      }

      const token = localStorage.getItem('access_token');
      const response = await fetch(`${API_BASE_URL}/automation/devices/${device.id}/ui-dump`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await response.json();
      setUiElements(data.elements || []);
      setShowUiInspector(true);
      toast.success(`Found ${data.count} elements`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to inspect UI');
    } finally {
      setLoadingUi(false);
    }
  }, [testAccountId, accounts, uiFilter, toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error('Please enter a preset name');
      return;
    }

    if (actions.length === 0) {
      toast.error('Please add at least one action');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        description: description.trim() || undefined,
        category: category.trim() || undefined,
        is_shared: isShared,
        variables: variables.length > 0 ? variables : undefined,
        actions,
      });
    } finally {
      setSaving(false);
    }
  };

  const inputClass = "w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basic Info */}
      <Panel>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          {preset ? 'Edit Preset' : 'Create New Preset'}
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Automation Preset"
              required
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this preset do?"
              rows={3}
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Category
              </label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g., Gaming, Social, Utility"
                className={inputClass}
              />
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 pt-7">
                <input
                  type="checkbox"
                  checked={isShared}
                  onChange={(e) => setIsShared(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                Share with others
              </label>
            </div>
          </div>
        </div>
      </Panel>

      {/* Variables */}
      <Panel>
        <VariablesEditor variables={variables} onChange={setVariables} />
      </Panel>

      {/* Actions */}
      <Panel>
        {/* Test Controls */}
        <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-medium text-yellow-800 dark:text-yellow-200">Test:</span>
            <select
              value={testAccountId?.toString() ?? ''}
              onChange={(e) => setTestAccountId(e.target.value ? Number(e.target.value) : null)}
              className="px-2 py-1 text-sm border border-yellow-300 dark:border-yellow-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              disabled={testing}
            >
              <option value="">Select account...</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.email} ({acc.provider_id})
                </option>
              ))}
            </select>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => handleTestActions(actions)}
              disabled={!testAccountId || testing || actions.length === 0}
              loading={testing}
            >
              ▶️ Run All
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={handleInspectUi}
              disabled={loadingUi}
              loading={loadingUi}
              title="Inspect device UI elements"
            >
              🔍 UI
            </Button>
            {testExecution && (
              <>
                <span className={`text-xs px-2 py-1 rounded ${
                  testExecution.status === AutomationStatus.RUNNING ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
                  testExecution.status === AutomationStatus.COMPLETED ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' :
                  testExecution.status === AutomationStatus.FAILED ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' :
                  'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                }`}>
                  {testExecution.status === AutomationStatus.RUNNING
                    ? `Running: ${(testExecution.current_action_index ?? 0) + 1}/${testExecution.total_actions}`
                    : testExecution.status === AutomationStatus.COMPLETED
                      ? `✓ Completed (${testExecution.total_actions} actions)`
                      : testExecution.status === AutomationStatus.FAILED
                        ? `✕ Failed at #${(testExecution.error_action_index ?? 0) + 1}`
                        : testExecution.status}
                </span>
                {(testExecution.status === AutomationStatus.COMPLETED || testExecution.status === AutomationStatus.FAILED) && (
                  <button
                    type="button"
                    onClick={() => setTestExecution(null)}
                    className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    title="Clear results"
                  >
                    ✕ Clear
                  </button>
                )}
              </>
            )}
          </div>
          {/* Error message display */}
          {testExecution?.status === AutomationStatus.FAILED && testExecution.error_message && (
            <div className="mt-2 p-2 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded text-xs text-red-700 dark:text-red-300">
              <strong>Error at action {formatActionPath(testExecution.error_details?.action_path)}:</strong> {testExecution.error_message}
            </div>
          )}

          {/* UI Inspector Panel */}
          {showUiInspector && (
            <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  UI Elements ({uiElements.length})
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={uiFilter}
                    onChange={(e) => setUiFilter(e.target.value)}
                    placeholder="Filter..."
                    className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 w-32"
                  />
                  <Button size="sm" variant="secondary" onClick={handleInspectUi} loading={loadingUi}>
                    Refresh
                  </Button>
                  <button
                    type="button"
                    onClick={() => setShowUiInspector(false)}
                    className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  >
                    ✕
                  </button>
                </div>
              </div>
              <div className="max-h-60 overflow-y-auto space-y-1">
                {(() => {
                  const filtered = uiFilter
                    ? uiElements.filter(el => {
                        const f = uiFilter.toLowerCase();
                        return (el.content_desc?.toLowerCase().includes(f) ||
                                el.text?.toLowerCase().includes(f) ||
                                el.resource_id?.toLowerCase().includes(f));
                      })
                    : uiElements;

                  if (filtered.length === 0) {
                    return <div className="text-xs text-gray-500 dark:text-gray-400 py-2">No elements found</div>;
                  }

                  return filtered.map((el, i) => (
                    <div key={i} className="text-xs p-2 bg-white dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600">
                      {el.content_desc && (
                        <div><span className="text-purple-600 dark:text-purple-400 font-medium">desc:</span> {el.content_desc}</div>
                      )}
                      {el.text && (
                        <div><span className="text-blue-600 dark:text-blue-400 font-medium">text:</span> {el.text}</div>
                      )}
                      {el.resource_id && (
                        <div><span className="text-green-600 dark:text-green-400 font-medium">id:</span> {el.resource_id}</div>
                      )}
                      <div className="text-gray-400 text-[10px]">{el.class} {el.bounds}</div>
                    </div>
                  ));
                })()}
              </div>
            </div>
          )}
        </div>
        <ActionBuilder
          actions={actions}
          onChange={setActions}
          variables={variables}
          testAccountId={testAccountId}
          onTestAction={handleTestActions}
          testing={testing}
          testExecution={testExecution}
          onCreatePresetFromSelection={handleCreatePresetFromSelection}
        />
      </Panel>

      {/* Form Actions */}
      <div className="flex gap-3 justify-end">
        <Button
          type="button"
          variant="secondary"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          loading={saving}
          disabled={saving}
        >
          {preset ? 'Save Changes' : 'Create Preset'}
        </Button>
      </div>

      {/* Create Preset from Selection Modal */}
      <Modal
        isOpen={showCreatePresetModal}
        onClose={() => setShowCreatePresetModal(false)}
        title="Create Preset from Selection"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Create a new reusable preset from {extractedActions.length} selected action(s).
          </p>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Preset Name *
            </label>
            <input
              type="text"
              value={newPresetName}
              onChange={(e) => setNewPresetName(e.target.value)}
              placeholder="e.g., Login Sequence"
              className={inputClass}
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Category
            </label>
            <input
              type="text"
              value={newPresetCategory}
              onChange={(e) => setNewPresetCategory(e.target.value)}
              placeholder="Snippet"
              className={inputClass}
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Use "Snippet" for reusable action sequences
            </p>
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={replaceWithCall}
                onChange={(e) => setReplaceWithCall(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
              />
              Replace selected actions with Call Preset
            </label>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 ml-6">
              Removes selected actions and inserts a call_preset action pointing to the new preset
            </p>
          </div>

          <div className="flex gap-3 justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowCreatePresetModal(false)}
              disabled={creatingPreset}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={handleConfirmCreatePreset}
              loading={creatingPreset}
              disabled={!newPresetName.trim() || creatingPreset}
            >
              Create Preset
            </Button>
          </div>
        </div>
      </Modal>
    </form>
  );
}
