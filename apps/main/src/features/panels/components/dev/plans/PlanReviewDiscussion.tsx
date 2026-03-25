import { Badge, DisclosureSection } from '@pixsim7/shared.ui';

import { formatActorLabel } from '@lib/identity/actorDisplay';

export interface ReviewSourceRefMatch {
  raw: string;
  path: string;
  startLine: number;
  endLine: number;
}

export interface ReviewSourcePreviewLine {
  lineNumber: number;
  text: string;
}

export interface ReviewSourcePreviewPayload {
  path: string;
  startLine: number;
  endLine: number;
  lines: ReviewSourcePreviewLine[];
}

export interface ReviewDiscussionNode {
  id: string;
  roundId: string;
  kind: string;
  authorRole: 'reviewer' | 'author' | 'agent' | 'system';
  body: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical' | null;
  planAnchor: Record<string, unknown> | null;
  meta: Record<string, unknown> | null;
  createdBy: string | null;
  actorPrincipalType: 'user' | 'agent' | 'service' | null;
  actorAgentId: string | null;
  actorRunId: string | null;
  actorUserId: number | null;
  createdAt: string;
}

export interface ReviewDiscussionLink {
  id: string;
  roundId: string;
  sourceNodeId: string;
  targetNodeId: string | null;
  relation: 'replies_to' | 'addresses' | 'because_of' | 'supports' | 'contradicts' | 'supersedes';
  targetPlanAnchor: Record<string, unknown> | null;
  quote: string | null;
}

type BadgeColor = React.ComponentProps<typeof Badge>['color'];

interface PlanReviewDiscussionProps {
  roots: ReviewDiscussionNode[];
  childrenByParent: ReadonlyMap<string, ReviewDiscussionNode[]>;
  threadRefByChild: ReadonlyMap<string, { parentId: string; linkId: string; relation: ReviewDiscussionLink['relation'] }>;
  linksBySource: ReadonlyMap<string, ReviewDiscussionLink[]>;
  selectedRoundId: string;
  nodeById: ReadonlyMap<string, ReviewDiscussionNode>;
  nodeOrderById: ReadonlyMap<string, number>;
  roundNumberById: ReadonlyMap<string, number>;
  focusedNodeId: string | null;
  dismissedNodeIds: ReadonlySet<string>;
  sourcePreview: { nodeId: string; data: ReviewSourcePreviewPayload } | null;
  sourcePreviewError: { nodeId: string; message: string } | null;
  sourcePreviewLoadingKey: string | null;
  nodeCardRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
  profileLabels: ReadonlyMap<string, string>;
  authorRoleColors: Record<ReviewDiscussionNode['authorRole'], BadgeColor>;
  severityColors: Record<NonNullable<ReviewDiscussionNode['severity']>, BadgeColor>;
  formatDateTime: (value: string | number | Date | null | undefined) => string;
  formatReviewRelation: (relation: ReviewDiscussionLink['relation']) => string;
  extractSourceRefs: (text: string) => ReviewSourceRefMatch[];
  onPreviewSourceRef: (nodeId: string, ref: ReviewSourceRefMatch) => void | Promise<void>;
  onClearSourcePreview: () => void;
  onFocusLinkedNode: (targetNodeId: string) => void;
  onReplyToNode: (node: ReviewDiscussionNode) => void;
}

