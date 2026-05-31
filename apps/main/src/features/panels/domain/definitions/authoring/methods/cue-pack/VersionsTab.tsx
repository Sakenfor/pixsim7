/**
 * VersionsTab — full draft lifecycle UI for the CUE Pack method.
 *
 * Composes the shared prompt-pack primitives (VersionsList,
 * VersionDetailPanel) on top of the shared `useDraftLifecycle` hook,
 * which owns the workflow plumbing (submit / approve / reject /
 * publish-private / publish-shared / activate / deactivate).
 *
 * The tab renders nothing useful without a selected draft; the
 * parent gates that.
 */

import { useAuthStore } from '@pixsim7/shared.auth.core';

import type { PromptPackDraft } from '@lib/api/promptPacks';
import { isAdminUser } from '@lib/auth/userRoles';
import {
  VersionDetailPanel,
  VersionsList,
  useDraftLifecycle,
} from '@lib/ui/promptPacks';

export interface VersionsTabProps {
  draft: PromptPackDraft;
}

export function VersionsTab({ draft }: VersionsTabProps) {
  const currentUser = useAuthStore((s) => s.user);
  const isAdmin = isAdminUser(currentUser);

  const lifecycle = useDraftLifecycle(draft.id);
  const selectedVersion =
    lifecycle.versions.find((v) => v.id === lifecycle.selectedVersionId) ?? null;

  const versionOwnerUserId = selectedVersion?.owner_user_id ?? null;
  const isVersionOwner =
    versionOwnerUserId !== null &&
    String(versionOwnerUserId) === String(currentUser?.id ?? '');
  const canManagePublication = Boolean(isVersionOwner || isAdmin);

  return (
    <div className="h-full flex flex-col bg-neutral-900">
      {/* Header: create-version + refresh + activity message */}
      <div className="border-b border-neutral-800 px-3 py-2 flex items-center gap-2 shrink-0">
        <span className="text-[10px] uppercase tracking-wider text-neutral-500">
          Versions
        </span>
        <span className="text-[11px] text-neutral-500 truncate flex-1 min-w-0">
          {lifecycle.activityMessage ?? 'Snapshot the current draft as an immutable version.'}
        </span>
        <button
          type="button"
          onClick={() => void lifecycle.refresh()}
          disabled={lifecycle.versionsLoading || lifecycle.catalogLoading}
          className="text-[10px] px-2 py-1 rounded border border-neutral-700 text-neutral-300 hover:bg-neutral-800 disabled:opacity-40"
        >
          Refresh
        </button>
        <button
          type="button"
          onClick={() => void lifecycle.createVersion()}
          disabled={lifecycle.workflowBusyAction !== null}
          className="text-[10px] px-2 py-1 rounded border border-blue-700/60 bg-blue-600/20 text-blue-100 hover:bg-blue-600/30 disabled:opacity-40"
        >
          + Version
        </button>
      </div>

      {/* Body: versions list (left) + selected version detail (right) */}
      <div className="flex-1 min-h-0 flex gap-2 p-2 overflow-hidden">
        <div className="flex-1 min-w-0 overflow-y-auto">
          <VersionsList
            versions={lifecycle.versions}
            selectedId={lifecycle.selectedVersionId}
            onSelect={lifecycle.selectVersion}
            activeVersionIds={lifecycle.activeVersionIds}
            loading={lifecycle.versionsLoading}
            error={lifecycle.versionsError}
            emptyMessage="No versions yet. Click + Version to snapshot this draft."
          />
        </div>
        <div className="shrink-0">
          {selectedVersion ? (
            <VersionDetailPanel
              version={selectedVersion}
              publication={selectedVersion.publication ?? null}
              isActive={lifecycle.activeVersionIds.has(selectedVersion.id)}
              canManagePublication={canManagePublication}
              isAdmin={isAdmin}
              isVersionOwner={isVersionOwner}
              workflowBusy={lifecycle.workflowBusyAction !== null}
              activationBusy={lifecycle.activationBusyVersionId === selectedVersion.id}
              reviewNotes={lifecycle.reviewNotes}
              onReviewNotesChange={lifecycle.setReviewNotes}
              onActivate={() => void lifecycle.activate(selectedVersion.id)}
              onDeactivate={() => void lifecycle.deactivate(selectedVersion.id)}
              onSubmit={() => void lifecycle.submit(selectedVersion.id)}
              onPublishPrivate={() => void lifecycle.publishPrivate(selectedVersion.id)}
              onPublishShared={() => void lifecycle.publishShared(selectedVersion.id)}
              onApprove={
                isAdmin ? () => void lifecycle.approve(selectedVersion.id) : undefined
              }
              onReject={
                isAdmin ? () => void lifecycle.reject(selectedVersion.id) : undefined
              }
            />
          ) : (
            <div className="w-56 rounded border border-neutral-800 p-3 text-[11px] text-neutral-500">
              Select a version to manage its publication state.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
