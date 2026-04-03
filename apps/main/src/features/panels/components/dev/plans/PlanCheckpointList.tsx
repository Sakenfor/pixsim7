import { Badge, SectionHeader } from '@pixsim7/shared.ui';
import { useCallback, useState } from 'react';

import { Icon } from '@lib/icons';

export interface CheckpointStep {
  id?: string;
  label: string;
  done: boolean;
  tests?: string[];
}

export interface CheckpointEvidence {
  kind: string;
  ref: string;
}

export interface CheckpointLastUpdate {
  at: string;
  by: string;
  note: string;
}

export interface Checkpoint {
  id: string;
  label: string;
  status: 'done' | 'active' | 'pending' | 'blocked';
  /** Legacy field — prefer description + note */
  criteria?: string;
  description?: string | null;
  note?: string | null;
  lastUpdate?: CheckpointLastUpdate | null;
  progress?: number;
  pointsDone?: number;
  pointsTotal?: number;
  points_done?: number;
  points_total?: number;
  steps?: CheckpointStep[];
  evidence?: CheckpointEvidence[];
}

const EVIDENCE_PREVIEW_COUNT = 3;
const EVIDENCE_KIND_ORDER: Record<string, number> = {
  git_commit: 0,
  test_suite: 1,
  file_path: 2,
};

type EvidenceGroup = {
  kind: string;
  label: string;
  color: 'blue' | 'green' | 'gray';
  items: CheckpointEvidence[];
};

function toNonNegativeNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return null;
}

// eslint-disable-next-line react-refresh/only-export-components
export function getCheckpointPointProgress(checkpoint: Checkpoint): { done: number; total: number } | null {
  const pointsDone = toNonNegativeNumber(checkpoint.pointsDone ?? checkpoint.points_done);
  const pointsTotal = toNonNegativeNumber(checkpoint.pointsTotal ?? checkpoint.points_total);
  if (pointsDone === null && pointsTotal === null) {
    return null;
  }
  const done = pointsDone ?? 0;
  const total = Math.max(pointsTotal ?? done, done);
  if (total <= 0) {
    return null;
  }
  return { done, total };
}

function evidenceKindLabel(kind: string): string {
  if (kind === 'git_commit') return 'Commits';
  if (kind === 'test_suite') return 'Suites';
  if (kind === 'file_path') return 'Files';
  return kind.replace(/_/g, ' ');
}

function evidenceKindColor(kind: string): 'blue' | 'green' | 'gray' {
  if (kind === 'git_commit') return 'blue';
  if (kind === 'test_suite') return 'green';
  return 'gray';
}

function basenameFromPath(path: string): string {
  const segments = path.split(/[\\/]/).filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1]! : path;
}

function groupCheckpointEvidence(evidence: CheckpointEvidence[]): EvidenceGroup[] {
  const grouped = new Map<string, CheckpointEvidence[]>();
  for (const item of evidence) {
    const kind = (item.kind || 'file_path').trim() || 'file_path';
    if (!grouped.has(kind)) {
      grouped.set(kind, []);
    }
    grouped.get(kind)!.push(item);
  }

  const kinds = [...grouped.keys()].sort((a, b) => {
    const orderA = EVIDENCE_KIND_ORDER[a] ?? 99;
    const orderB = EVIDENCE_KIND_ORDER[b] ?? 99;
    if (orderA !== orderB) return orderA - orderB;
    return a.localeCompare(b);
  });

  return kinds.map((kind) => ({
    kind,
    label: evidenceKindLabel(kind),
    color: evidenceKindColor(kind),
    items: [...(grouped.get(kind) ?? [])].reverse(),
  }));
}

