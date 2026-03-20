/**
 * PromptAuthoringNavigator
 *
 * Left sub-panel: family browser + version list.
 * Consumes shared state from PromptAuthoringContext.
 */

import { BranchSelector, Popover } from '@pixsim7/shared.ui';
import type { BranchInfo } from '@pixsim7/shared.ui';
import clsx from 'clsx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';


import { listBranches, createBranch, type BranchSummary } from '@lib/api/prompts';
import type { PromptFamilySummary } from '@lib/api/prompts';
import { Icon } from '@lib/icons';



import { usePromptAuthoring } from '../../context/PromptAuthoringContext';

function formatRelativeTime(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}


function FamilyEditPopover({
  family,
  onUpdate,
  onClose,
  triggerRef,
  categoryOptions,
}: {
  family: PromptFamilySummary;
  onUpdate: (familyId: string, data: { title?: string; category?: string; tags?: string[] }) => Promise<void>;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLElement | null>;
  categoryOptions: string[];
}) {
  const [title, setTitle] = useState(family.title);
  const [category, setCategory] = useState(family.category ?? '');
  const [tags, setTags] = useState<string[]>(family.tags ?? []);
  const [tagDraft, setTagDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const addTag = (raw: string) => {
    const t = raw.trim();
    if (t && !tags.includes(t)) setTags((prev) => [...prev, t]);
  };
  const removeTag = (t: string) => setTags((prev) => prev.filter((x) => x !== t));

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates: { title?: string; category?: string; tags?: string[] } = {};
      if (title.trim() !== family.title) updates.title = title.trim();
      if (category !== (family.category ?? '')) updates.category = category || undefined;
      const oldTags = family.tags ?? [];
      if (JSON.stringify(tags) !== JSON.stringify(oldTags)) updates.tags = tags;
      if (Object.keys(updates).length > 0) {
        await onUpdate(family.id, updates);
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover
      anchor={triggerRef.current}
      placement="bottom"
      align="start"
      offset={4}
      open
      onClose={onClose}
      triggerRef={triggerRef}
      className="w-72 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-lg p-3 space-y-2"
    >
      <div className="text-[11px] font-medium text-neutral-700 dark:text-neutral-200">Edit prompt</div>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title"
        className="w-full rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-xs"
      />
      <div>
        <div className="text-[10px] text-neutral-500 dark:text-neutral-400 mb-0.5">Category (authoring mode)</div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-xs"
        >
          {categoryOptions.map((opt) => (
            <option key={opt} value={opt}>{opt || '(none)'}</option>
          ))}
        </select>
      </div>
      <div>
        <div className="text-[10px] text-neutral-500 dark:text-neutral-400 mb-0.5">Tags</div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1.5">
            {tags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => removeTag(tag)}
                className="inline-flex items-center gap-0.5 rounded border border-neutral-200 dark:border-neutral-700 px-1.5 py-0.5 text-[10px] text-neutral-600 dark:text-neutral-300 hover:bg-red-50 hover:border-red-200 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:border-red-800/60 dark:hover:text-red-300"
                title={`Remove ${tag}`}
              >
                <span className="truncate max-w-[140px]">{tag}</span>
                <Icon name="x" size={8} />
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-1">
          <input
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addTag(tagDraft);
                setTagDraft('');
              }
            }}
            placeholder="Add tag..."
            className="flex-1 min-w-0 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-[11px]"
          />
          <button
            type="button"
            onClick={() => { addTag(tagDraft); setTagDraft(''); }}
            disabled={!tagDraft.trim()}
            className="rounded border border-neutral-200 dark:border-neutral-700 px-1.5 py-1 text-[11px] text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-40"
          >
            +
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="text-xs px-2 py-1 rounded border border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800/60 dark:bg-blue-900/20 dark:text-blue-300 disabled:opacity-60"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300"
        >
          Cancel
        </button>
      </div>
    </Popover>
  );
}

