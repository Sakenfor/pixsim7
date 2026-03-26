/**
 * PlanAgentTasksSection — the "Agent Tasks" DisclosureSection and all its
 * inner content: iterations list, new iteration form, selected iteration state
 * form, agent tasks/requests, dispatch tick, new task form, discussion, and
 * compose form.
 *
 * Extracted from PlansPanel.tsx during split — no logic changes.
 */

import {
  Badge,
  Button,
  DisclosureSection,
} from '@pixsim7/shared.ui';
import type React from 'react';

import { formatActorLabel } from '@lib/identity/actorDisplay';

import { PlanReviewDiscussion } from '../PlanReviewDiscussion';
import { PlanReviewRequestCard } from '../PlanReviewRequestCard';
import { PlanReviewRequestForm } from '../PlanReviewRequestForm';
import { PlanReviewResponseForm } from '../PlanReviewResponseForm';

import type {
  AgentSessionSnapshot,
  PlanReviewAssignee,
  PlanReviewGraphResponse,
  PlanReviewLink,
  PlanReviewNode,
  PlanReviewRound,
  PlanRequest,
  PlanSourcePreviewResponse,
  ReviewAgentProfileEntry,
  ReviewAuthorRole,
  ReviewNodeKind,
  ReviewRequestMode,
  ReviewRequestQueuePolicy,
  ReviewRoundStatus,
  SourceRefMatch,
} from './types';
import {
  buildAssigneeOptionValue,
  extractSourceRefs,
  formatDateTime,
  formatReviewRelation,
  REVIEW_AUTHOR_ROLE_COLORS,
  REVIEW_REQUEST_DISPATCH_COLORS,
  REVIEW_REQUEST_STATUS_COLORS,
  ITERATION_STATUS_LABELS,
  REVIEW_ROUND_STATUS_COLORS,
  REVIEW_SEVERITY_COLORS,
} from './types';

// =============================================================================
// Props
// =============================================================================

export interface PlanAgentTasksSectionProps {
  // Graph state
  reviewGraph: PlanReviewGraphResponse | null;
  loadingReviews: boolean;
  reviewError: string;
  reviewNotice: string | null;

  // Rounds
  reviewRounds: PlanReviewRound[];
  selectedRoundId: string;
  selectedRound: PlanReviewRound | null;
  reviewNodeCountByRound: Map<string, number>;
  reviewProfileLabels: ReadonlyMap<string, string>;
  onSelectRound: (roundId: string) => void;
  onLoadReviewGraph: () => Promise<void>;

  // New round form
  newRoundNote: string;
  creatingRound: boolean;
  showClosedIterations: boolean;
  onToggleShowClosed: () => void;
  onNewRoundNoteChange: (value: string) => void;
  onCreateRound: () => void;
  onCloseRound?: (round: PlanReviewRound) => void | Promise<void>;

  // Selected round state form
  roundStatusDraft: ReviewRoundStatus;
  roundNoteDraft: string;
  roundConclusionDraft: string;
  updatingRound: boolean;
  onRoundStatusDraftChange: (status: ReviewRoundStatus) => void;
  onRoundNoteDraftChange: (value: string) => void;
  onRoundConclusionDraftChange: (value: string) => void;
  onSaveRoundState: () => void;

  // Requests
  selectedRoundRequests: PlanRequest[];
  dispatchingRequestId: string | null;
  updatingRequestId: string | null;
  dispatchingTick: boolean;
  agentSessions: Map<string, AgentSessionSnapshot>;
  nodeById: Map<string, PlanReviewNode>;
  selectedRoundNodeOrder: Map<string, number>;
  onDispatchRequest: (request: PlanRequest) => void;
  onUpdateRequestStatus: (request: PlanRequest, status: 'open' | 'in_progress' | 'fulfilled' | 'cancelled') => void;
  onDismissRequest: (request: PlanRequest) => void;
  onDispatchTick: () => void;
  focusLinkedNode: (targetNodeId: string) => void;

