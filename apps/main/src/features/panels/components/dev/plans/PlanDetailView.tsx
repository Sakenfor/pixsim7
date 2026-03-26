import {
  Badge,
  Button,
  DisclosureSection,
  EmptyState,
  SectionHeader,
} from '@pixsim7/shared.ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { pixsimClient } from '@lib/api/client';
import { Icon } from '@lib/icons';
import { formatActorLabel } from '@lib/identity/actorDisplay';

import { CheckpointList, getCheckpointPointProgress } from './PlanCheckpointList';
import { ClickableBadge } from './ClickableBadge';
import { ParticipantEntry } from './ParticipantEntry';
import { PlanReviewDiscussion } from './PlanReviewDiscussion';
import { PlanReviewRequestCard } from './PlanReviewRequestCard';
import { PlanReviewRequestForm } from './PlanReviewRequestForm';
import { PlanReviewResponseForm } from './PlanReviewResponseForm';
import {
  PRIORITY_COLORS,
  REVIEW_AUTHOR_ROLE_COLORS,
  REVIEW_CAUSAL_RELATIONS,
  REVIEW_RELATIONS,
  REVIEW_REQUEST_DISPATCH_COLORS,
  REVIEW_REQUEST_STATUS_COLORS,
  REVIEW_ROUND_STATUS_COLORS,
  REVIEW_SEVERITY_COLORS,
  STAGE_BADGE_COLORS,
  STATUS_COLORS,
} from './planConstants';
import type {
  AgentSessionSnapshot,
  AgentSessionsSnapshot,
  PlanDetail,
  PlanReviewGraphResponse,
  PlanReviewLink,
  PlanReviewNode,
  PlanReviewNodeCreateRequest,
  PlanReviewNodeCreateResponse,
  PlanReviewRefInput,
  PlanReviewRound,
  PlanReviewRoundCreateRequest,
  PlanReviewRoundUpdateRequest,
  PlanRequest,
  PlanRequestCreateRequest,
  PlanRequestDispatchRequest,
  PlanRequestDispatchResponse,
  PlanReviewAssigneesResponse,
  PlanReviewDispatchTickResponse,
  PlanParticipantsResponse,
  PlanSourcePreviewResponse,
  PlanStageOptionEntry,
  PlanUpdateResponse,
  ReviewAgentProfileEntry,
  ReviewAgentProfileListResponse,
  ReviewAuthorRole,
  ReviewNodeKind,
  ReviewRequestMode,
  ReviewRequestQueuePolicy,
  ReviewRoundStatus,
  SourceRefMatch,
} from './planTypes';
import {
  buildAssigneeOptionValue,
  extractRevisionConflict,
  extractSourceRefs,
  formatDate,
  formatDateTime,
  formatReviewRelation,
  parseAssigneeOptionValue,
  stageLabelFromValue,
  toErrorMessage,
} from './planUtils';

