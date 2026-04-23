import { Button, Panel, Modal, useToast } from '@pixsim7/shared.ui';
import { useState, useEffect, useCallback, useRef } from 'react';

import { API_BASE_URL } from '@lib/api/client';
import { withCorrelationHeaders } from '@lib/api/correlationHeaders';
import { authService } from '@lib/auth';

import { automationService } from '@features/automation';
import { getAccounts } from '@features/providers';
import type { ProviderAccount } from '@features/providers';

import { type AppActionPreset, type ActionDefinition, type PresetVariable, type AutomationExecution, type AndroidDevice, ActionType } from '../types';

import { ActionBuilder } from './ActionBuilder';
import { VariablesEditor } from './VariablesEditor';



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

// Shows a static device screenshot with SVG rectangles overlaid for each
// UI element bounding box. Hovering an element row in the inspector list
// highlights the matching rect here, and vice versa.
function DeviceScreenOverlay({
  imgUrl,
  displayW,
  displayH,
  elements,
  hoveredIndex,
  onHover,
  selectedIndex,
  onSelect,
}: {
  imgUrl: string;
  displayW: number;
  displayH: number;
  elements: Array<{ i: number; rect: { x1: number; y1: number; x2: number; y2: number } | null }>;
  hoveredIndex: number | null;
  onHover: (i: number | null) => void;
  selectedIndex: number | null;
  onSelect: (i: number) => void;
}) {
  return (
    <div
      className="flex-shrink-0 relative bg-black rounded border border-gray-300 dark:border-gray-600 overflow-hidden"
      style={{ width: 240, aspectRatio: `${displayW} / ${displayH}` }}
    >
      <img
        src={imgUrl}
        alt="Device screen"
        className="absolute inset-0 w-full h-full object-fill select-none pointer-events-none"
        draggable={false}
      />
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox={`0 0 ${displayW} ${displayH}`}
        preserveAspectRatio="none"
      >
        {/* Sort largest → smallest so small elements render on top and win
            hover hit-testing over their parent containers (same trick Chrome
            DevTools uses). */}
        {[...elements]
          .filter((e) => e.rect)
          .sort((a, b) => {
            const aArea = (a.rect!.x2 - a.rect!.x1) * (a.rect!.y2 - a.rect!.y1);
            const bArea = (b.rect!.x2 - b.rect!.x1) * (b.rect!.y2 - b.rect!.y1);
            return bArea - aArea;
          })
          .map(({ i, rect }) => {
            const isHovered = i === hoveredIndex;
            const isSelected = i === selectedIndex;
            const w = rect!.x2 - rect!.x1;
            const h = rect!.y2 - rect!.y1;
            const stroke = isSelected ? '#10b981' : isHovered ? '#f59e0b' : 'rgba(59, 130, 246, 0.45)';
            const fill = isSelected
              ? 'rgba(16, 185, 129, 0.15)'
              : isHovered
                ? 'rgba(245, 158, 11, 0.25)'
                : 'transparent';
            return (
              <rect
                key={i}
                x={rect!.x1}
                y={rect!.y1}
                width={w}
                height={h}
                fill={fill}
                stroke={stroke}
                strokeWidth={isSelected ? 4 : isHovered ? 3 : 1}
                vectorEffect="non-scaling-stroke"
                // pointer-events="stroke" on un-hovered/un-selected rects so
                // hovering the empty interior of a big container passes
                // through to rects behind it.
                pointerEvents={isHovered || isSelected ? 'auto' : 'stroke'}
                onMouseEnter={() => onHover(i)}
                onMouseLeave={() => onHover(null)}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(i);
                }}
                style={{ cursor: 'pointer' }}
              />
            );
          })}
      </svg>
    </div>
  );
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
  const [devices, setDevices] = useState<AndroidDevice[]>([]);
  const [testAccountId, setTestAccountId] = useState<number | null>(null);
  const [testDeviceId, setTestDeviceId] = useState<number | 'auto'>('auto');
  const [testExecution, setTestExecution] = useState<AutomationExecution | null>(null);
  // `starting` covers only the brief request-in-flight window between clicking
  // a test button and receiving the execution record. Once we have a record,
  // `isTesting` below is derived purely from its status — so the "grey"
  // state can never get stuck out of sync with reality.
  const [starting, setStarting] = useState(false);
  const [testedActionRange, setTestedActionRange] = useState<{ start: number; count: number } | null>(null);

  const execStatus = testExecution?.status;
  const isTesting =
    starting || execStatus === 'pending' || execStatus === 'running';

  // UI Inspector state
  const [uiElements, setUiElements] = useState<any[]>([]);
  const [uiDisplay, setUiDisplay] = useState<{ width: number; height: number } | null>(null);
  const [uiFilter, setUiFilter] = useState('');
  const [loadingUi, setLoadingUi] = useState(false);
  const [showUiInspector, setShowUiInspector] = useState(false);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [showScreen, setShowScreen] = useState(true);
  const [hoveredElementIndex, setHoveredElementIndex] = useState<number | null>(null);
  const [selectedElementIndex, setSelectedElementIndex] = useState<number | null>(null);
  const selectedRowRef = useRef<HTMLDivElement | null>(null);

  // Revoke blob URLs on unmount / replacement so we don't leak them.
  useEffect(() => {
    return () => {
      if (screenshotUrl) URL.revokeObjectURL(screenshotUrl);
    };
  }, [screenshotUrl]);

  // When selection changes (e.g. via clicking a rect on the overlay), scroll
  // the matching list row into view so the user can see its details.
  useEffect(() => {
    if (selectedElementIndex != null && selectedRowRef.current) {
      selectedRowRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedElementIndex]);

  // Create Preset from Selection state
  const [showCreatePresetModal, setShowCreatePresetModal] = useState(false);
  const [extractedActions, setExtractedActions] = useState<ActionDefinition[]>([]);
  const [newPresetName, setNewPresetName] = useState('');
  const [newPresetCategory, setNewPresetCategory] = useState('Snippet');
  const [replaceWithCall, setReplaceWithCall] = useState(true);
  const [creatingPreset, setCreatingPreset] = useState(false);

  // Load accounts and devices for testing
  useEffect(() => {
    getAccounts().then(setAccounts).catch(console.error);
    automationService.getDevices().then(setDevices).catch(console.error);
  }, []);

  // Poll for test execution status. Stops as soon as the execution is
  // no longer pending/running — `isTesting` is derived from the status so
  // releasing the UI is automatic, no separate flag to keep in sync.
  useEffect(() => {
    if (!testExecution) return;
    if (testExecution.status !== 'pending' && testExecution.status !== 'running') {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const updated = await automationService.getExecution(testExecution.id);
        setTestExecution(updated);
        if (updated.status === 'completed') {
          toast.success(`Test completed: ${updated.total_actions} actions executed`);
        } else if (updated.status === 'failed') {
          toast.error(`Test failed at action ${(updated.error_action_index ?? 0) + 1}: ${updated.error_message}`);
        }
      } catch (err) {
        console.error('Error polling execution:', err);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [testExecution, toast]);

  // Test actions handler - accepts actions array directly (for nested support)
  const handleTestActions = useCallback(async (actionsToTest: ActionDefinition[], startIndex?: number) => {
    if (!testAccountId) {
      toast.error('Please select a test account first');
      return;
    }

    if (actionsToTest.length === 0) {
      toast.error('No actions to test');
      return;
    }

    setStarting(true);
    // Track which actions are being tested
    setTestedActionRange(startIndex !== undefined ? { start: startIndex, count: actionsToTest.length } : null);
    try {
      const result = await automationService.testActions(testAccountId, actionsToTest, {
        deviceId: testDeviceId === 'auto' ? undefined : testDeviceId,
        variables: variables.length > 0 ? variables : undefined,
      });

      if (result.status === 'queued') {
        const execution = await automationService.getExecution(result.execution_id);
        setTestExecution(execution);
        toast.info(`Testing ${result.actions_count} action(s)...`);
      }
      // For any non-queued response (skipped, rejected, already finished)
      // we simply don't set a testExecution — `isTesting` collapses to
      // false on its own once `starting` clears below.
    } catch (err: any) {
      toast.error(err.message || 'Failed to start test');
      setTestedActionRange(null);
    } finally {
      setStarting(false);
    }
  }, [testAccountId, testDeviceId, variables, toast]);

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

      const token = authService.getStoredToken();
      const authHeader = token ? { Authorization: `Bearer ${token}` } : undefined;

      // Fetch UI hierarchy and screenshot in parallel — both are device-bound
      // snapshots taken together so bounds and pixels line up.
      const [dumpResp, shotResp] = await Promise.all([
        fetch(`${API_BASE_URL}/automation/devices/${device.id}/ui-dump`, {
          headers: withCorrelationHeaders(authHeader, 'automation:preset-form:ui-dump'),
        }),
        fetch(`${API_BASE_URL}/automation/devices/${device.id}/screenshot`, {
          headers: withCorrelationHeaders(authHeader, 'automation:preset-form:screenshot'),
        }),
      ]);

      const data = await dumpResp.json();
      setUiElements(data.elements || []);
      setUiDisplay(
        data.display_width && data.display_height
          ? { width: data.display_width, height: data.display_height }
          : null,
      );

      // Replace screenshot URL (revoking the old one to free memory).
      if (shotResp.ok) {
        const blob = await shotResp.blob();
        const nextUrl = URL.createObjectURL(blob);
        setScreenshotUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return nextUrl;
        });
      } else {
        setScreenshotUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return null;
        });
      }

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
              disabled={isTesting}
            >
              <option value="">Select account...</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.email} ({acc.provider_id})
                </option>
              ))}
            </select>
            <select
              value={testDeviceId.toString()}
              onChange={(e) => setTestDeviceId(e.target.value === 'auto' ? 'auto' : Number(e.target.value))}
              className="px-2 py-1 text-sm border border-yellow-300 dark:border-yellow-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              disabled={isTesting}
              title="Device to run test on"
            >
              {devices.some(d => d.is_enabled && d.status === 'online') ? (
                <option value="auto">📱 Auto (first available)</option>
              ) : (
                <option value="auto" disabled>📱 None available</option>
              )}
              {devices
                .filter(d => d.is_enabled)
                .map((device) => (
                  <option
                    key={device.id}
                    value={device.id}
                    disabled={device.status !== 'online'}
                  >
                    {device.status === 'online' ? '🟢' : device.status === 'busy' ? '🟡' : '🔴'}{' '}
                    {device.name}
                    {device.status !== 'online' && ` (${device.status})`}
                  </option>
                ))}
            </select>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => handleTestActions(actions)}
              disabled={!testAccountId || isTesting || actions.length === 0}
              loading={isTesting}
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
                  testExecution.status === 'running' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
                  testExecution.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' :
                  testExecution.status === 'failed' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' :
                  'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                }`}>
                  {testExecution.status === 'running'
                    ? `Running: ${(testExecution.current_action_index ?? 0) + 1}/${testExecution.total_actions}`
                    : testExecution.status === 'completed'
                      ? `✓ Completed (${testExecution.total_actions} actions)`
                      : testExecution.status === 'failed'
                        ? `✕ Failed at #${(testExecution.error_action_index ?? 0) + 1}`
                        : testExecution.status}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setTestExecution(null);
                    setTestedActionRange(null);
                  }}
                  className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  title={
                    testExecution.status === 'pending' || testExecution.status === 'running'
                      ? 'Dismiss — detach from this run so you can start another test. The backend execution is not cancelled.'
                      : 'Clear results'
                  }
                >
                  {testExecution.status === 'pending' || testExecution.status === 'running'
                    ? '✕ Dismiss'
                    : '✕ Clear'}
                </button>
              </>
            )}
          </div>
          {/* Error message display */}
          {testExecution?.status === 'failed' && testExecution.error_message && (
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
                  {uiDisplay && (
                    <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">
                      {uiDisplay.width}×{uiDisplay.height}
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={uiFilter}
                    onChange={(e) => setUiFilter(e.target.value)}
                    placeholder="Filter..."
                    className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 w-32"
                  />
                  {screenshotUrl && (
                    <button
                      type="button"
                      onClick={() => setShowScreen((v) => !v)}
                      className={`px-2 py-1 text-xs rounded border ${
                        showScreen
                          ? 'bg-blue-100 border-blue-300 text-blue-700 dark:bg-blue-900/30 dark:border-blue-700 dark:text-blue-300'
                          : 'bg-white border-gray-300 text-gray-700 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300'
                      }`}
                      title="Toggle device screen preview"
                    >
                      {showScreen ? '🖥 Hide screen' : '🖥 Show screen'}
                    </button>
                  )}
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
              {(() => {
                const filter = uiFilter.toLowerCase();
                const filtered = uiElements
                  .map((el, i) => {
                    const m = el.bounds?.match(/\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/);
                    const rect = m
                      ? { x1: +m[1], y1: +m[2], x2: +m[3], y2: +m[4] }
                      : null;
                    return { el, i, rect };
                  })
                  .filter(({ el }) =>
                    !filter ||
                    el.content_desc?.toLowerCase().includes(filter) ||
                    el.text?.toLowerCase().includes(filter) ||
                    el.resource_id?.toLowerCase().includes(filter),
                  );

                const showOverlay = showScreen && screenshotUrl && uiDisplay;
                return (
                  <div className="flex gap-3">
                    <div className="flex-1 min-w-0 max-h-96 overflow-y-auto space-y-1">
                      {filtered.length === 0 ? (
                        <div className="text-xs text-gray-500 dark:text-gray-400 py-2">No elements found</div>
                      ) : (
                        filtered.map(({ el, i, rect }) => {
                          const isHovered = hoveredElementIndex === i;
                          const isSelected = selectedElementIndex === i;
                          return (
                            <div
                              key={i}
                              ref={isSelected ? selectedRowRef : undefined}
                              onMouseEnter={() => setHoveredElementIndex(i)}
                              onMouseLeave={() => setHoveredElementIndex((h) => (h === i ? null : h))}
                              onClick={() => setSelectedElementIndex((cur) => (cur === i ? null : i))}
                              className={`text-xs p-2 bg-white dark:bg-gray-700 rounded border transition-colors cursor-pointer ${
                                isSelected
                                  ? 'border-emerald-500 ring-2 ring-emerald-500/30'
                                  : isHovered
                                    ? 'border-amber-500 shadow shadow-amber-500/30'
                                    : 'border-gray-200 dark:border-gray-600'
                              }`}
                            >
                              {el.content_desc && (
                                <div><span className="text-purple-600 dark:text-purple-400 font-medium">desc:</span> {el.content_desc}</div>
                              )}
                              {el.text && (
                                <div><span className="text-blue-600 dark:text-blue-400 font-medium">text:</span> {el.text}</div>
                              )}
                              {el.resource_id && (
                                <div><span className="text-green-600 dark:text-green-400 font-medium">id:</span> {el.resource_id}</div>
                              )}
                              {el.clickable && !el.text && !el.content_desc && !el.resource_id && (
                                <div className="text-orange-600 dark:text-orange-400 font-medium">
                                  clickable (no label) — tap by coords only
                                </div>
                              )}
                              <div className="text-gray-400 text-[10px]">
                                <span>{el.class} <span title="Bounds: [left,top][right,bottom] in device pixels">{el.bounds}</span></span>
                                {rect && (() => {
                                  const { x1, y1, x2, y2 } = rect;
                                  const cx = (x1 + x2) >> 1;
                                  const cy = (y1 + y2) >> 1;
                                  const w = x2 - x1;
                                  const h = y2 - y1;
                                  const fx = uiDisplay ? (cx / uiDisplay.width).toFixed(3) : null;
                                  const fy = uiDisplay ? (cy / uiDisplay.height).toFixed(3) : null;
                                  return (
                                    <div className="mt-0.5 flex flex-wrap gap-x-2">
                                      <span
                                        className="text-amber-600 dark:text-amber-400"
                                        title="Tap target at element center, in device pixels. Breaks if the device resolution or orientation changes."
                                      >
                                        tap: {cx},{cy} px
                                      </span>
                                      {fx && fy && (
                                        <span
                                          className="text-amber-600 dark:text-amber-400"
                                          title={`Same tap target as 0–1 fractions of display (${uiDisplay!.width}×${uiDisplay!.height}). Survives resolution changes.`}
                                        >
                                          or: {fx}, {fy} (0–1)
                                        </span>
                                      )}
                                      <span
                                        className="text-gray-500 dark:text-gray-500"
                                        title="Element bounding box size in pixels (width × height)"
                                      >
                                        size: {w}×{h} px
                                      </span>
                                    </div>
                                  );
                                })()}
                              </div>
                              {isSelected && rect && (
                                <div
                                  className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600 flex flex-wrap gap-1"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {(() => {
                                    const cx = (rect.x1 + rect.x2) >> 1;
                                    const cy = (rect.y1 + rect.y2) >> 1;
                                    const fx = uiDisplay ? +(cx / uiDisplay.width).toFixed(3) : null;
                                    const fy = uiDisplay ? +(cy / uiDisplay.height).toFixed(3) : null;
                                    const copy = (text: string, label: string) => {
                                      navigator.clipboard.writeText(text).then(
                                        () => toast.success(`Copied ${label}`),
                                        () => toast.error('Copy failed'),
                                      );
                                    };
                                    return (
                                      <>
                                        <button
                                          type="button"
                                          className="px-2 py-0.5 text-[10px] rounded bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:hover:bg-amber-900/50"
                                          onClick={() => copy(`${cx}, ${cy}`, `${cx}, ${cy}`)}
                                        >
                                          Copy px
                                        </button>
                                        {fx !== null && fy !== null && (
                                          <button
                                            type="button"
                                            className="px-2 py-0.5 text-[10px] rounded bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:hover:bg-amber-900/50"
                                            onClick={() => copy(`${fx}, ${fy}`, `${fx}, ${fy}`)}
                                          >
                                            Copy 0-1
                                          </button>
                                        )}
                                        <button
                                          type="button"
                                          className="px-2 py-0.5 text-[10px] rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:hover:bg-emerald-900/50"
                                          title="Append a click_coords action using this element's center (normalized if available, else pixels)"
                                          onClick={() => {
                                            const useFrac = fx !== null && fy !== null;
                                            setActions((prev) => [
                                              ...prev,
                                              {
                                                type: ActionType.CLICK_COORDS,
                                                params: useFrac
                                                  ? { x: fx, y: fy }
                                                  : { x: cx, y: cy },
                                                comment: el.resource_id || el.text || el.content_desc || el.class || 'tap',
                                              },
                                            ]);
                                            toast.success('Added click_coords action');
                                          }}
                                        >
                                          + Add click_coords
                                        </button>
                                        {el.resource_id && (
                                          <button
                                            type="button"
                                            className="px-2 py-0.5 text-[10px] rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:hover:bg-emerald-900/50"
                                            title="Append a click_element action using this element's resource_id — more robust than raw coords"
                                            onClick={() => {
                                              setActions((prev) => [
                                                ...prev,
                                                {
                                                  type: ActionType.CLICK_ELEMENT,
                                                  params: { resource_id: el.resource_id },
                                                  comment: el.text || el.content_desc || el.resource_id,
                                                },
                                              ]);
                                              toast.success('Added click_element action');
                                            }}
                                          >
                                            + Add click_element
                                          </button>
                                        )}
                                      </>
                                    );
                                  })()}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                    {showOverlay && (
                      <DeviceScreenOverlay
                        imgUrl={screenshotUrl}
                        displayW={uiDisplay.width}
                        displayH={uiDisplay.height}
                        elements={filtered}
                        hoveredIndex={hoveredElementIndex}
                        onHover={setHoveredElementIndex}
                        selectedIndex={selectedElementIndex}
                        onSelect={(i) =>
                          setSelectedElementIndex((cur) => (cur === i ? null : i))
                        }
                      />
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
        <ActionBuilder
          actions={actions}
          onChange={setActions}
          variables={variables}
          testAccountId={testAccountId}
          onTestAction={handleTestActions}
          testing={isTesting}
          testExecution={testExecution}
          testedActionRange={testedActionRange}
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
