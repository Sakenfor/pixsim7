/**
 * SessionItem — a single chat tab entry in the sidebar list.
 * Extracted from the former `renderSessionItem` useCallback in AIAssistantPanel.
 */

import { Icon } from '@lib/icons';

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
  const tabIcon = resolveProfileIcon(
    tab.engine,
    tabProfile?.icon || (tabProfile && tabProfile.id.startsWith('assistant:') ? 'messageSquare' : 'cpu'),
  );
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
          ? 'bg-blue-50 dark:bg-blue-950/40 text-neutral-900 dark:text-neutral-100'
          : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
      }`}
    >
      <div className="relative shrink-0">
        <EngineProfileIcon engine={tab.engine} icon={tabIcon} size={12} />
        {isFailedCreate ? (
          <span
            className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-red-500 ring-1 ring-white dark:ring-neutral-950"
            title="Couldn't save this tab to the server — retry or dismiss"
          />
        ) : isSending ? (
          <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
        ) : hasUnread ? (
          <span
            className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-blue-500 ring-1 ring-white dark:ring-neutral-950"
            title="Unread reply"
          />
        ) : null}
      </div>
      <div className="flex-1 min-w-0">
        {isRenaming ? (
          <input
            autoFocus
            className="w-full text-[11px] font-medium bg-white dark:bg-neutral-800 border border-blue-300 dark:border-blue-600 rounded px-1 py-0 outline-none"
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
            className={`text-[11px] truncate ${hasUnread && !isActive ? 'font-semibold text-neutral-900 dark:text-neutral-100' : 'font-medium'}`}
            onDoubleClick={(e) => { e.stopPropagation(); onStartRename(tab.id, tab.label); }}
          >
            {tab.label}
          </div>
        )}
        {tab.profileId && tabProfile && !isRenaming && (
          <div className="text-[9px] text-neutral-400 dark:text-neutral-500 truncate">{tabProfile.label}</div>
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
              className="text-amber-500 hover:text-amber-600 dark:hover:text-amber-400"
              title="Retry server save"
            >
              <Icon name="refresh" size={10} />
            </button>
          )}
          {onDismissFailedCreate && (
            <button
              onClick={(e) => { e.stopPropagation(); onDismissFailedCreate(tab.id); }}
              className="text-neutral-400 hover:text-red-500"
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
            className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
            title="Rename"
          >
            <Icon name="edit" size={10} />
          </button>
          {tab.planId && onUnlinkPlan && (
            <button
              onClick={(e) => { e.stopPropagation(); onUnlinkPlan(tab.id); }}
              className="text-neutral-400 hover:text-green-600 dark:hover:text-green-400"
              title="Unlink from plan"
            >
              <Icon name="link" size={10} />
            </button>
          )}
          {tabCount > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); onClose(tab.id); }}
              className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
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