export function PlanDetailView({
  planId,
  onPlanChanged,
  onNavigatePlan,
  forgeUrlTemplate,
  stageOptions,
}: {
  planId: string;
  onPlanChanged: () => void;
  onNavigatePlan?: (planId: string) => void;
  forgeUrlTemplate?: string | null;
  stageOptions: PlanStageOptionEntry[];
}) {
  const [detail, setDetail] = useState<PlanDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [planExpanded, setPlanExpanded] = useState(false);
  const [coverage, setCoverage] = useState<{
    code_paths: string[];
    explicit_suites: string[];
    auto_discovered: { suite_id: string; suite_label: string; kind: string | null; matched_paths: string[] }[];
  } | null>(null);
  const [reviewGraph, setReviewGraph] = useState<PlanReviewGraphResponse | null>(null);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const [reviewNotice, setReviewNotice] = useState<string | null>(null);
  const [selectedRoundId, setSelectedRoundId] = useState('');
  const [newRoundStatus, setNewRoundStatus] = useState<'open' | 'changes_requested' | 'approved'>('open');
  const [newRoundRevision, setNewRoundRevision] = useState('');
  const [newRoundNote, setNewRoundNote] = useState('');
  const [creatingRound, setCreatingRound] = useState(false);
  const [roundStatusDraft, setRoundStatusDraft] = useState<ReviewRoundStatus>('open');
  const [roundNoteDraft, setRoundNoteDraft] = useState('');
  const [roundConclusionDraft, setRoundConclusionDraft] = useState('');
  const [updatingRound, setUpdatingRound] = useState(false);
  const [newNodeKind, setNewNodeKind] = useState<ReviewNodeKind>('review_comment');
  const [newNodeAuthorRole, setNewNodeAuthorRole] = useState<ReviewAuthorRole>('reviewer');
  const [newNodeSeverity, setNewNodeSeverity] = useState<NonNullable<PlanReviewNode['severity']> | ''>('');
  const [newNodeBody, setNewNodeBody] = useState('');
  const [newNodeRefRelation, setNewNodeRefRelation] = useState<PlanReviewLink['relation']>('replies_to');
  const [newNodeRefTargetId, setNewNodeRefTargetId] = useState('');
  const [newNodeRefPlanAnchor, setNewNodeRefPlanAnchor] = useState('');
  const [newNodeRefQuote, setNewNodeRefQuote] = useState('');
  const [creatingNode, setCreatingNode] = useState(false);
  const [newRequestTitle, setNewRequestTitle] = useState('');
  const [newRequestBody, setNewRequestBody] = useState('');
  const [reviewAssignees, setReviewAssignees] = useState<PlanReviewAssigneesResponse | null>(null);
  const [loadingAssignees, setLoadingAssignees] = useState(false);
  const [planParticipants, setPlanParticipants] = useState<PlanParticipantsResponse | null>(null);
  const [loadingParticipants, setLoadingParticipants] = useState(false);
  const [reviewProfiles, setReviewProfiles] = useState<ReviewAgentProfileEntry[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [newRequestAssignee, setNewRequestAssignee] = useState('auto');
  const [newRequestProfileId, setNewRequestProfileId] = useState('');
  const [newRequestMethod, setNewRequestMethod] = useState('');
  const [newRequestModelId, setNewRequestModelId] = useState('');
  const [newRequestProvider, setNewRequestProvider] = useState('');
  const [newRequestMode, setNewRequestMode] = useState<ReviewRequestMode>('review_only');
  const [newRequestBaseRevision, setNewRequestBaseRevision] = useState('');
  const [newRequestQueuePolicy, setNewRequestQueuePolicy] = useState<ReviewRequestQueuePolicy>('auto_reroute');
  const [creatingRequest, setCreatingRequest] = useState(false);
  const [updatingRequestId, setUpdatingRequestId] = useState<string | null>(null);
  const [dispatchingRequestId, setDispatchingRequestId] = useState<string | null>(null);
  const [dispatchingTick, setDispatchingTick] = useState(false);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [pendingFocusNodeId, setPendingFocusNodeId] = useState<string | null>(null);
  const [sourcePreview, setSourcePreview] = useState<{
    nodeId: string;
    ref: SourceRefMatch;
    data: PlanSourcePreviewResponse;
  } | null>(null);
  const [sourcePreviewError, setSourcePreviewError] = useState<{
    nodeId: string;
    message: string;
  } | null>(null);
  const [sourcePreviewLoadingKey, setSourcePreviewLoadingKey] = useState<string | null>(null);
  const composeTextareaRef = useRef<HTMLTextAreaElement>(null);
  const nodeCardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Auto-dismiss review notices (4s) and errors (8s)
  useEffect(() => {
    if (!reviewNotice) return;
    const t = setTimeout(() => setReviewNotice(null), 4000);
    return () => clearTimeout(t);
  }, [reviewNotice]);
  useEffect(() => {
    if (!reviewError) return;
    const t = setTimeout(() => setReviewError(''), 8000);
    return () => clearTimeout(t);
  }, [reviewError]);

  const encodedPlanId = useMemo(() => encodeURIComponent(planId), [planId]);
  const stageOptionsByValue = useMemo(
    () => new Map(stageOptions.map((stage) => [stage.value, stage])),
    [stageOptions],
  );
  const inputClassName =
    'w-full px-2 py-1 border rounded text-xs bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-neutral-100';
  const textAreaClassName =
    'w-full px-2 py-1 border rounded text-xs bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-neutral-100';

  const loadDetail = useCallback(() => {
    setLoading(true);
    setError('');
    pixsimClient
      .get<PlanDetail>(`/dev/plans/${encodedPlanId}?refresh=true`)
      .then((res) => setDetail(res))
      .catch((err) => setError(toErrorMessage(err, 'Failed to load plan')))
      .finally(() => setLoading(false));
  }, [encodedPlanId]);

  const loadReviewGraph = useCallback(async () => {
    setLoadingReviews(true);
    setLoadingAssignees(true);
    setLoadingParticipants(true);
    setLoadingProfiles(true);
    setReviewError('');
    try {
      const [graph, assignees, participants, profileList] = await Promise.all([
        pixsimClient.get<PlanReviewGraphResponse>(
          `/dev/plans/reviews/${encodedPlanId}/graph`,
        ),
        pixsimClient.get<PlanReviewAssigneesResponse>(
          `/dev/plans/reviews/${encodedPlanId}/assignees`,
        ).catch(() => null),
        pixsimClient.get<PlanParticipantsResponse>(
          `/dev/plans/${encodedPlanId}/participants`,
        ).catch(() => null),
        pixsimClient.get<ReviewAgentProfileListResponse>(
          '/dev/agent-profiles',
        ).catch(() => ({ profiles: [], total: 0 })),
      ]);
      setReviewGraph(graph);
      setReviewAssignees(assignees);
      setPlanParticipants(participants);
      setReviewProfiles((profileList.profiles ?? []).filter((p) => p.status === 'active'));
    } catch (err) {
      const message = toErrorMessage(err, 'Failed to load plan review graph');
      setReviewError(
        message.includes('404')
          ? 'Review API is unavailable. Restart backend with the latest review routes.'
          : message,
      );
      setReviewGraph(null);
      setReviewAssignees(null);
      setPlanParticipants(null);
      setReviewProfiles([]);
    } finally {
      setLoadingReviews(false);
      setLoadingAssignees(false);
      setLoadingParticipants(false);
      setLoadingProfiles(false);
    }
  }, [encodedPlanId]);

  useEffect(() => {
    loadDetail();
    // Load test coverage (non-blocking)
    pixsimClient
      .get<typeof coverage>(`/dev/plans/coverage/${encodedPlanId}`)
      .then(setCoverage)
      .catch(() => setCoverage(null));
  }, [loadDetail, encodedPlanId]);

  useEffect(() => {
    void loadReviewGraph();
  }, [loadReviewGraph]);

  // Poll agent sessions while any review request is in_progress
  const [agentSessions, setAgentSessions] = useState<Map<string, AgentSessionSnapshot>>(new Map());
  const hasInProgressRequests = useMemo(
    () => (reviewGraph?.requests ?? []).some((r) => r.status === 'in_progress'),
    [reviewGraph?.requests],
  );
  useEffect(() => {
    if (!hasInProgressRequests) {
      setAgentSessions(new Map());
      return;
    }
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await pixsimClient.get<AgentSessionsSnapshot>('/meta/agents');
        if (cancelled) return;
        const map = new Map<string, AgentSessionSnapshot>();
        for (const s of res.active) map.set(s.session_id, s);
        setAgentSessions(map);
      } catch { /* non-critical */ }
    };
    void poll();
    const interval = setInterval(() => { void poll(); }, 5_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [hasInProgressRequests]);

  // Also auto-refresh the review graph while requests are in-progress
  useEffect(() => {
    if (!hasInProgressRequests) return;
    const interval = setInterval(() => { void loadReviewGraph(); }, 10_000);
    return () => clearInterval(interval);
  }, [hasInProgressRequests, loadReviewGraph]);

  const handleUpdate = useCallback(() => {
    loadDetail();
    void loadReviewGraph();
    onPlanChanged();
  }, [loadDetail, loadReviewGraph, onPlanChanged]);

  const applyUpdate = useCallback(
    async (updates: Record<string, string>) => {
      setUpdating(true);
      setLastResult(null);
      try {
        const payload: Record<string, unknown> = { ...updates };
        if (detail?.revision != null) {
          payload.expected_revision = detail.revision;
        }
        const res = await pixsimClient.patch<PlanUpdateResponse>(
          `/dev/plans/${encodedPlanId}`,
          payload,
        );
        const changed = res.changes.map((c) => `${c.field}: ${c.old}\u2192${c.new}`).join(', ');
        if (res.revision != null) {
          setDetail((prev) => prev ? { ...prev, revision: res.revision } : prev);
        }
        setLastResult(
          res.commitSha
            ? `Updated (${changed}) \u2014 committed ${res.commitSha.slice(0, 7)}`
            : `Updated (${changed})`,
        );
        handleUpdate();
      } catch (err) {
        const conflict = extractRevisionConflict(err);
        if (conflict) {
          setLastResult(
            `Conflict: plan was updated elsewhere (rev ${conflict.expectedRevision} \u2192 ${conflict.currentRevision}). Refreshing\u2026`,
          );
          handleUpdate();
        } else {
          setLastResult(`Failed: ${toErrorMessage(err, 'Unknown error')}`);
        }
      } finally {
        setUpdating(false);
      }
    },
    [encodedPlanId, detail?.revision, handleUpdate],
  );

  const reviewRounds = useMemo(() => {
    const rounds = reviewGraph?.rounds ?? [];
    return [...rounds].sort((a, b) => {
      if (a.roundNumber !== b.roundNumber) return b.roundNumber - a.roundNumber;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [reviewGraph?.rounds]);

  const reviewRoundNumberById = useMemo(() => {
    const map = new Map<string, number>();
    for (const round of reviewGraph?.rounds ?? []) {
      map.set(round.id, round.roundNumber);
    }
    return map;
  }, [reviewGraph?.rounds]);

  const reviewNodeCountByRound = useMemo(() => {
    const counts = new Map<string, number>();
    for (const node of reviewGraph?.nodes ?? []) {
      counts.set(node.roundId, (counts.get(node.roundId) ?? 0) + 1);
    }
    return counts;
  }, [reviewGraph?.nodes]);

  const reviewerParticipants = useMemo(
    () => planParticipants?.reviewers ?? [],
    [planParticipants?.reviewers],
  );

  const builderParticipants = useMemo(
    () => planParticipants?.builders ?? [],
    [planParticipants?.builders],
  );

  useEffect(() => {
    if (reviewRounds.length === 0) {
      setSelectedRoundId('');
      return;
    }
    setSelectedRoundId((prev) =>
      prev && reviewRounds.some((round) => round.id === prev) ? prev : reviewRounds[0]!.id,
    );
  }, [reviewRounds]);

  const selectedRound = useMemo(
    () => reviewRounds.find((round) => round.id === selectedRoundId) ?? null,
    [reviewRounds, selectedRoundId],
  );

  useEffect(() => {
    if (!selectedRound) {
      setRoundStatusDraft('open');
      setRoundNoteDraft('');
      setRoundConclusionDraft('');
      return;
    }
    setRoundStatusDraft(selectedRound.status);
    setRoundNoteDraft(selectedRound.note ?? '');
    setRoundConclusionDraft(selectedRound.conclusion ?? '');
  }, [selectedRound]);

  useEffect(() => {
    setSourcePreview(null);
    setSourcePreviewError(null);
    setSourcePreviewLoadingKey(null);
  }, [selectedRoundId]);

  const selectedRoundNodes = useMemo(() => {
    if (!selectedRoundId) return [];
    const nodes = (reviewGraph?.nodes ?? []).filter((node) => node.roundId === selectedRoundId);
    return [...nodes].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  }, [reviewGraph?.nodes, selectedRoundId]);

  const selectedRoundRequests = useMemo(() => {
    const requests = reviewGraph?.requests ?? [];
    return [...requests]
      .filter((request) => !selectedRoundId || request.roundId === selectedRoundId || request.roundId === null)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [reviewGraph?.requests, selectedRoundId]);

  // Nodes linked to dismissed requests - show faded in discussion
  const dismissedNodeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const r of reviewGraph?.requests ?? []) {
      if (r.dismissed && r.resolvedNodeId) ids.add(r.resolvedNodeId);
    }
    // Also check node meta for request_id linkage
    for (const node of reviewGraph?.nodes ?? []) {
      const reqId = (node.meta as any)?.request_id;
      if (reqId) {
        const req = (reviewGraph?.requests ?? []).find((r) => r.id === reqId);
        if (req?.dismissed) ids.add(node.id);
      }
    }
    return ids;
  }, [reviewGraph?.requests, reviewGraph?.nodes]);

  const liveAssigneeOptions = useMemo(
    () => (reviewAssignees?.liveSessions ?? []),
    [reviewAssignees?.liveSessions],
  );

  const recentAssigneeOptions = useMemo(
    () => (reviewAssignees?.recentAgents ?? []),
    [reviewAssignees?.recentAgents],
  );

  const reviewProfileById = useMemo(
    () => new Map(reviewProfiles.map((profile) => [profile.id, profile])),
    [reviewProfiles],
  );

  const reviewProfileLabels = useMemo(
    () => new Map(reviewProfiles.map((profile) => [profile.id, profile.label])),
    [reviewProfiles],
  );

  const applyRequestProfileSelection = useCallback(
    (profileId: string) => {
      setNewRequestProfileId(profileId);
      if (!profileId) return;
      const profile = reviewProfileById.get(profileId);
      if (!profile) return;
      setNewRequestMethod(profile.method ?? '');
      setNewRequestModelId(profile.model_id ?? '');
      const config = profile.config && typeof profile.config === 'object' ? profile.config : null;
      const providerRaw = config ? config['provider'] : null;
      const providerIdRaw = config ? config['provider_id'] : null;
      const providerValue =
        (typeof providerRaw === 'string' && providerRaw.trim())
          || (typeof providerIdRaw === 'string' && providerIdRaw.trim())
          || '';
      setNewRequestProvider(providerValue);
    },
    [reviewProfileById],
  );

  useEffect(() => {
    if (newRequestAssignee === 'auto') return;
    const parsed = parseAssigneeOptionValue(newRequestAssignee);
    if (!parsed) {
      setNewRequestAssignee('auto');
      return;
    }
    if (parsed.kind === 'live') {
      const exists = liveAssigneeOptions.some((opt) => opt.agentId === parsed.id);
      if (!exists) setNewRequestAssignee('auto');
      return;
    }
    const exists = recentAssigneeOptions.some((opt) => opt.agentId === parsed.id);
    if (!exists) setNewRequestAssignee('auto');
  }, [liveAssigneeOptions, newRequestAssignee, recentAssigneeOptions]);

  useEffect(() => {
    if (!newRequestProfileId) return;
    if (reviewProfileById.has(newRequestProfileId)) return;
    setNewRequestProfileId('');
  }, [newRequestProfileId, reviewProfileById]);

  const selectedRoundLinksBySource = useMemo(() => {
    const bySource = new Map<string, PlanReviewLink[]>();
    for (const link of reviewGraph?.links ?? []) {
      if (selectedRoundId && link.roundId !== selectedRoundId) continue;
      const links = bySource.get(link.sourceNodeId) ?? [];
      links.push(link);
      bySource.set(link.sourceNodeId, links);
    }
    return bySource;
  }, [reviewGraph?.links, selectedRoundId]);

  const selectedRoundNodeOrder = useMemo(() => {
    const order = new Map<string, number>();
    selectedRoundNodes.forEach((node, idx) => {
      order.set(node.id, idx + 1);
    });
    return order;
  }, [selectedRoundNodes]);

  const selectedRoundThreadRefByChild = useMemo(() => {
    const relationRank: Record<PlanReviewLink['relation'], number> = {
      replies_to: 0,
      addresses: 1,
      because_of: 2,
      supports: 2,
      contradicts: 2,
      supersedes: 2,
    };
    const selectedIds = new Set(selectedRoundNodes.map((node) => node.id));
    const bestRefByChild = new Map<
      string,
      { parentId: string; linkId: string; relation: PlanReviewLink['relation']; rank: number }
    >();
    for (const link of reviewGraph?.links ?? []) {
      if (selectedRoundId && link.roundId !== selectedRoundId) continue;
      if (!selectedIds.has(link.sourceNodeId)) continue;
      if (!link.targetNodeId || !selectedIds.has(link.targetNodeId)) continue;
      if (link.targetNodeId === link.sourceNodeId) continue;
      const rank = relationRank[link.relation] ?? 99;
      const existing = bestRefByChild.get(link.sourceNodeId);
      if (!existing || rank < existing.rank) {
        bestRefByChild.set(link.sourceNodeId, {
          parentId: link.targetNodeId,
          linkId: link.id,
          relation: link.relation,
          rank,
        });
      }
    }
    const result = new Map<string, { parentId: string; linkId: string; relation: PlanReviewLink['relation'] }>();
    for (const [childId, ref] of bestRefByChild) {
      result.set(childId, {
        parentId: ref.parentId,
        linkId: ref.linkId,
        relation: ref.relation,
      });
    }
    return result;
  }, [reviewGraph?.links, selectedRoundId, selectedRoundNodes]);

  const selectedRoundThread = useMemo(() => {
    const nodeById = new Map(selectedRoundNodes.map((node) => [node.id, node]));
    const childrenByParent = new Map<string, PlanReviewNode[]>();
    const childIds = new Set<string>();

    for (const node of selectedRoundNodes) {
      const parentId = selectedRoundThreadRefByChild.get(node.id)?.parentId;
      if (!parentId || !nodeById.has(parentId)) continue;
      childIds.add(node.id);
      const siblings = childrenByParent.get(parentId) ?? [];
      siblings.push(node);
      childrenByParent.set(parentId, siblings);
    }

    for (const siblings of childrenByParent.values()) {
      siblings.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    }

    const roots = selectedRoundNodes.filter((node) => !childIds.has(node.id));
    return {
      roots: roots.length > 0 ? roots : selectedRoundNodes,
      childrenByParent,
    };
  }, [selectedRoundNodes, selectedRoundThreadRefByChild]);

  const nodeById = useMemo(() => {
    const map = new Map<string, PlanReviewNode>();
    for (const node of reviewGraph?.nodes ?? []) map.set(node.id, node);
    return map;
  }, [reviewGraph?.nodes]);

  const focusLinkedNode = useCallback(
    (targetNodeId: string) => {
      const targetNode = nodeById.get(targetNodeId);
      if (!targetNode) return;
      if (targetNode.roundId !== selectedRoundId) {
        setSelectedRoundId(targetNode.roundId);
      }
      setPendingFocusNodeId(targetNode.id);
    },
    [nodeById, selectedRoundId],
  );

  const previewSourceRef = useCallback(
    async (nodeId: string, ref: SourceRefMatch) => {
      const key = `${nodeId}:${ref.path}:${ref.startLine}-${ref.endLine}`;
      setSourcePreviewLoadingKey(key);
      setSourcePreviewError(null);
      try {
        const query = new URLSearchParams({
          path: ref.path,
          start_line: String(ref.startLine),
          end_line: String(ref.endLine),
        });
        const data = await pixsimClient.get<PlanSourcePreviewResponse>(
          `/dev/plans/reviews/${encodedPlanId}/source-preview?${query.toString()}`,
        );
        setSourcePreview({ nodeId, ref, data });
      } catch (err) {
        setSourcePreviewError({
          nodeId,
          message: toErrorMessage(err, 'Failed to load source preview'),
        });
      } finally {
        setSourcePreviewLoadingKey(null);
      }
    },
    [encodedPlanId],
  );

  useEffect(() => {
    if (!pendingFocusNodeId) return;
    const el = nodeCardRefs.current.get(pendingFocusNodeId);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setFocusedNodeId(pendingFocusNodeId);
    setPendingFocusNodeId(null);
    const timeout = window.setTimeout(() => {
      setFocusedNodeId((current) => (current === pendingFocusNodeId ? null : current));
    }, 1600);
    return () => window.clearTimeout(timeout);
  }, [pendingFocusNodeId, selectedRoundId, selectedRoundNodes]);

  const relationOptions = useMemo(
    () => REVIEW_RELATIONS.filter((r) => newNodeRefTargetId || !r.requiresTargetNode),
    [newNodeRefTargetId],
  );

  useEffect(() => {
    if (!newNodeRefTargetId && REVIEW_CAUSAL_RELATIONS.has(newNodeRefRelation)) {
      setNewNodeRefRelation('addresses');
    }
  }, [newNodeRefTargetId, newNodeRefRelation]);

  const handleCreateRound = useCallback(async () => {
    setCreatingRound(true);
    setReviewError('');
    setReviewNotice(null);
    try {
      const payload: PlanReviewRoundCreateRequest = { status: newRoundStatus };
      const note = newRoundNote.trim();
      if (note) payload.note = note;

      const revisionRaw = newRoundRevision.trim();
      if (revisionRaw) {
        const parsed = Number.parseInt(revisionRaw, 10);
        if (!Number.isFinite(parsed) || parsed < 1) {
          setReviewError('Round revision must be a positive integer.');
          return;
        }
        payload.review_revision = parsed;
      }

      const round = await pixsimClient.post<PlanReviewRound>(
        `/dev/plans/reviews/${encodedPlanId}/rounds`,
        payload,
      );
      setNewRoundRevision('');
      setNewRoundNote('');
      setSelectedRoundId(round.id);
      setReviewNotice(`Created review round #${round.roundNumber}.`);
      await loadReviewGraph();
    } catch (err) {
      setReviewError(toErrorMessage(err, 'Failed to create review round'));
    } finally {
      setCreatingRound(false);
    }
  }, [encodedPlanId, loadReviewGraph, newRoundNote, newRoundRevision, newRoundStatus]);

  const handleUpdateRound = useCallback(
    async (payload: PlanReviewRoundUpdateRequest, successMessage: string) => {
      if (!selectedRound) {
        setReviewError('Select a review round first.');
        return;
      }
      setUpdatingRound(true);
      setReviewError('');
      setReviewNotice(null);
      try {
        await pixsimClient.patch<PlanReviewRound>(
          `/dev/plans/reviews/${encodedPlanId}/rounds/${encodeURIComponent(selectedRound.id)}`,
          payload,
        );
        setReviewNotice(successMessage);
        await loadReviewGraph();
      } catch (err) {
        setReviewError(toErrorMessage(err, 'Failed to update review round'));
      } finally {
        setUpdatingRound(false);
      }
    },
    [encodedPlanId, loadReviewGraph, selectedRound],
  );

  const handleSaveRoundState = useCallback(async () => {
    if (!selectedRound) {
      setReviewError('Select a review round first.');
      return;
    }

    const nextNote = roundNoteDraft.trim();
    const currentNote = (selectedRound.note ?? '').trim();
    const nextConclusion = roundConclusionDraft.trim();
    const currentConclusion = (selectedRound.conclusion ?? '').trim();

    if (roundStatusDraft === 'concluded' && !nextConclusion) {
      setReviewError('Concluded rounds require a non-empty conclusion.');
      return;
    }

    const payload: PlanReviewRoundUpdateRequest = {};
    if (roundStatusDraft !== selectedRound.status) payload.status = roundStatusDraft;
    if (nextNote !== currentNote) payload.note = nextNote;
    if (roundStatusDraft === 'concluded' && nextConclusion !== currentConclusion) {
      payload.conclusion = nextConclusion;
    }

    if (!payload.status && payload.note === undefined && payload.conclusion === undefined) {
      setReviewNotice('No round changes to save.');
      return;
    }

    await handleUpdateRound(payload, `Updated review round #${selectedRound.roundNumber}.`);
  }, [
    handleUpdateRound,
    roundConclusionDraft,
    roundNoteDraft,
    roundStatusDraft,
    selectedRound,
  ]);

  const handleCreateNode = useCallback(async () => {
    if (!selectedRound) {
      setReviewError('Select a review round first.');
      return;
    }
    if (selectedRound.status === 'concluded') {
      setReviewError('Round is concluded. Re-open it before adding new responses.');
      return;
    }

    const body = newNodeBody.trim();
    if (!body) {
      setReviewError('Response body is required.');
      return;
    }

    if (!newNodeRefTargetId && REVIEW_CAUSAL_RELATIONS.has(newNodeRefRelation)) {
      setReviewError(`Relation '${newNodeRefRelation}' requires a target node.`);
      return;
    }

    setCreatingNode(true);
    setReviewError('');
    setReviewNotice(null);
    try {
      const refs: PlanReviewRefInput[] = [];
      const quote = newNodeRefQuote.trim();
      if (newNodeRefTargetId) {
        refs.push({
          relation: newNodeRefRelation,
          target_node_id: newNodeRefTargetId,
          quote: quote || undefined,
        });
      } else {
        const planAnchor = newNodeRefPlanAnchor.trim();
        if (planAnchor) {
          refs.push({
            relation: newNodeRefRelation,
            target_plan_anchor: { label: planAnchor },
            quote: quote || undefined,
          });
        }
      }

      const payload: PlanReviewNodeCreateRequest = {
        round_id: selectedRound.id,
        kind: newNodeKind,
        author_role: newNodeAuthorRole,
        body,
      };
      if (newNodeSeverity) payload.severity = newNodeSeverity;
      if (refs.length > 0) payload.refs = refs;

      const created = await pixsimClient.post<PlanReviewNodeCreateResponse>(
        `/dev/plans/reviews/${encodedPlanId}/nodes`,
        payload,
      );
      setReviewNotice(`Added response node ${created.node.id.slice(0, 8)}.`);
      setNewNodeBody('');
      setNewNodeSeverity('');
      setNewNodeRefRelation('replies_to');
      setNewNodeRefTargetId('');
      setNewNodeRefPlanAnchor('');
      setNewNodeRefQuote('');
      await loadReviewGraph();
    } catch (err) {
      setReviewError(toErrorMessage(err, 'Failed to add response node'));
    } finally {
      setCreatingNode(false);
    }
  }, [
    encodedPlanId,
    loadReviewGraph,
    newNodeAuthorRole,
    newNodeBody,
    newNodeKind,
    newNodeRefPlanAnchor,
    newNodeRefQuote,
    newNodeRefRelation,
    newNodeRefTargetId,
    newNodeSeverity,
    selectedRound,
  ]);

  const handleCreateRequest = useCallback(async () => {
    const title = newRequestTitle.trim();
    const body = newRequestBody.trim();
    if (!title) {
      setReviewError('Request title is required.');
      return;
    }
    if (!body) {
      setReviewError('Request body is required.');
      return;
    }

    setCreatingRequest(true);
    setReviewError('');
    setReviewNotice(null);
    try {
      const payload: PlanRequestCreateRequest = {
        title,
        body,
        review_mode: newRequestMode,
      };
      if (selectedRound) payload.round_id = selectedRound.id;
      const baseRevisionRaw = newRequestBaseRevision.trim();
      if (baseRevisionRaw) {
        const parsed = Number.parseInt(baseRevisionRaw, 10);
        if (!Number.isInteger(parsed) || parsed <= 0) {
          setReviewError('Base revision must be a positive integer.');
          return;
        }
        payload.base_revision = parsed;
      } else if (newRequestMode !== 'review_only') {
        setReviewError('Base revision is required for propose_patch/apply_patch modes.');
        return;
      }

      if (newRequestAssignee === 'auto') {
        payload.target_mode = 'auto';
      } else {
        const parsed = parseAssigneeOptionValue(newRequestAssignee);
        if (parsed?.kind === 'live') {
          const selectedLiveAssignee = liveAssigneeOptions.find((option) => option.agentId === parsed.id);
          if (
            selectedLiveAssignee
            && typeof selectedLiveAssignee.targetUserId === 'number'
            && selectedLiveAssignee.targetUserId > 0
          ) {
            payload.target_user_id = selectedLiveAssignee.targetUserId;
          }
          // Store as preference - dispatcher re-checks availability at dispatch time
          payload.target_mode = 'auto';
          payload.preferred_agent_id = parsed.id;
        } else if (parsed?.kind === 'recent') {
          payload.target_mode = 'auto';
          payload.preferred_agent_id = parsed.id;
        } else {
          payload.target_mode = 'auto';
        }
      }

      payload.queue_if_busy = newRequestQueuePolicy === 'queue_next';
      payload.auto_reroute_if_busy = newRequestQueuePolicy === 'auto_reroute';
      const targetProfileId = newRequestProfileId.trim();
      const targetMethod = newRequestMethod.trim();
      const targetModelId = newRequestModelId.trim();
      const targetProvider = newRequestProvider.trim();
      if (targetProfileId) payload.target_profile_id = targetProfileId;
      if (targetMethod) payload.target_method = targetMethod;
      if (targetModelId) payload.target_model_id = targetModelId;
      if (targetProvider) payload.target_provider = targetProvider;

      const created = await pixsimClient.post<PlanRequest>(
        `/dev/plans/reviews/${encodedPlanId}/requests`,
        payload,
      );
      setNewRequestTitle('');
      setNewRequestBody('');
      setNewRequestAssignee('auto');
      setNewRequestProfileId('');
      setNewRequestMethod('');
      setNewRequestModelId('');
      setNewRequestProvider('');
      setNewRequestMode('review_only');
      setNewRequestBaseRevision('');

      // Auto-dispatch when assignee is "auto" (idle agent dispatch)
      if (newRequestAssignee === 'auto' && created.status === 'open') {
        try {
          const result = await pixsimClient.post<PlanRequestDispatchResponse>(
            `/dev/plans/reviews/${encodedPlanId}/requests/${encodeURIComponent(created.id)}/dispatch`,
            { timeout_seconds: 240, create_round_if_missing: true, spawn_if_missing: false },
          );
          const nodeSuffix = result.node ? ` (node ${result.node.id.slice(0, 8)})` : '';
          setReviewNotice(`Request created & dispatched: ${result.message}${nodeSuffix}`);
        } catch {
          setReviewNotice('Request created but auto-dispatch failed - dispatch manually.');
        }
      } else {
        const dispatchLabel = created.dispatchState ? ` (${created.dispatchState})` : '';
        setReviewNotice(`Review request created${dispatchLabel}.`);
      }
      await loadReviewGraph();
    } catch (err) {
      setReviewError(toErrorMessage(err, 'Failed to create review request'));
    } finally {
      setCreatingRequest(false);
    }
  }, [
    encodedPlanId,
    liveAssigneeOptions,
    loadReviewGraph,
    newRequestBody,
    newRequestAssignee,
    newRequestMethod,
    newRequestModelId,
    newRequestMode,
    newRequestProfileId,
    newRequestProvider,
    newRequestQueuePolicy,
    newRequestBaseRevision,
    newRequestTitle,
    selectedRound,
  ]);

  const handleUpdateRequestStatus = useCallback(
    async (request: PlanRequest, status: ReviewRequestStatus) => {
      if (request.status === status) return;
      setUpdatingRequestId(request.id);
      setReviewError('');
      setReviewNotice(null);
      try {
        const payload: PlanRequestUpdateRequest = { status };
        if (status === 'fulfilled' && !request.resolutionNote) {
          payload.resolution_note = `Marked fulfilled on ${new Date().toISOString()}`;
        }
        await pixsimClient.patch<PlanRequest>(
          `/dev/plans/reviews/${encodedPlanId}/requests/${encodeURIComponent(request.id)}`,
          payload,
        );
        setReviewNotice(`Review request '${request.title}' set to ${status}.`);
        await loadReviewGraph();
      } catch (err) {
        setReviewError(toErrorMessage(err, 'Failed to update review request'));
      } finally {
        setUpdatingRequestId(null);
      }
    },
    [encodedPlanId, loadReviewGraph],
  );

  const handleDismissRequest = useCallback(
    async (request: PlanRequest) => {
      if (request.status === 'in_progress') return;
      setReviewError('');
      setReviewNotice(null);
      try {
        await pixsimClient.patch<PlanRequest>(
          `/dev/plans/reviews/${encodedPlanId}/requests/${encodeURIComponent(request.id)}`,
          { dismissed: true },
        );
        await loadReviewGraph();
      } catch (err) {
        setReviewError(toErrorMessage(err, 'Failed to dismiss review request'));
      }
    },
    [encodedPlanId, loadReviewGraph],
  );

  const handleDispatchRequest = useCallback(
    async (request: PlanRequest) => {
      if (request.status !== 'open') return;
      setDispatchingRequestId(request.id);
      setReviewError('');
      setReviewNotice(null);
      try {
        const payload: PlanRequestDispatchRequest = {
          timeout_seconds: 240,
          create_round_if_missing: true,
          spawn_if_missing: false,
        };
        const result = await pixsimClient.post<PlanRequestDispatchResponse>(
          `/dev/plans/reviews/${encodedPlanId}/requests/${encodeURIComponent(request.id)}/dispatch`,
          payload,
        );
        const nodeSuffix = result.node ? ` (node ${result.node.id.slice(0, 8)})` : '';
        setReviewNotice(`${result.message}${nodeSuffix}`);
        await loadReviewGraph();
      } catch (err) {
        setReviewError(toErrorMessage(err, 'Failed to dispatch review request'));
      } finally {
        setDispatchingRequestId(null);
      }
    },
    [encodedPlanId, loadReviewGraph],
  );

  const handleDispatchTick = useCallback(async () => {
    setDispatchingTick(true);
    setReviewError('');
    setReviewNotice(null);
    try {
      const result = await pixsimClient.post<PlanReviewDispatchTickResponse>(
        '/dev/plans/reviews/dispatch/tick',
        {
          plan_id: planId,
          limit: 5,
          timeout_seconds: 240,
          create_round_if_missing: true,
          spawn_if_missing: false,
        },
      );
      setReviewNotice(`Dispatch tick: processed ${result.processed}/${result.attempted} open requests.`);
      await loadReviewGraph();
    } catch (err) {
      setReviewError(toErrorMessage(err, 'Failed to dispatch open review requests'));
    } finally {
      setDispatchingTick(false);
    }
  }, [loadReviewGraph, planId]);

  const handleReplyToNode = useCallback((node: PlanReviewNode) => {
    setNewNodeKind('agent_response');
    setNewNodeAuthorRole('agent');
    setNewNodeRefTargetId(node.id);
    setNewNodeRefPlanAnchor('');
    setNewNodeRefRelation('replies_to');
    setReviewNotice(`Reply target set to ${node.id.slice(0, 8)}.`);
    setTimeout(() => composeTextareaRef.current?.focus(), 0);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <EmptyState message="Loading plan..." icon={<Icon name="loader" size={20} />} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <EmptyState message="Failed to load plan" description={error} icon={<Icon name="alertCircle" size={20} />} />
      </div>
    );
  }

  if (!detail) return null;

  const pointProgressRows = detail.checkpoints
    ?.map((cp) => getCheckpointPointProgress(cp))
    .filter((progress): progress is { done: number; total: number } => progress !== null) ?? [];
  const donePoints = pointProgressRows.reduce((sum, progress) => sum + progress.done, 0);
  const totalPoints = pointProgressRows.reduce((sum, progress) => sum + progress.total, 0);
  const overallPointsProgress = totalPoints > 0 ? Math.round((donePoints / totalPoints) * 100) : null;
  const totalSteps = detail.checkpoints?.reduce((sum, cp) => sum + (cp.steps?.length ?? 0), 0) ?? 0;
  const doneSteps = detail.checkpoints?.reduce((sum, cp) => sum + (cp.steps?.filter((s) => s.done).length ?? 0), 0) ?? 0;
  const overallStepProgress = totalSteps > 0 ? Math.round((doneSteps / totalSteps) * 100) : null;
  const overallProgress = overallPointsProgress ?? overallStepProgress;
  const overallProgressLabel = overallPointsProgress !== null
    ? `${donePoints}/${totalPoints} pts`
    : `${doneSteps}/${totalSteps} steps`;

  const statusOptions = [
    { value: 'active', label: 'Active', color: 'green' as const },
    { value: 'parked', label: 'Parked', color: 'gray' as const },
    { value: 'done', label: 'Done', color: 'blue' as const },
    { value: 'blocked', label: 'Blocked', color: 'red' as const },
  ];

  const priorityOptions = [
    { value: 'high', label: 'High', color: 'red' as const },
    { value: 'normal', label: 'Normal', color: 'orange' as const },
    { value: 'low', label: 'Low', color: 'gray' as const },
  ];
  const stageBadgeOptions = stageOptions.map((stage) => ({
    value: stage.value,
    label: stage.label,
    color: STAGE_BADGE_COLORS[stage.value] ?? 'gray',
  }));
  const stageLabel = stageLabelFromValue(detail.stage, stageOptionsByValue);

  return (
    <div className="p-4 space-y-4">
      {/* Plan lineage - parent -> this -> children */}
      {(detail.parentId || detail.children.length > 0) && (
        <div className="flex items-center gap-1 flex-wrap text-[10px]">
          {detail.parentId && (
            <>
              <button
                type="button"
                onClick={() => onNavigatePlan?.(detail.parentId!)}
                className="text-blue-600 dark:text-blue-400 hover:underline truncate max-w-[150px]"
                title={detail.parentId}
              >
                {detail.parentId}
              </button>
              <Icon name="chevronRight" size={10} className="text-neutral-400 shrink-0" />
            </>
          )}
          <span className="font-medium text-neutral-700 dark:text-neutral-300 truncate max-w-[200px]">
            {detail.title}
          </span>
          {detail.children.map((child) => (
            <span key={child.id} className="flex items-center gap-1">
              <Icon name="chevronRight" size={10} className="text-neutral-400 shrink-0" />
              <button
                type="button"
                onClick={() => onNavigatePlan?.(child.id)}
                className="text-blue-600 dark:text-blue-400 hover:underline truncate max-w-[150px]"
                title={`${child.title} (${child.status})`}
              >
                {child.title}
              </button>
              <Badge color={STATUS_COLORS[child.status] ?? 'gray'} className="text-[9px]">{child.status}</Badge>
            </span>
          ))}
        </div>
      )}

      {/* Header with clickable status/priority badges */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            {detail.title}
          </h2>
          <ClickableBadge
            value={detail.status}
            color={STATUS_COLORS[detail.status] ?? 'gray'}
            options={statusOptions}
            onSelect={(v) => void applyUpdate({ status: v })}
            disabled={updating}
          />
          <ClickableBadge
            value={detail.priority}
            color={PRIORITY_COLORS[detail.priority] ?? 'gray'}
            options={priorityOptions}
            onSelect={(v) => void applyUpdate({ priority: v })}
            disabled={updating}
          />
          <ClickableBadge
            value={detail.stage}
            displayValue={stageLabel}
            color={STAGE_BADGE_COLORS[detail.stage] ?? 'gray'}
            options={stageBadgeOptions}
            onSelect={(v) => void applyUpdate({ stage: v })}
            disabled={updating}
          />
          <Badge color="gray" className="text-[10px]">{detail.planType}</Badge>
          {detail.visibility !== 'public' && (
            <Badge color={detail.visibility === 'private' ? 'orange' : 'blue'} className="text-[10px]">
              {detail.visibility}
            </Badge>
          )}
        </div>
        <div className="text-sm text-neutral-500 dark:text-neutral-400">{detail.summary}</div>
        {lastResult && (
          <div className={`text-xs mt-1 ${lastResult.startsWith('Failed') ? 'text-red-500' : 'text-green-600 dark:text-green-400'}`}>
            {lastResult}
          </div>
        )}
      </div>

      {/* Compact metadata row */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500 dark:text-neutral-400">
        <span className="flex items-center gap-1">
          <Icon name="user" size={11} className="text-neutral-400" />
          <span className="font-medium text-neutral-700 dark:text-neutral-300">{detail.owner}</span>
        </span>
        <span className="text-neutral-300 dark:text-neutral-600">&middot;</span>
        <span>Stage: <span className="font-medium text-neutral-700 dark:text-neutral-300">{stageLabel}</span></span>
        {overallProgress !== null ? (
          <>
            <span className="text-neutral-300 dark:text-neutral-600">&middot;</span>
            <span>{overallProgress}% <span className="text-neutral-400">({overallProgressLabel})</span></span>
          </>
        ) : (
          <>
            <span className="text-neutral-300 dark:text-neutral-600">&middot;</span>
            <span>{detail.scope}</span>
          </>
        )}
        <span className="text-neutral-300 dark:text-neutral-600">&middot;</span>
        <span>{formatDate(detail.lastUpdated)}</span>
      </div>

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

      <DisclosureSection
        label="Review Loop"
        defaultOpen={false}
        className="rounded-md border border-neutral-200 dark:border-neutral-700 p-3"
        contentClassName="space-y-3 mt-2"
        badge={
          <span className="text-[10px] text-neutral-400">
            {reviewGraph ? `${reviewGraph.rounds.length} rounds` : '0 rounds'}
          </span>
        }
        actions={
          <Button size="sm" onClick={() => void loadReviewGraph()} disabled={loadingReviews}>
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
                Review Rounds
              </div>
              {loadingReviews && reviewRounds.length === 0 ? (
                <div className="text-xs text-neutral-500 dark:text-neutral-400">Loading review graph...</div>
              ) : reviewRounds.length === 0 ? (
                <div className="text-xs text-neutral-500 dark:text-neutral-400">No review rounds yet.</div>
              ) : (
                <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
                  {reviewRounds.map((round) => {
                    const selected = round.id === selectedRoundId;
                    return (
                      <button
                        key={round.id}
                        onClick={() => setSelectedRoundId(round.id)}
                        className={`w-full text-left p-2 rounded border text-xs ${
                          selected
                            ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/20'
                            : 'border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="font-medium text-neutral-800 dark:text-neutral-200">
                            Round #{round.roundNumber}
                          </span>
                          <Badge color={REVIEW_ROUND_STATUS_COLORS[round.status]} className="text-[9px]">
                            {round.status}
                          </Badge>
                        </div>
                        <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
                          {reviewNodeCountByRound.get(round.id) ?? 0} nodes
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
                    );
                  })}
                </div>
              )}
            </div>

            <DisclosureSection
              label="Start New Round"
              defaultOpen={false}
              className="rounded-md border border-neutral-200 dark:border-neutral-700 p-2"
              contentClassName="space-y-2"
            >
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[11px] text-neutral-600 dark:text-neutral-400">
                  Status
                  <select
                    value={newRoundStatus}
                    onChange={(e) => setNewRoundStatus(e.target.value as 'open' | 'changes_requested' | 'approved')}
                    className={inputClassName}
                  >
                    <option value="open">open</option>
                    <option value="changes_requested">changes_requested</option>
                    <option value="approved">approved</option>
                  </select>
                </label>
                <label className="text-[11px] text-neutral-600 dark:text-neutral-400">
                  Revision
                  <input
                    value={newRoundRevision}
                    onChange={(e) => setNewRoundRevision(e.target.value)}
                    className={inputClassName}
                    placeholder="optional"
                  />
                </label>
              </div>
              <label className="text-[11px] text-neutral-600 dark:text-neutral-400 block">
                Note
                <input
                  value={newRoundNote}
                  onChange={(e) => setNewRoundNote(e.target.value)}
                  className={inputClassName}
                  placeholder="Optional context for this round"
                />
              </label>
              <Button size="sm" onClick={() => void handleCreateRound()} disabled={creatingRound}>
                {creatingRound ? 'Creating...' : 'Create Round'}
              </Button>
            </DisclosureSection>
          </div>

          <div className="space-y-3 xl:col-span-2">
            <div className="rounded-md border border-neutral-200 dark:border-neutral-700 p-2 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                  {selectedRound ? `Round #${selectedRound.roundNumber}` : 'Round State'}
                </span>
                {selectedRound && (
                  <Badge color={REVIEW_ROUND_STATUS_COLORS[selectedRound.status]} className="text-[9px]">
                    {selectedRound.status}
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
                  Select a review round to inspect responses.
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <label className="text-[11px] text-neutral-600 dark:text-neutral-400">
                      Status
                      <select
                        value={roundStatusDraft}
                        onChange={(e) => setRoundStatusDraft(e.target.value as ReviewRoundStatus)}
                        className={inputClassName}
                      >
                        <option value="open">open</option>
                        <option value="changes_requested">changes_requested</option>
                        <option value="approved">approved</option>
                        <option value="concluded">concluded</option>
                      </select>
                    </label>
                    <label className="text-[11px] text-neutral-600 dark:text-neutral-400 sm:col-span-2">
                      Note
                      <input
                        value={roundNoteDraft}
                        onChange={(e) => setRoundNoteDraft(e.target.value)}
                        className={inputClassName}
                        placeholder="Optional round note"
                      />
                    </label>
                  </div>

                  <label className="text-[11px] text-neutral-600 dark:text-neutral-400 block">
                    Conclusion (required when status=concluded)
                    <textarea
                      value={roundConclusionDraft}
                      onChange={(e) => setRoundConclusionDraft(e.target.value)}
                      className={textAreaClassName}
                      rows={2}
                    />
                  </label>

                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={() => void handleSaveRoundState()} disabled={updatingRound}>
                      {updatingRound ? 'Saving...' : 'Save Round State'}
                    </Button>
                    <span className="text-[10px] text-neutral-400">
                      Updated {formatDateTime(selectedRound.updatedAt)}
                    </span>
                  </div>
                </>
              )}
            </div>

            <DisclosureSection
              label="Review Requests"
              defaultOpen
              className="rounded-md border border-neutral-200 dark:border-neutral-700 p-2"
              contentClassName="space-y-2"
              badge={
                <Badge color="gray" className="text-[9px]">{selectedRoundRequests.length}</Badge>
              }
              actions={
                <Button
                  size="sm"
                  onClick={() => void handleDispatchTick()}
                  disabled={dispatchingTick || !selectedRoundRequests.some((request) => request.status === 'open')}
                >
                  {dispatchingTick ? 'Dispatching...' : 'Dispatch Open'}
                </Button>
              }
            >

              {selectedRoundRequests.length === 0 ? (
                <div className="text-xs text-neutral-500 dark:text-neutral-400">
                  No review requests yet.
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
                      onDispatchRequest={handleDispatchRequest}
                      onUpdateRequestStatus={handleUpdateRequestStatus}
                      onDismissRequest={handleDismissRequest}
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
                onTitleChange={setNewRequestTitle}
                onBodyChange={setNewRequestBody}
                onProfileChange={applyRequestProfileSelection}
                onMethodChange={setNewRequestMethod}
                onProviderChange={setNewRequestProvider}
                onModelIdChange={setNewRequestModelId}
                onModeChange={setNewRequestMode}
                onBaseRevisionChange={setNewRequestBaseRevision}
                onAssigneeChange={setNewRequestAssignee}
                onQueuePolicyChange={setNewRequestQueuePolicy}
                onSubmit={() => void handleCreateRequest()}
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
                  Select a review round to view discussion.
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
                    onPreviewSourceRef={previewSourceRef}
                    onClearSourcePreview={() => setSourcePreview(null)}
                    onFocusLinkedNode={focusLinkedNode}
                    onReplyToNode={handleReplyToNode}
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
              onKindChange={setNewNodeKind}
              onAuthorRoleChange={setNewNodeAuthorRole}
              onSeverityChange={setNewNodeSeverity}
              onBodyChange={setNewNodeBody}
              onRefTargetIdChange={setNewNodeRefTargetId}
              onRefRelationChange={setNewNodeRefRelation}
              onRefPlanAnchorChange={setNewNodeRefPlanAnchor}
              onRefQuoteChange={setNewNodeRefQuote}
              onSubmit={() => void handleCreateNode()}
            />
          </div>
        </div>
      </DisclosureSection>

      {/* Parent reference moved to lineage bar at top */}

      {/* Plan markdown - collapsed by default */}
      {detail.markdown && (
        <div>
          <button
            onClick={() => setPlanExpanded((e) => !e)}
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
    </div>
  );
}
