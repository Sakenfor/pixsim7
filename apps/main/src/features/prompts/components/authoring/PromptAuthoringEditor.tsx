/**
 * PromptAuthoringEditor
 *
 * Center sub-panel: PromptComposer + version action buttons.
 * Compact generation controls: target selector, settings/assets shortcuts, Go button.
 */

import { Popover } from '@pixsim7/shared.ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';


import { useRegisterDevContext } from '@lib/dockview/contextMenu/devContext';
import { buildFloatingOriginMetaRecord, readFloatingOriginMeta } from '@lib/dockview/floatingPanelInterop';
import { Icon } from '@lib/icons';

import {
  CAP_GENERATION_WIDGET,
  type GenerateOverrides,
  type GenerationWidgetContext,
  useCapabilityAll,
} from '@features/contextHub';
import { useAuthoringHintsStore } from '@features/generation/stores/authoringHintsStore';
import {
  getGenerationInputStore,
  getGenerationSessionStore,
  getGenerationSettingsStore,
} from '@features/generation/stores/generationScopeStores';
import { useWorkspaceStore } from '@features/workspace';
import { getFloatingDefinitionId } from '@features/workspace/lib/floatingPanelUtils';

import type { OperationType } from '@/types/operations';

import { usePromptAuthoring, formatDate } from '../../context/PromptAuthoringContext';
import {
  formatOperationTypeShort,
  pickPreferredOperation,
  resolveAuthoringGenerationHints,
} from '../../lib/authoringGenerationHints';
import { PromptComposerSurface } from '../PromptComposerSurface';

import { PROMPT_AUTHORING_QUICKGEN_DOCK_ID } from './promptAuthoringIds';

/** Portaled popover for the generation-policy sparkles icon. */
function GenerationPolicyPopover({
  prioritizedOperation,
  activeWidgetOperation,
  preferredGenerationHint,
  suggestedParamsEntries,
  applySuggestedOperation,
  applySuggestedSettings,
  canApplySuggestedSettings,
  selectedWidget,
}: {
  prioritizedOperation: OperationType | null;
  activeWidgetOperation: OperationType | null;
  preferredGenerationHint: { requiresInputAsset: boolean; autoBind: string | null; note: string | null };
  suggestedParamsEntries: [string, unknown][];
  applySuggestedOperation: () => void;
  applySuggestedSettings: () => void;
  canApplySuggestedSettings: boolean;
  selectedWidget: { value?: { setOperationType?: (op: OperationType) => void; scopeId?: string } } | null | undefined;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="list-none cursor-pointer select-none rounded border border-neutral-200 dark:border-neutral-700 p-1 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 hover:text-neutral-700 dark:hover:text-neutral-200"
        title="Generation policy — how prompt hints and QuickGen settings combine"
      >
        <Icon name="sparkles" size={12} />
      </button>
      <Popover
        anchor={triggerRef.current}
        placement="bottom"
        align="start"
        offset={4}
        open={open}
        onClose={() => setOpen(false)}
        triggerRef={triggerRef}
        className="w-80 max-w-[calc(100vw-2rem)] rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-lg p-3 space-y-2"
      >
        <div className="text-[11px] font-medium text-neutral-700 dark:text-neutral-200">Prompt-derived generation intent</div>
        {prioritizedOperation ? (
          <div className="space-y-1 text-[11px] text-neutral-600 dark:text-neutral-300">
            <div>
              Suggested op: <span className="font-medium text-neutral-700 dark:text-neutral-200">{formatOperationTypeShort(prioritizedOperation)}</span>
              {activeWidgetOperation && (
                <span className="ml-2 text-[10px] text-neutral-500 dark:text-neutral-400">
                  (current: {formatOperationTypeShort(activeWidgetOperation)})
                </span>
              )}
            </div>
            <div>
              Input asset required: {preferredGenerationHint.requiresInputAsset ? 'Yes' : 'No'}
            </div>
            {preferredGenerationHint.autoBind && (
              <div>Auto-bind hint: {preferredGenerationHint.autoBind}</div>
            )}
            {preferredGenerationHint.note && (
              <div className="text-[10px] text-neutral-500 dark:text-neutral-400">{preferredGenerationHint.note}</div>
            )}
            <button
              type="button"
              onClick={applySuggestedOperation}
              disabled={(!selectedWidget?.value?.setOperationType && !selectedWidget?.value?.scopeId) || !prioritizedOperation}
              className="rounded border border-neutral-200 dark:border-neutral-700 px-2 py-1 text-[11px] text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-60"
            >
              Apply suggested op
            </button>
            {suggestedParamsEntries.length > 0 && (
              <button
                type="button"
                onClick={applySuggestedSettings}
                disabled={!canApplySuggestedSettings}
                className="rounded border border-neutral-200 dark:border-neutral-700 px-2 py-1 text-[11px] text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-60"
              >
                Apply suggested settings (missing-only)
              </button>
            )}
          </div>
        ) : (
          <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
            No prompt-mode hints resolved for current tags/category.
          </div>
        )}
        <div className="pt-2 border-t border-neutral-200 dark:border-neutral-700 text-[10px] text-neutral-500 dark:text-neutral-400">
          QuickGen settings remain user-controlled. Generate enforces operation intent + asset requirement from prompt hints.
        </div>
      </Popover>
    </>
  );
}

