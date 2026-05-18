/**
 * VersionDetailPanel — publication metadata + workflow actions for
 * a single prompt-pack version.
 *
 * Renders:
 *   - visibility + review status pills (private | approved | shared)
 *                                      (draft | submitted | approved | rejected)
 *   - owner + reviewer metadata
 *   - activate / deactivate buttons
 *   - submit for review (owners only)
 *   - publish private / shared (owner or admin, gated on review state)
 *   - admin-only approve / reject with optional review notes
 *
 * Action handlers are passed in — this component owns no API state,
 * only forwards button clicks. The parent gates `canManagePublication`
 * (owner-or-admin), `isAdmin`, and `isVersionOwner` based on auth.
 */

import type {
  PromptPackPublication,
  PromptPackVersion,
} from '@lib/api/promptPacks';
import { Icon } from '@lib/icons';

import { StatusBadge } from './StatusBadge';
import { reviewStatusVariant, visibilityVariant } from './statusVariants';

function formatDate(value?: string | null): string {
  if (!value) return '-';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

export interface VersionDetailPanelProps {
  version: PromptPackVersion;
  publication: PromptPackPublication | null;
  isActive: boolean;
  /** Owner-or-admin: can publish private/shared. */
  canManagePublication: boolean;
  /** Admin: can approve/reject. */
  isAdmin: boolean;
  /** Owner: can submit for review. */
  isVersionOwner: boolean;
  /** True when any workflow action is in flight (disables conflicting buttons). */
  workflowBusy: boolean;
  /** True when activation/deactivation for this version is in flight. */
  activationBusy: boolean;
  reviewNotes: string;
  onReviewNotesChange: (value: string) => void;
  onActivate: () => void;
  onDeactivate: () => void;
  onSubmit: () => void;
  onPublishPrivate: () => void;
  onPublishShared: () => void;
  /** Admin actions; omit when isAdmin is false. */
  onApprove?: () => void;
  onReject?: () => void;
}

export function VersionDetailPanel({
  version,
  publication,
  isActive,
  canManagePublication,
  isAdmin,
  isVersionOwner,
  workflowBusy,
  activationBusy,
  reviewNotes,
  onReviewNotesChange,
  onActivate,
  onDeactivate,
  onSubmit,
  onPublishPrivate,
  onPublishShared,
  onApprove,
  onReject,
}: VersionDetailPanelProps) {
  const visibility = publication?.visibility ?? 'private';
  const reviewStatus = publication?.review_status ?? 'draft';

  return (
    <div className="w-56 rounded border border-neutral-200 dark:border-neutral-700 p-2 space-y-2">
      <div className="text-xs text-neutral-600 dark:text-neutral-300">
        Version <span className="font-medium">v{version.version}</span>
      </div>
      <div className="text-[10px] text-neutral-500 dark:text-neutral-400 break-all">
        {version.id}
      </div>
      <div className="flex items-center gap-1 flex-wrap">
        <StatusBadge variant={visibilityVariant(visibility)}>
          visibility: {visibility}
        </StatusBadge>
        <StatusBadge variant={reviewStatusVariant(reviewStatus)}>
          review: {reviewStatus}
        </StatusBadge>
      </div>
      <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
        owner:{' '}
        {version.owner_username ?? version.owner_ref ?? `user:${version.owner_user_id}`}
      </div>
      {publication?.reviewed_at && (
        <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
          reviewed: {formatDate(publication.reviewed_at)}
        </div>
      )}
      {publication?.review_notes && (
        <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
          notes: {publication.review_notes}
        </div>
      )}
      <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
        {isActive ? 'Currently active' : 'Currently inactive'}
      </div>

      <button
        type="button"
        onClick={onActivate}
        disabled={activationBusy || isActive}
        className="w-full text-xs px-2 py-1 rounded border border-blue-200 text-blue-700 dark:border-blue-800/40 dark:text-blue-300 disabled:opacity-50 inline-flex items-center justify-center gap-1"
      >
        <Icon name="play" size={11} />
        Activate
      </button>
      <button
        type="button"
        onClick={onDeactivate}
        disabled={activationBusy || !isActive}
        className="w-full text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 disabled:opacity-50 inline-flex items-center justify-center gap-1"
      >
        <Icon name="pause" size={11} />
        Deactivate
      </button>
      <button
        type="button"
        onClick={onSubmit}
        disabled={!isVersionOwner || workflowBusy || reviewStatus === 'submitted'}
        className="w-full text-xs px-2 py-1 rounded border border-amber-200 text-amber-700 dark:border-amber-800/40 dark:text-amber-300 disabled:opacity-50 inline-flex items-center justify-center gap-1"
      >
        <Icon name="upload" size={11} />
        Submit for Review
      </button>
      <button
        type="button"
        onClick={onPublishPrivate}
        disabled={!canManagePublication || workflowBusy || visibility === 'private'}
        className="w-full text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 disabled:opacity-50 inline-flex items-center justify-center gap-1"
      >
        <Icon name="lock" size={11} />
        Publish Private
      </button>
      <button
        type="button"
        onClick={onPublishShared}
        disabled={
          !canManagePublication ||
          workflowBusy ||
          reviewStatus !== 'approved' ||
          visibility === 'shared'
        }
        className="w-full text-xs px-2 py-1 rounded border border-emerald-200 text-emerald-700 dark:border-emerald-800/40 dark:text-emerald-300 disabled:opacity-50 inline-flex items-center justify-center gap-1"
      >
        <Icon name="users" size={11} />
        Publish Shared
      </button>
      {isAdmin && onApprove && onReject && (
        <>
          <textarea
            value={reviewNotes}
            onChange={(event) => onReviewNotesChange(event.target.value)}
            placeholder="review notes (optional)"
            className="w-full h-16 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-[10px]"
          />
          <button
            type="button"
            onClick={onApprove}
            disabled={workflowBusy || reviewStatus !== 'submitted'}
            className="w-full text-xs px-2 py-1 rounded border border-blue-200 text-blue-700 dark:border-blue-800/40 dark:text-blue-300 disabled:opacity-50 inline-flex items-center justify-center gap-1"
          >
            <Icon name="check-square" size={11} />
            Approve
          </button>
          <button
            type="button"
            onClick={onReject}
            disabled={workflowBusy || !['submitted', 'approved'].includes(reviewStatus)}
            className="w-full text-xs px-2 py-1 rounded border border-red-200 text-red-700 dark:border-red-800/40 dark:text-red-300 disabled:opacity-50 inline-flex items-center justify-center gap-1"
          >
            <Icon name="x" size={11} />
            Reject
          </button>
        </>
      )}
    </div>
  );
}
