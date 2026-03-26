/**
 * PlanDetailSections — read-only detail sections below the header:
 * participants, target, checkpoints, tags, code paths, companions, handoffs,
 * dependencies, test coverage, plan markdown, and source preview.
 *
 * Extracted from PlansPanel.tsx during split — no logic changes.
 */

import {
  Badge,
  DisclosureSection,
  SectionHeader,
} from '@pixsim7/shared.ui';

import { Icon } from '@lib/icons';

import { CheckpointList } from '../PlanCheckpointList';
import { ParticipantEntry } from './shared';
import type {
  PlanDetail,
  PlanParticipant,
  PlanParticipantsResponse,
  PlanSourcePreviewResponse,
  SourceRefMatch,
} from './types';

export interface PlanDetailSectionsProps {
  detail: PlanDetail;
  forgeUrlTemplate?: string | null;
  loadingParticipants: boolean;
  planParticipants: PlanParticipantsResponse | null;
  reviewerParticipants: PlanParticipant[];
  builderParticipants: PlanParticipant[];
  reviewProfileLabels: ReadonlyMap<string, string>;
  coverage: {
    code_paths: string[];
    explicit_suites: string[];
    auto_discovered: { suite_id: string; suite_label: string; kind: string | null; matched_paths: string[] }[];
  } | null;
  planExpanded: boolean;
  onTogglePlanExpanded: () => void;
  onNavigatePlan?: (planId: string) => void;
  sourcePreview: {
    nodeId: string;
    ref: SourceRefMatch;
    data: PlanSourcePreviewResponse;
  } | null;
  sourcePreviewError: {
    nodeId: string;
    message: string;
  } | null;
  onClearSourcePreview: () => void;
}

