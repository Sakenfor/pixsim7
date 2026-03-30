/**
 * Shared sub-components for PlanDetailView.
 *
 * ClickableBadge — inline badge with dropdown for status/priority/stage changes.
 * ParticipantEntry — row for a plan participant with expandable popover.
 *
 * Extracted from PlansPanel.tsx during split — no logic changes.
 */

import {
  Badge,
  Popover,
} from '@pixsim7/shared.ui';
import { useRef, useState } from 'react';

import { Icon } from '@lib/icons';
import { formatActorLabel } from '@lib/identity/actorDisplay';

import type { PlanParticipant } from './types';
import { formatDateTime } from './types';

// =============================================================================
// ClickableBadge
// =============================================================================

export function ClickableBadge({
  value,
  displayValue,
  color,
  options,
  onSelect,
  disabled,
}: {
  value: string;
  displayValue?: string;
  color: 'green' | 'blue' | 'gray' | 'orange' | 'red';
  options: { value: string; label: string; color: 'green' | 'blue' | 'gray' | 'orange' | 'red' }[];
  onSelect: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => !disabled && setOpen((o) => !o)}
        className="cursor-pointer hover:opacity-80 transition-opacity"
        disabled={disabled}
      >
        <Badge color={color}>
          {displayValue ?? value}
          <Icon name="chevronDown" size={8} className="ml-0.5 inline-block opacity-50" />
        </Badge>
      </button>
      <Popover
        anchor={triggerRef.current}
        placement="bottom"
        align="start"
        offset={4}
        open={open}
        onClose={() => setOpen(false)}
        triggerRef={triggerRef}
      >
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md shadow-lg py-1 min-w-[100px] text-xs">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onSelect(opt.value);
                setOpen(false);
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              <Badge color={opt.color} className="text-[9px] !px-1">{opt.value === value ? '\u2713' : '\u00A0'}</Badge>
              <span className="text-neutral-700 dark:text-neutral-300">{opt.label}</span>
            </button>
          ))}
        </div>
      </Popover>
    </>
  );
}

// =============================================================================
// ParticipantEntry
// =============================================================================

export function ParticipantEntry({
  participant,
  profileLabels,
}: {
  participant: PlanParticipant;
  profileLabels: ReadonlyMap<string, string>;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const label = formatActorLabel(
    {
      principalType: participant.principalType,
      userId: participant.userId,
      agentId: participant.agentId,
      profileId: participant.profileId,
    },
    { profileLabels },
  );
  const profileLabel = participant.profileId
    ? (profileLabels.get(participant.profileId) ?? participant.profileId)
    : null;
  const actionLog = (participant.meta?.action_log as { action: string; at: string }[] | undefined) ?? [];
  const summaryAction = participant.lastAction ? participant.lastAction.replace(/_/g, ' ') : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Click to view participant details"
        className="flex w-full items-center justify-between gap-2 text-[11px] text-left group hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded px-1 -mx-1 py-0.5 cursor-pointer"
      >
        <span className="flex min-w-0 items-center gap-1">
          <span className="font-mono text-neutral-700 dark:text-neutral-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 group-hover:underline group-hover:decoration-dotted">
            {label}
          </span>
          <span className="text-neutral-400 group-hover:text-blue-500">({participant.touches}x)</span>
          {summaryAction && (
            <span className="text-neutral-400 text-[10px] truncate">{summaryAction}</span>
          )}
        </span>
        <Icon
          name="chevronDown"
          size={8}
          className={`shrink-0 transition-transform text-neutral-400 group-hover:text-blue-500 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <Popover
        anchor={triggerRef.current}
        placement="bottom"
        align="start"
        open={open}
        onClose={() => setOpen(false)}
        triggerRef={triggerRef}
        className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-lg p-3 max-w-xs"
      >
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-neutral-800 dark:text-neutral-200">{label}</span>
            <Badge color="gray" className="text-[9px]">{participant.role}</Badge>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
            {participant.agentType && (
              <>
                <span className="text-neutral-400">Type</span>
                <span className="text-neutral-600 dark:text-neutral-300">{participant.agentType}</span>
              </>
            )}
            {participant.profileId && (
              <>
                <span className="text-neutral-400">Profile</span>
                <span
                  className="text-neutral-600 dark:text-neutral-300"
                  title={profileLabel !== participant.profileId ? participant.profileId ?? undefined : undefined}
                >
                  {profileLabel}
                </span>
              </>
            )}
            <span className="text-neutral-400">Touches</span>
            <span className="text-neutral-600 dark:text-neutral-300">{participant.touches}</span>
            {participant.lastSeenAt && (
              <>
                <span className="text-neutral-400">Last seen</span>
                <span className="text-neutral-600 dark:text-neutral-300">{formatDateTime(participant.lastSeenAt)}</span>
              </>
            )}
            {participant.runId && (
              <>
                <span className="text-neutral-400">Run</span>
                <span className="text-neutral-600 dark:text-neutral-300 font-mono truncate">{participant.runId}</span>
              </>
            )}
          </div>
          <div>
            <div className="text-[10px] font-medium text-neutral-500 dark:text-neutral-400 mb-1">
              Activity ({actionLog.length > 0 ? actionLog.length : participant.touches})
            </div>
            {actionLog.length > 0 ? (
              <div className="space-y-0.5 max-h-40 overflow-y-auto">
                {actionLog.map((entry, i) => (
                  <div key={`${participant.id}:action:${i}`} className="flex items-center gap-2 text-[10px]">
                    <span className="shrink-0 w-10 text-right text-neutral-400 font-mono">
                      {new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="text-neutral-700 dark:text-neutral-300">{entry.action.replace(/_/g, ' ')}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-[10px] text-neutral-400 italic">
                {participant.touches} touch{participant.touches !== 1 ? 'es' : ''} recorded before activity tracking.
                {participant.lastAction && <> Last: {participant.lastAction.replace(/_/g, ' ')}.</>}
              </div>
            )}
          </div>
        </div>
      </Popover>
    </>
  );
}