  // New request form
  newRequestTitle: string;
  newRequestBody: string;
  newRequestProfileId: string;
  newRequestMethod: string;
  newRequestModelId: string;
  newRequestProvider: string;
  newRequestMode: ReviewRequestMode;
  newRequestBaseRevision: string;
  newRequestAssignee: string;
  newRequestQueuePolicy: ReviewRequestQueuePolicy;
  creatingRequest: boolean;
  loadingAssignees: boolean;
  loadingProfiles: boolean;
  reviewProfiles: ReviewAgentProfileEntry[];
  liveAssigneeOptions: PlanReviewAssignee[];
  recentAssigneeOptions: PlanReviewAssignee[];
  onNewRequestTitleChange: (value: string) => void;
  onNewRequestBodyChange: (value: string) => void;
  onApplyRequestProfileSelection: (profileId: string) => void;
  onNewRequestMethodChange: (value: string) => void;
  onNewRequestProviderChange: (value: string) => void;
  onNewRequestModelIdChange: (value: string) => void;
  onNewRequestModeChange: (mode: ReviewRequestMode) => void;
  onNewRequestBaseRevisionChange: (value: string) => void;
  onNewRequestAssigneeChange: (value: string) => void;
  onNewRequestQueuePolicyChange: (policy: ReviewRequestQueuePolicy) => void;
  onCreateRequest: () => void;

  // Discussion
  selectedRoundNodes: PlanReviewNode[];
  selectedRoundThread: {
    roots: PlanReviewNode[];
    childrenByParent: Map<string, PlanReviewNode[]>;
  };
  selectedRoundThreadRefByChild: Map<string, { parentId: string; linkId: string; relation: PlanReviewLink['relation'] }>;
  selectedRoundLinksBySource: Map<string, PlanReviewLink[]>;
  reviewRoundNumberById: Map<string, number>;
  focusedNodeId: string | null;
  dismissedNodeIds: Set<string>;
  sourcePreview: {
    nodeId: string;
    ref: SourceRefMatch;
    data: PlanSourcePreviewResponse;
  } | null;
  sourcePreviewError: {
    nodeId: string;
    message: string;
  } | null;
  sourcePreviewLoadingKey: string | null;
  nodeCardRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
  onPreviewSourceRef: (nodeId: string, ref: SourceRefMatch) => void;
  onClearSourcePreview: () => void;
  onReplyToNode: (node: PlanReviewNode) => void;

  // Compose form
  composeTextareaRef: React.RefObject<HTMLTextAreaElement | null>;
  newNodeKind: ReviewNodeKind;
  newNodeAuthorRole: ReviewAuthorRole;
  newNodeSeverity: NonNullable<PlanReviewNode['severity']> | '';
  newNodeBody: string;
  newNodeRefTargetId: string;
  newNodeRefRelation: PlanReviewLink['relation'];
  newNodeRefPlanAnchor: string;
  newNodeRefQuote: string;
  creatingNode: boolean;
  relationOptions: { value: PlanReviewLink['relation']; label: string; requiresTargetNode: boolean }[];
  onNewNodeKindChange: (kind: ReviewNodeKind) => void;
  onNewNodeAuthorRoleChange: (role: ReviewAuthorRole) => void;
  onNewNodeSeverityChange: (severity: NonNullable<PlanReviewNode['severity']> | '') => void;
  onNewNodeBodyChange: (body: string) => void;
  onNewNodeRefTargetIdChange: (id: string) => void;
  onNewNodeRefRelationChange: (relation: PlanReviewLink['relation']) => void;
  onNewNodeRefPlanAnchorChange: (anchor: string) => void;
  onNewNodeRefQuoteChange: (quote: string) => void;
  onCreateNode: () => void;

  // Shared style classNames from orchestrator
  inputClassName: string;
  textAreaClassName: string;
}

