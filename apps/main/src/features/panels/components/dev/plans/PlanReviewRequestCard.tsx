import { Badge, Button } from '@pixsim7/shared.ui';

import { formatActorLabel } from '@lib/identity/actorDisplay';

type BadgeColor = React.ComponentProps<typeof Badge>['color'];

export type ReviewRequestStatus = 'open' | 'in_progress' | 'fulfilled' | 'cancelled';

export interface ReviewRequestCardData {
  id: string;
  title: string;
  body: string;
  status: ReviewRequestStatus;
  dispatchState: 'assigned' | 'queued' | 'unassigned' | null;
  targetMode: 'auto' | 'session' | 'recent_agent' | null;
  targetAgentId: string | null;
  targetSessionId: string | null;
  roundId: string | null;
  targetModelId: string | null;
  targetProvider: string | null;
  targetMethod: string | null;
  targetProfileId: string | null;
  reviewMode?: 'review_only' | 'propose_patch' | 'apply_patch' | null;
  baseRevision?: number | null;
  queueIfBusy: boolean;
  dispatchReason: string | null;
  requestedBy: string | null;
  requestedByPrincipalType: 'user' | 'agent' | 'service' | null;
  requestedByAgentId: string | null;
  requestedByUserId: number | null;
  resolvedBy: string | null;
  resolvedByPrincipalType: 'user' | 'agent' | 'service' | null;
  resolvedByAgentId: string | null;
  resolvedByUserId: number | null;
  resolvedNodeId: string | null;
  resolutionNote: string | null;
  createdAt: string;
}

export interface ReviewRequestCardSessionActivity {
  action: string;
  detail: string;
  timestamp: string;
}

export interface ReviewRequestCardSession {
  session_id: string;
  plan_id: string | null;
  contract_id: string | null;
  action: string;
  detail: string;
  recent_activity: ReviewRequestCardSessionActivity[];
}

interface PlanReviewRequestCardProps {
  request: ReviewRequestCardData;
  profileLabels: ReadonlyMap<string, string>;
  requestStatusColors: Record<ReviewRequestStatus, BadgeColor>;
  requestDispatchColors: Record<'assigned' | 'queued' | 'unassigned', BadgeColor>;
  agentSessions: ReadonlyMap<string, ReviewRequestCardSession>;
  nodeById: ReadonlyMap<string, { id: string }>;
  selectedRoundNodeOrder: ReadonlyMap<string, number>;
  dispatchingRequestId: string | null;
  updatingRequestId: string | null;
  onDispatchRequest: (request: ReviewRequestCardData) => void | Promise<void>;
  onUpdateRequestStatus: (request: ReviewRequestCardData, status: ReviewRequestStatus) => void | Promise<void>;
  onDismissRequest: (request: ReviewRequestCardData) => void | Promise<void>;
  onFocusNode: (nodeId: string) => void;
  formatDateTime: (value: string | number | Date | null | undefined) => string;
}

