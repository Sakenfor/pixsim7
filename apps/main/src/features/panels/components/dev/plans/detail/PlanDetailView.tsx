/**
 * PlanDetailView — orchestrator component.
 *
 * Holds all useState, useCallback, useMemo, useEffect hooks.
 * Delegates rendering to PlanDetailHeader, PlanDetailSections,
 * and PlanAgentTasksSection.
 *
 * Extracted from PlansPanel.tsx during split — no logic changes.
 */

import { EmptyState } from '@pixsim7/shared.ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { pixsimClient } from '@lib/api/client';
import { Icon } from '@lib/icons';

import { useAuthStore } from '@/stores/authStore';

import { PlanAgentTasksSection } from './PlanAgentTasksSection';
import { PlanDetailHeader } from './PlanDetailHeader';
import { PlanDetailSections } from './PlanDetailSections';
import type {
  AgentSessionSnapshot,
  AgentSessionsSnapshot,
  PlanChildSummary,
  PlanDetail,
  PlanParticipantsResponse,
  PlanSummary,
  PlanReviewAssigneesResponse,
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
  PlanRequestUpdateRequest,
  PlanReviewDispatchTickResponse,
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
} from './types';
import {
  extractRevisionConflict,
  parseAssigneeOptionValue,
  REVIEW_CAUSAL_RELATIONS,
  REVIEW_RELATIONS,
  toErrorMessage,
} from './types';