export function PlanAgentTasksSection({
  reviewGraph,
  loadingReviews,
  reviewError,
  reviewNotice,
  reviewRounds,
  selectedRoundId,
  selectedRound,
  reviewNodeCountByRound,
  reviewProfileLabels,
  onSelectRound,
  onLoadReviewGraph,
  newRoundNote,
  creatingRound,
  showClosedIterations,
  onToggleShowClosed,
  onNewRoundNoteChange,
  onCreateRound,
  onCloseRound,
  roundStatusDraft,
  roundNoteDraft,
  roundConclusionDraft,
  updatingRound,
  onRoundStatusDraftChange,
  onRoundNoteDraftChange,
  onRoundConclusionDraftChange,
  onSaveRoundState,
  selectedRoundRequests,
  dispatchingRequestId,
  updatingRequestId,
  dispatchingTick,
  agentSessions,
  nodeById,
  selectedRoundNodeOrder,
  onDispatchRequest,
  onUpdateRequestStatus,
  onDismissRequest,
  onDispatchTick,
  focusLinkedNode,
  newRequestTitle,
  newRequestBody,
  newRequestProfileId,
  newRequestMethod,
  newRequestModelId,
  newRequestProvider,
  newRequestMode,
  newRequestBaseRevision,
  newRequestAssignee,
  newRequestQueuePolicy,
  creatingRequest,
  loadingAssignees,
  loadingProfiles,
  reviewProfiles,
  liveAssigneeOptions,
  recentAssigneeOptions,
  onNewRequestTitleChange,
  onNewRequestBodyChange,
  onApplyRequestProfileSelection,
  onNewRequestMethodChange,
  onNewRequestProviderChange,
  onNewRequestModelIdChange,
  onNewRequestModeChange,
  onNewRequestBaseRevisionChange,
  onNewRequestAssigneeChange,
  onNewRequestQueuePolicyChange,
  onCreateRequest,
  selectedRoundNodes,
  selectedRoundThread,
  selectedRoundThreadRefByChild,
  selectedRoundLinksBySource,
  reviewRoundNumberById,
  focusedNodeId,
  dismissedNodeIds,
  sourcePreview,
  sourcePreviewError,
  sourcePreviewLoadingKey,
  nodeCardRefs,
  onPreviewSourceRef,
  onClearSourcePreview,
  onReplyToNode,
  composeTextareaRef,
  newNodeKind,
  newNodeAuthorRole,
  newNodeSeverity,
  newNodeBody,
  newNodeRefTargetId,
  newNodeRefRelation,
  newNodeRefPlanAnchor,
  newNodeRefQuote,
  creatingNode,
  relationOptions,
  onNewNodeKindChange,
  onNewNodeAuthorRoleChange,
  onNewNodeSeverityChange,
  onNewNodeBodyChange,
  onNewNodeRefTargetIdChange,
  onNewNodeRefRelationChange,
  onNewNodeRefPlanAnchorChange,
  onNewNodeRefQuoteChange,
  onCreateNode,
  inputClassName,
  textAreaClassName,
}: PlanAgentTasksSectionProps) {
  return (
    <DisclosureSection
      label="Agent Tasks"
      defaultOpen={false}
      className="rounded-md border border-neutral-200 dark:border-neutral-700 p-3"
      contentClassName="space-y-3 mt-2"
      badge={
        <span className="text-[10px] text-neutral-400">
          {reviewGraph ? `${reviewGraph.rounds.length} rounds` : '0 rounds'}
        </span>
      }
      actions={
        <Button size="sm" onClick={() => void onLoadReviewGraph()} disabled={loadingReviews}>
          {loadingReviews ? 'Refreshing...' : 'Refresh'}
        </Button>
      }
    >

      {reviewError && (
        <div className="text-xs text-red-600 dark:text-red-400">
          {reviewError}
        </div>
      )}
      {reviewNotice && !reviewError && (
        <div className="text-xs text-green-600 dark:text-green-400">
          {reviewNotice}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        <div className="space-y-3">
          <div className="rounded-md border border-neutral-200 dark:border-neutral-700 p-2">
            <div className="text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-2">
              Iterations
            </div>
            {loadingReviews && reviewRounds.length === 0 ? (
              <div className="text-xs text-neutral-500 dark:text-neutral-400">Loading task data...</div>
            ) : reviewRounds.length === 0 ? (
              <div className="text-xs text-neutral-500 dark:text-neutral-400">No iterations yet.</div>
            ) : (() => {
              const closedCount = reviewRounds.filter((r) => r.status === 'concluded').length;
              const visibleRounds = showClosedIterations
                ? reviewRounds
                : reviewRounds.filter((r) => r.status !== 'concluded');
              return (
                <>
                  <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
                    {visibleRounds.map((round) => {
                      const selected = round.id === selectedRoundId;
                      return (
                        <div
                          key={round.id}
                          className={`p-2 rounded border text-xs ${
                            selected
                              ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/20'
                              : 'border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800'
                          }`}
                        >
                          <div className="flex items-start gap-1">
                            <button
                              onClick={() => onSelectRound(round.id)}
                              className="flex-1 text-left min-w-0"
                            >
                              <div className="flex items-center gap-1.5 mb-1">
                                <span className="font-medium text-neutral-800 dark:text-neutral-200">
                                  Iteration #{round.roundNumber}
                                </span>
                                <Badge color={REVIEW_ROUND_STATUS_COLORS[round.status]} className="text-[9px]">
                                  {ITERATION_STATUS_LABELS[round.status] ?? round.status}
                                </Badge>
                              </div>
                              <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
                                {reviewNodeCountByRound.get(round.id) ?? 0} entries
                                {round.reviewRevision != null ? ` - rev ${round.reviewRevision}` : ''}
                              </div>
                              {(round.actorAgentId || round.actorRunId || round.createdBy) && (
                                <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
                                  {formatActorLabel(
                                    {
                                      principalType: round.actorPrincipalType,
                                      userId: round.actorUserId,
                                      agentId: round.actorAgentId,
                                      fallback: round.createdBy,
                                    },
                                    { profileLabels: reviewProfileLabels },
                                  )}
                                  {round.actorRunId ? ` - run ${round.actorRunId.slice(0, 16)}` : ''}
                                </div>
                              )}
                              <div className="text-[10px] text-neutral-400 mt-0.5">
                                {formatDateTime(round.updatedAt)}
                              </div>
                            </button>
                            {round.status !== 'concluded' && onCloseRound && (
                              <button
                                onClick={(e) => { e.stopPropagation(); void onCloseRound(round); }}
                                className="shrink-0 p-1 text-neutral-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                                title="Archive this iteration"
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                                  <polyline points="3 6 5 6 21 6" />
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                </svg>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {closedCount > 0 && (
                    <button
                      onClick={onToggleShowClosed}
                      className="text-[10px] text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 mt-1"
                    >
                      {showClosedIterations ? 'Hide' : 'Show'} {closedCount} closed
                    </button>
                  )}
                </>
              );
            })()}
          </div>

          <DisclosureSection
            label="Start New Iteration"
            defaultOpen={false}
            className="rounded-md border border-neutral-200 dark:border-neutral-700 p-2"
            contentClassName="space-y-2"
          >
            <label className="text-[11px] text-neutral-600 dark:text-neutral-400 block">
              Note
              <input
                value={newRoundNote}
                onChange={(e) => onNewRoundNoteChange(e.target.value)}
                className={inputClassName}
                placeholder="Optional context for this iteration"
              />
            </label>
            <Button size="sm" onClick={onCreateRound} disabled={creatingRound}>
              {creatingRound ? 'Creating...' : 'Create Iteration'}
            </Button>
          </DisclosureSection>
        </div>

        <div className="space-y-3 xl:col-span-2">
          <div className="rounded-md border border-neutral-200 dark:border-neutral-700 p-2 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                {selectedRound ? `Iteration #${selectedRound.roundNumber}` : 'Iteration State'}
              </span>
              {selectedRound && (
                <Badge color={REVIEW_ROUND_STATUS_COLORS[selectedRound.status]} className="text-[9px]">
                  {ITERATION_STATUS_LABELS[selectedRound.status] ?? selectedRound.status}
                </Badge>
              )}
              {selectedRound?.reviewRevision != null && (
                <Badge color="gray" className="text-[9px]">
                  rev {selectedRound.reviewRevision}
                </Badge>
              )}
            </div>

            {!selectedRound ? (
              <div className="text-xs text-neutral-500 dark:text-neutral-400">
                Select a iteration to inspect responses.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <label className="text-[11px] text-neutral-600 dark:text-neutral-400">
                    Status
                    <select
                      value={roundStatusDraft}
                      onChange={(e) => onRoundStatusDraftChange(e.target.value as ReviewRoundStatus)}
                      className={inputClassName}
                    >
                      <option value="open">Active</option>
                      <option value="changes_requested">Needs Action</option>
                      <option value="approved">Completed</option>
                      <option value="concluded">Closed</option>
                    </select>
                  </label>
                  <label className="text-[11px] text-neutral-600 dark:text-neutral-400 sm:col-span-2">
                    Note
                    <input
                      value={roundNoteDraft}
                      onChange={(e) => onRoundNoteDraftChange(e.target.value)}
                      className={inputClassName}
                      placeholder="Optional round note"
                    />
                  </label>
                </div>

                <label className="text-[11px] text-neutral-600 dark:text-neutral-400 block">
                  Conclusion (required when status=concluded)
                  <textarea
                    value={roundConclusionDraft}
                    onChange={(e) => onRoundConclusionDraftChange(e.target.value)}
                    className={textAreaClassName}
                    rows={2}
                  />
                </label>

                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={onSaveRoundState} disabled={updatingRound}>
                    {updatingRound ? 'Saving...' : 'Save Iteration State'}
                  </Button>
                  <span className="text-[10px] text-neutral-400">
                    Updated {formatDateTime(selectedRound.updatedAt)}
                  </span>
                </div>
              </>
            )}
          </div>

          <DisclosureSection
            label="Agent Tasks"
            defaultOpen
            className="rounded-md border border-neutral-200 dark:border-neutral-700 p-2"
            contentClassName="space-y-2"
            badge={
              <Badge color="gray" className="text-[9px]">{selectedRoundRequests.length}</Badge>
            }
            actions={
              <Button
                size="sm"
                onClick={onDispatchTick}
                disabled={dispatchingTick || !selectedRoundRequests.some((request) => request.status === 'open')}
              >
                {dispatchingTick ? 'Dispatching...' : 'Dispatch Open'}
              </Button>
            }
          >

            {selectedRoundRequests.length === 0 ? (
              <div className="text-xs text-neutral-500 dark:text-neutral-400">
                No agent tasks yet.
              </div>
            ) : (
              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {selectedRoundRequests.filter((r) => !r.dismissed).map((request) => (
                  <PlanReviewRequestCard
                    key={request.id}
                    request={request}
                    profileLabels={reviewProfileLabels}
                    requestStatusColors={REVIEW_REQUEST_STATUS_COLORS}
                    requestDispatchColors={REVIEW_REQUEST_DISPATCH_COLORS}
                    agentSessions={agentSessions}
                    nodeById={nodeById}
                    selectedRoundNodeOrder={selectedRoundNodeOrder}
                    dispatchingRequestId={dispatchingRequestId}
                    updatingRequestId={updatingRequestId}
                    onDispatchRequest={onDispatchRequest}
                    onUpdateRequestStatus={onUpdateRequestStatus}
                    onDismissRequest={onDismissRequest}
                    onFocusNode={focusLinkedNode}
                    formatDateTime={formatDateTime}
                  />
                ))}
              </div>
            )}

            <PlanReviewRequestForm
              inputClassName={inputClassName}
              textAreaClassName={textAreaClassName}
              title={newRequestTitle}
              body={newRequestBody}
              profileId={newRequestProfileId}
              method={newRequestMethod}
              provider={newRequestProvider}
              modelId={newRequestModelId}
              mode={newRequestMode}
              baseRevision={newRequestBaseRevision}
              assignee={newRequestAssignee}
              queuePolicy={newRequestQueuePolicy}
              creating={creatingRequest}
              loadingAssignees={loadingAssignees}
              loadingProfiles={loadingProfiles}
              profiles={reviewProfiles}
              liveAssignees={liveAssigneeOptions}
              recentAssignees={recentAssigneeOptions}
              profileLabels={reviewProfileLabels}
              buildAssigneeOptionValue={buildAssigneeOptionValue}
              onTitleChange={onNewRequestTitleChange}
              onBodyChange={onNewRequestBodyChange}
              onProfileChange={onApplyRequestProfileSelection}
              onMethodChange={onNewRequestMethodChange}
              onProviderChange={onNewRequestProviderChange}
              onModelIdChange={onNewRequestModelIdChange}
              onModeChange={onNewRequestModeChange}
              onBaseRevisionChange={onNewRequestBaseRevisionChange}
              onAssigneeChange={onNewRequestAssigneeChange}
              onQueuePolicyChange={onNewRequestQueuePolicyChange}
              onSubmit={onCreateRequest}
            />
          </DisclosureSection>

          <DisclosureSection
            label="Discussion"
            defaultOpen
            className="rounded-md border border-neutral-200 dark:border-neutral-700 p-2"
            contentClassName="space-y-2"
            badge={
              <Badge color="gray" className="text-[9px]">{selectedRoundNodes.length}</Badge>
            }
          >
            {!selectedRound ? (
              <div className="text-xs text-neutral-500 dark:text-neutral-400">
                Select a iteration to view discussion.
              </div>
            ) : selectedRoundNodes.length === 0 ? (
              <div className="text-xs text-neutral-500 dark:text-neutral-400">
                No responses yet in this round.
              </div>
            ) : (
              <div className="space-y-2 max-h-[24rem] overflow-y-auto pr-1">
                <PlanReviewDiscussion
                  roots={selectedRoundThread.roots}
                  childrenByParent={selectedRoundThread.childrenByParent}
                  threadRefByChild={selectedRoundThreadRefByChild}
                  linksBySource={selectedRoundLinksBySource}
                  selectedRoundId={selectedRoundId}
                  nodeById={nodeById}
                  nodeOrderById={selectedRoundNodeOrder}
                  roundNumberById={reviewRoundNumberById}
                  focusedNodeId={focusedNodeId}
                  dismissedNodeIds={dismissedNodeIds}
                  sourcePreview={sourcePreview}
                  sourcePreviewError={sourcePreviewError}
                  sourcePreviewLoadingKey={sourcePreviewLoadingKey}
                  nodeCardRefs={nodeCardRefs}
                  profileLabels={reviewProfileLabels}
                  authorRoleColors={REVIEW_AUTHOR_ROLE_COLORS}
                  severityColors={REVIEW_SEVERITY_COLORS}
                  formatDateTime={formatDateTime}
                  formatReviewRelation={formatReviewRelation}
                  extractSourceRefs={extractSourceRefs}
                  onPreviewSourceRef={onPreviewSourceRef}
                  onClearSourcePreview={onClearSourcePreview}
                  onFocusLinkedNode={focusLinkedNode}
                  onReplyToNode={onReplyToNode}
                />
              </div>
            )}
          </DisclosureSection>

          <PlanReviewResponseForm
            inputClassName={inputClassName}
            textAreaClassName={textAreaClassName}
            selectedRoundStatus={selectedRound?.status ?? null}
            selectedRoundNodes={selectedRoundNodes}
            relationOptions={relationOptions}
            composeTextareaRef={composeTextareaRef}
            kind={newNodeKind}
            authorRole={newNodeAuthorRole}
            severity={newNodeSeverity}
            body={newNodeBody}
            refTargetId={newNodeRefTargetId}
            refRelation={newNodeRefRelation}
            refPlanAnchor={newNodeRefPlanAnchor}
            refQuote={newNodeRefQuote}
            creating={creatingNode}
            onKindChange={onNewNodeKindChange}
            onAuthorRoleChange={onNewNodeAuthorRoleChange}
            onSeverityChange={onNewNodeSeverityChange}
            onBodyChange={onNewNodeBodyChange}
            onRefTargetIdChange={onNewNodeRefTargetIdChange}
            onRefRelationChange={onNewNodeRefRelationChange}
            onRefPlanAnchorChange={onNewNodeRefPlanAnchorChange}
            onRefQuoteChange={onNewNodeRefQuoteChange}
            onSubmit={onCreateNode}
          />
        </div>
      </div>
    </DisclosureSection>
  );
}
