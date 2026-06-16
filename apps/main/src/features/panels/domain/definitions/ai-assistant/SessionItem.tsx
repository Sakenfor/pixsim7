/**
 * SessionItem — a single chat tab entry in the sidebar list.
 * Extracted from the former `renderSessionItem` useCallback in AIAssistantPanel.
 */

import { useEffect, useState } from 'react';

import { Icon, getIcon } from '@lib/icons';

import type { ChatTab } from './assistantChatStore';
import type { UnifiedProfile } from './assistantTypes';
import { EngineProfileIcon, resolveProfileIcon } from './EngineProfileIcon';

// Green "agent working" halo speed. Each agent activity event (a tool-use
// heartbeat, surfaced as an `activityTick` bump) snaps the pulse to the fast
// rate, which then eases back through these steps to a calm baseline — a flurry
// of tool calls reads as a rapid heartbeat, a settled/thinking agent as a slow
// one. [delayMs, animation-duration].
// Peak opacity of the soft "your turn — active conversation" row tint, applied
// at full `activeFade` (right after the agent's reply) and scaled down to 0 as
// the reply ages. Kept low so it reads as a gentle wash, not an alert.
const SOFT_TINT_PEAK_ALPHA = 0.13;

const WORK_PULSE_BASELINE = '0.95s';
const WORK_PULSE_DECAY: ReadonlyArray<readonly [number, string]> = [
  [0, '0.4s'],
  [1100, '0.6s'],
  [2400, '0.8s'],
  [4000, WORK_PULSE_BASELINE],
];

export interface SessionItemProps {
  tab: ChatTab;
  isActive: boolean;
  profiles: readonly UnifiedProfile[];
  tabCount: number;
  isSending: boolean;
  /** Tab has an unseen assistant reply (active tab is always read). */
  hasUnread?: boolean;
  /**
   * Tab has an unanswered agent question waiting on the user (Phase 4b).
   * Rendered as a distinct orange pip that takes precedence over the blue
   * unread pip — a blocked agent is more urgent than an unread reply.
   */
  hasPendingQuestion?: boolean;
  /**
   * Soft "your turn — recently active" reminder, as a fade factor in [0, 1].
   * Non-zero for a non-active tab whose last message is a recent agent reply
   * (ball in the user's court): `1` right after the reply, easing to `0` as it
   * ages out of the reminder window. Drives a faint row tint that lingers past
   * the bright unread ring (which clears on focus) so the conversations you're
   * mid-chat on stay easy to spot. Strictly cosmetic — weaker than the
   * unread/question signals.
   */
  activeFade?: number;
  /**
   * Changing value that ticks on each agent activity event for this tab — the
   * bridge request's `_lastActivity` timestamp, bumped on *every* heartbeat
   * (including the `thinking`/keepalive ones that `thinkingLog` filters out).
   * Each change momentarily speeds up the green work halo.
   */
  activityTick?: number;
  renamingTabId: string | null;
  renameValue: string;
  onSetActive: (id: string) => void;
  onStartRename: (id: string, currentLabel: string) => void;
  onCommitRename: (id: string, value: string) => void;
  onCancelRename: () => void;
  onSetRenameValue: (value: string) => void;
  onClose: (id: string) => void;
  onUnlinkPlan?: (id: string) => void;
  /**
   * Retry handler for `tab.pending === 'create-failed'` rows — re-fires the
   * server POST that originally rolled back. See plan
   * `chat-tab-server-persistence` checkpoint F.
   */
  onRetryCreate?: (id: string) => void;
  /** Dismiss handler — yanks a failed-create row out of the snapshot. */
  onDismissFailedCreate?: (id: string) => void;
}

