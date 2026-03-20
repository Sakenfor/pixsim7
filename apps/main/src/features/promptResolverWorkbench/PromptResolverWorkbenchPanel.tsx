import { HierarchicalSidebarNav } from '@pixsim7/shared.ui';
import { useEffect, useMemo, useState } from 'react';

import { GraphEditorSplitLayout } from '@/features/graph/components/graph/GraphEditorSplitLayout';
import { GraphSidebarSection } from '@/features/graph/components/graph/GraphSidebarSection';

import {
  compileTemplateToResolutionRequestRemote,
  runNextV1ResolutionRemote,
} from './api';
import { getResolverWorkbenchFixture, resolverWorkbenchFixtures } from './fixtures';
import {
  deleteSavedSnapshot,
  loadSavedSnapshots,
  saveNamedSnapshot,
  type WorkbenchSavedSnapshot,
} from './savedSnapshots';
import {
  createResolverWorkbenchSnapshot,
  parseResolverWorkbenchSnapshot,
  serializeResolverWorkbenchSnapshot,
} from './snapshot';
import type {
  ResolutionRequest,
  ResolutionResult,
  ResolverWorkbenchFixture,
} from './types';

type WorkbenchView =
  | 'overview'
  | 'request'
  | 'result'
  | 'trace'
  | 'snapshot';

const NAV_ITEMS = [
  {
    id: 'run',
    label: 'Run',
    selectOnClick: false,
    children: [
      { id: 'overview', label: 'Overview' },
      { id: 'result', label: 'Result' },
      { id: 'trace', label: 'Trace' },
    ],
  },
  {
    id: 'data',
    label: 'Data',
    selectOnClick: false,
    children: [
      { id: 'request', label: 'Request JSON' },
      { id: 'snapshot', label: 'Snapshot' },
    ],
  },
] as const;

function safeJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function cloneRequest(request: ResolutionRequest): ResolutionRequest {
  return JSON.parse(JSON.stringify(request)) as ResolutionRequest;
}

function summarizeFixture(fixture: ResolverWorkbenchFixture | null) {
  if (!fixture) return 'Custom request';
  return fixture.description || fixture.name;
}

function TagChips({ tags }: { tags: Record<string, unknown> | undefined }) {
  if (!tags || Object.keys(tags).length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {Object.entries(tags).map(([k, v]) => (
        <span
          key={k}
          className="rounded border border-neutral-700 bg-neutral-900/40 px-1.5 py-0.5 text-[10px] text-neutral-300"
        >
          {k}: {Array.isArray(v) ? v.join(', ') : String(v)}
        </span>
      ))}
    </div>
  );
}

function JsonPane({
  title,
  value,
  onChange,
  readOnly = false,
  error,
}: {
  title: string;
  value: string;
  onChange?: (next: string) => void;
  readOnly?: boolean;
  error?: string | null;
}) {
  return (
    <div className="min-h-0 rounded border border-neutral-800 bg-neutral-950/40">
      <div className="border-b border-neutral-800 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
        {title}
      </div>
      <textarea
        className="h-[420px] w-full resize-y bg-transparent px-3 py-2 font-mono text-xs text-neutral-200 outline-none"
        value={value}
        onChange={readOnly ? undefined : (e) => onChange?.(e.target.value)}
        readOnly={readOnly}
        spellCheck={false}
      />
      {error ? (
        <div className="border-t border-rose-900/50 bg-rose-950/30 px-3 py-2 text-xs text-rose-300">
          {error}
        </div>
      ) : null}
    </div>
  );
}

