import type {
  FlowGraphV1,
  FlowResolveRequest,
  FlowResolveResponse,
  FlowRunStatus,
} from '@pixsim7/shared.types';
import { useEffect, useMemo, useState } from 'react';

import {
  CAP_CHARACTER_CONTEXT,
  CAP_EDITOR_CONTEXT,
  type CharacterContextSummary,
  type EditorContextSnapshot,
  useAuthoringContext,
  useCapability,
} from '@features/contextHub';

import { JourneyTemplateCanvas } from './JourneyTemplateCanvas';
import { loadFlowGraph, resolveFlowGraph } from './loadFlowGraph';

interface ResolveContextFormState {
  project_id: string;
  world_id: string;
  location_id: string;
  active_character_id: string;
  capabilities_csv: string;
  flags_csv: string;
}

interface ActiveContextSnapshot {
  project_id?: string;
  world_id?: string;
  location_id?: string;
  active_character_id?: string;
  derived_flags: string[];
  source: string;
}

interface TemplateRunStats {
  total: number;
  completed: number;
  blocked: number;
  in_progress: number;
  abandoned: number;
}

const DEFAULT_GOAL = 'scene.create';
const DEFAULT_CONTEXT: ResolveContextFormState = {
  project_id: '',
  world_id: '',
  location_id: '',
  active_character_id: '',
  capabilities_csv: 'scene_prep,generation',
  flags_csv: 'room_navigation_enabled',
};