export function SessionItem({
  tab,
  isActive,
  profiles,
  tabCount,
  isSending,
  hasUnread = false,
  hasPendingQuestion = false,
  activeFade = 0,
  activityTick = 0,
  renamingTabId,
  renameValue,
  onSetActive,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onSetRenameValue,
  onClose,
  onUnlinkPlan,
  onRetryCreate,
  onDismissFailedCreate,
}: SessionItemProps) {
  const tabProfile = profiles.find((p) => p.id === tab.profileId);
  // Agent-set tab identity (plan `agent-freeform-tab-identity`). The
  // freeform icon wins as the leading glyph, but only when it resolves to a
  // real @lib/icons entry — an unknown/garbage name falls back to the
  // profile/engine glyph rather than rendering raw text inside the badge.
  const agentIcon = tab.icon?.trim();
  const validAgentIcon = agentIcon && getIcon(agentIcon) ? agentIcon : null;
  const tabIcon = resolveProfileIcon(
    tab.engine,
    validAgentIcon || tabProfile?.icon || (tabProfile && tabProfile.id.startsWith('assistant:') ? 'messageSquare' : 'cpu'),
  );
  // Secondary line: agent-set subtitle, falling back to the profile label
  // (the slot's prior sole content) when the agent hasn't set one.
  const subtitle = tab.subtitle?.trim() || null;
  const secondaryLine = subtitle || (tab.profileId && tabProfile ? tabProfile.label : null);
  const isRenaming = renamingTabId === tab.id;
  const isFailedCreate = tab.pending === 'create-failed';

  // Tempo of the green work halo, driven by agent activity. A new `activityTick`
  // (the agent used a tool) snaps it fast, then timers ease it back to baseline.
  const [workPulse, setWorkPulse] = useState(WORK_PULSE_BASELINE);
  useEffect(() => {
    if (!isSending) {
      setWorkPulse(WORK_PULSE_BASELINE);
      return;
    }
    const timers = WORK_PULSE_DECAY.map(([delay, dur]) =>
      setTimeout(() => setWorkPulse(dur), delay),
    );
    return () => timers.forEach(clearTimeout);
  }, [activityTick, isSending]);

  // Status halo: a colored ring around the tab icon (replaces the old 1.5px
  // corner pip, which washed out under some themes). One status wins, in
  // urgency order. The larger ring surface keeps the signal legible even when
  // a theme mutes the token color, and the glow separates it from the row
  // background. Pulse *speed* encodes meaning: fast green = actively working,
  // slow blue = passively waiting on the user to read. `pulse` is the
  // animation-duration (inline style reliably overrides Tailwind's fixed-2s
  // `animate-pulse` shorthand); null = static.
  const status: { ring: string; title: string; pulse: string | null } | null = isFailedCreate
    ? { ring: 'ring-signal-error', title: "Couldn't save this tab to the server — retry or dismiss", pulse: null }
    : hasPendingQuestion
      ? { ring: 'ring-signal-warning', title: 'Agent is waiting on your answer', pulse: '1.4s' }
      : isSending
        ? { ring: 'ring-signal-success', title: 'Working…', pulse: workPulse }
        : hasUnread
          ? { ring: 'ring-signal-info', title: 'Unread reply', pulse: '2.8s' }
          : null;

  return (
    <div
      role="option"
      aria-selected={isActive}
      onClick={() => onSetActive(tab.id)}
      onKeyDown={(e) => { if (e.key === 'Enter') onSetActive(tab.id); }}
      tabIndex={0}
      className={`group flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${
        isActive
          ? 'bg-accent-subtle text-th'
          : 'text-th-secondary hover:bg-surface-secondary'
      }`}
      // Soft "your turn" tint, faded by recency. Driven inline (not a utility
      // class) because the alpha is continuous — `--info` is the signal-info
      // token, the same hue as the unread ring, at a peak ~13% that eases to 0.
      // Only on non-active tabs; the active row keeps its accent background.
      style={
        !isActive && activeFade > 0
          ? { backgroundColor: `rgb(var(--info) / ${(activeFade * SOFT_TINT_PEAK_ALPHA).toFixed(3)})` }
          : undefined
      }
    >
      <div className="relative flex shrink-0" title={status?.title}>
        <EngineProfileIcon engine={tab.engine} icon={tabIcon} size={12} />
        {status && (
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute -inset-0.5 rounded-full ring-2 ${status.ring} shadow-[0_0_5px_var(--tw-ring-color)] ${status.pulse ? 'animate-pulse' : ''}`}
            style={status.pulse ? { animationDuration: status.pulse } : undefined}
          />
        )}
      </div>
      <div className="flex-1 min-w-0">
        {isRenaming ? (
          <input
            autoFocus
            className="w-full text-[11px] font-medium bg-surface text-th border border-accent rounded px-1 py-0 outline-none"
            value={renameValue}
            onChange={(e) => onSetRenameValue(e.target.value)}
            onBlur={() => onCommitRename(tab.id, renameValue)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') onCommitRename(tab.id, renameValue);
              if (e.key === 'Escape') onCancelRename();
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <div
            className={`text-[11px] truncate ${(hasUnread || hasPendingQuestion) && !isActive ? 'font-semibold text-th' : 'font-medium'}`}
            onDoubleClick={(e) => { e.stopPropagation(); onStartRename(tab.id, tab.label); }}
          >
            {tab.label}
          </div>
        )}
        {secondaryLine && !isRenaming && (
          <div
            className="text-[9px] text-th-muted truncate"
            title={subtitle ?? undefined}
          >
            {secondaryLine}
          </div>
        )}
      </div>
      {isFailedCreate ? (
        // Failed-create rows replace the hover cluster with always-visible
        // retry + dismiss so the user can recover without having to hover
        // and discover it.
        <div className="flex items-center gap-0.5 shrink-0">
          {onRetryCreate && (
            <button
              onClick={(e) => { e.stopPropagation(); onRetryCreate(tab.id); }}
              className="text-signal-warning hover:opacity-80"
              title="Retry server save"
            >
              <Icon name="refresh" size={10} />
            </button>
          )}
          {onDismissFailedCreate && (
            <button
              onClick={(e) => { e.stopPropagation(); onDismissFailedCreate(tab.id); }}
              className="text-th-muted hover:text-signal-error"
              title="Dismiss — drop this tab locally"
            >
              <Icon name="x" size={10} />
            </button>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onStartRename(tab.id, tab.label); }}
            className="text-th-muted hover:text-th"
            title="Rename"
          >
            <Icon name="edit" size={10} />
          </button>
          {tab.planId && onUnlinkPlan && (
            <button
              onClick={(e) => { e.stopPropagation(); onUnlinkPlan(tab.id); }}
              className="text-th-muted hover:text-signal-success"
              title="Unlink from plan"
            >
              <Icon name="link" size={10} />
            </button>
          )}
          {tabCount > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); onClose(tab.id); }}
              className="text-th-muted hover:text-th"
              title="Close"
            >
              <Icon name="x" size={10} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
