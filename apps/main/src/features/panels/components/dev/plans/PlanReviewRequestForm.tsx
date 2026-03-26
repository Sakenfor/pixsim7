import { Button, DisclosureSection } from '@pixsim7/shared.ui';
import { useMemo } from 'react';


import { formatActorLabel } from '@lib/identity/actorDisplay';

export type ReviewRequestQueuePolicy = 'start_now' | 'queue_next' | 'auto_reroute';
export type ReviewRequestMode = 'review_only' | 'propose_patch' | 'apply_patch';

export interface ReviewRequestProfileOption {
  id: string;
  label: string;
}

export interface ReviewRequestPoolSessionOption {
  sessionId: string;
  cliModel: string | null;
  state: string;
  messagesSent: number;
  contextPct: number | null;
}

export interface ReviewRequestLiveAssigneeOption {
  agentId: string;
  agentType: string | null;
  label: string | null;
  engines: string[] | null;
  busy: boolean;
  tasksCompleted: number;
  source?: 'live' | 'recent' | 'delegated' | string;
  targetUserId?: number | null;
  poolSessions?: ReviewRequestPoolSessionOption[] | null;
}

export interface ReviewRequestRecentAssigneeOption {
  agentId: string;
  agentType: string | null;
  tasksCompleted: number;
}

interface PlanReviewRequestFormProps {
  inputClassName: string;
  textAreaClassName: string;
  title: string;
  body: string;
  profileId: string;
  mode: ReviewRequestMode;
  baseRevision: string;
  assignee: string;
  queuePolicy: ReviewRequestQueuePolicy;
  creating: boolean;
  loadingAssignees: boolean;
  loadingProfiles: boolean;
  profiles: ReviewRequestProfileOption[];
  liveAssignees: ReviewRequestLiveAssigneeOption[];
  recentAssignees: ReviewRequestRecentAssigneeOption[];
  profileLabels: ReadonlyMap<string, string>;
  buildAssigneeOptionValue: (kind: 'live' | 'recent', id: string) => string;
  onTitleChange: (value: string) => void;
  onBodyChange: (value: string) => void;
  onProfileChange: (value: string) => void;
  onModeChange: (value: ReviewRequestMode) => void;
  onBaseRevisionChange: (value: string) => void;
  onAssigneeChange: (value: string) => void;
  onQueuePolicyChange: (value: ReviewRequestQueuePolicy) => void;
  onSubmit: () => void | Promise<void>;
}