export function PlanReviewRequestCard({
  request,
  profileLabels,
  requestStatusColors,
  requestDispatchColors,
  agentSessions,
  nodeById,
  selectedRoundNodeOrder,
  dispatchingRequestId,
  updatingRequestId,
  onDispatchRequest,
  onUpdateRequestStatus,
  onDismissRequest,
  onFocusNode,
  formatDateTime,
}: PlanReviewRequestCardProps) {
  const resolvedNode = request.resolvedNodeId ? nodeById.get(request.resolvedNodeId) : undefined;
  const resolvedOrder = resolvedNode ? selectedRoundNodeOrder.get(resolvedNode.id) : undefined;

  return (
    <div className="rounded border border-neutral-200 dark:border-neutral-700 p-2">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[11px] font-medium text-neutral-800 dark:text-neutral-200">
          {request.title}
        </span>
        <Badge color={requestStatusColors[request.status]} className="text-[9px]">
          {request.status}
        </Badge>
        {request.dispatchState && (
          <Badge color={requestDispatchColors[request.dispatchState]} className="text-[9px]">
            {request.dispatchState}
          </Badge>
        )}
        {request.targetMode && (
          <Badge color="gray" className="text-[9px]">
            {request.targetMode}
          </Badge>
        )}
        <Badge color="blue" className="text-[9px]">
          {request.reviewMode || 'review_only'}
        </Badge>
        {typeof request.baseRevision === 'number' && request.baseRevision > 0 && (
          <Badge color="indigo" className="text-[9px]">
            base rev {request.baseRevision}
          </Badge>
        )}
        {request.targetAgentId && (
          <Badge color="green" className="text-[9px]">
            {formatActorLabel(
              {
                principalType: 'agent',
                agentId: request.targetAgentId,
              },
              { profileLabels },
            )}
          </Badge>
        )}
        {request.roundId && (
          <Badge color="gray" className="text-[9px]">
            iteration-bound
          </Badge>
        )}
        <span className="text-[10px] text-neutral-400">{formatDateTime(request.createdAt)}</span>
      </div>
      <div className="mt-1 text-[11px] text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap">
        {request.body}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1">
        <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
          by {formatActorLabel(
            {
              principalType: request.requestedByPrincipalType,
              userId: request.requestedByUserId,
              agentId: request.requestedByAgentId,
              fallback: request.requestedBy,
            },
            { profileLabels },
          )}
        </span>
        {request.targetModelId && (
          <Badge color="purple" className="text-[9px]">{request.targetModelId}</Badge>
        )}
        {request.targetProvider && (
          <Badge color="gray" className="text-[9px]">{request.targetProvider}</Badge>
        )}
        {request.targetMethod && (
          <Badge color="gray" className="text-[9px]">{request.targetMethod}</Badge>
        )}
        {request.targetProfileId && (
          <Badge color="indigo" className="text-[9px]">{request.targetProfileId}</Badge>
        )}
        {request.queueIfBusy && (
          <Badge color="yellow" className="text-[9px]">queued</Badge>
        )}
        {(request.resolvedByAgentId || request.resolvedBy) && (
          <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
            resolved by {formatActorLabel(
              {
                principalType: request.resolvedByPrincipalType,
                userId: request.resolvedByUserId,
                agentId: request.resolvedByAgentId,
                fallback: request.resolvedBy,
              },
              { profileLabels },
            )}
          </span>
        )}
      </div>
      {request.dispatchReason && request.status !== 'in_progress' && (
        <div className="mt-1 text-[10px] text-neutral-500 dark:text-neutral-400">
          dispatch: {request.dispatchReason}
        </div>
      )}
      {request.status === 'in_progress' && (() => {
        const agentId = request.targetAgentId || request.targetSessionId;
        const session = agentId ? agentSessions.get(agentId) : undefined;
        return (
          <div className="mt-1.5 rounded border border-green-200 dark:border-green-800/50 bg-green-50/50 dark:bg-green-950/20 p-1.5">
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
              {session ? (
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] text-green-700 dark:text-green-300">
                    {session.action || 'Working'}{session.detail ? `: ${session.detail.slice(0, 80)}` : ''}
                  </span>
                  {(session.plan_id || session.contract_id) && (
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      {session.contract_id && (
                        <Badge color="blue" className="text-[9px]">
                          {session.contract_id}
                        </Badge>
                      )}
                      {session.plan_id && (
                        <Badge color="green" className="text-[9px]">
                          plan:{session.plan_id}
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <span className="text-[10px] text-green-700 dark:text-green-300">
                  Agent working
                  {agentId
                    ? ` (${formatActorLabel(
                        { principalType: 'agent', agentId },
                        { profileLabels },
                      )})`
                    : ''}
                  ...
                </span>
              )}
            </div>
            {session && session.recent_activity.length > 0 && (
              <div className="mt-1 space-y-0.5 max-h-20 overflow-y-auto">
                {session.recent_activity.slice(0, 5).map((activity, index) => (
                  <div key={`${session.session_id}:activity:${index}`} className="flex items-start gap-1.5 text-[9px] text-neutral-500 dark:text-neutral-400">
                    <span className="shrink-0 w-12 text-right text-neutral-400">
                      {new Date(activity.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                    <span className="font-medium text-neutral-600 dark:text-neutral-300">{activity.action}</span>
                    {activity.detail && <span className="truncate">{activity.detail.slice(0, 60)}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}
      {request.resolutionNote && (
        <div className="mt-1 text-[10px] text-neutral-500 dark:text-neutral-400 italic">
          {request.resolutionNote}
        </div>
      )}
      {request.resolvedNodeId && (
        <div className="mt-1">
          <button
            type="button"
            onClick={() => onFocusNode(request.resolvedNodeId!)}
            className="hover:opacity-80"
            title="Jump to resolved node"
          >
            <Badge color="green" className="text-[9px]">
              {'resolved -> #'}{resolvedOrder ?? request.resolvedNodeId.slice(0, 8)}
            </Badge>
          </button>
        </div>
      )}
      <RequestActions
        request={request}
        dispatchingRequestId={dispatchingRequestId}
        updatingRequestId={updatingRequestId}
        onDispatchRequest={onDispatchRequest}
        onUpdateRequestStatus={onUpdateRequestStatus}
        onDismissRequest={onDismissRequest}
      />
    </div>
  );
}


// -- Contextual action buttons ------------------------------------------------

/** Status transitions and their meaning */
const STATUS_ACTIONS: Record<
  ReviewRequestStatus,
  Array<{
    to: ReviewRequestStatus;
    label: string;
    tooltip: string;
  }>
> = {
  open: [
    { to: 'cancelled', label: 'Cancel', tooltip: 'Cancel this task -- no longer needed' },
  ],
  in_progress: [
    { to: 'fulfilled', label: 'Mark Fulfilled', tooltip: 'Mark as completed -- task is done' },
    { to: 'open', label: 'Reopen', tooltip: 'Return to open -- agent stopped or needs retry' },
    { to: 'cancelled', label: 'Cancel', tooltip: 'Cancel this task' },
  ],
  fulfilled: [
    { to: 'open', label: 'Reopen', tooltip: 'Reopen for another pass' },
  ],
  cancelled: [
    { to: 'open', label: 'Reopen', tooltip: 'Reopen this cancelled task' },
  ],
};

function RequestActions({
  request,
  dispatchingRequestId,
  updatingRequestId,
  onDispatchRequest,
  onUpdateRequestStatus,
  onDismissRequest,
}: {
  request: ReviewRequestCardData;
  dispatchingRequestId: string | null;
  updatingRequestId: string | null;
  onDispatchRequest: (r: ReviewRequestCardData) => void | Promise<void>;
  onUpdateRequestStatus: (r: ReviewRequestCardData, s: ReviewRequestStatus) => void | Promise<void>;
  onDismissRequest: (r: ReviewRequestCardData) => void | Promise<void>;
}) {
  const busy = updatingRequestId === request.id || dispatchingRequestId === request.id;
  const actions = STATUS_ACTIONS[request.status] ?? [];

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {request.status === 'open' && (
        <Button
          size="sm"
          onClick={() => void onDispatchRequest(request)}
          disabled={busy}
          title="Send this task to an available agent"
        >
          {dispatchingRequestId === request.id ? 'Dispatching...' : 'Dispatch'}
        </Button>
      )}
      {actions.map((action) => (
        <Button
          key={`${request.id}:${action.to}`}
          size="sm"
          onClick={() => void onUpdateRequestStatus(request, action.to)}
          disabled={busy}
          title={action.tooltip}
        >
          {action.label}
        </Button>
      ))}
      {request.status !== 'in_progress' && (
        <Button
          size="sm"
          onClick={() => void onDismissRequest(request)}
          disabled={busy}
          title="Hide this task from the list without changing its status"
        >
          Dismiss
        </Button>
      )}
    </div>
  );
}
