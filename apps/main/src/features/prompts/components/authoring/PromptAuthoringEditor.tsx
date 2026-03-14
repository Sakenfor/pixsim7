/**
 * PromptAuthoringEditor
 *
 * Center sub-panel: PromptComposer + version action buttons.
 * Includes a target selector dropdown for generation widgets and
 * separate Send / Send & Generate buttons.
 */

import { useState } from 'react';

import { Icon } from '@lib/icons';

import {
  CAP_GENERATION_WIDGET,
  type GenerationWidgetContext,
  useCapabilityAll,
} from '@features/contextHub';
import {
  getGenerationSessionStore,
  getGenerationSettingsStore,
} from '@features/generation/stores/generationScopeStores';

import { usePromptAuthoring, formatDate } from '../../context/PromptAuthoringContext';
import { PromptComposer } from '../PromptComposer';

export function PromptAuthoringEditor() {
  const {
    selectedFamily,
    selectedVersion,
    selectedFamilyId,
    selectedVersionId,
    editorText,
    setEditorText,
    instructionInput,
    setInstructionInput,
    commitMessageInput,
    setCommitMessageInput,
    versionTagsInput,
    setVersionTagsInput,
    busyAction,
    statusMessage,
    versionsLoading,
    handleCreateVersion,
    handleApplyEdit,
    refreshVersions,
  } = usePromptAuthoring();

  const widgets = useCapabilityAll<GenerationWidgetContext>(CAP_GENERATION_WIDGET);
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null);

  // Resolve selected widget (fall back to first available)
  const selectedWidget = widgets.find((w) => w.provider.id === selectedWidgetId)
    ?? (widgets.length > 0 ? widgets[0] : null);

  const sendToSelected = (andGenerate: boolean) => {
    const widget = selectedWidget?.value;
    if (!widget?.scopeId || !editorText.trim()) return;
    const sessionStore = getGenerationSessionStore(widget.scopeId);
    sessionStore.getState().setPrompt(editorText);
    widget.setOpen(true);
    if (andGenerate && widget.generate) {
      setTimeout(() => void widget.generate?.(), 150);
    }
  };

  const hasText = !!editorText.trim();

  // Build tooltip summarizing the selected widget's current settings
  const generateTooltip = (() => {
    const widget = selectedWidget?.value;
    if (!widget?.scopeId) return 'Generate';
    const settings = getGenerationSettingsStore(widget.scopeId);
    const params = settings.getState().params;
    const parts = [widget.operationType?.replace(/_/g, ' ')];
    if (params.model) parts.push(String(params.model));
    if (params.quality) parts.push(params.quality);
    if (params.duration) parts.push(`${params.duration}s`);
    return `Generate: ${parts.filter(Boolean).join(' · ')}`;
  })();

  return (
    <div className="h-full min-h-0 flex flex-col bg-white dark:bg-neutral-900/60">
      <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-800">
        <div className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">Prompt Authoring</div>
        <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
          {selectedFamily
            ? `${selectedFamily.title} (${selectedFamily.prompt_type})`
            : 'Create or select a family to start authoring.'}
        </div>
      </div>

      <div className="p-3 space-y-2 border-b border-neutral-200 dark:border-neutral-800">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <input
            value={instructionInput}
            onChange={(e) => setInstructionInput(e.target.value)}
            placeholder="Instruction (optional)"
            className="rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-xs"
          />
          <input
            value={commitMessageInput}
            onChange={(e) => setCommitMessageInput(e.target.value)}
            placeholder="Commit message"
            className="rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-xs"
          />
          <input
            value={versionTagsInput}
            onChange={(e) => setVersionTagsInput(e.target.value)}
            placeholder="version tags (comma separated)"
            className="rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-xs"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleCreateVersion()}
            disabled={busyAction === 'version' || !selectedFamilyId}
            className="text-xs px-2 py-1 rounded border border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800/60 dark:bg-blue-900/20 dark:text-blue-300 disabled:opacity-60"
          >
            {busyAction === 'version' ? 'Saving...' : 'Create version'}
          </button>
          <button
            type="button"
            onClick={() => void handleApplyEdit()}
            disabled={busyAction === 'edit' || !selectedVersionId}
            className="text-xs px-2 py-1 rounded border border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800/60 dark:bg-violet-900/20 dark:text-violet-300 disabled:opacity-60"
          >
            {busyAction === 'edit' ? 'Applying...' : 'Apply edit as child'}
          </button>
          <button
            type="button"
            onClick={() => void refreshVersions(selectedFamilyId, selectedVersionId)}
            disabled={!selectedFamilyId || versionsLoading}
            className="text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300"
          >
            Refresh versions
          </button>
          {selectedVersion && (
            <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
              Selected: v{selectedVersion.version_number} | {selectedVersion.id.slice(0, 8)} | {formatDate(selectedVersion.created_at)}
            </span>
          )}
        </div>

        {/* QuickGen: target selector + compact icon actions */}
        {widgets.length > 0 && (
          <div className="flex items-center gap-1 pt-1 border-t border-neutral-100 dark:border-neutral-800">
            <select
              value={selectedWidget?.provider.id ?? ''}
              onChange={(e) => setSelectedWidgetId(e.target.value || null)}
              className="rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-1.5 py-1 text-[11px]"
            >
              {widgets.map(({ provider }) => (
                <option key={provider.id} value={provider.id}>
                  {provider.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => sendToSelected(false)}
              disabled={!hasText || !selectedWidget}
              title="Send prompt to selected widget"
              className="p-1 rounded border border-neutral-200 dark:border-neutral-700 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 disabled:opacity-40"
            >
              <Icon name="arrowRight" size={12} />
            </button>
            {selectedWidget?.value.generate && (
              <>
                <button
                  type="button"
                  onClick={() => sendToSelected(true)}
                  disabled={!hasText || !selectedWidget}
                  title="Send prompt & generate"
                  className="p-1 rounded border border-neutral-200 dark:border-neutral-700 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 disabled:opacity-40"
                >
                  <Icon name="zap" size={12} />
                </button>
                <button
                  type="button"
                  onClick={() => void selectedWidget.value.generate?.()}
                  disabled={!selectedWidget}
                  title={generateTooltip}
                  className="p-1 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-40"
                >
                  <Icon name="play" size={12} />
                </button>
              </>
            )}
          </div>
        )}

        {statusMessage && (
          <div className="text-[11px] text-neutral-600 dark:text-neutral-300">{statusMessage}</div>
        )}
      </div>

      <div className="flex-1 min-h-0 p-3">
        <PromptComposer
          value={editorText}
          onChange={setEditorText}
          maxChars={12000}
          placeholder="Write or revise prompt prose..."
          className="h-full"
          variant="default"
          showCounter
          resizable
          minHeight={260}
        />
      </div>
    </div>
  );
}
