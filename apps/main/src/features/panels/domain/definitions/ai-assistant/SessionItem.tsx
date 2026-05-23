/**
 * SessionItem — a single chat tab entry in the sidebar list.
 * Extracted from the former `renderSessionItem` useCallback in AIAssistantPanel.
 */

import { Icon, getIcon } from '@lib/icons';

import type { ChatTab } from './assistantChatStore';
import type { UnifiedProfile } from './assistantTypes';
import { EngineProfileIcon, resolveProfileIcon } from './EngineProfileIcon';

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
    >
      <div className="relative shrink-0">
        <EngineProfileIcon engine={tab.engine} icon={tabIcon} size={12} />
        {isFailedCreate ? (
          <span
            className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-signal-error ring-1 ring-surface"
            title="Couldn't save this tab to the server — retry or dismiss"
          />
        ) : hasPendingQuestion ? (
          <span
            className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-signal-warning ring-1 ring-surface animate-pulse"
            title="Agent is waiting on your answer"
          />
        ) : isSending ? (
          <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-signal-success animate-pulse" />
        ) : hasUnread ? (
          <span
            className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-signal-info ring-1 ring-surface"
            title="Unread reply"
          />
        ) : null}
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
