/**
 * ChainBuilderPanel — Panel for building, managing, and executing generation chains.
 *
 * Three views:
 * - List: browse/search chains, create new, delete
 * - Edit: build/edit a chain with ordered step editors
 * - Execution: monitor chain execution progress
 */
import clsx from 'clsx';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { BlockTemplateSummary } from '@lib/api/blockTemplates';
import type { ChainSummary, ChainStepDefinition } from '@lib/api/chains';
import { Icon } from '@lib/icons';
import { resolveBlockTemplates } from '@lib/resolvers';

import { AssetPickerField, type PickedAsset } from '@features/assets/components/pickers';
import {
  useChainStore,
  createEmptyStep,
} from '@features/chains/stores/chainStore';

import { ChainStepEditor } from './ChainStepEditor';

type PanelView = 'list' | 'edit' | 'execution';

export function ChainBuilderPanel() {
  const chains = useChainStore((s) => s.chains);
  const chainsLoading = useChainStore((s) => s.chainsLoading);
  const fetchChains = useChainStore((s) => s.fetchChains);
  const fetchChain = useChainStore((s) => s.fetchChain);
  const activeChain = useChainStore((s) => s.activeChain);
  const setActiveChain = useChainStore((s) => s.setActiveChain);
  const draftSteps = useChainStore((s) => s.draftSteps);
  const setDraftSteps = useChainStore((s) => s.setDraftSteps);
  const addDraftStep = useChainStore((s) => s.addDraftStep);
  const updateDraftStep = useChainStore((s) => s.updateDraftStep);
  const removeDraftStep = useChainStore((s) => s.removeDraftStep);
  const reorderDraftSteps = useChainStore((s) => s.reorderDraftSteps);
  const saveChain = useChainStore((s) => s.saveChain);
  const updateChain = useChainStore((s) => s.updateChain);
  const deleteChain = useChainStore((s) => s.deleteChain);
  const saving = useChainStore((s) => s.saving);
  const executeChain = useChainStore((s) => s.executeChain);
  const activeExecution = useChainStore((s) => s.activeExecution);
  const executionPolling = useChainStore((s) => s.executionPolling);
  const stopPolling = useChainStore((s) => s.stopPolling);

  const [view, setView] = useState<PanelView>('list');
  const [search, setSearch] = useState('');
  const [templates, setTemplates] = useState<BlockTemplateSummary[]>([]);

  // Edit form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Execute form state
  const [providerId, setProviderId] = useState('pixverse');
  const [defaultOperation, setDefaultOperation] = useState('text_to_image');
  const [initialAsset, setInitialAsset] = useState<PickedAsset | null>(null);

  useEffect(() => {
    void fetchChains();
  }, [fetchChains]);

  // Load templates for step editor dropdowns
  useEffect(() => {
    void resolveBlockTemplates(
      { limit: 200 },
      { consumerId: 'ChainBuilderPanel.loadTemplates' },
    ).then(setTemplates).catch(() => {});
  }, []);

  // Sync edit form when activeChain changes
  useEffect(() => {
    if (activeChain) {
      setName(activeChain.name);
      setDescription(activeChain.description ?? '');
      setTags(activeChain.tags.join(', '));
    }
  }, [activeChain?.id, activeChain?.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup polling on unmount
  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  const filteredChains = useMemo(() => {
    if (!search.trim()) return chains;
    const q = search.toLowerCase();
    return chains.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }, [chains, search]);

  const allStepIds = useMemo(
    () => draftSteps.map((s) => s.id),
    [draftSteps],
  );

  const handleNew = useCallback(() => {
    setActiveChain(null);
    setDraftSteps([createEmptyStep(0)]);
    setName('');
    setDescription('');
    setTags('');
    setError(null);
    setView('edit');
  }, [setActiveChain, setDraftSteps]);

  const handleEdit = useCallback(
    async (c: ChainSummary) => {
      await fetchChain(c.id);
      setError(null);
      setView('edit');
    },
    [fetchChain],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteChain(id);
    },
    [deleteChain],
  );

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    if (draftSteps.length === 0) {
      setError('At least one step is required');
      return;
    }
    const invalidStep = draftSteps.find(
      (s) => !(s.template_id?.trim()) && !(s.prompt?.trim()),
    );
    if (invalidStep) {
      setError(`Step "${invalidStep.label || invalidStep.id}" needs a template or prompt`);
      return;
    }
    setError(null);

    const tagList = tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      if (activeChain) {
        await updateChain(activeChain.id, {
          name,
          description: description || undefined,
          tags: tagList,
        });
      } else {
        await saveChain({
          name,
          description: description || undefined,
          tags: tagList,
        });
      }
      setView('list');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  }, [name, description, tags, draftSteps, activeChain, saveChain, updateChain]);

  const handleAddStep = useCallback(() => {
    addDraftStep(createEmptyStep(draftSteps.length));
  }, [addDraftStep, draftSteps.length]);

  const handleStepChange = useCallback(
    (index: number, step: ChainStepDefinition) => {
      updateDraftStep(index, step);
    },
    [updateDraftStep],
  );

  const handleDuplicateStep = useCallback(
    (index: number) => {
      const source = draftSteps[index];
      if (!source) return;

      const existingIds = new Set(draftSteps.map((s) => s.id));
      const baseId = source.id?.trim() || `step_${index + 1}`;
      let nextId = `${baseId}_copy`;
      let copyIndex = 2;
      while (existingIds.has(nextId)) {
        nextId = `${baseId}_copy${copyIndex}`;
        copyIndex += 1;
      }

      const baseLabel = (source.label ?? '').trim() || `Step ${index + 1}`;
      const duplicate: ChainStepDefinition = {
        ...source,
        id: nextId,
        label: `${baseLabel} Copy`,
      };

      const nextSteps = [...draftSteps];
      nextSteps.splice(index + 1, 0, duplicate);
      setDraftSteps(nextSteps);
    },
    [draftSteps, setDraftSteps],
  );

  const handleExecute = useCallback(async () => {
    if (!activeChain) return;
    const executionId = await executeChain(activeChain.id, {
      provider_id: providerId,
      initial_asset_id: initialAsset?.id ?? null,
      default_operation: defaultOperation,
    });
    if (executionId) {
      setView('execution');
    }
  }, [activeChain, executeChain, providerId, initialAsset, defaultOperation]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 p-3 border-b border-neutral-200 dark:border-neutral-700 shrink-0">
        {view !== 'list' && (
          <button
            type="button"
            onClick={() => {
              stopPolling();
              setView('list');
            }}
            className="p-1 rounded text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-200"
            title="Back to list"
          >
            <Icon name="arrowLeft" size={14} />
          </button>
        )}
        <h2 className="text-sm font-medium text-neutral-700 dark:text-neutral-200 shrink-0">
          {view === 'list'
            ? 'Generation Chains'
            : view === 'edit'
              ? activeChain
                ? 'Edit Chain'
                : 'New Chain'
              : 'Execution'}
        </h2>

        {view === 'list' && (
          <button
            type="button"
            onClick={handleNew}
            className="ml-auto text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 shrink-0"
          >
            <Icon name="plus" size={10} className="inline mr-1" />
            New
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto thin-scrollbar">
        {/* ===== LIST VIEW ===== */}
        {view === 'list' && (
          <div className="flex flex-col min-h-0">
            {/* Search */}
            <div className="px-3 py-1.5 shrink-0">
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
                <Icon name="search" size={12} className="text-neutral-400 shrink-0" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search chains..."
                  className="flex-1 bg-transparent text-[11px] text-neutral-700 dark:text-neutral-200 outline-none placeholder-neutral-400"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
                  >
                    <Icon name="x" size={10} />
                  </button>
                )}
              </div>
            </div>

            {/* Chain list */}
            <div className="px-2 pb-2 space-y-0.5 overflow-y-auto thin-scrollbar">
              {chainsLoading && (
                <div className="text-xs text-neutral-500 text-center py-4">Loading...</div>
              )}
              {!chainsLoading && filteredChains.length === 0 && (
                <div className="text-xs text-neutral-400 text-center py-4">
                  {search ? 'No matches' : 'No chains yet. Create one to get started.'}
                </div>
              )}
              {filteredChains.map((c) => (
                <div
                  key={c.id}
                  className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-2.5 hover:bg-neutral-50 dark:hover:bg-neutral-800/60 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-neutral-700 dark:text-neutral-200 truncate">
                      {c.name}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleEdit(c)}
                        className="p-1 rounded text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-200"
                        title="Edit"
                      >
                        <Icon name="edit" size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(c.id)}
                        className="p-1 rounded text-red-600 hover:text-red-700 dark:text-red-400"
                        title="Delete"
                      >
                        <Icon name="trash2" size={12} />
                      </button>
                    </div>
                  </div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400">
                    {c.step_count} step{c.step_count === 1 ? '' : 's'}
                    {c.execution_count > 0 && ` \u00B7 ${c.execution_count} runs`}
                  </div>
                  {c.description && (
                    <div className="text-xs text-neutral-400 dark:text-neutral-500 truncate">
                      {c.description}
                    </div>
                  )}
                  {c.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {c.tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-[10px] px-1.5 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===== EDIT VIEW ===== */}
        {view === 'edit' && (
          <div className="p-3 space-y-4">
            {/* Error banner */}
            {error && (
              <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded px-2 py-1.5">
                {error}
              </div>
            )}

            {/* Name */}
            <div>
              <label className="text-[10px] text-neutral-500 dark:text-neutral-400 block mb-0.5">
                Chain Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My generation chain"
                className="w-full text-xs px-2 py-1.5 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 outline-none"
              />
            </div>

            {/* Description */}
            <div>
              <label className="text-[10px] text-neutral-500 dark:text-neutral-400 block mb-0.5">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this chain do?"
                rows={2}
                className="w-full text-xs px-2 py-1.5 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 outline-none resize-y"
              />
            </div>

            {/* Tags */}
            <div>
              <label className="text-[10px] text-neutral-500 dark:text-neutral-400 block mb-0.5">
                Tags (comma-separated)
              </label>
              <input
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="workflow, portrait, ..."
                className="w-full text-xs px-2 py-1.5 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 outline-none"
              />
            </div>

            {/* Steps */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-neutral-700 dark:text-neutral-200">
                  Steps ({draftSteps.length})
                </label>
                <button
                  type="button"
                  onClick={handleAddStep}
                  className="text-[10px] px-2 py-0.5 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  <Icon name="plus" size={10} className="inline mr-0.5" />
                  Add Step
                </button>
              </div>
              <div className="space-y-2">
                {draftSteps.map((step, i) => (
                  <ChainStepEditor
                    key={step.id}
                    step={step}
                    index={i}
                    totalSteps={draftSteps.length}
                    templates={templates}
                    allStepIds={allStepIds}
                    onChange={handleStepChange}
                    onDuplicate={handleDuplicateStep}
                    onRemove={removeDraftStep}
                    onMoveUp={(idx) => reorderDraftSteps(idx, idx - 1)}
                    onMoveDown={(idx) => reorderDraftSteps(idx, idx + 1)}
                  />
                ))}
              </div>
            </div>

            {/* Save / Execute buttons */}
            <div className="flex items-center gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className={clsx(
                  'text-xs px-3 py-1.5 rounded font-medium transition-colors',
                  saving
                    ? 'bg-neutral-200 dark:bg-neutral-700 text-neutral-400 cursor-not-allowed'
                    : 'bg-accent text-accent-text hover:bg-accent-hover',
                )}
              >
                {saving ? 'Saving...' : activeChain ? 'Update' : 'Create'}
              </button>
              {activeChain && (
                <button
                  type="button"
                  onClick={handleExecute}
                  className="text-xs px-3 py-1.5 rounded font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                >
                  Execute
                </button>
              )}
            </div>

            {/* Quick execute settings (only shown when chain is saved) */}
            {activeChain && (
              <div className="space-y-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
                <label className="text-[10px] text-neutral-500 dark:text-neutral-400 block">
                  Execution Settings
                </label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <div className="flex-1">
                    <label className="text-[10px] text-neutral-400 block mb-0.5">
                      Provider ID
                    </label>
                    <input
                      type="text"
                      value={providerId}
                      onChange={(e) => setProviderId(e.target.value)}
                      className="w-full text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 outline-none"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] text-neutral-400 block mb-0.5">
                      Default Operation
                    </label>
                    <input
                      type="text"
                      value={defaultOperation}
                      onChange={(e) => setDefaultOperation(e.target.value)}
                      className="w-full text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 outline-none"
                    />
                  </div>
                  <div className="flex-1">
                    <AssetPickerField
                      label="Initial Asset (optional)"
                      value={initialAsset}
                      onChange={setInitialAsset}
                      mediaTypes={['image', 'video']}
                    />
                    <div className="mt-1 text-[10px] text-neutral-400">
                      Used by step 1 when it needs an asset input.
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===== EXECUTION VIEW ===== */}
        {view === 'execution' && (
          <div className="p-3 space-y-3">
            {!activeExecution && (
              <div className="text-xs text-neutral-500 text-center py-4">
                Starting execution...
              </div>
            )}
            {activeExecution && (
              <>
                {/* Status header */}
                <div className="flex items-center gap-2">
                  <span
                    className={clsx(
                      'text-[10px] font-medium px-2 py-0.5 rounded-full',
                      activeExecution.status === 'completed' && 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
                      activeExecution.status === 'running' && 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
                      activeExecution.status === 'pending' && 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500',
                      activeExecution.status === 'failed' && 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
                      activeExecution.status === 'cancelled' && 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
                    )}
                  >
                    {activeExecution.status}
                  </span>
                  <span className="text-xs text-neutral-500">
                    Step {activeExecution.current_step_index + 1} of {activeExecution.total_steps}
                  </span>
                  {executionPolling && (
                    <span className="text-[10px] text-blue-500 animate-pulse-subtle ml-auto">
                      polling...
                    </span>
                  )}
                </div>

                {/* Error message */}
                {activeExecution.error_message && (
                  <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded px-2 py-1.5">
                    {activeExecution.error_message}
                  </div>
                )}

                {/* Per-step progress */}
                <div className="space-y-1.5">
                  {activeExecution.step_states.map((stepState, i) => (
                    <div
                      key={stepState.step_id}
                      className={clsx(
                        'flex items-center gap-2 px-2 py-1.5 rounded border text-xs',
                        stepState.status === 'completed' && 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/10',
                        stepState.status === 'running' && 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/10',
                        stepState.status === 'pending' && 'border-neutral-200 dark:border-neutral-700',
                        stepState.status === 'failed' && 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10',
                      )}
                    >
                      <span className="text-[10px] font-mono text-neutral-400 shrink-0">
                        #{i + 1}
                      </span>
                      <span className="text-neutral-700 dark:text-neutral-200 truncate flex-1">
                        {stepState.step_id}
                      </span>
                      <span
                        className={clsx(
                          'text-[10px] font-medium shrink-0',
                          stepState.status === 'completed' && 'text-emerald-600 dark:text-emerald-400',
                          stepState.status === 'running' && 'text-blue-600 dark:text-blue-400',
                          stepState.status === 'pending' && 'text-neutral-400',
                          stepState.status === 'failed' && 'text-red-600 dark:text-red-400',
                        )}
                      >
                        {stepState.status}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