function FamilyCreatePopover({
  onClose,
  triggerRef,
  categoryOptions,
}: {
  onClose: () => void;
  triggerRef: React.RefObject<HTMLElement | null>;
  categoryOptions: string[];
}) {
  const {
    newFamilyTitle, setNewFamilyTitle,
    newFamilyPromptType, setNewFamilyPromptType,
    newFamilyCategory, setNewFamilyCategory,
    newFamilyTagsInput, setNewFamilyTagsInput,
    busyAction, handleCreateFamily,
  } = usePromptAuthoring();

  const handleCreate = async () => {
    await handleCreateFamily();
    onClose();
  };

  return (
    <Popover
      anchor={triggerRef.current}
      placement="bottom"
      align="end"
      offset={4}
      open
      onClose={onClose}
      triggerRef={triggerRef}
      className="w-72 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-lg p-3 space-y-2"
    >
      <div className="text-[11px] font-medium text-neutral-700 dark:text-neutral-200">New prompt</div>
      <input
        value={newFamilyTitle}
        onChange={(e) => setNewFamilyTitle(e.target.value)}
        placeholder="Title"
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
        <select
          value={newFamilyCategory}
          onChange={(e) => setNewFamilyCategory(e.target.value)}
          className="rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-xs"
        >
          {categoryOptions.map((opt) => (
            <option key={opt} value={opt}>{opt || '(none)'}</option>
          ))}
        </select>
      </div>
      <input
        value={newFamilyTagsInput}
        onChange={(e) => setNewFamilyTagsInput(e.target.value)}
        placeholder="Tags (comma separated)"
        className="w-full rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-xs"
      />
      <button
        type="button"
        onClick={() => void handleCreate()}
        disabled={busyAction === 'family'}
        className="text-xs px-2 py-1 rounded border border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800/60 dark:bg-blue-900/20 dark:text-blue-300 disabled:opacity-60"
      >
        {busyAction === 'family' ? 'Creating...' : 'Create'}
      </button>
    </Popover>
  );
}