export function PlanReviewRequestForm({
  inputClassName,
  textAreaClassName,
  title,
  body,
  profileId,
  mode,
  baseRevision,
  assignee,
  queuePolicy,
  creating,
  loadingAssignees,
  loadingProfiles,
  profiles,
  liveAssignees,
  recentAssignees,
  profileLabels,
  buildAssigneeOptionValue,
  onTitleChange,
  onBodyChange,
  onProfileChange,
  onModeChange,
  onBaseRevisionChange,
  onAssigneeChange,
  onQueuePolicyChange,
  onSubmit,
}: PlanReviewRequestFormProps) {
  // Parse assignee value to extract agent and session parts
  const selectedAgentId = useMemo(() => {
    if (assignee === 'auto') return 'auto';
    // assignee format: "live:<agentId>" or "recent:<agentId>"
    const parts = assignee.split(':');
    return parts.length >= 2 ? parts.slice(1).join(':') : assignee;
  }, [assignee]);

  const selectedAgent = useMemo(
    () => liveAssignees.find((a) => a.agentId === selectedAgentId),
    [liveAssignees, selectedAgentId],
  );

  const sessions = selectedAgent?.poolSessions ?? [];

  return (
    <DisclosureSection
      label="New Request"
      defaultOpen={false}
      className="rounded border border-neutral-200 dark:border-neutral-700 p-2"
      contentClassName="space-y-2"
    >
      {/* Title */}
      <label
        className="text-[11px] text-neutral-600 dark:text-neutral-400 block"
        title="Short description of what you want the reviewer to check"
      >
        Title
        <input
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          className={inputClassName}
          placeholder="e.g. Re-review after fixes"
        />
      </label>

      {/* ── Routing: Profile → Agent → Session ────────────────── */}
      <div className="space-y-1.5 rounded border border-neutral-150 dark:border-neutral-700/50 p-2 bg-neutral-50/50 dark:bg-neutral-800/30">
        <div className="text-[10px] font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
          Routing
        </div>

        {/* Level 1: Profile */}
        <label
          className="text-[11px] text-neutral-600 dark:text-neutral-400 block"
          title="Agent profile defines the provider, model, and instructions for this review"
        >
          Profile
          <select
            value={profileId}
            onChange={(e) => {
              onProfileChange(e.target.value);
              onAssigneeChange('auto');  // reset agent when profile changes
            }}
            className={inputClassName}
          >
            <option value="">Select a profile...</option>
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.label}
              </option>
            ))}
          </select>
        </label>

        {/* Level 2: Agent (only when profile selected) */}
        {profileId && (
          <label
            className="text-[11px] text-neutral-600 dark:text-neutral-400 block pl-3 border-l-2 border-neutral-200 dark:border-neutral-700"
            title="Which connected agent runs this. Auto lets the dispatcher pick the best available."
          >
            Agent
            <select
              value={assignee}
              onChange={(e) => onAssigneeChange(e.target.value)}
              className={inputClassName}
            >
              <option value="auto">Auto (best available)</option>
              {liveAssignees.map((agent) => {
                const displayLabel = (agent.label || '').trim() || formatActorLabel(
                  { principalType: 'agent', agentId: agent.agentId },
                  { profileLabels },
                );
                const parts = [
                  displayLabel,
                  agent.source === 'delegated' && typeof agent.targetUserId === 'number'
                    ? `user #${agent.targetUserId}`
                    : '',
                  agent.busy ? 'busy' : 'idle',
                  agent.tasksCompleted > 0 ? `${agent.tasksCompleted} done` : '',
                ].filter(Boolean).join(' \u00b7 ');
                return (
                  <option key={`live:${agent.agentId}`} value={buildAssigneeOptionValue('live', agent.agentId)}>
                    {parts}
                  </option>
                );
              })}
              {recentAssignees.length > 0 && (
                <optgroup label="Recent">
                  {recentAssignees.map((option) => (
                    <option key={`recent:${option.agentId}`} value={buildAssigneeOptionValue('recent', option.agentId)}>
                      {formatActorLabel(
                        { principalType: 'agent', agentId: option.agentId },
                        { profileLabels },
                      )}
                      {option.tasksCompleted > 0 ? ` \u00b7 ${option.tasksCompleted} done` : ''}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>
        )}

        {/* Level 3: Session (only when a specific agent is selected and has sessions) */}
        {profileId && selectedAgent && sessions.length > 0 && (
          <div
            className="text-[11px] text-neutral-600 dark:text-neutral-400 pl-6 border-l-2 border-neutral-200 dark:border-neutral-700"
          >
            <div className="text-[10px] text-neutral-400 dark:text-neutral-500 mb-0.5" title="Active sessions for this agent">
              Sessions
            </div>
            <div className="space-y-0.5">
              {sessions.map((s) => {
                const parts: string[] = [];
                if (s.cliModel) parts.push(s.cliModel);
                parts.push(s.state);
                if (s.messagesSent > 0) parts.push(`${s.messagesSent} msg`);
                if (s.contextPct != null) parts.push(`ctx ${s.contextPct}%`);
                return (
                  <div key={s.sessionId} className="flex items-center gap-1.5 text-[10px]">
                    <span
                      className={`inline-block w-1.5 h-1.5 rounded-full ${
                        s.state === 'active' ? 'bg-green-500' : 'bg-neutral-400'
                      }`}
                    />
                    <span className="text-neutral-600 dark:text-neutral-300 font-mono">
                      {s.sessionId.slice(0, 12)}
                    </span>
                    <span className="text-neutral-400">{parts.join(' \u00b7 ')}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {loadingAssignees && (
          <div className="text-[10px] text-neutral-400 pl-3">Loading agents...</div>
        )}
        {loadingProfiles && (
          <div className="text-[10px] text-neutral-400">Loading profiles...</div>
        )}
      </div>

      {/* ── Review settings ───────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label
          className="text-[11px] text-neutral-600 dark:text-neutral-400 block"
          title="Review Only: comment only. Propose Patch: suggest changes. Apply Patch: directly edit the plan."
        >
          Review Mode
          <select
            value={mode}
            onChange={(e) => onModeChange(e.target.value as ReviewRequestMode)}
            className={inputClassName}
          >
            <option value="review_only">Review Only</option>
            <option value="propose_patch">Propose Patch</option>
            <option value="apply_patch">Apply Patch</option>
          </select>
        </label>
        <label
          className="text-[11px] text-neutral-600 dark:text-neutral-400 block"
          title="Plan revision the patch is based on. Required for patch modes to detect conflicts."
        >
          Base Revision
          <input
            value={baseRevision}
            onChange={(e) => onBaseRevisionChange(e.target.value)}
            className={inputClassName}
            placeholder={mode === 'review_only' ? 'optional' : 'required for patch modes'}
          />
        </label>
      </div>

      {/* Queue policy — only relevant when a specific agent is chosen */}
      {assignee !== 'auto' && (
        <label
          className="text-[11px] text-neutral-600 dark:text-neutral-400 block"
          title="What to do if the chosen agent is busy"
        >
          If Busy
          <select
            value={queuePolicy}
            onChange={(e) => onQueuePolicyChange(e.target.value as ReviewRequestQueuePolicy)}
            className={inputClassName}
          >
            <option value="auto_reroute">Reroute to another agent</option>
            <option value="queue_next">Queue until free</option>
            <option value="start_now">Fail if busy</option>
          </select>
        </label>
      )}

      {/* Body */}
      <label
        className="text-[11px] text-neutral-600 dark:text-neutral-400 block"
        title="Detailed instructions for the reviewer"
      >
        Body
        <textarea
          value={body}
          onChange={(e) => onBodyChange(e.target.value)}
          className={textAreaClassName}
          rows={3}
          placeholder="What should the reviewer verify or challenge?"
        />
      </label>

      <Button size="sm" onClick={() => void onSubmit()} disabled={creating || !profileId}>
        {creating ? 'Creating...' : 'Create Review Request'}
      </Button>
      {!profileId && (
        <div className="text-[10px] text-amber-600 dark:text-amber-400">
          Select an agent profile to enable submission.
        </div>
      )}
    </DisclosureSection>
  );
}