export function CheckpointList({
  checkpoints,
  forgeUrlTemplate,
}: {
  checkpoints: Checkpoint[];
  forgeUrlTemplate?: string | null;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(checkpoints.filter((cp) => cp.status === 'active').map((cp) => cp.id)),
  );
  const [expandedEvidenceGroups, setExpandedEvidenceGroups] = useState<Set<string>>(new Set());

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleEvidenceGroup = useCallback((key: string) => {
    setExpandedEvidenceGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  return (
    <div>
      <SectionHeader>Checkpoints</SectionHeader>
      <div className="mt-2 space-y-1">
        {checkpoints.map((cp, cpIdx) => {
          const checkpointKey = `${cp.id}:${cpIdx}`;
          const cpSteps = cp.steps ?? [];
          const cpPointProgress = getCheckpointPointProgress(cp);
          const cpDone = cpPointProgress?.done ?? cpSteps.filter((s) => s.done).length;
          const cpTotal = cpPointProgress?.total ?? cpSteps.length;
          const cpUnit = cpPointProgress ? 'pts' : 'steps';
          const cpPct = cpTotal > 0 ? Math.round((cpDone / cpTotal) * 100) : (cp.status === 'done' ? 100 : 0);
          const isOpen = expanded.has(cp.id);
          const cpEvidence = cp.evidence ?? [];
          const cpEvidenceGroups = groupCheckpointEvidence(cpEvidence);
          const cpDescription = cp.description || cp.criteria || null;
          const hasContent = !!cpDescription || !!cp.note || !!cp.lastUpdate || cpSteps.length > 0 || cpEvidence.length > 0;

          return (
            <div
              key={checkpointKey}
              className={`rounded-md border overflow-hidden ${
                cp.status === 'active'
                  ? 'border-green-300 dark:border-green-700'
                  : cp.status === 'done'
                    ? 'border-neutral-200 dark:border-neutral-700 opacity-75'
                    : 'border-neutral-200 dark:border-neutral-700'
              }`}
            >
              <button
                onClick={() => hasContent && toggle(cp.id)}
                className={`w-full px-3 py-1.5 bg-neutral-50 dark:bg-neutral-900 flex items-center gap-2 text-left ${hasContent ? 'cursor-pointer' : 'cursor-default'}`}
              >
                {hasContent && (
                  <Icon
                    name="chevronRight"
                    size={10}
                    className={`text-neutral-400 transition-transform flex-shrink-0 ${isOpen ? 'rotate-90' : ''}`}
                  />
                )}
                <Badge
                  color={cp.status === 'done' ? 'green' : cp.status === 'active' ? 'blue' : cp.status === 'blocked' ? 'red' : 'gray'}
                  className="text-[10px]"
                >
                  {cp.status}
                </Badge>
                <span className="font-medium text-sm text-neutral-800 dark:text-neutral-200 flex-1 truncate">{cp.label}</span>
                {cpEvidence.length > 0 && (
                  <Badge color="gray" className="text-[9px] hidden sm:inline-flex">
                    {cpEvidence.length} evidence
                  </Badge>
                )}
                {cpTotal > 0 && (
                  <span className="text-[10px] text-neutral-400 flex-shrink-0">{cpDone}/{cpTotal} {cpUnit} ({cpPct}%)</span>
                )}
              </button>

              {cpTotal > 0 && (
                <div className="h-1 bg-neutral-200 dark:bg-neutral-800">
                  <div
                    className={`h-full transition-all ${cp.status === 'done' ? 'bg-green-500' : 'bg-blue-500'}`}
                    style={{ width: `${cpPct}%` }}
                  />
                </div>
              )}

              {isOpen && (
                <>
                  {cpDescription && (
                    <div className="px-3 py-1.5 text-[11px] text-neutral-600 dark:text-neutral-300 border-t border-neutral-100 dark:border-neutral-800">
                      {cpDescription}
                    </div>
                  )}

                  {cp.note && (
                    <div className="px-3 py-1.5 text-[11px] text-neutral-500 dark:text-neutral-400 border-t border-neutral-100 dark:border-neutral-800 whitespace-pre-wrap">
                      {cp.note}
                    </div>
                  )}

                  {cp.lastUpdate && (
                    <div className="px-3 py-1.5 border-t border-neutral-100 dark:border-neutral-800">
                      <div className="text-[10px] text-neutral-400 mb-0.5">
                        Last update by {cp.lastUpdate.by} &middot; {new Date(cp.lastUpdate.at).toLocaleDateString()}
                      </div>
                      {cp.lastUpdate.note && (
                        <div className="text-[11px] text-neutral-500 dark:text-neutral-400 whitespace-pre-wrap">
                          {cp.lastUpdate.note}
                        </div>
                      )}
                    </div>
                  )}

                  {cpSteps.length > 0 && (
                    <div className="px-3 py-2 space-y-1">
                      {cpSteps.map((step, stepIdx) => {
                        const stepKey = step.id?.trim()
                          ? `id:${step.id}`
                          : `idx:${stepIdx}:${step.label}`;
                        return (
                          <div key={`${checkpointKey}:${stepKey}`} className="flex items-start gap-2 text-xs">
                            <span className={`mt-0.5 ${step.done ? 'text-green-500' : 'text-neutral-400'}`}>
                              {step.done ? '\u2713' : '\u25CB'}
                            </span>
                            <span className={step.done ? 'text-neutral-500 line-through' : 'text-neutral-700 dark:text-neutral-300'}>
                              {step.label}
                            </span>
                            {step.tests && step.tests.length > 0 && (
                              <span className="ml-auto flex gap-1">
                                {step.tests.map((t, testIdx) => (
                                  <Badge key={`${checkpointKey}:${stepKey}:test:${t}:${testIdx}`} color="purple" className="text-[9px]">{t}</Badge>
                                ))}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {cpEvidence.length > 0 && (
                    <div className="px-3 py-2 border-t border-neutral-100 dark:border-neutral-800">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="text-[10px] text-neutral-500 font-medium">
                          Evidence Summary
                        </div>
                        <Badge color="gray" className="text-[9px]">
                          {cpEvidence.length} refs
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-1 mb-2">
                        {cpEvidenceGroups.map((group) => (
                          <Badge key={`${checkpointKey}:summary:${group.kind}`} color={group.color} className="text-[9px]">
                            {group.label} {group.items.length}
                          </Badge>
                        ))}
                      </div>
                      <div className="space-y-2">
                        {cpEvidenceGroups.map((group) => {
                          const evidenceGroupKey = `${checkpointKey}:group:${group.kind}`;
                          const isGroupExpanded = expandedEvidenceGroups.has(evidenceGroupKey);
                          const visibleItems = isGroupExpanded
                            ? group.items
                            : group.items.slice(0, EVIDENCE_PREVIEW_COUNT);
                          const hiddenCount = Math.max(0, group.items.length - visibleItems.length);

                          return (
                            <div
                              key={evidenceGroupKey}
                              className="rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50/70 dark:bg-neutral-900/40 p-2"
                            >
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <div className="flex items-center gap-1.5">
                                  <Badge color={group.color} className="text-[9px]">
                                    {group.label}
                                  </Badge>
                                  <span className="text-[10px] text-neutral-400">{group.items.length}</span>
                                </div>
                                {group.items.length > EVIDENCE_PREVIEW_COUNT && (
                                  <button
                                    type="button"
                                    onClick={() => toggleEvidenceGroup(evidenceGroupKey)}
                                    className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline"
                                  >
                                    {isGroupExpanded ? 'Show less' : `Show ${hiddenCount} more`}
                                  </button>
                                )}
                              </div>
                              <div className="space-y-1">
                                {visibleItems.map((ev, evIdx) => {
                                  const commitUrl =
                                    ev.kind === 'git_commit' && forgeUrlTemplate
                                      ? forgeUrlTemplate.replace('{sha}', ev.ref)
                                      : null;
                                  const fileName = ev.kind === 'file_path' ? basenameFromPath(ev.ref) : null;
                                  return (
                                    <div
                                      key={`${evidenceGroupKey}:${ev.kind}:${ev.ref}:${evIdx}`}
                                      className="flex items-center gap-1.5 text-[11px] min-w-0"
                                    >
                                      {commitUrl ? (
                                        <a
                                          href={commitUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-blue-600 dark:text-blue-400 hover:underline font-mono text-[10px]"
                                          title={ev.ref}
                                        >
                                          {ev.ref.slice(0, 7)}
                                        </a>
                                      ) : ev.kind === 'file_path' && fileName ? (
                                        <>
                                          <code className="text-neutral-700 dark:text-neutral-200 font-mono text-[10px]" title={ev.ref}>
                                            {fileName}
                                          </code>
                                          <span className="text-[10px] text-neutral-400 truncate" title={ev.ref}>
                                            {ev.ref}
                                          </span>
                                        </>
                                      ) : (
                                        <code
                                          className="text-neutral-600 dark:text-neutral-300 font-mono text-[10px]"
                                          title={ev.ref}
                                        >
                                          {ev.kind === 'git_commit' ? ev.ref.slice(0, 7) : ev.ref}
                                        </code>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

