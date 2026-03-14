/**
 * PromptAuthoringEditor
 *
 * Center sub-panel: PromptComposer + version action buttons.
 * Includes a "Send to QuickGen" button that pushes editor text into
 * the generation scope's input store.
 */

import { Icon } from '@lib/icons';

import { useGenerationScopeStores } from '@features/generation';

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

  const { useSessionStore } = useGenerationScopeStores();

  const handleSendToQuickGen = () => {
    useSessionStore.getState().setPrompt(editorText);
  };

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
            onClick={handleSendToQuickGen}
            disabled={!editorText.trim()}
            className="text-xs px-2 py-1 rounded border border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800/60 dark:bg-amber-900/20 dark:text-amber-300 disabled:opacity-60"
          >
            <Icon name="sparkles" size={10} className="mr-1 inline-block" />
            Send to QuickGen
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