function parseTagsInput(value: string): string[] {
  const seen = new Set<string>();
  const parsed: string[] = [];
  value
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0)
    .forEach((tag) => {
      if (seen.has(tag)) return;
      seen.add(tag);
      parsed.push(tag);
    });
  return parsed;
}

function formatSuggestedParamValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value === null) return 'null';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function PromptAuthoringEditor() {
  const {
    selectedFamily,
    selectedVersion,
    versions,
    selectedFamilyId,
    selectedVersionId,
    editorText,
    setEditorText,
    instructionInput,
    commitMessageInput,
    setCommitMessageInput,
    versionTagsInput,
    busyAction,
    statusMessage,
    handleCreateVersion,
    authoringModes,
  } = usePromptAuthoring();

  // Register dev context for AI Assistant integration
  useRegisterDevContext(
    'prompt-authoring-editor',
    useCallback(() => ({
      panelId: 'prompt-authoring-editor',
      panelTitle: 'Prompt Authoring',
      summary: selectedFamily
        ? `Editing family "${selectedFamily.title}" (${selectedFamily.prompt_type})${selectedVersion ? `, version v${selectedVersion.version_number}` : ''}`
        : 'No family selected',
      state: {
        familyId: selectedFamilyId ?? null,
        familyTitle: selectedFamily?.title ?? null,
        promptType: selectedFamily?.prompt_type ?? null,
        category: selectedFamily?.category ?? null,
        versionId: selectedVersionId ?? null,
        versionNumber: selectedVersion?.version_number ?? null,
        totalVersions: versions.length,
        editorTextLength: editorText.length,
        editorTextPreview: editorText.slice(0, 200) || '(empty)',
        hasInstruction: !!instructionInput.trim(),
        busyAction: busyAction ?? null,
      },
      keyFiles: [
        'features/prompts/context/PromptAuthoringContext.tsx',
        'features/prompts/components/authoring/PromptAuthoringEditor.tsx',
        'features/prompts/lib/authoringGenerationHints.ts',
      ],
    }), [
      selectedFamily, selectedVersion, selectedFamilyId, selectedVersionId,
      versions.length, editorText, instructionInput, busyAction,
    ]),
  );

  const widgets = useCapabilityAll<GenerationWidgetContext>(CAP_GENERATION_WIDGET);
  const dedupedWidgets = useMemo(() => {
    const seen = new Set<string>();
    return widgets.filter(({ provider }) => {
      if (seen.has(provider.id)) return false;
      seen.add(provider.id);
      return true;
    });
  }, [widgets]);
  const localAuthoringWidget = dedupedWidgets.find(
    (widget) => widget.provider.id === 'generation-widget:prompt-authoring',
  );
  const floatingPanels = useWorkspaceStore((s) => s.floatingPanels);
  const openFloatingPanel = useWorkspaceStore((s) => s.openFloatingPanel);
  const closeFloatingPanel = useWorkspaceStore((s) => s.closeFloatingPanel);

  const toggleQuickGenPanel = useCallback((panelId: 'quickgen-asset' | 'quickgen-settings') => {
    const localWidget = localAuthoringWidget?.value;
    if (!localWidget) return;

    const existingFloatingPanel = floatingPanels.find((floatingPanel) => {
      if (getFloatingDefinitionId(floatingPanel.id) !== panelId) return false;
      const origin = readFloatingOriginMeta(floatingPanel.context);
      return origin?.sourceDockviewId === PROMPT_AUTHORING_QUICKGEN_DOCK_ID;
    });

    if (existingFloatingPanel) {
      closeFloatingPanel(existingFloatingPanel.id);
      return;
    }

    openFloatingPanel(panelId, {
      width: panelId === 'quickgen-settings' ? 520 : 640,
      height: panelId === 'quickgen-settings' ? 440 : 520,
      context: {
        generationScopeId: localWidget.scopeId,
        ...buildFloatingOriginMetaRecord({
          sourceDockviewId: PROMPT_AUTHORING_QUICKGEN_DOCK_ID,
          sourceGroupId: null,
          sourceInstanceId: `${PROMPT_AUTHORING_QUICKGEN_DOCK_ID}:${panelId}`,
          sourceDefinitionId: panelId,
          sourceGroupRestoreHint: null,
        }),
      },
    });
  }, [closeFloatingPanel, floatingPanels, localAuthoringWidget, openFloatingPanel]);

  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(() => {
    try { return localStorage.getItem('prompt-authoring:widgetId'); } catch { return null; }
  });
  const [sendMenuOpen, setSendMenuOpen] = useState(false);
  const [pendingGenerateDispatch, setPendingGenerateDispatch] = useState<{
    widgetId: string;
    targetOperation: OperationType | null;
    overrides: GenerateOverrides;
  } | null>(null);

  // Resolve selected widget (fall back to first available)
  const selectedWidget = dedupedWidgets.find((w) => w.provider.id === selectedWidgetId)
    ?? (dedupedWidgets.length > 0 ? dedupedWidgets[0] : null);

  const isLocalWidget = selectedWidget?.provider.id === 'generation-widget:prompt-authoring';

  const handleSendOnly = useCallback(() => {
    const widget = selectedWidget?.value;
    if (!widget?.scopeId || !editorText.trim()) return;
    const sessionStore = getGenerationSessionStore(widget.scopeId);
    sessionStore.getState().setPrompt(editorText);
    setSendMenuOpen(false);
  }, [selectedWidget, editorText]);

  const handleSendAndOpen = useCallback(() => {
    const widget = selectedWidget?.value;
    if (!widget?.scopeId || !editorText.trim()) return;
    if (widget.generate) {
      void widget.generate({ promptOverride: editorText });
    } else {
      const sessionStore = getGenerationSessionStore(widget.scopeId);
      sessionStore.getState().setPrompt(editorText);
    }
    widget.setOpen(true);
    setSendMenuOpen(false);
  }, [selectedWidget, editorText]);

  const hasText = !!editorText.trim();
  const selectedTags = useMemo(() => parseTagsInput(versionTagsInput), [versionTagsInput]);
  const resolvedGenerationHints = useMemo(
    () =>
      resolveAuthoringGenerationHints({
        tags: selectedTags,
        familyCategory: selectedFamily?.category,
        modes: authoringModes,
      }),
    [authoringModes, selectedFamily?.category, selectedTags],
  );

  const hasInputForOperation = useCallback(
    (operation: OperationType): boolean => {
      const scopeId = selectedWidget?.value.scopeId;
      if (!scopeId) return false;
      const inputStore = getGenerationInputStore(scopeId);
      return (inputStore.getState().inputsByOperation[operation]?.items?.length ?? 0) > 0;
    },
    [selectedWidget],
  );
  const preferredGenerationHint = useMemo(
    () => pickPreferredOperation(resolvedGenerationHints, hasInputForOperation),
    [hasInputForOperation, resolvedGenerationHints],
  );
  const prioritizedOperation = preferredGenerationHint.operation;
  // Reactive: subscribe to session store for live operation type updates
  const [activeWidgetOperation, setActiveWidgetOperation] = useState<OperationType | null>(() => {
    const widget = selectedWidget?.value;
    if (!widget) return null;
    if (widget.scopeId) return getGenerationSessionStore(widget.scopeId).getState().operationType;
    return widget.operationType;
  });
  useEffect(() => {
    const widget = selectedWidget?.value;
    if (!widget) { setActiveWidgetOperation(null); return; }
    if (!widget.scopeId) { setActiveWidgetOperation(widget.operationType); return; }
    const store = getGenerationSessionStore(widget.scopeId);
    const sync = () => setActiveWidgetOperation(store.getState().operationType);
    sync();
    return store.subscribe(sync);
  }, [selectedWidget]);

  const applySuggestedOperation = useCallback(() => {
    const widget = selectedWidget?.value;
    if (!widget || !preferredGenerationHint.operation) return;
    const targetOp = preferredGenerationHint.operation;
    if (widget.setOperationType) {
      widget.setOperationType(targetOp);
    } else if (widget.scopeId) {
      getGenerationSessionStore(widget.scopeId).getState().setOperationType(targetOp);
    }
  }, [preferredGenerationHint.operation, selectedWidget]);
  const suggestedParamsEntries = useMemo(
    () => Object.entries(preferredGenerationHint.suggestedParams ?? {}),
    [preferredGenerationHint.suggestedParams],
  );
  const canApplySuggestedSettings = Boolean(selectedWidget?.value?.scopeId && suggestedParamsEntries.length > 0);
  const applySuggestedSettings = useCallback(() => {
    const widget = selectedWidget?.value;
    if (!widget?.scopeId) return;
    if (suggestedParamsEntries.length === 0) return;
    const settingsStore = getGenerationSettingsStore(widget.scopeId);
    const state = settingsStore.getState();
    const currentParams = state.params ?? {};
    const nextMissingOnly: Record<string, unknown> = {};
    for (const [key, value] of suggestedParamsEntries) {
      if (value === undefined) continue;
      if (currentParams[key] === undefined || currentParams[key] === null || currentParams[key] === '') {
        nextMissingOnly[key] = value;
      }
    }
    if (Object.keys(nextMissingOnly).length === 0) return;
    state.setDynamicParams({
      ...currentParams,
      ...nextMissingOnly,
    });
  }, [selectedWidget, suggestedParamsEntries]);

  const toggleSuggestedParam = useCallback((key: string, suggestedValue: unknown) => {
    const widget = selectedWidget?.value;
    if (!widget?.scopeId) return;
    const settingsStore = getGenerationSettingsStore(widget.scopeId);
    const state = settingsStore.getState();
    const currentParams = state.params ?? {};
    const current = currentParams[key];
    if (String(current) === String(suggestedValue)) {
      // Already matches → clear it so it becomes "will-apply" again
      const next = { ...currentParams };
      delete next[key];
      state.setDynamicParams(next);
    } else {
      // Empty or different → apply the suggested value
      state.setDynamicParams({ ...currentParams, [key]: suggestedValue });
    }
  }, [selectedWidget]);

  // Reactive override status for inline param badges
  type ParamStatus = 'will-apply' | 'match' | 'conflict';
  const [paramOverrideStatus, setParamOverrideStatus] = useState<
    Record<string, { status: ParamStatus; currentValue?: unknown }>
  >({});
  const suggestedParamsEntriesRef = useRef(suggestedParamsEntries);
  suggestedParamsEntriesRef.current = suggestedParamsEntries;
  useEffect(() => {
    const widget = selectedWidget?.value;
    if (!widget?.scopeId || suggestedParamsEntries.length === 0) {
      setParamOverrideStatus({});
      return;
    }
    const store = getGenerationSettingsStore(widget.scopeId);
    const compute = () => {
      const currentParams = store.getState().params ?? {};
      const result: Record<string, { status: ParamStatus; currentValue?: unknown }> = {};
      for (const [key, value] of suggestedParamsEntriesRef.current) {
        if (value === undefined) continue;
        const current = currentParams[key];
        if (current === undefined || current === null || current === '') {
          result[key] = { status: 'will-apply' };
        } else if (String(current) === String(value)) {
          result[key] = { status: 'match' };
        } else {
          result[key] = { status: 'conflict', currentValue: current };
        }
      }
      setParamOverrideStatus(result);
    };
    compute();
    return store.subscribe(compute);
  }, [selectedWidget, suggestedParamsEntries]);

  // Sync authoring hints to the shared store so the settings panel can display them
  const setAuthoringHints = useAuthoringHintsStore((s) => s.set);
  const clearAuthoringHints = useAuthoringHintsStore((s) => s.clear);
  useEffect(() => {
    const scopeId = selectedWidget?.value?.scopeId;
    if (!scopeId) return;
    setAuthoringHints(scopeId, {
      suggestedOperation: prioritizedOperation,
      suggestedParams: Object.fromEntries(suggestedParamsEntries),
    });
    return () => clearAuthoringHints(scopeId);
  }, [selectedWidget, prioritizedOperation, suggestedParamsEntries, setAuthoringHints, clearAuthoringHints]);

  const handleGenerate = useCallback(() => {
    const widget = selectedWidget?.value;
    if (!widget || !editorText.trim()) return;
    const preferredOperation = pickPreferredOperation(resolvedGenerationHints, hasInputForOperation);

    const overrides = {
      promptOverride: editorText,
      ...(preferredOperation.operation && !preferredOperation.requiresInputAsset
        ? { skipActiveAssetFallback: true }
        : {}),
    };
    const activeOperationType = widget.scopeId
      ? getGenerationSessionStore(widget.scopeId).getState().operationType
      : widget.operationType;
    const shouldSwitchOperation =
      preferredOperation.operation
      && widget.setOperationType
      && activeOperationType !== preferredOperation.operation;
    if (shouldSwitchOperation) {
      widget.setOperationType!(preferredOperation.operation!);
      setPendingGenerateDispatch({
        widgetId: widget.widgetId,
        targetOperation: preferredOperation.operation,
        overrides,
      });
      return;
    }

    if (widget.executeGeneration) {
      void widget.executeGeneration(overrides);
      return;
    }
    if (widget.generate) {
      void widget.generate(overrides);
    }
  }, [editorText, hasInputForOperation, resolvedGenerationHints, selectedWidget]);

  useEffect(() => {
    if (!pendingGenerateDispatch) return;
    const widget = selectedWidget?.value;
    if (!widget) return;
    if (widget.widgetId !== pendingGenerateDispatch.widgetId) return;
    const activeOperationType = widget.scopeId
      ? getGenerationSessionStore(widget.scopeId).getState().operationType
      : widget.operationType;
    if (
      pendingGenerateDispatch.targetOperation
      && activeOperationType !== pendingGenerateDispatch.targetOperation
    ) {
      return;
    }

    if (widget.executeGeneration) {
      void widget.executeGeneration(pendingGenerateDispatch.overrides);
    } else if (widget.generate) {
      void widget.generate(pendingGenerateDispatch.overrides);
    }
    setPendingGenerateDispatch(null);
  }, [pendingGenerateDispatch, selectedWidget]);

  const authoringPromptAdapter = useMemo(
    () => ({
      value: editorText,
      onChange: setEditorText,
      maxChars: 12000,
      placeholder: 'Write or revise prompt prose...',
    }),
    [editorText, setEditorText],
  );

  return (
    <div className="h-full min-h-0 flex flex-col bg-white dark:bg-neutral-900/60">
      <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-800">
        <div className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">Prompt Authoring</div>
        <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
          {selectedFamily
            ? `${selectedFamily.title} (${selectedFamily.prompt_type})`
            : 'Create or select a prompt to start authoring.'}
        </div>
      </div>

      <div className="p-3 space-y-2 border-b border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center gap-1.5">
          <input
            value={commitMessageInput}
            onChange={(e) => setCommitMessageInput(e.target.value)}
            placeholder="Commit message..."
            className="flex-1 min-w-0 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-xs"
          />
          <button
            type="button"
            onClick={() => void handleCreateVersion()}
            disabled={busyAction === 'version' || !selectedFamilyId}
            className="flex-shrink-0 text-xs px-3 py-1 rounded border border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800/60 dark:bg-blue-900/20 dark:text-blue-300 font-medium disabled:opacity-60"
          >
            {busyAction === 'version' ? 'Saving...' : 'Commit'}
          </button>
        </div>
        {selectedVersion && (
          <div className="text-[10px] text-neutral-400 dark:text-neutral-500">
            v{selectedVersion.version_number} · {selectedVersion.id.slice(0, 7)} · {formatDate(selectedVersion.created_at)}
          </div>
        )}

        {/* Generation policy: icon + inline color-coded suggested overrides */}
        {(prioritizedOperation || suggestedParamsEntries.length > 0) && (
          <div className="flex flex-wrap items-center gap-1.5">
            <GenerationPolicyPopover
              prioritizedOperation={prioritizedOperation}
              activeWidgetOperation={activeWidgetOperation}
              preferredGenerationHint={preferredGenerationHint}
              suggestedParamsEntries={suggestedParamsEntries}
              applySuggestedOperation={applySuggestedOperation}
              applySuggestedSettings={applySuggestedSettings}
              canApplySuggestedSettings={canApplySuggestedSettings}
              selectedWidget={selectedWidget}
            />
            {prioritizedOperation && (() => {
              const opMatch = activeWidgetOperation === prioritizedOperation;
              const opSet = activeWidgetOperation != null;
              const opBadgeClass = opMatch
                ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-900/20 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40'
                : opSet
                  ? 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800/60 dark:bg-amber-900/20 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40'
                  : 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800/60 dark:bg-blue-900/20 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40';
              const opTooltip = opMatch
                ? `Operation: ${formatOperationTypeShort(prioritizedOperation)} (active)`
                : opSet
                  ? `Suggested: ${formatOperationTypeShort(prioritizedOperation)}, current: ${formatOperationTypeShort(activeWidgetOperation!)} — click to apply`
                  : `Operation: ${formatOperationTypeShort(prioritizedOperation)} — click to apply`;
              return (
                <button
                  type="button"
                  title={opTooltip}
                  disabled={!selectedWidget?.value?.setOperationType && !selectedWidget?.value?.scopeId}
                  onClick={applySuggestedOperation}
                  className={`inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[10px] font-medium cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${opBadgeClass}`}
                >
                  {opMatch && <Icon name="check" size={9} />}
                  {!opMatch && opSet && <Icon name="alertCircle" size={9} />}
                  op: {formatOperationTypeShort(prioritizedOperation)}
                  {!opMatch && opSet && (
                    <span className="opacity-70">({formatOperationTypeShort(activeWidgetOperation!)})</span>
                  )}
                </button>
              );
            })()}
            {suggestedParamsEntries.map(([key, value]) => {
              const info = paramOverrideStatus[key];
              const status = info?.status ?? 'will-apply';
              const badgeClass =
                status === 'match'
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-900/20 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40'
                  : status === 'conflict'
                    ? 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800/60 dark:bg-amber-900/20 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40'
                    : 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800/60 dark:bg-blue-900/20 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40';
              const tooltip =
                status === 'match'
                  ? `${key}: ${formatSuggestedParamValue(value)} (applied — click to clear)`
                  : status === 'conflict'
                    ? `${key}: suggested ${formatSuggestedParamValue(value)}, current ${formatSuggestedParamValue(info?.currentValue)} — click to apply`
                    : `${key}: ${formatSuggestedParamValue(value)} — click to apply`;
              return (
                <button
                  key={key}
                  type="button"
                  title={tooltip}
                  disabled={!selectedWidget?.value?.scopeId}
                  onClick={() => toggleSuggestedParam(key, value)}
                  className={`inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[10px] font-medium cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${badgeClass}`}
                >
                  {status === 'match' && <Icon name="check" size={9} />}
                  {status === 'conflict' && <Icon name="alertCircle" size={9} />}
                  {key.replace('aspect_ratio', 'ratio')}: {formatSuggestedParamValue(value)}
                  {status === 'conflict' && (
                    <span className="opacity-70">({formatSuggestedParamValue(info?.currentValue)})</span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Generation controls: target selector + settings/assets shortcuts + Go */}
        {dedupedWidgets.length > 0 && (
          <div className="flex items-center gap-1.5 pt-1.5 border-t border-neutral-100 dark:border-neutral-800">
            {/* Widget selector */}
            <select
              value={selectedWidget?.provider.id ?? ''}
              onChange={(e) => {
                const id = e.target.value || null;
                setSelectedWidgetId(id);
                setSendMenuOpen(false);
                try { if (id) localStorage.setItem('prompt-authoring:widgetId', id); } catch { /* ignore */ }
              }}
              className="min-w-0 flex-shrink rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-1.5 py-1 text-[11px]"
            >
              {dedupedWidgets.map(({ provider }) => (
                <option key={provider.id} value={provider.id}>
                  {provider.label}
                </option>
              ))}
            </select>

            {/* Settings shortcut — toggle in authoring quickgen dock */}
            <button
              type="button"
              onClick={() => toggleQuickGenPanel('quickgen-settings')}
              title="Toggle generation settings"
              className="p-1 rounded text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-700 dark:hover:text-neutral-200"
            >
              <Icon name="settings" size={12} />
            </button>

            {/* Asset input shortcut — toggle in authoring quickgen dock */}
            <button
              type="button"
              onClick={() => toggleQuickGenPanel('quickgen-asset')}
              title="Toggle asset input"
              className="p-1 rounded text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-700 dark:hover:text-neutral-200"
            >
              <Icon name="image" size={12} />
            </button>

            <div className="flex-1" />

            {/* Send menu (for external widgets) */}
            {!isLocalWidget && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setSendMenuOpen(!sendMenuOpen)}
                  disabled={!hasText || !selectedWidget}
                  title="Send options"
                  className="p-1 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-40"
                >
                  <Icon name="arrowRight" size={12} />
                </button>
                {sendMenuOpen && (
                  <div className="absolute bottom-full right-0 mb-1 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded shadow-lg py-1 z-50 min-w-[140px]">
                    <button
                      type="button"
                      onClick={handleSendOnly}
                      disabled={!hasText}
                      className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-neutral-100 dark:hover:bg-neutral-700 disabled:opacity-40"
                    >
                      Send to prompt
                    </button>
                    <button
                      type="button"
                      onClick={handleSendAndOpen}
                      disabled={!hasText}
                      className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-neutral-100 dark:hover:bg-neutral-700 disabled:opacity-40"
                    >
                      Send & generate
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Go button */}
            <button
              type="button"
              onClick={handleGenerate}
              disabled={!hasText || !(selectedWidget?.value.generate || selectedWidget?.value.executeGeneration)}
              title={`Generate via ${selectedWidget?.provider.label ?? 'selected generator'}`}
              className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium bg-green-600 hover:bg-green-700 text-white disabled:opacity-40 disabled:hover:bg-green-600"
            >
              <Icon name="play" size={10} color="#fff" />
              Go
            </button>
          </div>
        )}

        {statusMessage && (
          <div className="text-[11px] text-neutral-600 dark:text-neutral-300">{statusMessage}</div>
        )}
      </div>

      <div className="flex-1 min-h-0 p-3">
        <PromptComposerSurface
          adapter={authoringPromptAdapter}
          display={{
            variant: 'default',
            showCounter: true,
            resizable: true,
            minHeight: 260,
            containerClassName: 'h-full w-full flex flex-col',
          }}
        />
      </div>
    </div>
  );
}
