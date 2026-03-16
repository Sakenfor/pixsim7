/**
 * PromptAuthoringNavigator
 *
 * Left sub-panel: family browser + version list.
 * Consumes shared state from PromptAuthoringContext.
 */

import { DisclosureSection } from '@pixsim7/shared.ui';
import clsx from 'clsx';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';


import type { PromptVersionSummary } from '@lib/api/prompts';
import { Icon } from '@lib/icons';

import { ClientFilterBar } from '@features/gallery/components/ClientFilterBar';
import type { ClientFilterDef, ClientFilterValue } from '@features/gallery/lib/useClientFilters';


import type { OperationType } from '@/types/operations';

import { formatDate, usePromptAuthoring } from '../../context/PromptAuthoringContext';
import {
  formatOperationTypeLabel,
  formatOperationTypeShort,
  resolveAuthoringGenerationHints,
} from '../../lib/authoringGenerationHints';

const VERSION_TAG_FILTER_KEY = 'version-tag';

function VersionMetadataPopover({
  version,
  modeId,
  prioritizedOperations,
}: {
  version: PromptVersionSummary;
  modeId: string | null;
  prioritizedOperations: OperationType[];
}) {
  const [open, setOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) {
      setAnchorRect(null);
      return;
    }
    const update = () => setAnchorRect(buttonRef.current?.getBoundingClientRect() ?? null);
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (buttonRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const popover = open && anchorRect ? (() => {
    const width = 288;
    const left = Math.max(8, Math.min(anchorRect.left, window.innerWidth - width - 8));
    const availableAbove = Math.max(0, anchorRect.top - 8);
    const availableBelow = Math.max(0, window.innerHeight - anchorRect.bottom - 8);
    const openUp = availableAbove >= 220 || availableAbove >= availableBelow;
    const top = openUp ? anchorRect.top - 8 : anchorRect.bottom + 8;

    return createPortal(
      <div
        className="fixed z-[10000]"
        style={{
          left,
          top,
          transform: openUp ? 'translateY(-100%)' : undefined,
        }}
      >
        <div
          ref={panelRef}
          className="w-72 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-lg p-3 space-y-2"
        >
          <div className="text-[11px] font-medium text-neutral-700 dark:text-neutral-200">Saved version metadata</div>
          <div className="space-y-1 text-[11px]">
            <div className="text-neutral-700 dark:text-neutral-200">
              v{version.version_number} ({version.id.slice(0, 8)})
            </div>
            <div className="text-neutral-600 dark:text-neutral-300">
              {version.commit_message || 'No commit message'}
            </div>
            <div className="text-neutral-500 dark:text-neutral-400">
              Created: {formatDate(version.created_at)}
            </div>
            {version.author && (
              <div className="text-neutral-500 dark:text-neutral-400">
                Author: {version.author}
              </div>
            )}
            {prioritizedOperations.length > 0 && (
              <div className="pt-1 border-t border-neutral-200 dark:border-neutral-700">
                <div className="text-neutral-500 dark:text-neutral-400">
                  Priority op: {formatOperationTypeShort(prioritizedOperations[0])}
                </div>
                <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
                  Order: {prioritizedOperations.map((operation) => formatOperationTypeLabel(operation)).join(' -> ')}
                </div>
                {modeId && (
                  <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
                    Mode: {modeId}
                  </div>
                )}
              </div>
            )}
          </div>
          {version.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1 pt-1 border-t border-neutral-200 dark:border-neutral-700">
              {version.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center rounded border border-neutral-200 dark:border-neutral-700 px-1.5 py-0.5 text-[10px] text-neutral-600 dark:text-neutral-300"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : (
            <div className="text-[11px] text-neutral-500 dark:text-neutral-400 pt-1 border-t border-neutral-200 dark:border-neutral-700">
              No saved tags.
            </div>
          )}
        </div>
      </div>,
      document.body,
    );
  })() : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="rounded border border-neutral-200 dark:border-neutral-700 p-1 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800"
        title="Saved version metadata"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Icon name="info" size={10} />
      </button>
      {popover}
    </>
  );
}