export function PlanDetailView({
  planId,
  onPlanChanged,
  onNavigatePlan,
  forgeUrlTemplate,
  stageOptions,
  allPlans,
  view = 'plan',
}: {
  planId: string;
  onPlanChanged: () => void;
  onNavigatePlan?: (planId: string) => void;
  forgeUrlTemplate?: string | null;
  stageOptions: PlanStageOptionEntry[];
  allPlans?: PlanSummary[];
  view?: 'plan' | 'tasks';
}) {
  const currentUserId = useAuthStore((state) =>
    state.user?.id != null ? Number(state.user.id) : null,
  );
  const currentUsername = useAuthStore((state) => state.user?.username ?? null);
  const [detail, setDetail] = useState<PlanDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [planExpanded, setPlanExpanded] = useState(false);
  const [contentView, setContentView] = useState<'full' | 'checkpoints' | 'tasks'>(
    view === 'tasks' ? 'tasks' : 'full',
  );
  const [showSummaries, setShowSummaries] = useState(false);
  const [planSummaries, setPlanSummaries] = useState<{ detail: string; timestamp: string; agent_type?: string; session_id?: string }[]>([]);
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
  const [newRoundNote, setNewRoundNote] = useState('');
  const [showClosedIterations, setShowClosedIterations] = useState(false);
  const [creatingRound, setCreatingRound] = useState(false);
  const [roundStatusDraft, setRoundStatusDraft] = useState<ReviewRoundStatus>('open');
  const [roundNoteDraft, setRoundNoteDraft] = useState('');
  const [roundConclusionDraft, setRoundConclusionDraft] = useState('');
  const [updatingRound, setUpdatingRound] = useState(false);
  const [newNodeKind, setNewNodeKind] = useState<ReviewNodeKind>('comment');
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

  useEffect(() => {
    setContentView(view === 'tasks' ? 'tasks' : 'full');
  }, [planId, view]);

  // Poll agent sessions while any agent task is in_progress
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

  // Load work summaries for this plan when toggled on
  useEffect(() => {
    if (!showSummaries || !detail) { setPlanSummaries([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await pixsimClient.get<{ entries: { detail: string; timestamp: string; agent_type?: string; session_id?: string }[] }>(
          '/meta/agents/history', { params: { plan_id: detail.id, action: 'work_summary', limit: 30 } },
        );
        if (!cancelled) setPlanSummaries(res.entries ?? []);
      } catch { if (!cancelled) setPlanSummaries([]); }
    })();
    return () => { cancelled = true; };
  }, [showSummaries, detail?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
    const nodeByIdLocal = new Map(selectedRoundNodes.map((node) => [node.id, node]));
    const childrenByParent = new Map<string, PlanReviewNode[]>();
    const childIds = new Set<string>();

    for (const node of selectedRoundNodes) {
      const parentId = selectedRoundThreadRefByChild.get(node.id)?.parentId;
      if (!parentId || !nodeByIdLocal.has(parentId)) continue;
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
      const payload: PlanReviewRoundCreateRequest = { status: 'open' };
      const note = newRoundNote.trim();
      if (note) payload.note = note;
      if (detail?.revision != null) {
        payload.review_revision = detail.revision;
      }

      const round = await pixsimClient.post<PlanReviewRound>(
        `/dev/plans/reviews/${encodedPlanId}/rounds`,
        payload,
      );
      setNewRoundNote('');
      setSelectedRoundId(round.id);
      setReviewNotice(`Created iteration #${round.roundNumber}.`);
      await loadReviewGraph();
    } catch (err) {
      setReviewError(toErrorMessage(err, 'Failed to create iteration'));
    } finally {
      setCreatingRound(false);
    }
  }, [detail?.revision, encodedPlanId, loadReviewGraph, newRoundNote]);

  const handleUpdateRound = useCallback(
    async (payload: PlanReviewRoundUpdateRequest, successMessage: string) => {
      if (!selectedRound) {
        setReviewError('Select a iteration first.');
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
        setReviewError(toErrorMessage(err, 'Failed to update iteration'));
      } finally {
        setUpdatingRound(false);
      }
    },
    [encodedPlanId, loadReviewGraph, selectedRound],
  );

  const handleCloseRound = useCallback(
    async (round: PlanReviewRound) => {
      setReviewError('');
      setReviewNotice(null);
      try {
        await pixsimClient.patch<PlanReviewRound>(
          `/dev/plans/reviews/${encodedPlanId}/rounds/${encodeURIComponent(round.id)}`,
          { status: 'concluded' },
        );
        setReviewNotice(`Closed iteration #${round.roundNumber}.`);
        await loadReviewGraph();
      } catch (err) {
        setReviewError(toErrorMessage(err, 'Failed to close iteration'));
      }
    },
    [encodedPlanId, loadReviewGraph],
  );

  const handleReopenRound = useCallback(
    async (round: PlanReviewRound) => {
      setReviewError('');
      setReviewNotice(null);
      try {
        await pixsimClient.patch<PlanReviewRound>(
          `/dev/plans/reviews/${encodedPlanId}/rounds/${encodeURIComponent(round.id)}`,
          { status: 'open' },
        );
        setReviewNotice(`Re-opened iteration #${round.roundNumber}.`);
        await loadReviewGraph();
      } catch (err) {
        setReviewError(toErrorMessage(err, 'Failed to re-open iteration'));
      }
    },
    [encodedPlanId, loadReviewGraph],
  );

  const handleSaveRoundState = useCallback(async () => {
    if (!selectedRound) {
      setReviewError('Select a iteration first.');
      return;
    }

    const nextNote = roundNoteDraft.trim();
    const currentNote = (selectedRound.note ?? '').trim();
    const nextConclusion = roundConclusionDraft.trim();
    const currentConclusion = (selectedRound.conclusion ?? '').trim();

    if (roundStatusDraft === 'concluded' && !nextConclusion) {
      setReviewError('Concluded iterations require a non-empty conclusion.');
      return;
    }

    const payload: PlanReviewRoundUpdateRequest = {};
    if (roundStatusDraft !== selectedRound.status) payload.status = roundStatusDraft;
    if (nextNote !== currentNote) payload.note = nextNote;
    if (roundStatusDraft === 'concluded' && nextConclusion !== currentConclusion) {
      payload.conclusion = nextConclusion;
    }

    if (!payload.status && payload.note === undefined && payload.conclusion === undefined) {
      setReviewNotice('No iteration changes to save.');
      return;
    }

    await handleUpdateRound(payload, `Updated iteration #${selectedRound.roundNumber}.`);
  }, [
    handleUpdateRound,
    roundConclusionDraft,
    roundNoteDraft,
    roundStatusDraft,
    selectedRound,
  ]);

  const handleCreateNode = useCallback(async () => {
    if (!selectedRound) {
      setReviewError('Select a iteration first.');
      return;
    }
    if (selectedRound.status === 'concluded') {
      setReviewError('Iteration is concluded. Re-open it before adding new responses.');
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
        setReviewNotice(`Agent task created${dispatchLabel}.`);
      }
      await loadReviewGraph();
    } catch (err) {
      setReviewError(toErrorMessage(err, 'Failed to create agent task'));
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
    async (request: PlanRequest, status: 'open' | 'in_progress' | 'fulfilled' | 'cancelled') => {
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
        setReviewNotice(`Agent task '${request.title}' set to ${status}.`);
        await loadReviewGraph();
      } catch (err) {
        setReviewError(toErrorMessage(err, 'Failed to update agent task'));
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
        setReviewError(toErrorMessage(err, 'Failed to dismiss agent task'));
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
        setReviewError(toErrorMessage(err, 'Failed to dispatch agent task'));
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
      setReviewError(toErrorMessage(err, 'Failed to dispatch open agent tasks'));
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

  // Resolve sibling phases when viewing a child plan (phase).
  // Must be above all early returns to satisfy Rules of Hooks.
  const siblingPhases = useMemo<PlanChildSummary[]>(() => {
    if (!detail?.parentId || !allPlans) return [];
    const parent = allPlans.find((p) => p.id === detail.parentId);
    if (!parent) return [];
    const childMap = new Map(parent.children.map((c) => [c.id, c]));
    if (parent.phases.length > 0) {
      const ordered: PlanChildSummary[] = [];
      for (const id of parent.phases) {
        const child = childMap.get(id);
        if (child) { ordered.push(child); childMap.delete(id); }
      }
      for (const child of childMap.values()) ordered.push(child);
      return ordered;
    }
    return parent.children;
  }, [detail?.parentId, allPlans]);

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

  return (
    <div className="p-4 space-y-4">
      <PlanDetailHeader
        detail={detail}
        stageOptions={stageOptions}
        stageOptionsByValue={stageOptionsByValue}
        updating={updating}
        lastResult={lastResult}
        onApplyUpdate={(updates) => void applyUpdate(updates)}
        onNavigatePlan={onNavigatePlan}
        siblingPhases={siblingPhases}
      />

      <div className="space-y-4 min-w-0">
        <div className="rounded-md border border-neutral-200 dark:border-neutral-700 p-2 flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            View
          </span>
          {([
            { id: 'full', label: 'Full Plan' },
            { id: 'checkpoints', label: 'Checkpoints' },
            { id: 'tasks', label: 'Tasks' },
          ] as const).map((option) => {
            const active = contentView === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setContentView(option.id)}
                className={`text-xs rounded-md border px-2 py-1 transition-colors ${
                  active
                    ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950/30 dark:text-blue-300'
                    : 'border-neutral-300 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800'
                }`}
              >
                {option.label}
              </button>
            );
          })}
          <div className="w-px h-4 bg-neutral-200 dark:bg-neutral-700" />
          <button
            type="button"
            onClick={() => setShowSummaries((v) => !v)}
            className={`text-xs rounded-md border px-2 py-1 transition-colors flex items-center gap-1 ${
              showSummaries
                ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950/30 dark:text-blue-300'
                : 'border-neutral-300 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800'
            }`}
          >
            <Icon name="fileText" size={11} />
            Summaries
          </button>
        </div>

        {contentView !== 'tasks' ? (
          <PlanDetailSections
            detail={detail}
            viewMode={contentView === 'checkpoints' ? 'checkpoints' : 'full'}
            forgeUrlTemplate={forgeUrlTemplate}
            loadingParticipants={loadingParticipants}
            planParticipants={planParticipants}
            reviewerParticipants={reviewerParticipants}
            builderParticipants={builderParticipants}
            reviewProfileLabels={reviewProfileLabels}
            coverage={coverage}
            planExpanded={planExpanded}
            onTogglePlanExpanded={() => setPlanExpanded((e) => !e)}
            onNavigatePlan={onNavigatePlan}
            sourcePreview={sourcePreview}
            sourcePreviewError={sourcePreviewError}
            onClearSourcePreview={() => setSourcePreview(null)}
          />
        ) : (
          <PlanAgentTasksSection
            reviewGraph={reviewGraph}
            loadingReviews={loadingReviews}
            reviewError={reviewError}
            reviewNotice={reviewNotice}
            reviewRounds={reviewRounds}
            selectedRoundId={selectedRoundId}
            selectedRound={selectedRound}
            reviewNodeCountByRound={reviewNodeCountByRound}
            reviewProfileLabels={reviewProfileLabels}
            onSelectRound={setSelectedRoundId}
            onLoadReviewGraph={loadReviewGraph}
            newRoundNote={newRoundNote}
            creatingRound={creatingRound}
            showClosedIterations={showClosedIterations}
            onToggleShowClosed={() => setShowClosedIterations((v) => !v)}
            onNewRoundNoteChange={setNewRoundNote}
            onCreateRound={() => void handleCreateRound()}
            onCloseRound={handleCloseRound}
            onReopenRound={handleReopenRound}
            currentUserId={currentUserId}
            currentUsername={currentUsername}
            roundStatusDraft={roundStatusDraft}
            roundNoteDraft={roundNoteDraft}
            roundConclusionDraft={roundConclusionDraft}
            updatingRound={updatingRound}
            onRoundStatusDraftChange={setRoundStatusDraft}
            onRoundNoteDraftChange={setRoundNoteDraft}
            onRoundConclusionDraftChange={setRoundConclusionDraft}
            onSaveRoundState={() => void handleSaveRoundState()}
            selectedRoundRequests={selectedRoundRequests}
            dispatchingRequestId={dispatchingRequestId}
            updatingRequestId={updatingRequestId}
            dispatchingTick={dispatchingTick}
            agentSessions={agentSessions}
            nodeById={nodeById}
            selectedRoundNodeOrder={selectedRoundNodeOrder}
            onDispatchRequest={(r) => void handleDispatchRequest(r)}
            onUpdateRequestStatus={(r, s) => void handleUpdateRequestStatus(r, s)}
            onDismissRequest={(r) => void handleDismissRequest(r)}
            onDispatchTick={() => void handleDispatchTick()}
            focusLinkedNode={focusLinkedNode}
            newRequestTitle={newRequestTitle}
            newRequestBody={newRequestBody}
            newRequestProfileId={newRequestProfileId}
            newRequestMethod={newRequestMethod}
            newRequestModelId={newRequestModelId}
            newRequestProvider={newRequestProvider}
            newRequestMode={newRequestMode}
            newRequestBaseRevision={newRequestBaseRevision}
            newRequestAssignee={newRequestAssignee}
            newRequestQueuePolicy={newRequestQueuePolicy}
            creatingRequest={creatingRequest}
            loadingAssignees={loadingAssignees}
            loadingProfiles={loadingProfiles}
            reviewProfiles={reviewProfiles}
            liveAssigneeOptions={liveAssigneeOptions}
            recentAssigneeOptions={recentAssigneeOptions}
            onNewRequestTitleChange={setNewRequestTitle}
            onNewRequestBodyChange={setNewRequestBody}
            onApplyRequestProfileSelection={applyRequestProfileSelection}
            onNewRequestMethodChange={setNewRequestMethod}
            onNewRequestProviderChange={setNewRequestProvider}
            onNewRequestModelIdChange={setNewRequestModelId}
            onNewRequestModeChange={setNewRequestMode}
            onNewRequestBaseRevisionChange={setNewRequestBaseRevision}
            onNewRequestAssigneeChange={setNewRequestAssignee}
            onNewRequestQueuePolicyChange={setNewRequestQueuePolicy}
            onCreateRequest={() => void handleCreateRequest()}
            selectedRoundNodes={selectedRoundNodes}
            selectedRoundThread={selectedRoundThread}
            selectedRoundThreadRefByChild={selectedRoundThreadRefByChild}
            selectedRoundLinksBySource={selectedRoundLinksBySource}
            reviewRoundNumberById={reviewRoundNumberById}
            focusedNodeId={focusedNodeId}
            dismissedNodeIds={dismissedNodeIds}
            sourcePreview={sourcePreview}
            sourcePreviewError={sourcePreviewError}
            sourcePreviewLoadingKey={sourcePreviewLoadingKey}
            nodeCardRefs={nodeCardRefs}
            onPreviewSourceRef={previewSourceRef}
            onClearSourcePreview={() => setSourcePreview(null)}
            onReplyToNode={handleReplyToNode}
            composeTextareaRef={composeTextareaRef}
            newNodeKind={newNodeKind}
            newNodeAuthorRole={newNodeAuthorRole}
            newNodeSeverity={newNodeSeverity}
            newNodeBody={newNodeBody}
            newNodeRefTargetId={newNodeRefTargetId}
            newNodeRefRelation={newNodeRefRelation}
            newNodeRefPlanAnchor={newNodeRefPlanAnchor}
            newNodeRefQuote={newNodeRefQuote}
            creatingNode={creatingNode}
            relationOptions={relationOptions}
            onNewNodeKindChange={setNewNodeKind}
            onNewNodeAuthorRoleChange={setNewNodeAuthorRole}
            onNewNodeSeverityChange={setNewNodeSeverity}
            onNewNodeBodyChange={setNewNodeBody}
            onNewNodeRefTargetIdChange={setNewNodeRefTargetId}
            onNewNodeRefRelationChange={setNewNodeRefRelation}
            onNewNodeRefPlanAnchorChange={setNewNodeRefPlanAnchor}
            onNewNodeRefQuoteChange={setNewNodeRefQuote}
            onCreateNode={() => void handleCreateNode()}
            inputClassName={inputClassName}
            textAreaClassName={textAreaClassName}
          />
        )}

        {/* Work Summaries section (togglable, shown alongside any view) */}
        {showSummaries && (
          <div className="rounded-md border border-neutral-200 dark:border-neutral-700 overflow-hidden">
            <div className="px-3 py-2 bg-neutral-50 dark:bg-neutral-900 flex items-center gap-2">
              <Icon name="fileText" size={12} className="text-neutral-500" />
              <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">Work Summaries</span>
              <span className="text-[10px] text-neutral-400 ml-auto">{planSummaries.length} entries</span>
            </div>
            <div className="divide-y divide-neutral-100 dark:divide-neutral-800 max-h-[400px] overflow-y-auto">
              {planSummaries.length === 0 ? (
                <div className="px-3 py-4 text-xs text-neutral-400 italic text-center">
                  No work summaries logged for this plan yet
                </div>
              ) : planSummaries.map((entry, i) => (
                <div key={i} className="px-3 py-2.5">
                  <div className="text-xs text-neutral-700 dark:text-neutral-200 leading-relaxed whitespace-pre-wrap">
                    {entry.detail.split(/\s*\((\d+)\)\s*/).reduce<React.ReactNode[]>((acc, part, idx) => {
                      if (idx === 0) return part.trim() ? [...acc, part.trim(), '\n'] : acc;
                      if (idx % 2 === 1) return [...acc, `(${part}) `];
                      return [...acc, part.trim(), '\n'];
                    }, []).slice(0, -1)}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-neutral-400">{new Date(entry.timestamp).toLocaleString()}</span>
                    {entry.agent_type && (
                      <span className={`text-[9px] px-1 rounded ${entry.agent_type === 'claude' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400'}`}>
                        {entry.agent_type}
                      </span>
                    )}
                    {entry.session_id && (
                      <span className="text-[9px] text-neutral-400 font-mono">{entry.session_id.slice(0, 12)}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Parent reference moved to lineage bar at top */}
    </div>
  );
}