export function PromptResolverWorkbenchPanel() {
  const [selectedFixtureId, setSelectedFixtureId] = useState<string>(resolverWorkbenchFixtures[0]?.id ?? '');
  const [activeView, setActiveView] = useState<WorkbenchView>('overview');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set(['run', 'data']));
  const [requestText, setRequestText] = useState<string>(() => safeJson(resolverWorkbenchFixtures[0]?.request ?? {
    resolver_id: 'next_v1',
    candidates_by_target: {},
  }));
  const [result, setResult] = useState<ResolutionResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [templateSlug, setTemplateSlug] = useState<string>('bananza-scene-compose-scaffold-v1');
  const [templateCandidateLimit, setTemplateCandidateLimit] = useState<number>(24);
  const [controlValuesText, setControlValuesText] = useState<string>('{}');
  const [controlValuesError, setControlValuesError] = useState<string | null>(null);
  const [isCompilingTemplate, setIsCompilingTemplate] = useState(false);
  const [templateCompileError, setTemplateCompileError] = useState<string | null>(null);
  const [snapshotText, setSnapshotText] = useState<string>('');
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [savedSnapshots, setSavedSnapshots] = useState<WorkbenchSavedSnapshot[]>(() => loadSavedSnapshots());
  const [saveNameText, setSaveNameText] = useState<string>('');

  const selectedFixture = getResolverWorkbenchFixture(selectedFixtureId);

  const parseState = useMemo(() => {
    try {
      const parsed = JSON.parse(requestText) as ResolutionRequest;
      return { parsedRequest: parsed, requestError: null as string | null };
    } catch (err) {
      return {
        parsedRequest: null as ResolutionRequest | null,
        requestError: err instanceof Error ? err.message : 'Invalid JSON',
      };
    }
  }, [requestText]);
  const parsedRequest = parseState.parsedRequest;
  const requestError = parseState.requestError;

  useEffect(() => {
    setSnapshotText(
      serializeResolverWorkbenchSnapshot(
        createResolverWorkbenchSnapshot({
          fixtureId: selectedFixtureId || null,
          request: parsedRequest ?? {
            resolver_id: 'next_v1',
            candidates_by_target: {},
          },
          result,
        }),
      ),
    );
  }, [parsedRequest, result, selectedFixtureId]);

  const handleLoadFixture = (fixtureId: string) => {
    const fixture = getResolverWorkbenchFixture(fixtureId);
    if (!fixture) return;
    setSelectedFixtureId(fixture.id);
    setRequestText(safeJson(cloneRequest(fixture.request)));
    setResult(null);
    setActiveView('overview');
  };

  const handleRun = async () => {
    if (!parsedRequest) {
      setActiveView('request');
      return;
    }
    if ((parsedRequest.resolver_id || 'next_v1') !== 'next_v1') {
      setResult({
        resolver_id: String(parsedRequest.resolver_id || 'unknown'),
        seed: parsedRequest.seed ?? null,
        selected_by_target: {},
        warnings: [],
        errors: [`Only 'next_v1' is supported in the fixture workbench right now.`],
        trace: { events: [] },
        diagnostics: { mode: 'fixture_workbench' },
      });
      setRunError(null);
      setActiveView('result');
      return;
    }
    setIsRunning(true);
    setRunError(null);
    try {
      const remoteResult = await runNextV1ResolutionRemote(parsedRequest);
      setResult(remoteResult);
      setActiveView('result');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Resolver request failed';
      setRunError(message);
      setResult({
        resolver_id: 'next_v1',
        seed: parsedRequest.seed ?? null,
        selected_by_target: {},
        warnings: [],
        errors: [message],
        trace: { events: [] },
        diagnostics: { mode: 'remote_error' },
      });
      setActiveView('result');
    } finally {
      setIsRunning(false);
    }
  };

  const handleResetToFixture = () => {
    if (!selectedFixture) return;
    setRequestText(safeJson(cloneRequest(selectedFixture.request)));
    setResult(null);
  };

  const handleLoadTemplate = async () => {
    const slug = templateSlug.trim();
    if (!slug) {
      setTemplateCompileError('Template slug is required');
      return;
    }
    let parsedControlValues: Record<string, unknown> | undefined;
    const trimmedControlValues = controlValuesText.trim();
    if (trimmedControlValues && trimmedControlValues !== '{}') {
      try {
        parsedControlValues = JSON.parse(trimmedControlValues) as Record<string, unknown>;
        setControlValuesError(null);
      } catch (err) {
        setControlValuesError(err instanceof Error ? err.message : 'Invalid JSON');
        return;
      }
    } else {
      setControlValuesError(null);
    }
    setIsCompilingTemplate(true);
    setTemplateCompileError(null);
    try {
      const compiled = await compileTemplateToResolutionRequestRemote({
        slug,
        candidate_limit: templateCandidateLimit,
        control_values: parsedControlValues,
      });
      setSelectedFixtureId('');
      setRequestText(safeJson(compiled));
      setResult(null);
      setRunError(null);
      setActiveView('overview');
    } catch (err) {
      setTemplateCompileError(err instanceof Error ? err.message : 'Template compile failed');
    } finally {
      setIsCompilingTemplate(false);
    }
  };

  const handleCopySnapshot = async () => {
    try {
      await navigator.clipboard.writeText(snapshotText);
      setSnapshotError(null);
    } catch {
      setSnapshotError('Clipboard copy failed. Copy manually from Snapshot JSON.');
    }
  };

  const handleSaveSnapshot = () => {
    const name = saveNameText.trim() || (selectedFixture ? selectedFixture.name : `snapshot-${Date.now()}`);
    const snapshot = createResolverWorkbenchSnapshot({
      fixtureId: selectedFixtureId || null,
      request: parsedRequest ?? { resolver_id: 'next_v1', candidates_by_target: {} },
      result,
    });
    saveNamedSnapshot(name, snapshot);
    setSavedSnapshots(loadSavedSnapshots());
    setSaveNameText('');
  };

  const handleLoadSavedSnapshot = (saved: WorkbenchSavedSnapshot) => {
    setSelectedFixtureId(saved.snapshot.fixture_id || '');
    setRequestText(safeJson(saved.snapshot.request));
    setResult(saved.snapshot.result ?? null);
    setSnapshotError(null);
    setActiveView('overview');
  };

  const handleDeleteSavedSnapshot = (id: string) => {
    deleteSavedSnapshot(id);
    setSavedSnapshots(loadSavedSnapshots());
  };

  const handleLoadSnapshot = () => {
    try {
      const snapshot = parseResolverWorkbenchSnapshot(snapshotText);
      setSelectedFixtureId(snapshot.fixture_id || '');
      setRequestText(safeJson(snapshot.request));
      setResult(snapshot.result ?? null);
      setSnapshotError(null);
      setActiveView('overview');
    } catch (err) {
      setSnapshotError(err instanceof Error ? err.message : 'Invalid snapshot');
      setActiveView('snapshot');
    }
  };

  const targetEntries = Object.entries(parsedRequest?.candidates_by_target ?? {});
  const traceEvents = result?.trace?.events ?? [];

  return (
    <GraphEditorSplitLayout
      sidebarWidthPx={260}
      sidebarClassName="bg-neutral-950/20"
      mainClassName="p-0"
      sidebar={(
        <div className="space-y-3">
          <GraphSidebarSection title="Resolver">
            <div className="rounded border border-neutral-800 bg-neutral-900/40 px-2 py-2">
              <div className="text-xs font-medium text-neutral-100">
                Prompt Resolver Workbench
              </div>
              <div className="mt-0.5 text-[11px] text-neutral-400">
                Fixture-driven `next_v1` sandbox
              </div>
            </div>
          </GraphSidebarSection>

          <GraphSidebarSection title="Fixture" titleClassName="mb-1">
            <select
              className="w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-xs text-neutral-100"
              value={selectedFixtureId || '__custom__'}
              onChange={(e) => handleLoadFixture(e.target.value)}
            >
              <option value="__custom__">Custom / Compiled Request</option>
              {resolverWorkbenchFixtures.map((fixture) => (
                <option key={fixture.id} value={fixture.id}>
                  {fixture.name}
                </option>
              ))}
            </select>
            <div className="mt-1 text-[11px] text-neutral-500">
              {summarizeFixture(selectedFixture)}
            </div>
          </GraphSidebarSection>

          <GraphSidebarSection title="Template Compile" titleClassName="mb-1">
            <div className="space-y-1.5">
              <input
                type="text"
                value={templateSlug}
                onChange={(e) => setTemplateSlug(e.target.value)}
                placeholder="template slug"
                className="w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-xs text-neutral-100 placeholder:text-neutral-500"
              />
              <label className="flex items-center justify-between gap-2 text-[11px] text-neutral-400">
                <span>Candidate limit</span>
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={templateCandidateLimit}
                  onChange={(e) => setTemplateCandidateLimit(Math.max(1, Math.min(200, Number(e.target.value) || 24)))}
                  className="w-20 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-right text-xs text-neutral-100"
                />
              </label>
              <div>
                <div className="mb-1 text-[11px] text-neutral-400">control_values (JSON)</div>
                <textarea
                  value={controlValuesText}
                  onChange={(e) => setControlValuesText(e.target.value)}
                  rows={3}
                  spellCheck={false}
                  className="w-full resize-y rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 font-mono text-[11px] text-neutral-100 outline-none"
                  placeholder='{"slider_id": 4}'
                />
                {controlValuesError ? (
                  <div className="mt-0.5 text-[11px] text-rose-300">{controlValuesError}</div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={handleLoadTemplate}
                disabled={isCompilingTemplate}
                className="w-full rounded border border-blue-700/60 bg-blue-900/20 px-2 py-1.5 text-xs font-medium text-blue-200 hover:bg-blue-900/40 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isCompilingTemplate ? 'Compiling…' : 'Load Template -> Request'}
              </button>
              {templateCompileError ? (
                <div className="rounded border border-rose-800/60 bg-rose-950/20 px-2 py-1.5 text-[11px] text-rose-300">
                  {templateCompileError}
                </div>
              ) : (
                <div className="text-[11px] text-neutral-500">
                  Compiles slots + control effects into a `ResolutionRequest` for `next_v1`.
                </div>
              )}
            </div>
          </GraphSidebarSection>

          <GraphSidebarSection title="Sections" titleClassName="mb-1">
            <HierarchicalSidebarNav
              variant="dark"
              items={NAV_ITEMS.map((item) => ({
                ...item,
                children: item.children.map((child) => ({
                  ...child,
                  label: child.id === 'result' && result
                    ? `Result (${Object.keys(result.selected_by_target ?? {}).length})`
                    : child.id === 'trace'
                      ? `Trace (${traceEvents.length})`
                      : child.label,
                })),
              }))}
              expandedItemIds={expandedGroups}
              onToggleExpand={(id) => setExpandedGroups((prev) => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              })}
              onSelectChild={(_, childId) => setActiveView(childId as WorkbenchView)}
              getItemState={(item) => (
                NAV_ITEMS.find((group) => group.id === item.id)?.children.some((c) => c.id === activeView)
                  ? 'ancestor'
                  : 'inactive'
              )}
              getChildState={(_, child) => (child.id === activeView ? 'active' : 'inactive')}
              className="space-y-1"
            />
          </GraphSidebarSection>

          <GraphSidebarSection title="Quick Actions" className="mb-0">
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={handleRun}
                className="w-full rounded border border-emerald-700/60 bg-emerald-900/30 px-2 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-900/50 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isRunning}
              >
                {isRunning ? 'Running…' : 'Run `next_v1`'}
              </button>
              <button
                type="button"
                onClick={handleResetToFixture}
                className="w-full rounded border border-neutral-700 bg-neutral-900/40 px-2 py-1.5 text-xs text-neutral-200 hover:bg-neutral-900/70"
                disabled={!selectedFixture}
              >
                Reset to Fixture
              </button>
              <button
                type="button"
                onClick={handleLoadSnapshot}
                className="w-full rounded border border-neutral-700 bg-neutral-900/40 px-2 py-1.5 text-xs text-neutral-200 hover:bg-neutral-900/70"
              >
                Load Snapshot JSON
              </button>
              <button
                type="button"
                onClick={handleCopySnapshot}
                className="w-full rounded border border-neutral-700 bg-neutral-900/40 px-2 py-1.5 text-xs text-neutral-200 hover:bg-neutral-900/70"
              >
                Copy Snapshot JSON
              </button>
            </div>
          </GraphSidebarSection>

          <GraphSidebarSection title="Saved Snapshots" titleClassName="mb-1">
            <div className="space-y-1.5">
              <div className="flex gap-1">
                <input
                  type="text"
                  value={saveNameText}
                  onChange={(e) => setSaveNameText(e.target.value)}
                  placeholder={selectedFixture ? selectedFixture.name : 'snapshot name'}
                  className="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-100 placeholder:text-neutral-500"
                />
                <button
                  type="button"
                  onClick={handleSaveSnapshot}
                  className="shrink-0 rounded border border-neutral-600 bg-neutral-800 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-700"
                >
                  Save
                </button>
              </div>
              {savedSnapshots.length === 0 ? (
                <div className="text-[11px] text-neutral-600">No saved snapshots.</div>
              ) : (
                <div className="max-h-40 space-y-1 overflow-y-auto">
                  {savedSnapshots.map((saved) => (
                    <div
                      key={saved.id}
                      className="flex items-center gap-1 rounded border border-neutral-800 bg-neutral-900/40 px-2 py-1"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[11px] font-medium text-neutral-100">{saved.name}</div>
                        <div className="text-[10px] text-neutral-500">
                          {new Date(saved.savedAt).toLocaleString()}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleLoadSavedSnapshot(saved)}
                        className="shrink-0 rounded border border-neutral-700 bg-neutral-800/60 px-1.5 py-0.5 text-[10px] text-neutral-300 hover:bg-neutral-700"
                      >
                        Load
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteSavedSnapshot(saved.id)}
                        className="shrink-0 rounded border border-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-500 hover:border-rose-800/60 hover:text-rose-400"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </GraphSidebarSection>
        </div>
      )}
      main={(
        <div className="flex h-full flex-col overflow-hidden">
          <div className="border-b border-neutral-800 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-sm font-semibold text-neutral-100">Resolver Workbench</div>
              <span className="rounded border border-neutral-700 bg-neutral-900/40 px-2 py-0.5 text-[11px] text-neutral-300">
                resolver: {parsedRequest?.resolver_id ?? 'invalid'}
              </span>
              <span className="rounded border border-neutral-700 bg-neutral-900/40 px-2 py-0.5 text-[11px] text-neutral-300">
                targets: {targetEntries.length}
              </span>
              {result ? (
                <span className="rounded border border-neutral-700 bg-neutral-900/40 px-2 py-0.5 text-[11px] text-neutral-300">
                  resolved: {Object.keys(result.selected_by_target ?? {}).length}
                </span>
              ) : null}
            </div>
            <div className="mt-1 text-xs text-neutral-500">
              Inspect request → candidates → constraints → result → trace without touching legacy template execution.
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {activeView === 'overview' && (
              <div className="space-y-4">
                <section className="rounded border border-neutral-800 bg-neutral-950/40 p-3">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                    Run Status
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    {requestError ? (
                      <span className="rounded border border-rose-800/60 bg-rose-950/20 px-2 py-1 text-rose-300">
                        Request JSON invalid: {requestError}
                      </span>
                    ) : (
                      <span className="rounded border border-emerald-800/60 bg-emerald-950/20 px-2 py-1 text-emerald-300">
                        Request JSON valid
                      </span>
                    )}
                    {result ? (
                      <span className="rounded border border-neutral-700 bg-neutral-900/50 px-2 py-1 text-neutral-200">
                        Last run: {Object.keys(result.selected_by_target ?? {}).length} selected, {result.warnings?.length ?? 0} warnings
                      </span>
                    ) : (
                      <span className="rounded border border-neutral-700 bg-neutral-900/50 px-2 py-1 text-neutral-400">
                        No run yet
                      </span>
                    )}
                    {runError ? (
                      <span className="rounded border border-rose-800/60 bg-rose-950/20 px-2 py-1 text-rose-300">
                        Remote error: {runError}
                      </span>
                    ) : null}
                  </div>
                </section>

                <section className="rounded border border-neutral-800 bg-neutral-950/40 p-3">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                    Targets & Candidates
                  </div>
                  <div className="space-y-2">
                    {targetEntries.map(([targetKey, candidates]) => (
                      <div key={targetKey} className="rounded border border-neutral-800 bg-neutral-900/30 p-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs font-medium text-neutral-100">{targetKey}</div>
                          <div className="text-[11px] text-neutral-400">{candidates.length} candidates</div>
                        </div>
                        <div className="mt-1 space-y-1">
                          {candidates.slice(0, 3).map((candidate) => (
                            <div key={candidate.block_id} className="rounded border border-neutral-800/80 bg-neutral-950/20 px-2 py-1">
                              <div className="text-[11px] font-medium text-neutral-200">{candidate.block_id}</div>
                              <div className="truncate text-[11px] text-neutral-400">{candidate.text}</div>
                              <TagChips tags={candidate.tags} />
                            </div>
                          ))}
                          {candidates.length > 3 && (
                            <div className="text-[11px] text-neutral-500">+{candidates.length - 3} more…</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded border border-neutral-800 bg-neutral-950/40 p-3">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                    Constraints
                  </div>
                  <div className="space-y-1">
                    {(parsedRequest?.constraints ?? []).map((constraint) => (
                      <div key={constraint.id} className="rounded border border-neutral-800 bg-neutral-900/30 px-2 py-1.5 text-xs text-neutral-200">
                        <span className="font-medium">{constraint.id}</span> · {constraint.kind}
                        {constraint.target_key ? <span className="text-neutral-400"> · {constraint.target_key}</span> : null}
                      </div>
                    ))}
                    {(parsedRequest?.constraints ?? []).length === 0 && (
                      <div className="text-xs text-neutral-500">No constraints in this request.</div>
                    )}
                  </div>
                </section>

                <section className="rounded border border-neutral-800 bg-neutral-950/40 p-3">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                    Result (Selected Blocks)
                  </div>
                  {!result ? (
                    <div className="text-xs text-neutral-500">Run the resolver to populate selections.</div>
                  ) : (
                    <div className="space-y-2">
                      {Object.entries(result.selected_by_target ?? {}).map(([targetKey, selected]) => (
                        <div key={targetKey} className="rounded border border-neutral-800 bg-neutral-900/30 p-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-xs font-medium text-neutral-100">{targetKey}</div>
                            <div className="text-[11px] text-neutral-400">
                              score: {typeof selected.score === 'number' ? selected.score.toFixed(2) : 'n/a'}
                            </div>
                          </div>
                          <div className="mt-1 text-[11px] text-neutral-300">{selected.block_id}</div>
                          {selected.reasons?.length ? (
                            <div className="mt-1 text-[11px] text-neutral-500">
                              {selected.reasons.join(', ')}
                            </div>
                          ) : null}
                        </div>
                      ))}
                      {(result.warnings?.length ?? 0) > 0 && (
                        <div className="rounded border border-amber-800/60 bg-amber-950/20 px-2 py-1.5 text-xs text-amber-200">
                          Warnings: {(result.warnings ?? []).join(' | ')}
                        </div>
                      )}
                    </div>
                  )}
                </section>
              </div>
            )}

            {activeView === 'request' && (
              <JsonPane
                title="ResolutionRequest JSON"
                value={requestText}
                onChange={setRequestText}
                error={requestError}
              />
            )}

            {activeView === 'result' && (
              <JsonPane
                title="ResolutionResult JSON"
                value={result ? safeJson(result) : '{\n  "note": "Run next_v1 to produce a result."\n}'}
                readOnly
              />
            )}

            {activeView === 'trace' && (
              <div className="space-y-2">
                {!result ? (
                  <div className="rounded border border-neutral-800 bg-neutral-950/40 px-3 py-2 text-xs text-neutral-500">
                    Run the resolver to inspect trace events.
                  </div>
                ) : (
                  traceEvents.map((event, idx) => (
                    <div key={`${event.kind}-${idx}`} className="rounded border border-neutral-800 bg-neutral-950/40 p-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded border border-neutral-700 bg-neutral-900/40 px-1.5 py-0.5 text-neutral-200">
                          {event.kind}
                        </span>
                        {event.target_key ? <span className="text-neutral-300">{event.target_key}</span> : null}
                        {event.candidate_block_id ? <span className="text-neutral-500">{event.candidate_block_id}</span> : null}
                        {typeof event.score === 'number' ? (
                          <span className="text-neutral-400">score {event.score.toFixed(2)}</span>
                        ) : null}
                      </div>
                      {event.message ? (
                        <div className="mt-1 text-[11px] text-neutral-300">{event.message}</div>
                      ) : null}
                      {event.data && Object.keys(event.data).length > 0 ? (
                        <pre className="mt-1 overflow-x-auto rounded bg-neutral-950/60 p-2 text-[10px] text-neutral-400">
                          {safeJson(event.data)}
                        </pre>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            )}

            {activeView === 'snapshot' && (
              <JsonPane
                title="Workbench Snapshot JSON"
                value={snapshotText}
                onChange={setSnapshotText}
                error={snapshotError}
              />
            )}
          </div>
        </div>
      )}
    />
  );
}
