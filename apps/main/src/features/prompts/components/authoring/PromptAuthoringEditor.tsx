/**
 * PromptAuthoringEditor
 *
 * Center sub-panel: PromptComposer + version action buttons.
 * Compact generation controls: target selector, settings/assets shortcuts, Go button.
 */

import { useCallback, useMemo, useState } from 'react';

import { buildFloatingOriginMetaRecord, readFloatingOriginMeta } from '@lib/dockview/floatingPanelInterop';
import { Icon } from '@lib/icons';

import {
  CAP_GENERATION_WIDGET,
  type GenerationWidgetContext,
  useCapabilityAll,
} from '@features/contextHub';
import { getGenerationSessionStore } from '@features/generation/stores/generationScopeStores';
import { useWorkspaceStore } from '@features/workspace';
import { getFloatingDefinitionId } from '@features/workspace/lib/floatingPanelUtils';

import { usePromptAuthoring, formatDate } from '../../context/PromptAuthoringContext';
import { PromptComposerSurface } from '../PromptComposerSurface';

import { PROMPT_AUTHORING_QUICKGEN_DOCK_ID } from './promptAuthoringIds';

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

  // Resolve selected widget (fall back to first available)
  const selectedWidget = dedupedWidgets.find((w) => w.provider.id === selectedWidgetId)
    ?? (dedupedWidgets.length > 0 ? dedupedWidgets[0] : null);

  const isLocalWidget = selectedWidget?.provider.id === 'generation-widget:prompt-authoring';

  const handleGenerate = useCallback(() => {
    const widget = selectedWidget?.value;
    if (!widget?.generate || !editorText.trim()) return;
    void widget.generate({ promptOverride: editorText });
  }, [selectedWidget, editorText]);

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
              disabled={!hasText || !selectedWidget?.value.generate}
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