export function PromptAuthoringNavigator() {
  const {
    families,
    familiesError,
    selectedFamily,
    selectedFamilyId,
    setSelectedFamilyId,
    refreshFamilies,
    handleUpdateFamily,
    versions,
    versionsLoading,
    versionsError,
    selectedVersionId,
    setSelectedVersionId,
    hydrateFromVersion,
    authoringModes,
  } = usePromptAuthoring();

  const categoryOptions = useMemo(
    () => ['', ...authoringModes.map((m) => m.id)],
    [authoringModes],
  );

  const [createOpen, setCreateOpen] = useState(false);
  const createBtnRef = useRef<HTMLButtonElement>(null);
  const [editingFamilyId, setEditingFamilyId] = useState<string | null>(null);
  const editBtnRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  // Branch state
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [currentBranch, setCurrentBranch] = useState<string | null>('main');

  useEffect(() => {
    if (!selectedFamilyId) { setBranches([]); return; }
    let cancelled = false;
    void listBranches(selectedFamilyId).then((result) => {
      if (cancelled) return;
      setBranches(result);
    }).catch(() => {
      if (!cancelled) setBranches([]);
    });
    return () => { cancelled = true; };
  }, [selectedFamilyId, versions]); // re-fetch when versions change (new branch created)

  const branchInfos: BranchInfo[] = useMemo(
    () => branches.map((b) => ({
      name: b.name,
      isMain: b.is_main,
      commitCount: b.commit_count,
      lastCommit: b.last_commit,
      author: b.author,
    })),
    [branches],
  );

  const filteredByBranch = useMemo(() => {
    if (!currentBranch || currentBranch === 'main') {
      return versions.filter((v) => !v.branch_name || v.branch_name === 'main');
    }
    return versions.filter((v) => v.branch_name === currentBranch);
  }, [currentBranch, versions]);

  const handleCreateBranch = useCallback(async (branchName: string) => {
    if (!selectedFamilyId) return;
    try {
      await createBranch(selectedFamilyId, { branch_name: branchName });
      setCurrentBranch(branchName);
      // branches re-fetch via the versions dep change in the effect above
      void refreshFamilies(selectedFamilyId);
    } catch {
      // silently fail — branch name conflict etc.
    }
  }, [selectedFamilyId, refreshFamilies]);

  return (
    <div className="h-full min-h-0 flex flex-col bg-white dark:bg-neutral-900/60">
      {/* ── Prompt selector bar ── */}
      <div className="px-2.5 pt-2.5 pb-2 space-y-1.5 border-b border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center gap-1">
          <select
            value={selectedFamilyId ?? ''}
            onChange={(e) => setSelectedFamilyId(e.target.value || null)}
            className="flex-1 min-w-0 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-2 py-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-200 truncate"
          >
            <option value="">Select prompt...</option>
            {families.map((f) => (
              <option key={f.id} value={f.id}>{f.title}</option>
            ))}
          </select>
          <button
            ref={createBtnRef}
            type="button"
            onClick={() => setCreateOpen((v) => !v)}
            className="p-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 hover:text-neutral-700 dark:hover:text-neutral-200"
            title="New prompt"
          >
            <Icon name="plus" size={12} />
          </button>
          {selectedFamily && (
            <button
              ref={(el) => { if (el && selectedFamily) editBtnRefs.current.set(selectedFamily.id, el); }}
              type="button"
              onClick={() => setEditingFamilyId((v) => v === selectedFamilyId ? null : selectedFamilyId)}
              className="p-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 hover:text-neutral-700 dark:hover:text-neutral-200"
              title="Edit prompt"
            >
              <Icon name="edit" size={12} />
            </button>
          )}
        </div>
        {selectedFamily && (
          <div className="flex items-center gap-1.5 px-0.5">
            {selectedFamily.category && (
              <span className="inline-flex items-center rounded border border-neutral-200 dark:border-neutral-700 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600 dark:text-neutral-300">
                {selectedFamily.category}
              </span>
            )}
            <span className="text-[10px] text-neutral-400 dark:text-neutral-500">
              {selectedFamily.prompt_type}
            </span>
          </div>
        )}
        {familiesError && (
          <div className="text-[11px] text-red-600 dark:text-red-300">{familiesError}</div>
        )}
      </div>

      {/* Create popover */}
      {createOpen && (
        <FamilyCreatePopover
          onClose={() => setCreateOpen(false)}
          triggerRef={createBtnRef}
          categoryOptions={categoryOptions}
        />
      )}
      {/* Edit popover */}
      {editingFamilyId && (() => {
        const fam = families.find((f) => f.id === editingFamilyId);
        const btnEl = editBtnRefs.current.get(editingFamilyId);
        if (!fam || !btnEl) return null;
        return (
          <FamilyEditPopover
            family={fam}
            onUpdate={handleUpdateFamily}
            onClose={() => setEditingFamilyId(null)}
            triggerRef={{ current: btnEl }}
            categoryOptions={categoryOptions}
          />
        );
      })()}

      {/* ── Branch + version history ── */}
      <div className="flex-1 min-h-0 flex flex-col">
        {/* Branch selector */}
        {selectedFamilyId && (
          <div className="px-2.5 pt-2 pb-1.5 border-b border-neutral-200 dark:border-neutral-800">
            <BranchSelector
              branches={branchInfos}
              currentBranch={currentBranch}
              onSelect={setCurrentBranch}
              onCreateBranch={handleCreateBranch}
              disabled={!selectedFamilyId}
            />
          </div>
        )}

        {versionsError && (
          <div className="px-3 py-2 text-[11px] text-red-600 dark:text-red-300">{versionsError}</div>
        )}

        {/* Version history — git log style */}
        <div className="flex-1 min-h-0 overflow-y-auto thin-scrollbar">
          {!selectedFamilyId ? (
            <div className="px-3 py-6 text-xs text-neutral-500 dark:text-neutral-400 text-center">
              Select a prompt to view history.
            </div>
          ) : filteredByBranch.length === 0 && !versionsLoading ? (
            <div className="px-3 py-6 text-xs text-neutral-500 dark:text-neutral-400 text-center">
              No versions on this branch.
            </div>
          ) : (
            <div className="py-1">
              {filteredByBranch.map((version, idx) => {
                const isSelected = selectedVersionId === version.id;
                const isLast = idx === filteredByBranch.length - 1;

                return (
                  <button
                    key={version.id}
                    type="button"
                    onClick={() => {
                      setSelectedVersionId(version.id);
                      hydrateFromVersion(version);
                    }}
                    className={clsx(
                      'w-full text-left flex items-start gap-2.5 px-3 py-1.5 transition-colors',
                      isSelected
                        ? 'bg-blue-50 dark:bg-blue-900/20'
                        : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50',
                    )}
                  >
                    {/* Git-line: dot + connector */}
                    <div className="flex flex-col items-center pt-0.5 flex-shrink-0 w-3">
                      <div className={clsx(
                        'w-2 h-2 rounded-full border-2 flex-shrink-0',
                        isSelected
                          ? 'border-blue-500 bg-blue-500'
                          : 'border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900',
                      )} />
                      {!isLast && (
                        <div className="w-px flex-1 min-h-[16px] bg-neutral-200 dark:bg-neutral-700 mt-0.5" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 pb-1">
                      <div className="flex items-baseline gap-1.5">
                        <span className={clsx(
                          'text-xs font-medium',
                          isSelected ? 'text-blue-700 dark:text-blue-300' : 'text-neutral-700 dark:text-neutral-200',
                        )}>
                          v{version.version_number}
                        </span>
                        <span className="text-[10px] text-neutral-400 dark:text-neutral-500 font-mono">
                          {version.id.slice(0, 7)}
                        </span>
                        <span className="text-[10px] text-neutral-400 dark:text-neutral-500 ml-auto flex-shrink-0">
                          {formatRelativeTime(version.created_at)}
                        </span>
                      </div>
                      <div className={clsx(
                        'text-[11px] truncate mt-0.5',
                        isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-neutral-500 dark:text-neutral-400',
                      )}>
                        {version.commit_message || 'No message'}
                      </div>
                      {version.author && (
                        <div className="text-[10px] text-neutral-400 dark:text-neutral-500 mt-0.5">
                          {version.author}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