export function PlanDetailSections({
  detail,
  forgeUrlTemplate,
  loadingParticipants,
  planParticipants,
  reviewerParticipants,
  builderParticipants,
  reviewProfileLabels,
  coverage,
  planExpanded,
  onTogglePlanExpanded,
}: PlanDetailSectionsProps) {
  return (
    <>
      {(loadingParticipants || (planParticipants?.participants.length ?? 0) > 0) && (
        <div className="rounded-md border border-neutral-200 dark:border-neutral-700 p-3">
          <SectionHeader
            trailing={(
              <span className="text-[10px] text-neutral-400">
                {loadingParticipants
                  ? 'Refreshing...'
                  : `${planParticipants?.participants.length ?? 0} tracked`}
              </span>
            )}
          >
            Participants
          </SectionHeader>
          {!loadingParticipants && (planParticipants?.participants.length ?? 0) === 0 ? (
            <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              No attributed participants yet.
            </div>
          ) : (
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <div className="text-[11px] font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Builders ({builderParticipants.length})
                </div>
                <div className="space-y-1">
                  {builderParticipants.map((participant) => (
                    <ParticipantEntry
                      key={participant.id}
                      participant={participant}
                      profileLabels={reviewProfileLabels}
                    />
                  ))}
                  {builderParticipants.length === 0 && (
                    <div className="text-[11px] text-neutral-400">None</div>
                  )}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Reviewers ({reviewerParticipants.length})
                </div>
                <div className="space-y-1">
                  {reviewerParticipants.map((participant) => (
                    <ParticipantEntry
                      key={participant.id}
                      participant={participant}
                      profileLabels={reviewProfileLabels}
                    />
                  ))}
                  {reviewerParticipants.length === 0 && (
                    <div className="text-[11px] text-neutral-400">None</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Target */}
      {detail.target && (
        <div className="rounded-md border border-neutral-200 dark:border-neutral-700 p-3">
          <SectionHeader>Target</SectionHeader>
          <div className="mt-1 flex items-center gap-2 text-xs">
            <Badge color="blue" className="text-[10px]">{detail.target.type}</Badge>
            <span className="font-medium text-neutral-700 dark:text-neutral-300">{detail.target.id}</span>
          </div>
          <div className="text-xs text-neutral-500 mt-1">{detail.target.description}</div>
          {detail.target.paths && detail.target.paths.length > 0 && (
            <div className="mt-1 space-y-0.5">
              {detail.target.paths.map((p) => (
                <div key={p} className="text-[10px] text-neutral-400 font-mono">{p}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Checkpoints */}
      {detail.checkpoints && detail.checkpoints.length > 0 && (
        <CheckpointList checkpoints={detail.checkpoints} forgeUrlTemplate={forgeUrlTemplate} />
      )}

      {/* Tags */}
      {detail.tags.length > 0 && (
        <div>
          <SectionHeader>Tags</SectionHeader>
          <div className="flex flex-wrap gap-1 mt-1">
            {detail.tags.map((tag) => (
              <Badge key={tag} color="gray" className="text-[10px]">{tag}</Badge>
            ))}
          </div>
        </div>
      )}

      {/* Code paths */}
      {detail.codePaths.length > 0 && (
        <div>
          <SectionHeader>Code Paths ({detail.codePaths.length})</SectionHeader>
          <div className="mt-1 space-y-0.5">
            {detail.codePaths.map((p) => (
              <div key={p} className="text-xs text-neutral-600 dark:text-neutral-400 font-mono">
                {p}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Companions & Handoffs & Dependencies */}
      {(detail.companions.length > 0 || detail.handoffs.length > 0 || detail.dependsOn.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {detail.companions.length > 0 && (
            <div>
              <SectionHeader>Companions ({detail.companions.length})</SectionHeader>
              <div className="mt-1 space-y-0.5">
                {detail.companions.map((c) => (
                  <div key={c} className="text-xs text-neutral-600 dark:text-neutral-400">{c}</div>
                ))}
              </div>
            </div>
          )}
          {detail.handoffs.length > 0 && (
            <div>
              <SectionHeader>Handoffs ({detail.handoffs.length})</SectionHeader>
              <div className="mt-1 space-y-0.5">
                {detail.handoffs.map((h) => (
                  <div key={h} className="text-xs text-neutral-600 dark:text-neutral-400">{h}</div>
                ))}
              </div>
            </div>
          )}
          {detail.dependsOn.length > 0 && (
            <div>
              <SectionHeader>Depends On</SectionHeader>
              <div className="mt-1 space-y-0.5">
                {detail.dependsOn.map((d) => (
                  <div key={d} className="text-xs text-neutral-600 dark:text-neutral-400">{d}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sub-plans moved to lineage bar at top */}

      {/* Test Coverage */}
      {coverage && (coverage.explicit_suites.length > 0 || coverage.auto_discovered.length > 0) && (
        <DisclosureSection
          label="Test Coverage"
          defaultOpen={false}
          className="rounded-md border border-neutral-200 dark:border-neutral-700 p-3"
          contentClassName="space-y-2 mt-2"
          badge={
            <span className="text-[10px] text-neutral-400">
              {coverage.explicit_suites.length + coverage.auto_discovered.length} suite{coverage.explicit_suites.length + coverage.auto_discovered.length !== 1 ? 's' : ''}
            </span>
          }
        >
          {coverage.explicit_suites.length > 0 && (
            <div>
              <div className="text-[10px] font-medium text-neutral-500 dark:text-neutral-400 mb-1">
                Linked suites
              </div>
              <div className="flex flex-wrap gap-1">
                {coverage.explicit_suites.map((id) => (
                  <Badge key={id} color="purple" className="text-[9px]">{id}</Badge>
                ))}
              </div>
            </div>
          )}
          {coverage.auto_discovered.length > 0 && (
            <div>
              <div className="text-[10px] font-medium text-neutral-500 dark:text-neutral-400 mb-1">
                Auto-discovered ({coverage.auto_discovered.length})
              </div>
              <div className="space-y-1">
                {coverage.auto_discovered.map((suite) => (
                  <div key={suite.suite_id} className="flex items-start gap-2 text-[11px]">
                    <Badge color="green" className="text-[9px] shrink-0">{suite.kind || 'test'}</Badge>
                    <div className="min-w-0">
                      <span className="font-medium text-neutral-700 dark:text-neutral-300">{suite.suite_label}</span>
                      {suite.matched_paths.length > 0 && (
                        <div className="text-[9px] text-neutral-400 truncate">
                          {suite.matched_paths[0]}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {coverage.code_paths.length > 0 && (
            <div className="text-[9px] text-neutral-400 mt-1">
              Scanning {coverage.code_paths.length} code path{coverage.code_paths.length !== 1 ? 's' : ''}
            </div>
          )}
        </DisclosureSection>
      )}

      {/* Plan markdown - collapsed by default */}
      {detail.markdown && (
        <div>
          <button
            onClick={onTogglePlanExpanded}
            className="flex items-center gap-1.5 w-full text-left group"
          >
            <Icon
              name="chevronRight"
              size={12}
              className={`text-neutral-400 transition-transform ${planExpanded ? 'rotate-90' : ''}`}
            />
            <SectionHeader
              trailing={
                <code className="text-[10px] text-neutral-400">{detail.planPath}</code>
              }
            >
              Full Plan
            </SectionHeader>
          </button>
          {planExpanded && (
            <pre className="mt-2 p-3 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md text-xs whitespace-pre-wrap overflow-auto max-h-[32rem] leading-relaxed">
              {detail.markdown}
            </pre>
          )}
        </div>
      )}
    </>
  );
}