export function PlanReviewDiscussion({
  roots,
  childrenByParent,
  threadRefByChild,
  linksBySource,
  selectedRoundId,
  nodeById,
  nodeOrderById,
  roundNumberById,
  focusedNodeId,
  dismissedNodeIds,
  sourcePreview,
  sourcePreviewError,
  sourcePreviewLoadingKey,
  nodeCardRefs,
  profileLabels,
  authorRoleColors,
  severityColors,
  formatDateTime,
  formatReviewRelation,
  extractSourceRefs,
  onPreviewSourceRef,
  onClearSourcePreview,
  onFocusLinkedNode,
  onReplyToNode,
}: PlanReviewDiscussionProps) {
  const renderDiscussionNode = (
    node: ReviewDiscussionNode,
    depth: number,
    ancestry: Set<string>,
  ): React.ReactNode => {
    if (ancestry.has(node.id)) {
      return null;
    }

    const nextAncestry = new Set(ancestry);
    nextAncestry.add(node.id);

    const threadRef = threadRefByChild.get(node.id);
    const parentId = threadRef?.parentId ?? null;
    const parentOrder = parentId ? nodeOrderById.get(parentId) : null;
    const threadedLinkId = threadRef?.linkId;
    const links = (linksBySource.get(node.id) ?? []).filter((link) => link.id !== threadedLinkId);
    const children = childrenByParent.get(node.id) ?? [];
    const nodeOrder = nodeOrderById.get(node.id) ?? 0;
    const indentPx = Math.min(depth, 8) * 16;
    const isFocused = focusedNodeId === node.id;
    const isDismissed = dismissedNodeIds.has(node.id);
    const sourceRefs = extractSourceRefs(node.body);
    const sourcePreviewForNode = sourcePreview?.nodeId === node.id ? sourcePreview : null;
    const sourcePreviewErrorForNode = sourcePreviewError?.nodeId === node.id ? sourcePreviewError.message : null;
    const threadedRelationLabel = threadRef?.relation
      ? formatReviewRelation(threadRef.relation)
      : 'reply to';
    const nodeActorLabel = formatActorLabel(
      {
        principalType: node.actorPrincipalType,
        userId: node.actorUserId,
        agentId: node.actorAgentId,
        fallback: node.createdBy,
      },
      { profileLabels },
    );

    return (
      <div key={node.id} className="space-y-2" style={{ marginLeft: `${indentPx}px` }}>
        <div
          ref={(el) => {
            if (el) nodeCardRefs.current.set(node.id, el);
            else nodeCardRefs.current.delete(node.id);
          }}
          className={`rounded border border-neutral-200 dark:border-neutral-700 p-2 ${
            depth > 0 ? 'bg-neutral-50/60 dark:bg-neutral-900/30' : ''
          } ${isFocused ? 'ring-2 ring-blue-400 ring-offset-1 dark:ring-blue-500' : ''} ${isDismissed ? 'opacity-40' : ''}`}
        >
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <span className="text-[10px] text-neutral-400">#{nodeOrder}</span>
            <Badge color={authorRoleColors[node.authorRole]} className="text-[9px]">
              {node.authorRole}
            </Badge>
            <Badge color="gray" className="text-[9px]">
              {node.kind}
            </Badge>
            {node.severity && (
              <Badge color={severityColors[node.severity]} className="text-[9px]">
                {node.severity}
              </Badge>
            )}
            {(node.actorAgentId || node.createdBy || node.actorUserId != null) && (
              <Badge color="green" className="text-[9px]">
                {nodeActorLabel}
              </Badge>
            )}
            {node.actorRunId && (
              <Badge color="gray" className="text-[9px] cursor-default" title={`Run ID: ${node.actorRunId}`}>
                run {node.actorRunId.slice(0, 12)}
              </Badge>
            )}
            {parentOrder && parentId && (
              <button
                type="button"
                onClick={() => onFocusLinkedNode(parentId)}
                className="hover:opacity-80"
                title="Jump to parent node"
              >
                <Badge color="blue" className="text-[9px]">
                  {threadedRelationLabel} #{parentOrder}
                </Badge>
              </button>
            )}
            <span className="text-[10px] text-neutral-400">{formatDateTime(node.createdAt)}</span>
          </div>
          <div className="text-xs text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap">
            {node.body}
          </div>

          {sourceRefs.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {sourceRefs.map((ref, refIdx) => {
                const refRequestKey = `${node.id}:${ref.path}:${ref.startLine}-${ref.endLine}`;
                const isLoading = sourcePreviewLoadingKey === refRequestKey;
                return (
                  <button
                    key={`${refRequestKey}:${refIdx}`}
                    type="button"
                    onClick={() => void onPreviewSourceRef(node.id, ref)}
                    className="hover:opacity-85"
                    disabled={isLoading}
                    title="Preview source snippet"
                  >
                    <Badge color="gray" className="text-[9px]">
                      {isLoading ? 'loading...' : ref.raw}
                    </Badge>
                  </button>
                );
              })}
            </div>
          )}

          {sourcePreviewErrorForNode && (
            <div className="mt-2 text-[11px] text-red-600 dark:text-red-400">
              {sourcePreviewErrorForNode}
            </div>
          )}

          {sourcePreviewForNode && (
            <div className="mt-2 rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 p-2">
              <div className="flex items-center justify-between gap-2 mb-1">
                <code className="text-[10px] text-neutral-600 dark:text-neutral-300">
                  {sourcePreviewForNode.data.path}:{sourcePreviewForNode.data.startLine}-{sourcePreviewForNode.data.endLine}
                </code>
                <button
                  type="button"
                  onClick={onClearSourcePreview}
                  className="text-[10px] text-neutral-500 hover:underline"
                >
                  Close
                </button>
              </div>
              <pre className="text-[11px] leading-relaxed overflow-auto max-h-56">
                {sourcePreviewForNode.data.lines.map((line) => (
                  <div key={`${sourcePreviewForNode.data.path}:${line.lineNumber}`} className="flex gap-2">
                    <span className="w-10 shrink-0 text-right text-neutral-400 select-none">{line.lineNumber}</span>
                    <code className="text-neutral-700 dark:text-neutral-200 whitespace-pre">{line.text}</code>
                  </div>
                ))}
              </pre>
            </div>
          )}

          {links.length > 0 && (
            <div className="mt-2 space-y-1">
              {links.map((link, linkIdx) => {
                const targetNode = link.targetNodeId ? nodeById.get(link.targetNodeId) : undefined;
                const targetNodeOrder = targetNode ? nodeOrderById.get(targetNode.id) : undefined;
                const targetRoundNumber = targetNode ? roundNumberById.get(targetNode.roundId) : undefined;
                const targetInDifferentRound =
                  !!targetNode && targetNode.roundId !== selectedRoundId;
                return (
                  <div
                    key={`${node.id}:link:${link.id}:${linkIdx}`}
                    className="text-[11px] text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5 flex-wrap"
                  >
                    {targetNode ? (
                      <button
                        type="button"
                        onClick={() => onFocusLinkedNode(targetNode.id)}
                        className="hover:opacity-80"
                        title="Jump to referenced node"
                      >
                        <Badge color="blue" className="text-[9px]">{link.relation}</Badge>
                      </button>
                    ) : (
                      <Badge color="gray" className="text-[9px]">{link.relation}</Badge>
                    )}
                    {targetNode ? (
                      <button
                        type="button"
                        onClick={() => onFocusLinkedNode(targetNode.id)}
                        className="text-blue-600 dark:text-blue-400 hover:underline"
                        title="Jump to referenced node"
                      >
                        to <code className="font-mono">{targetNodeOrder ? `#${targetNodeOrder}` : targetNode.id.slice(0, 8)}</code>{' '}
                        ({targetNode.authorRole}/{targetNode.kind}
                        {targetInDifferentRound ? `, round #${targetRoundNumber ?? '?'}` : ''})
                      </button>
                    ) : link.targetPlanAnchor ? (
                      <span>
                        plan anchor <code className="font-mono">{JSON.stringify(link.targetPlanAnchor)}</code>
                      </span>
                    ) : (
                      <span>reference</span>
                    )}
                    {link.quote && (
                      <span className="italic text-neutral-400">"{link.quote}"</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-2">
            <button
              type="button"
              onClick={() => onReplyToNode(node)}
              className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
            >
              Reply to this node
            </button>
          </div>
        </div>

        {children.length > 0 && (
          <DisclosureSection
            label={`${children.length} ${children.length === 1 ? 'reply' : 'replies'}`}
            defaultOpen={depth < 2}
            size="sm"
            bordered
          >
            <div className="space-y-2">
              {children.map((child) => renderDiscussionNode(child, depth + 1, nextAncestry))}
            </div>
          </DisclosureSection>
        )}
      </div>
    );
  };

  return (
    <>
      {roots.map((node) => renderDiscussionNode(node, 0, new Set()))}
    </>
  );
}

