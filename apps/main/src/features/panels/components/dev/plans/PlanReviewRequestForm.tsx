import { Button, DisclosureSection } from '@pixsim7/shared.ui';

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
  method: string;
  provider: string;
  modelId: string;
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
  onMethodChange: (value: string) => void;
  onProviderChange: (value: string) => void;
  onModelIdChange: (value: string) => void;
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
  method,
  provider,
  modelId,
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
  onMethodChange,
  onProviderChange,
  onModelIdChange,
  onModeChange,
  onBaseRevisionChange,
  onAssigneeChange,
  onQueuePolicyChange,
  onSubmit,
}: PlanReviewRequestFormProps) {
  return (
    <DisclosureSection
      label="New Request"
      defaultOpen={false}
      className="rounded border border-neutral-200 dark:border-neutral-700 p-2"
      contentClassName="space-y-2"
    >
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
      <label
        className="text-[11px] text-neutral-600 dark:text-neutral-400 block"
        title="Select an agent profile to use its preconfigured provider, model, and method"
      >
        Agent Profile
        <select
          value={profileId}
          onChange={(e) => onProfileChange(e.target.value)}
          className={inputClassName}
        >
          <option value="">Custom (manual provider/model)</option>
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.label} ({profile.id})
            </option>
          ))}
        </select>
      </label>
      {!profileId && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <label
            className="text-[11px] text-neutral-600 dark:text-neutral-400 block"
            title="Delivery method: remote (bridge agent) or local"
          >
            Method
            <input
              value={method}
              onChange={(e) => onMethodChange(e.target.value)}
              className={inputClassName}
              placeholder="remote"
            />
          </label>
          <label
            className="text-[11px] text-neutral-600 dark:text-neutral-400 block"
            title="LLM provider to use (e.g. anthropic, openai)"
          >
            Provider
            <input
              value={provider}
              onChange={(e) => onProviderChange(e.target.value)}
              className={inputClassName}
              placeholder="anthropic"
            />
          </label>
          <label
            className="text-[11px] text-neutral-600 dark:text-neutral-400 block"
            title="Specific model ID to use for the review"
          >
            Model
            <input
              value={modelId}
              onChange={(e) => onModelIdChange(e.target.value)}
              className={inputClassName}
              placeholder="claude-3-7-sonnet"
            />
          </label>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label
          className="text-[11px] text-neutral-600 dark:text-neutral-400 block"
          title="review_only: comment only. propose_patch: suggest changes. apply_patch: directly edit the plan."
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
      <label
        className="text-[11px] text-neutral-600 dark:text-neutral-400 block"
        title="Choose which agent handles the review. Auto lets the dispatcher pick the best available."
      >
        Assignee
        <select
          value={assignee}
          onChange={(e) => onAssigneeChange(e.target.value)}
          className={inputClassName}
        >
          <option value="auto">Auto (dispatcher)</option>
          {liveAssignees.map((agent) => {
            const displayLabel = (agent.label || '').trim() || formatActorLabel(
              { principalType: 'agent', agentId: agent.agentId },
              { profileLabels },
            );
            const agentLabel = [
              displayLabel,
              agent.source === 'delegated' && typeof agent.targetUserId === 'number'
                ? `delegated user #${agent.targetUserId}`
                : '',
              agent.engines?.join('/') || agent.agentType,
              agent.busy ? 'busy' : 'idle',
              agent.tasksCompleted > 0 ? `${agent.tasksCompleted} done` : '',
            ].filter(Boolean).join(' - ');

            if (agent.poolSessions && agent.poolSessions.length > 0) {
              return (
                <optgroup key={`live:${agent.agentId}`} label={agentLabel}>
                  <option value={buildAssigneeOptionValue('live', agent.agentId)}>
                    Any session (auto)
                  </option>
                  {agent.poolSessions.map((poolSession) => {
                    const parts = [poolSession.sessionId];
                    if (poolSession.cliModel) parts.push(poolSession.cliModel);
                    parts.push(poolSession.state);
                    if (poolSession.messagesSent > 0) parts.push(`${poolSession.messagesSent} msg`);
                    if (poolSession.contextPct != null) parts.push(`ctx ${poolSession.contextPct}%`);
                    return (
                      <option key={`live:${poolSession.sessionId}`} value={buildAssigneeOptionValue('live', agent.agentId)}>
                        {'-> '}{parts.join(' - ')}
                      </option>
                    );
                  })}
                </optgroup>
              );
            }

            return (
              <option key={`live:${agent.agentId}`} value={buildAssigneeOptionValue('live', agent.agentId)}>
                {agentLabel}
              </option>
            );
          })}
          {recentAssignees.length > 0 && (
            <optgroup label="Recent Reviewers">
              {recentAssignees.map((option) => {
                const parts = [
                  formatActorLabel(
                    { principalType: 'agent', agentId: option.agentId },
                    { profileLabels },
                  ),
                ];
                if (option.agentType) parts.push(option.agentType);
                if (option.tasksCompleted > 0) parts.push(`${option.tasksCompleted} done`);
                return (
                  <option key={`recent:${option.agentId}`} value={buildAssigneeOptionValue('recent', option.agentId)}>
                    {parts.join(' - ')}
                  </option>
                );
              })}
            </optgroup>
          )}
        </select>
      </label>
      <label
        className="text-[11px] text-neutral-600 dark:text-neutral-400 block"
        title="What to do if the chosen agent is busy"
      >
        Queue Policy
        <select
          value={queuePolicy}
          onChange={(e) => onQueuePolicyChange(e.target.value as ReviewRequestQueuePolicy)}
          className={inputClassName}
        >
          <option value="auto_reroute">Auto reroute if busy (recommended)</option>
          <option value="start_now">Start now only</option>
          <option value="queue_next">Queue next if busy</option>
        </select>
      </label>
      {loadingAssignees && (
        <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
          Refreshing live assignees...
        </div>
      )}
      {loadingProfiles && (
        <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
          Refreshing agent profiles...
        </div>
      )}
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
      <Button size="sm" onClick={() => void onSubmit()} disabled={creating}>
        {creating ? 'Creating...' : 'Create Review Request'}
      </Button>
    </DisclosureSection>
  );
}