export function JourneysView() {
  const [graph, setGraph] = useState<FlowGraphV1 | null>(null);
  const [graphError, setGraphError] = useState<string | null>(null);
  const [loadingGraph, setLoadingGraph] = useState(true);

  const [goal, setGoal] = useState(DEFAULT_GOAL);
  const [formState, setFormState] = useState<ResolveContextFormState>(DEFAULT_CONTEXT);
  const [useActiveContext, setUseActiveContext] = useState(true);
  const [resolveResult, setResolveResult] = useState<FlowResolveResponse | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [lastResolvePayload, setLastResolvePayload] = useState<FlowResolveRequest | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  const authoringContext = useAuthoringContext();
  const { value: editorContext } = useCapability<EditorContextSnapshot>(CAP_EDITOR_CONTEXT);
  const { value: activeCharacter } = useCapability<CharacterContextSummary>(CAP_CHARACTER_CONTEXT);

  const activeContext = useMemo<ActiveContextSnapshot>(() => {
    const runtimeMode = (editorContext?.runtime?.mode ?? '').toLowerCase();
    const primaryView = (editorContext?.editor?.primaryView ?? '').toLowerCase();
    const derivedFlags: string[] = [];
    if (runtimeMode === 'room' || primaryView === 'room') {
      derivedFlags.push('room_navigation_enabled');
    }

    return {
      project_id: toOptionalString(authoringContext.projectId),
      world_id: toOptionalString(authoringContext.worldId),
      location_id: toOptionalString(editorContext?.world?.locationId),
      active_character_id: toOptionalString(activeCharacter?.characterId),
      derived_flags: derivedFlags,
      source: authoringContext.source,
    };
  }, [
    activeCharacter?.characterId,
    authoringContext.projectId,
    authoringContext.source,
    authoringContext.worldId,
    editorContext?.editor?.primaryView,
    editorContext?.runtime?.mode,
    editorContext?.world?.locationId,
  ]);

  const templateRunStats = useMemo<Record<string, TemplateRunStats>>(() => {
    const stats: Record<string, TemplateRunStats> = {};
    for (const run of graph?.runs ?? []) {
      const current = stats[run.template_id] ?? {
        total: 0,
        completed: 0,
        blocked: 0,
        in_progress: 0,
        abandoned: 0,
      };
      current.total += 1;
      incrementStatus(current, run.status);
      stats[run.template_id] = current;
    }
    return stats;
  }, [graph]);

  const templateNodeLabels = useMemo<Record<string, Record<string, string>>>(() => {
    const labels: Record<string, Record<string, string>> = {};
    for (const template of graph?.templates ?? []) {
      const byId: Record<string, string> = {};
      for (const node of template.nodes ?? []) {
        byId[node.id] = node.label;
      }
      labels[template.id] = byId;
    }
    return labels;
  }, [graph]);

  const selectedTemplate = useMemo(() => {
    const templates = graph?.templates ?? [];
    if (templates.length === 0) return null;
    if (selectedTemplateId) {
      const match = templates.find((template) => template.id === selectedTemplateId);
      if (match) return match;
    }
    return templates[0] ?? null;
  }, [graph?.templates, selectedTemplateId]);

  const candidateByTemplate = useMemo(() => {
    return new Map((resolveResult?.candidate_templates ?? []).map((item) => [item.template_id, item]));
  }, [resolveResult?.candidate_templates]);

  const blockedByTemplate = useMemo(() => {
    return new Map((resolveResult?.blocked_steps ?? []).map((item) => [item.template_id, item]));
  }, [resolveResult?.blocked_steps]);

  const nextStepByTemplate = useMemo(() => {
    return new Map((resolveResult?.next_steps ?? []).map((item) => [item.template_id, item]));
  }, [resolveResult?.next_steps]);

  const latestRunByTemplate = useMemo(() => {
    const runs = graph?.runs ?? [];
    const byTemplate = new Map<string, (typeof runs)[number]>();

    for (const run of runs) {
      const current = byTemplate.get(run.template_id);
      if (!current) {
        byTemplate.set(run.template_id, run);
        continue;
      }
      if (compareRuns(run, current) > 0) {
        byTemplate.set(run.template_id, run);
      }
    }

    return byTemplate;
  }, [graph?.runs]);

  const templateCountLabel = useMemo(() => {
    if (!graph) return '0 templates';
    return `${graph.templates.length} templates`;
  }, [graph]);

  const buildResolvePayload = (): FlowResolveRequest => {
    const capabilities = parseCsv(formState.capabilities_csv);
    const flags = mergeUnique(parseCsv(formState.flags_csv), activeContext.derived_flags);

    return {
      goal: goal.trim() || DEFAULT_GOAL,
      context: {
        project_id: useActiveContext
          ? activeContext.project_id ?? toOptional(formState.project_id)
          : toOptional(formState.project_id),
        world_id: useActiveContext
          ? activeContext.world_id ?? toOptional(formState.world_id)
          : toOptional(formState.world_id),
        location_id: useActiveContext
          ? activeContext.location_id ?? toOptional(formState.location_id)
          : toOptional(formState.location_id),
        active_character_id: useActiveContext
          ? activeContext.active_character_id ?? toOptional(formState.active_character_id)
          : toOptional(formState.active_character_id),
        capabilities,
        flags,
      },
    };
  };

  const runResolve = async () => {
    const payload = buildResolvePayload();
    setLastResolvePayload(payload);

    setResolving(true);
    setResolveError(null);
    try {
      const result = await resolveFlowGraph(payload);
      setResolveResult(result);
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'Failed to resolve flow for the selected context.';
      setResolveError(message);
      setResolveResult(null);
    } finally {
      setResolving(false);
    }
  };

  const copyActiveContextToForm = () => {
    setFormState((prev) => ({
      ...prev,
      project_id: activeContext.project_id ?? prev.project_id,
      world_id: activeContext.world_id ?? prev.world_id,
      location_id: activeContext.location_id ?? prev.location_id,
      active_character_id: activeContext.active_character_id ?? prev.active_character_id,
      flags_csv: mergeUnique(parseCsv(prev.flags_csv), activeContext.derived_flags).join(','),
    }));
  };

  useEffect(() => {
    let active = true;
    setLoadingGraph(true);
    loadFlowGraph()
      .then((result) => {
        if (!active) return;
        setGraph(result.graph);
        setGraphError(result.error ?? null);
      })
      .finally(() => {
        if (!active) return;
        setLoadingGraph(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    void runResolve();
    // Run once on mount with default + active context settings.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedTemplateId && (graph?.templates.length ?? 0) > 0) {
      setSelectedTemplateId(graph?.templates[0]?.id ?? null);
    }
  }, [graph?.templates, selectedTemplateId]);

  useEffect(() => {
    const suggestedTemplateId = resolveResult?.suggested_path?.template_id;
    if (!suggestedTemplateId) return;
    if (!selectedTemplateId) {
      setSelectedTemplateId(suggestedTemplateId);
      return;
    }
    const currentTemplateExists = (graph?.templates ?? []).some(
      (template) => template.id === selectedTemplateId
    );
    if (!currentTemplateExists) {
      setSelectedTemplateId(suggestedTemplateId);
    }
  }, [graph?.templates, resolveResult?.suggested_path?.template_id, selectedTemplateId]);

  return (
    <div className="flex h-full flex-col lg:flex-row bg-white dark:bg-neutral-900">
      <div className="lg:w-[340px] border-b lg:border-b-0 lg:border-r border-neutral-200 dark:border-neutral-700 overflow-y-auto max-h-72 lg:max-h-none">
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Journey Templates
            </h3>
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              {templateCountLabel}
            </span>
          </div>

          {loadingGraph && (
            <div className="text-sm text-neutral-500 dark:text-neutral-400">
              Loading flow templates...
            </div>
          )}

          {graphError && (
            <div className="mb-3 rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-800 dark:border-yellow-900/40 dark:bg-yellow-900/20 dark:text-yellow-200">
              {graphError}
            </div>
          )}

          <div className="space-y-2">
            {(graph?.templates ?? []).map((template) => {
              const stats = templateRunStats[template.id];
              const isSelected = selectedTemplate?.id === template.id;
              return (
                <button
                  type="button"
                  key={template.id}
                  onClick={() => setSelectedTemplateId(template.id)}
                  className={`w-full text-left rounded-md border p-3 transition-colors ${
                    isSelected
                      ? 'border-blue-400 bg-blue-50 dark:border-blue-500 dark:bg-blue-900/20'
                      : 'border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                      {template.label}
                    </div>
                    {isSelected ? (
                      <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200">
                        active
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                    <code>{template.id}</code>
                  </div>
                  <div className="mt-2 text-xs text-neutral-600 dark:text-neutral-300">
                    Domain: <span className="font-medium">{template.domain}</span>
                  </div>
                  {stats?.total ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge label={`runs ${stats.total}`} tone="neutral" />
                      {stats.completed > 0 && (
                        <Badge label={`completed ${stats.completed}`} tone="green" />
                      )}
                      {stats.blocked > 0 && (
                        <Badge label={`blocked ${stats.blocked}`} tone="red" />
                      )}
                      {stats.in_progress > 0 && (
                        <Badge label={`in-progress ${stats.in_progress}`} tone="blue" />
                      )}
                      {stats.abandoned > 0 && (
                        <Badge label={`abandoned ${stats.abandoned}`} tone="neutral" />
                      )}
                    </div>
                  ) : null}
                </button>
              );
            })}
            {!loadingGraph && (graph?.templates.length ?? 0) === 0 && (
              <div className="text-sm text-neutral-500 dark:text-neutral-400">
                No templates available.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        <section className="space-y-3 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white/70 dark:bg-neutral-900/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
              Template Graph
            </h3>
            <label className="text-xs font-medium uppercase text-neutral-500 dark:text-neutral-400">
              Active Template
              <select
                value={selectedTemplate?.id ?? ''}
                onChange={(event) => setSelectedTemplateId(event.target.value || null)}
                disabled={(graph?.templates.length ?? 0) === 0}
                className="ml-2 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 px-2 py-1 text-xs text-neutral-900 dark:text-neutral-100"
              >
                {(graph?.templates ?? []).map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <JourneyTemplateCanvas
            template={selectedTemplate}
            candidate={selectedTemplate ? candidateByTemplate.get(selectedTemplate.id) : undefined}
            nextStep={selectedTemplate ? nextStepByTemplate.get(selectedTemplate.id) : undefined}
            blockedStep={selectedTemplate ? blockedByTemplate.get(selectedTemplate.id) : undefined}
            suggestedPath={
              resolveResult?.suggested_path?.template_id === selectedTemplate?.id
                ? resolveResult?.suggested_path
                : undefined
            }
            latestRun={selectedTemplate ? latestRunByTemplate.get(selectedTemplate.id) : undefined}
          />
        </section>

        <section className="space-y-3 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white/70 dark:bg-neutral-900/40 p-4">
          <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
            Context Resolver
          </h3>

          <div className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 p-3 text-xs text-neutral-700 dark:text-neutral-300">
            <div className="font-medium text-neutral-900 dark:text-neutral-100 mb-2">
              Active App Context
            </div>
            <div>source: {activeContext.source}</div>
            <div>project: {activeContext.project_id ?? '-'}</div>
            <div>world: {activeContext.world_id ?? '-'}</div>
            <div>location: {activeContext.location_id ?? '-'}</div>
            <div>character: {activeContext.active_character_id ?? '-'}</div>
            <div>derived flags: {activeContext.derived_flags.join(',') || '-'}</div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <InputField label="Goal" value={goal} onChange={setGoal} placeholder="scene.create" />
            <InputField
              label="Project ID"
              value={formState.project_id}
              onChange={(value) => setFormState((prev) => ({ ...prev, project_id: value }))}
              placeholder="optional"
            />
            <InputField
              label="World ID"
              value={formState.world_id}
              onChange={(value) => setFormState((prev) => ({ ...prev, world_id: value }))}
              placeholder="optional"
            />
            <InputField
              label="Location ID"
              value={formState.location_id}
              onChange={(value) => setFormState((prev) => ({ ...prev, location_id: value }))}
              placeholder="optional"
            />
            <InputField
              label="Active Character ID"
              value={formState.active_character_id}
              onChange={(value) =>
                setFormState((prev) => ({ ...prev, active_character_id: value }))
              }
              placeholder="optional"
            />
            <InputField
              label="Capabilities (CSV)"
              value={formState.capabilities_csv}
              onChange={(value) =>
                setFormState((prev) => ({ ...prev, capabilities_csv: value }))
              }
              placeholder="scene_prep,generation"
            />
            <InputField
              label="Flags (CSV)"
              value={formState.flags_csv}
              onChange={(value) => setFormState((prev) => ({ ...prev, flags_csv: value }))}
              placeholder="room_navigation_enabled"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
              <input
                type="checkbox"
                checked={useActiveContext}
                onChange={(event) => setUseActiveContext(event.target.checked)}
                className="rounded border-neutral-400"
              />
              Use active app context
            </label>
            <button
              type="button"
              onClick={copyActiveContextToForm}
              className="px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-sm text-neutral-800 dark:text-neutral-200 rounded-md transition-colors"
            >
              Copy Active IDs
            </button>
            <button
              type="button"
              onClick={() => {
                void runResolve();
              }}
              disabled={resolving}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white text-sm font-medium rounded-md transition-colors"
            >
              {resolving ? 'Resolving...' : 'What can I do next?'}
            </button>
          </div>

          {resolveError && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200">
              {resolveError}
            </div>
          )}
        </section>

        <section className="space-y-3 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white/70 dark:bg-neutral-900/40 p-4">
          <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
            Resolve Output
          </h3>
          {!resolveResult && (
            <div className="text-sm text-neutral-500 dark:text-neutral-400">
              Run resolve to see candidate templates and context-aware steps.
            </div>
          )}
          {resolveResult && (
            <div className="space-y-4">
              {lastResolvePayload?.context && (
                <div className="rounded-md border border-neutral-200 dark:border-neutral-700 p-4 bg-neutral-50 dark:bg-neutral-800">
                  <div className="text-xs uppercase text-neutral-500 dark:text-neutral-400 mb-2">
                    Context Used
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-neutral-700 dark:text-neutral-300">
                    <div>project: {lastResolvePayload.context.project_id ?? '-'}</div>
                    <div>world: {lastResolvePayload.context.world_id ?? '-'}</div>
                    <div>location: {lastResolvePayload.context.location_id ?? '-'}</div>
                    <div>character: {lastResolvePayload.context.active_character_id ?? '-'}</div>
                    <div>
                      capabilities:{' '}
                      {(lastResolvePayload.context.capabilities ?? []).join(',') || '-'}
                    </div>
                    <div>flags: {(lastResolvePayload.context.flags ?? []).join(',') || '-'}</div>
                  </div>
                </div>
              )}

              <div className="rounded-md border border-neutral-200 dark:border-neutral-700 p-4 bg-neutral-50 dark:bg-neutral-800">
                <div className="text-xs uppercase text-neutral-500 dark:text-neutral-400 mb-2">
                  Candidate Templates
                </div>
                <div className="space-y-2">
                  {resolveResult.candidate_templates.map((candidate) => (
                    <div
                      key={candidate.template_id}
                      className="flex items-start justify-between gap-3 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-3"
                    >
                      <div>
                        <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                          {candidate.label}
                        </div>
                        <div className="text-xs text-neutral-500 dark:text-neutral-400">
                          <code>{candidate.template_id}</code>
                        </div>
                        {candidate.blocked_reason && (
                          <div className="mt-1 text-xs text-red-600 dark:text-red-300">
                            {candidate.blocked_reason}
                          </div>
                        )}
                      </div>
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${
                          candidate.status === 'ready'
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                            : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                        }`}
                      >
                        {candidate.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-md border border-neutral-200 dark:border-neutral-700 p-4 bg-neutral-50 dark:bg-neutral-800">
                <div className="text-xs uppercase text-neutral-500 dark:text-neutral-400 mb-2">
                  Next Steps
                </div>
                <div className="space-y-2">
                  {resolveResult.next_steps.map((step) => (
                    <div
                      key={`${step.template_id}:${step.node_id}`}
                      className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-3"
                    >
                      <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                        {step.label}
                      </div>
                      <div className="text-xs text-neutral-500 dark:text-neutral-400">
                        <code>{step.template_id}</code> | {step.kind}
                      </div>
                    </div>
                  ))}
                  {resolveResult.next_steps.length === 0 && (
                    <div className="text-sm text-neutral-500 dark:text-neutral-400">
                      No immediate next steps available in this context.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-md border border-neutral-200 dark:border-neutral-700 p-4 bg-neutral-50 dark:bg-neutral-800">
                <div className="text-xs uppercase text-neutral-500 dark:text-neutral-400 mb-2">
                  Blocked Steps
                </div>
                <div className="space-y-2">
                  {resolveResult.blocked_steps.map((blocked) => (
                    <div
                      key={`${blocked.template_id}:${blocked.edge_id}`}
                      className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-3"
                    >
                      <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                        {blocked.label}
                      </div>
                      <div className="text-xs text-neutral-500 dark:text-neutral-400">
                        <code>{blocked.reason_code}</code> | {blocked.reason}
                      </div>
                    </div>
                  ))}
                  {resolveResult.blocked_steps.length === 0 && (
                    <div className="text-sm text-neutral-500 dark:text-neutral-400">
                      No blocked steps in current context.
                    </div>
                  )}
                </div>
              </div>

              {resolveResult.suggested_path && (
                <div className="rounded-md border border-neutral-200 dark:border-neutral-700 p-4 bg-neutral-50 dark:bg-neutral-800">
                  <div className="text-xs uppercase text-neutral-500 dark:text-neutral-400 mb-2">
                    Suggested Path
                  </div>
                  <div className="text-sm text-neutral-900 dark:text-neutral-100 mb-1">
                    <code>{resolveResult.suggested_path.template_id}</code>
                  </div>
                  <div className="text-xs text-neutral-600 dark:text-neutral-300">
                    {resolveResult.suggested_path.node_ids
                      .map(
                        (nodeId) =>
                          templateNodeLabels[resolveResult.suggested_path?.template_id ?? '']?.[
                            nodeId
                          ] ?? nodeId
                      )
                      .join(' -> ')}
                  </div>
                  {resolveResult.suggested_path.blocked &&
                    resolveResult.suggested_path.blocked_reason && (
                      <div className="mt-2 text-xs text-red-600 dark:text-red-300">
                        {resolveResult.suggested_path.blocked_reason}
                      </div>
                    )}
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function InputField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium uppercase text-neutral-500 dark:text-neutral-400">
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100"
      />
    </label>
  );
}

function Badge({
  label,
  tone,
}: {
  label: string;
  tone: 'neutral' | 'green' | 'red' | 'blue';
}) {
  const toneClass =
    tone === 'green'
      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
      : tone === 'red'
        ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
        : tone === 'blue'
          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
          : 'bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200';

  return <span className={`text-[11px] px-2 py-0.5 rounded ${toneClass}`}>{label}</span>;
}

function incrementStatus(
  stats: TemplateRunStats,
  status: FlowRunStatus
) {
  if (status === 'completed') stats.completed += 1;
  else if (status === 'blocked') stats.blocked += 1;
  else if (status === 'abandoned') stats.abandoned += 1;
  else stats.in_progress += 1;
}

function compareRuns(
  a: { started_at: string; ended_at?: string; last_node_id?: string },
  b: { started_at: string; ended_at?: string; last_node_id?: string }
): number {
  const byStartedAt = toEpochMs(a.started_at) - toEpochMs(b.started_at);
  if (byStartedAt !== 0) return byStartedAt;

  const byEndedAt = toEpochMs(a.ended_at) - toEpochMs(b.ended_at);
  if (byEndedAt !== 0) return byEndedAt;

  return (a.last_node_id ?? '').localeCompare(b.last_node_id ?? '');
}

function toEpochMs(value?: string): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseCsv(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function mergeUnique(primary: string[], secondary: string[]): string[] {
  return Array.from(new Set([...primary, ...secondary]));
}

function toOptional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function toOptionalString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return toOptional(value);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}