export function PromptAuthoringNavigator() {
  const {
    families,
    familiesLoading,
    familiesError,
    selectedFamily,
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
    hydrateFromVersion,
    authoringModes,
  } = usePromptAuthoring();
  const [activeVersionTagFilters, setActiveVersionTagFilters] = useState<string[]>([]);

  useEffect(() => {
    setActiveVersionTagFilters([]);
  }, [selectedFamilyId]);

  const availableVersionTags = useMemo(() => {
    const counts = new Map<string, number>();
    versions.forEach((version) => {
      (version.tags ?? []).forEach((tag) => {
        const normalized = tag.trim();
        if (!normalized) return;
        counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
      });
    });
    return Array.from(counts.entries()).sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    });
  }, [versions]);

  const filteredVersions = useMemo(() => {
    if (activeVersionTagFilters.length === 0) return versions;
    const selected = new Set(activeVersionTagFilters);
    return versions.filter((version) =>
      (version.tags ?? []).some((tag) => selected.has(tag.trim())),
    );
  }, [activeVersionTagFilters, versions]);

  const versionFilterDefs = useMemo<ClientFilterDef<never>[]>(() => [
    {
      key: VERSION_TAG_FILTER_KEY,
      label: 'Tags',
      icon: 'tag',
      type: 'enum',
      selectionMode: 'multi',
      order: 0,
      predicate: () => true,
    },
  ], []);
  const versionFilterState = useMemo<Record<string, ClientFilterValue>>(
    () => ({
      [VERSION_TAG_FILTER_KEY]:
        activeVersionTagFilters.length > 0 ? activeVersionTagFilters : undefined,
    }),
    [activeVersionTagFilters],
  );
  const versionDerivedOptions = useMemo(
    () => ({
      [VERSION_TAG_FILTER_KEY]: availableVersionTags.map(([tag, count]) => ({
        value: tag,
        label: tag,
        count,
      })),
    }),
    [availableVersionTags],
  );
  const handleVersionFilterChange = useCallback((key: string, value: ClientFilterValue) => {
    if (key !== VERSION_TAG_FILTER_KEY) return;
    if (!Array.isArray(value)) {
      setActiveVersionTagFilters([]);
      return;
    }
    const next = Array.from(
      new Set(
        value
          .map((entry) => String(entry).trim())
          .filter((entry) => entry.length > 0),
      ),
    );
    setActiveVersionTagFilters(next);
  }, []);

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
          {versions.length > 0 && (
            <div className="px-2 pt-2 pb-1 border-b border-neutral-200 dark:border-neutral-800">
              <ClientFilterBar
                defs={versionFilterDefs}
                filterState={versionFilterState}
                derivedOptions={versionDerivedOptions}
                onFilterChange={handleVersionFilterChange}
                onReset={() => setActiveVersionTagFilters([])}
                popoverMode="inline"
              />
            </div>
          )}
          {versions.length === 0 && !versionsLoading ? (
            <div className="px-3 py-4 text-xs text-neutral-500 dark:text-neutral-400">
              Select a family to view versions.
            </div>
          ) : filteredVersions.length === 0 && !versionsLoading ? (
            <div className="px-3 py-4 text-xs text-neutral-500 dark:text-neutral-400">
              No versions match the selected tag filters.
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {filteredVersions.map((version) => {
                const versionHints = resolveAuthoringGenerationHints({
                  tags: version.tags ?? [],
                  familyCategory: selectedFamily?.category,
                  modes: authoringModes,
                });
                const prioritizedOperation = versionHints.prioritizedOperations[0] ?? null;

                return (
                  <div
                    key={version.id}
                    className={clsx(
                      'rounded border text-xs',
                      selectedVersionId === version.id
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-900/20 dark:text-emerald-300'
                        : 'border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedVersionId(version.id);
                        hydrateFromVersion(version);
                      }}
                      className="w-full text-left px-2 pt-1.5 pb-1"
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
                      {prioritizedOperation && (
                        <div className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                          Priority op: {formatOperationTypeShort(prioritizedOperation)}
                        </div>
                      )}
                    </button>
                    <div className="px-2 pb-1.5 flex items-center justify-between">
                      <VersionMetadataPopover
                        version={version}
                        modeId={versionHints.modeId}
                        prioritizedOperations={versionHints.prioritizedOperations}
                      />
                      <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
                        {formatDate(version.created_at)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </DisclosureSection>
      </div>
    </div>
  );
}
