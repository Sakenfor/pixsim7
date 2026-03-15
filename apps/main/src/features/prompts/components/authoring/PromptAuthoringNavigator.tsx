/**
 * PromptAuthoringNavigator
 *
 * Left sub-panel: family browser + version list.
 * Consumes shared state from PromptAuthoringContext.
 */

import { DisclosureSection } from '@pixsim7/shared.ui';
import clsx from 'clsx';

import { Icon } from '@lib/icons';

import { usePromptAuthoring } from '../../context/PromptAuthoringContext';

export function PromptAuthoringNavigator() {
  const {
    families,
    familiesLoading,
    familiesError,
    selectedFamilyId,
    setSelectedFamilyId,
    newFamilyTitle,
    setNewFamilyTitle,
    newFamilyPromptType,
    setNewFamilyPromptType,
    newFamilyCategory,
    setNewFamilyCategory,
    newFamilyTagsInput,
    setNewFamilyTagsInput,
    busyAction,
    refreshFamilies,
    handleCreateFamily,
    versions,
    versionsLoading,
    versionsError,
    selectedVersionId,
    setSelectedVersionId,
    setEditorText,
    setInstructionInput,
    setCommitMessageInput,
    setVersionTagsInput,
  } = usePromptAuthoring();

  return (
    <div className="h-full min-h-0 flex flex-col bg-white dark:bg-neutral-900/60">
      <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-800">
        <div className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">Prompt Families</div>
        <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
          Select a family, then select a version branch source.
        </div>
      </div>

      {/* Family creation form */}
      <div className="p-3 space-y-2 border-b border-neutral-200 dark:border-neutral-800">
        <input
          value={newFamilyTitle}
          onChange={(e) => setNewFamilyTitle(e.target.value)}
          placeholder="New family title..."
          className="w-full rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-xs"
        />
        <div className="grid grid-cols-2 gap-2">
          <select
            value={newFamilyPromptType}
            onChange={(e) => setNewFamilyPromptType(e.target.value as 'visual' | 'narrative' | 'hybrid')}
            className="rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-xs"
          >
            <option value="visual">visual</option>
            <option value="narrative">narrative</option>
            <option value="hybrid">hybrid</option>
          </select>
          <input
            value={newFamilyCategory}
            onChange={(e) => setNewFamilyCategory(e.target.value)}
            placeholder="Category"
            className="rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-xs"
          />
        </div>
        <input
          value={newFamilyTagsInput}
          onChange={(e) => setNewFamilyTagsInput(e.target.value)}
          placeholder="family tags (comma separated)"
          className="w-full rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-xs"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleCreateFamily()}
            disabled={busyAction === 'family'}
            className="text-xs px-2 py-1 rounded border border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800/60 dark:bg-blue-900/20 dark:text-blue-300 disabled:opacity-60"
          >
            {busyAction === 'family' ? 'Creating...' : 'Create family'}
          </button>
          <button
            type="button"
            onClick={() => void refreshFamilies(selectedFamilyId)}
            disabled={familiesLoading}
            className="text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300"
          >
            <Icon name="refresh" size={12} />
          </button>
        </div>
        {familiesError && (
          <div className="text-[11px] text-red-600 dark:text-red-300">{familiesError}</div>
        )}
      </div>

      {/* Family + version lists */}
      <div className="flex-1 min-h-0 flex flex-col">
        <DisclosureSection
          label="Families"
          defaultOpen
          fillHeight
          badge={families.length > 0 ? <span className="text-[10px] text-neutral-500 dark:text-neutral-400">({families.length})</span> : undefined}
          className="border-b border-neutral-200 dark:border-neutral-800"
          headerClassName="px-3"
          contentClassName="!mt-0"
        >
          {families.length === 0 && !familiesLoading ? (
            <div className="px-3 py-4 text-xs text-neutral-500 dark:text-neutral-400">
              No prompt families found.
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {families.map((family) => (
                <button
                  key={family.id}
                  type="button"
                  onClick={() => setSelectedFamilyId(family.id)}
                  className={clsx(
                    'w-full text-left px-2 py-1.5 rounded border text-xs',
                    selectedFamilyId === family.id
                      ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800/60 dark:bg-blue-900/20 dark:text-blue-300'
                      : 'border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200',
                  )}
                >
                  <div className="font-medium truncate">{family.title}</div>
                  <div className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate">
                    {family.slug} | {family.prompt_type}
                  </div>
                </button>
              ))}
            </div>
          )}
        </DisclosureSection>

        <DisclosureSection
          label="Versions"
          defaultOpen
          fillHeight
          badge={versions.length > 0 ? <span className="text-[10px] text-neutral-500 dark:text-neutral-400">({versions.length})</span> : undefined}
          headerClassName="px-3"
          contentClassName="!mt-0"
        >
          {versionsError && (
            <div className="px-3 py-2 text-[11px] text-red-600 dark:text-red-300">{versionsError}</div>
          )}
          {versions.length === 0 && !versionsLoading ? (
            <div className="px-3 py-4 text-xs text-neutral-500 dark:text-neutral-400">
              Select a family to view versions.
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {versions.map((version) => (
                <button
                  key={version.id}
                  type="button"
                  onClick={() => {
                    setSelectedVersionId(version.id);
                    setEditorText(version.prompt_text ?? '');
                    setCommitMessageInput(version.commit_message ?? '');
                    setVersionTagsInput((version.tags ?? []).join(', '));
                    setInstructionInput('');
                  }}
                  className={clsx(
                    'w-full text-left px-2 py-1.5 rounded border text-xs',
                    selectedVersionId === version.id
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-900/20 dark:text-emerald-300'
                      : 'border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200',
                  )}
                >
                  <div className="font-medium truncate">
                    v{version.version_number}
                    <span className="ml-2 text-[10px] text-neutral-500 dark:text-neutral-400">
                      {version.id.slice(0, 8)}
                    </span>
                  </div>
                  <div className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate">
                    {version.commit_message || 'No commit message'}
                  </div>
                </button>
              ))}
            </div>
          )}
        </DisclosureSection>
      </div>
    </div>
  );
}
