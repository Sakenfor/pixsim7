import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  extractErrorMessage,
  listAdminUsers,
  listBridgeMachines,
  pixsimClient,
  type AdminUserPermissions,
  type BridgeMachine,
} from '@lib/api';
import { isAdminUser } from '@lib/auth/userRoles';
import { formatActorLabel } from '@lib/identity/actorDisplay';

import { useAuthStore } from '@/stores/authStore';

interface PlanReviewDelegationEntry {
  id: string;
  grantorUserId: number;
  delegateUserId: number;
  planId: string | null;
  status: string;
  allowedProfileIds: string[];
  allowedBridgeIds: string[];
  allowedAgentIds: string[];
  note: string | null;
  expiresAt: string | null;
  updatedAt: string;
}

interface PlanReviewDelegationListResponse {
  generatedAt: string;
  asGrantor: PlanReviewDelegationEntry[];
  asDelegate: PlanReviewDelegationEntry[];
}

interface PlanReviewDelegationPayload {
  plan_id?: string;
  allowed_profile_ids?: string[];
  allowed_bridge_ids?: string[];
  allowed_agent_ids?: string[];
  note?: string;
}

interface BridgeStatusAgent {
  bridge_client_id: string;
  user_id: number | null;
  agent_type: string;
  connected_at: string;
  busy: boolean;
  tasks_completed: number;
}

interface BridgeStatusResponse {
  connected: number;
  available: number;
  agents: BridgeStatusAgent[];
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return 'Never';
  return new Date(value).toLocaleString();
}

function statusPillClass(status: string): string {
  const normalized = status.trim().toLowerCase();
  if (normalized === 'active') return 'bg-green-500/15 text-green-300 border-green-500/30';
  if (normalized === 'pending') return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
  if (normalized === 'revoked' || normalized === 'cancelled') {
    return 'bg-neutral-500/15 text-neutral-300 border-neutral-500/30';
  }
  return 'bg-blue-500/15 text-blue-300 border-blue-500/30';
}

function userLabel(userId: number, currentUserId?: number): string {
  return userId === currentUserId ? 'You' : `User #${userId}`;
}

function parseIdList(value: string): string[] | undefined {
  const ids = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return ids.length > 0 ? ids : undefined;
}

function delegationTerminal(status: string): boolean {
  const normalized = status.trim().toLowerCase();
  return normalized === 'revoked' || normalized === 'cancelled';
}

interface UserPickerOption {
  id: number;
  label: string;
}

function UserIdField({
  label,
  value,
  onChange,
  options,
  inputClassName,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: UserPickerOption[];
  inputClassName: string;
  placeholder: string;
}) {
  const hasOptions = options.length > 0;
  return (
    <label className="mt-2 block text-[10px] text-neutral-400">
      {label}
      {hasOptions ? (
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={inputClassName}
        >
          <option value="">Select user...</option>
          {options.map((option) => (
            <option key={option.id} value={String(option.id)}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={inputClassName}
          placeholder={placeholder}
        />
      )}
    </label>
  );
}

function DelegationList({
  title,
  emptyLabel,
  items,
  currentUserId,
  actionBusyKey,
  canApprove,
  canRevoke,
  onApprove,
  onRevoke,
}: {
  title: string;
  emptyLabel: string;
  items: PlanReviewDelegationEntry[];
  currentUserId?: number;
  actionBusyKey?: string | null;
  canApprove: (item: PlanReviewDelegationEntry) => boolean;
  canRevoke: (item: PlanReviewDelegationEntry) => boolean;
  onApprove: (item: PlanReviewDelegationEntry) => void;
  onRevoke: (item: PlanReviewDelegationEntry) => void;
}) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/40">
      <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-2">
        <h3 className="text-xs font-medium text-neutral-200">{title}</h3>
        <span className="text-[10px] text-neutral-500">
          {items.length} item{items.length === 1 ? '' : 's'}
        </span>
      </div>
      {items.length === 0 ? (
        <div className="px-3 py-3 text-[11px] text-neutral-500">{emptyLabel}</div>
      ) : (
        <div className="space-y-2 p-3">
          {items.map((item) => {
            const scopeBits: string[] = [];
            if (item.allowedProfileIds.length > 0) scopeBits.push(`profiles ${item.allowedProfileIds.length}`);
            if (item.allowedBridgeIds.length > 0) scopeBits.push(`bridges ${item.allowedBridgeIds.length}`);
            if (item.allowedAgentIds.length > 0) scopeBits.push(`agents ${item.allowedAgentIds.length}`);
            const scopeLabel = scopeBits.length > 0 ? scopeBits.join(' | ') : 'No explicit target filters';
            const normalizedStatus = item.status.trim().toLowerCase();
            const approveBusy = actionBusyKey === `approve:${item.id}`;
            const revokeBusy = actionBusyKey === `revoke:${item.id}`;
            const canApproveItem = canApprove(item);
            const canRevokeItem = canRevoke(item);
            const revokeLabel =
              normalizedStatus === 'pending' &&
              currentUserId === item.delegateUserId &&
              currentUserId !== item.grantorUserId
                ? 'Cancel'
                : 'Revoke';
            return (
              <div key={item.id} className="rounded border border-neutral-800 bg-neutral-950/40 px-2.5 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] text-neutral-200">
                    {userLabel(item.grantorUserId, currentUserId)} {'->'}
                    {' '}
                    {userLabel(item.delegateUserId, currentUserId)}
                  </div>
                  <span
                    className={`rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${statusPillClass(item.status)}`}
                  >
                    {item.status}
                  </span>
                </div>
                <div className="mt-1 text-[10px] text-neutral-500">
                  Plan scope: {item.planId || 'Any plan'}
                </div>
                <div className="mt-1 text-[10px] text-neutral-500">
                  Scope: {scopeLabel}
                </div>
                {item.note ? (
                  <div className="mt-1 text-[10px] text-neutral-400">{item.note}</div>
                ) : null}
                <div className="mt-1 text-[10px] text-neutral-600">
                  Updated {formatDateTime(item.updatedAt)}
                  {item.expiresAt ? ` | Expires ${formatDateTime(item.expiresAt)}` : ''}
                </div>
                {(canApproveItem || canRevokeItem) && (
                  <div className="mt-2 flex items-center gap-2">
                    {canApproveItem ? (
                      <button
                        onClick={() => onApprove(item)}
                        disabled={approveBusy || revokeBusy}
                        className="rounded border border-green-500/40 bg-green-500/10 px-2 py-0.5 text-[10px] text-green-200 transition-colors hover:border-green-400/70 disabled:opacity-50"
                      >
                        {approveBusy ? 'Approving...' : 'Approve'}
                      </button>
                    ) : null}
                    {canRevokeItem ? (
                      <button
                        onClick={() => onRevoke(item)}
                        disabled={approveBusy || revokeBusy}
                        className="rounded border border-neutral-600 bg-neutral-900 px-2 py-0.5 text-[10px] text-neutral-300 transition-colors hover:border-neutral-500 hover:text-neutral-100 disabled:opacity-50"
                      >
                        {revokeBusy ? 'Updating...' : revokeLabel}
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ProfileView() {
  const currentUser = useAuthStore((state) => state.user);
  const isAdmin = isAdminUser(currentUser);
  const [directoryUsers, setDirectoryUsers] = useState<AdminUserPermissions[]>([]);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [directoryError, setDirectoryError] = useState('');
  const [machines, setMachines] = useState<BridgeMachine[]>([]);
  const [liveBridgeAgents, setLiveBridgeAgents] = useState<BridgeStatusAgent[]>([]);
  const [delegations, setDelegations] = useState<PlanReviewDelegationListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mutationError, setMutationError] = useState('');
  const [mutationNotice, setMutationNotice] = useState('');
  const [actionBusyKey, setActionBusyKey] = useState<string | null>(null);

  const [requestGrantorUserId, setRequestGrantorUserId] = useState('');
  const [requestPlanId, setRequestPlanId] = useState('');
  const [requestAllowedProfileIds, setRequestAllowedProfileIds] = useState('');
  const [requestAllowedBridgeIds, setRequestAllowedBridgeIds] = useState('');
  const [requestAllowedAgentIds, setRequestAllowedAgentIds] = useState('');
  const [requestNote, setRequestNote] = useState('');
  const [requesting, setRequesting] = useState(false);

  const [grantDelegateUserId, setGrantDelegateUserId] = useState('');
  const [grantPlanId, setGrantPlanId] = useState('');
  const [grantAllowedProfileIds, setGrantAllowedProfileIds] = useState('');
  const [grantAllowedBridgeIds, setGrantAllowedBridgeIds] = useState('');
  const [grantAllowedAgentIds, setGrantAllowedAgentIds] = useState('');
  const [grantNote, setGrantNote] = useState('');
  const [granting, setGranting] = useState(false);

  const inputClassName =
    'mt-1 w-full rounded border border-neutral-700 bg-neutral-950/60 px-2 py-1 text-[11px] text-neutral-100 outline-none placeholder:text-neutral-500 focus:border-neutral-500';

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [machineResponse, delegationResponse] = await Promise.all([
        listBridgeMachines({ limit: 100 }),
        pixsimClient.get<PlanReviewDelegationListResponse>('/dev/plans/reviews/delegations'),
      ]);
      setMachines(machineResponse.machines || []);
      setDelegations(delegationResponse);
      const bridgeStatus = await pixsimClient.get<BridgeStatusResponse>('/meta/agents/bridge').catch(() => null);
      setLiveBridgeAgents(bridgeStatus?.agents ?? []);
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to load profile access data.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    const loadDirectoryUsers = async () => {
      if (!isAdmin) {
        setDirectoryUsers([]);
        setDirectoryError('');
        return;
      }
      setDirectoryLoading(true);
      setDirectoryError('');
      try {
        const response = await listAdminUsers({ limit: 300, offset: 0 });
        if (!cancelled) {
          setDirectoryUsers(response.users ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setDirectoryError(extractErrorMessage(err, 'Failed to load user directory.'));
        }
      } finally {
        if (!cancelled) {
          setDirectoryLoading(false);
        }
      }
    };
    void loadDirectoryUsers();
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  const onlineCount = useMemo(() => machines.filter((machine) => machine.online).length, [machines]);
  const orphanSharedBridgeAgents = useMemo(
    () =>
      liveBridgeAgents.filter(
        (agent) =>
          agent.user_id == null &&
          !machines.some((machine) => machine.bridge_client_id === agent.bridge_client_id),
      ),
    [liveBridgeAgents, machines],
  );
  const asGrantor = delegations?.asGrantor ?? [];
  const asDelegate = delegations?.asDelegate ?? [];
  const userPickerOptions = useMemo(() => {
    const byId = new Map<number, UserPickerOption>();
    const sortedDirectory = [...directoryUsers].sort((a, b) => a.username.localeCompare(b.username));
    for (const user of sortedDirectory) {
      const youPrefix = currentUser?.id === user.id ? 'You - ' : '';
      byId.set(user.id, {
        id: user.id,
        label: `${youPrefix}${user.username} (#${user.id})`,
      });
    }
    const knownIds = new Set<number>();
    if (typeof currentUser?.id === 'number' && currentUser.id > 0) knownIds.add(currentUser.id);
    for (const item of asGrantor) {
      knownIds.add(item.grantorUserId);
      knownIds.add(item.delegateUserId);
    }
    for (const item of asDelegate) {
      knownIds.add(item.grantorUserId);
      knownIds.add(item.delegateUserId);
    }
    for (const knownId of knownIds) {
      if (byId.has(knownId)) continue;
      byId.set(knownId, {
        id: knownId,
        label: knownId === currentUser?.id ? `You (#${knownId})` : `User #${knownId}`,
      });
    }
    return [...byId.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [asDelegate, asGrantor, currentUser?.id, directoryUsers]);

  const buildCommonPayload = useCallback(
    (params: {
      planId: string;
      allowedProfileIds: string;
      allowedBridgeIds: string;
      allowedAgentIds: string;
      note: string;
    }): PlanReviewDelegationPayload => {
      const payload: PlanReviewDelegationPayload = {};
      const planId = params.planId.trim();
      const note = params.note.trim();
      const profileIds = parseIdList(params.allowedProfileIds);
      const bridgeIds = parseIdList(params.allowedBridgeIds);
      const agentIds = parseIdList(params.allowedAgentIds);
      if (planId) payload.plan_id = planId;
      if (profileIds) payload.allowed_profile_ids = profileIds;
      if (bridgeIds) payload.allowed_bridge_ids = bridgeIds;
      if (agentIds) payload.allowed_agent_ids = agentIds;
      if (note) payload.note = note;
      return payload;
    },
    [],
  );

  const handleRequestDelegation = useCallback(async () => {
    const grantorUserId = Number.parseInt(requestGrantorUserId.trim(), 10);
    if (!Number.isInteger(grantorUserId) || grantorUserId <= 0) {
      setMutationError('Grantor user ID must be a positive number.');
      return;
    }
    setRequesting(true);
    setMutationError('');
    setMutationNotice('');
    try {
      const payload = {
        grantor_user_id: grantorUserId,
        ...buildCommonPayload({
          planId: requestPlanId,
          allowedProfileIds: requestAllowedProfileIds,
          allowedBridgeIds: requestAllowedBridgeIds,
          allowedAgentIds: requestAllowedAgentIds,
          note: requestNote,
        }),
      };
      await pixsimClient.post<PlanReviewDelegationEntry>('/dev/plans/reviews/delegations/requests', payload);
      setRequestGrantorUserId('');
      setRequestPlanId('');
      setRequestAllowedProfileIds('');
      setRequestAllowedBridgeIds('');
      setRequestAllowedAgentIds('');
      setRequestNote('');
      setMutationNotice(`Delegation request sent to User #${grantorUserId}.`);
      await refresh();
    } catch (err) {
      setMutationError(extractErrorMessage(err, 'Failed to create delegation request.'));
    } finally {
      setRequesting(false);
    }
  }, [
    buildCommonPayload,
    refresh,
    requestAllowedAgentIds,
    requestAllowedBridgeIds,
    requestAllowedProfileIds,
    requestGrantorUserId,
    requestNote,
    requestPlanId,
  ]);

  const handleGrantDelegation = useCallback(async () => {
    const delegateUserId = Number.parseInt(grantDelegateUserId.trim(), 10);
    if (!Number.isInteger(delegateUserId) || delegateUserId <= 0) {
      setMutationError('Delegate user ID must be a positive number.');
      return;
    }
    setGranting(true);
    setMutationError('');
    setMutationNotice('');
    try {
      const payload = {
        delegate_user_id: delegateUserId,
        ...buildCommonPayload({
          planId: grantPlanId,
          allowedProfileIds: grantAllowedProfileIds,
          allowedBridgeIds: grantAllowedBridgeIds,
          allowedAgentIds: grantAllowedAgentIds,
          note: grantNote,
        }),
      };
      await pixsimClient.post<PlanReviewDelegationEntry>('/dev/plans/reviews/delegations/grants', payload);
      setGrantDelegateUserId('');
      setGrantPlanId('');
      setGrantAllowedProfileIds('');
      setGrantAllowedBridgeIds('');
      setGrantAllowedAgentIds('');
      setGrantNote('');
      setMutationNotice(`Delegation granted to User #${delegateUserId}.`);
      await refresh();
    } catch (err) {
      setMutationError(extractErrorMessage(err, 'Failed to create delegation grant.'));
    } finally {
      setGranting(false);
    }
  }, [
    buildCommonPayload,
    grantAllowedAgentIds,
    grantAllowedBridgeIds,
    grantAllowedProfileIds,
    grantDelegateUserId,
    grantNote,
    grantPlanId,
    refresh,
  ]);

  const canApproveDelegation = useCallback(
    (entry: PlanReviewDelegationEntry): boolean => {
      if (entry.status.trim().toLowerCase() !== 'pending') return false;
      return isAdmin || currentUser?.id === entry.grantorUserId;
    },
    [currentUser?.id, isAdmin],
  );

  const canRevokeDelegation = useCallback(
    (entry: PlanReviewDelegationEntry): boolean => {
      if (delegationTerminal(entry.status)) return false;
      if (isAdmin || currentUser?.id === entry.grantorUserId) return true;
      if (currentUser?.id === entry.delegateUserId) {
        return entry.status.trim().toLowerCase() === 'pending';
      }
      return false;
    },
    [currentUser?.id, isAdmin],
  );

  const handleApproveDelegation = useCallback(
    async (entry: PlanReviewDelegationEntry) => {
      setActionBusyKey(`approve:${entry.id}`);
      setMutationError('');
      setMutationNotice('');
      try {
        await pixsimClient.post<PlanReviewDelegationEntry>(
          `/dev/plans/reviews/delegations/${encodeURIComponent(entry.id)}/approve`,
          {},
        );
        setMutationNotice(`Delegation ${entry.id.slice(0, 8)} approved.`);
        await refresh();
      } catch (err) {
        setMutationError(extractErrorMessage(err, 'Failed to approve delegation.'));
      } finally {
        setActionBusyKey(null);
      }
    },
    [refresh],
  );

  const handleRevokeDelegation = useCallback(
    async (entry: PlanReviewDelegationEntry) => {
      setActionBusyKey(`revoke:${entry.id}`);
      setMutationError('');
      setMutationNotice('');
      try {
        await pixsimClient.post<PlanReviewDelegationEntry>(
          `/dev/plans/reviews/delegations/${encodeURIComponent(entry.id)}/revoke`,
          {},
        );
        const normalizedStatus = entry.status.trim().toLowerCase();
        const cancelledByDelegate =
          normalizedStatus === 'pending' &&
          currentUser?.id === entry.delegateUserId &&
          currentUser?.id !== entry.grantorUserId &&
          !isAdmin;
        setMutationNotice(
          cancelledByDelegate
            ? `Delegation request ${entry.id.slice(0, 8)} cancelled.`
            : `Delegation ${entry.id.slice(0, 8)} revoked.`,
        );
        await refresh();
      } catch (err) {
        setMutationError(extractErrorMessage(err, 'Failed to update delegation.'));
      } finally {
        setActionBusyKey(null);
      }
    },
    [currentUser?.id, isAdmin, refresh],
  );

  return (
    <div className="h-full overflow-auto bg-neutral-900 p-4 text-neutral-200">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium text-neutral-100">Profile & Access</h2>
            <p className="text-xs text-neutral-500">
              Self-scoped bridge identity and review delegation visibility.
            </p>
          </div>
          <button
            onClick={() => void refresh()}
            disabled={loading}
            className="rounded-md border border-neutral-700 px-2.5 py-1 text-[10px] text-neutral-300 transition-colors hover:border-neutral-500 hover:text-neutral-100 disabled:opacity-50"
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {error ? (
          <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-200">
            {error}
          </div>
        ) : null}

        {mutationError ? (
          <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-200">
            {mutationError}
          </div>
        ) : null}

        {mutationNotice ? (
          <div className="rounded border border-green-500/30 bg-green-500/10 px-3 py-2 text-[11px] text-green-200">
            {mutationNotice}
          </div>
        ) : null}

        {directoryError ? (
          <div className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
            {directoryError} Falling back to manual numeric user IDs.
          </div>
        ) : null}

        {orphanSharedBridgeAgents.length > 0 ? (
          <div className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
            <div>
              Detected {orphanSharedBridgeAgents.length} live shared bridge
              {orphanSharedBridgeAgents.length === 1 ? '' : 's'} not linked to your user machine history.
            </div>
            <div className="mt-1 text-[10px] text-amber-100/80">
              IDs: {orphanSharedBridgeAgents.map((agent) => agent.bridge_client_id).join(', ')}
            </div>
          </div>
        ) : null}

        <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 px-3 py-2">
          <div className="text-[11px] text-neutral-300">
            Signed in as <span className="font-medium text-neutral-100">{currentUser?.username ?? 'Unknown user'}</span>
            {currentUser?.id ? ` (User #${currentUser.id})` : ''}
          </div>
          <div className="mt-1 text-[10px] text-neutral-500">
            Global user role and permission edits remain under Admin {'>'} Access.
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 px-3 py-3">
            <h3 className="text-xs font-medium text-neutral-200">Request Delegation</h3>
            <p className="mt-1 text-[10px] text-neutral-500">
              Ask another user to approve your access to their review routing.
            </p>
            <UserIdField
              label="Grantor user"
              value={requestGrantorUserId}
              onChange={setRequestGrantorUserId}
              options={userPickerOptions}
              inputClassName={inputClassName}
              placeholder="e.g. 2"
            />
            <div className="mt-1 text-[10px] text-neutral-500">
              {directoryLoading ? 'Loading users...' : `${userPickerOptions.length} user option(s) available`}
            </div>
            <label className="mt-2 block text-[10px] text-neutral-400">
              Plan scope (optional)
              <input
                value={requestPlanId}
                onChange={(event) => setRequestPlanId(event.target.value)}
                className={inputClassName}
                placeholder="unified-task-agent-architecture"
              />
            </label>
            <label className="mt-2 block text-[10px] text-neutral-400">
              Allowed profile IDs (optional, comma-separated)
              <input
                value={requestAllowedProfileIds}
                onChange={(event) => setRequestAllowedProfileIds(event.target.value)}
                className={inputClassName}
                placeholder="profile-a, profile-b"
              />
            </label>
            <label className="mt-2 block text-[10px] text-neutral-400">
              Allowed bridge client IDs (optional, comma-separated)
              <input
                value={requestAllowedBridgeIds}
                onChange={(event) => setRequestAllowedBridgeIds(event.target.value)}
                className={inputClassName}
                placeholder="bridge-client-a"
              />
            </label>
            <label className="mt-2 block text-[10px] text-neutral-400">
              Allowed agent IDs (optional, comma-separated)
              <input
                value={requestAllowedAgentIds}
                onChange={(event) => setRequestAllowedAgentIds(event.target.value)}
                className={inputClassName}
                placeholder="profile-xyz"
              />
            </label>
            <label className="mt-2 block text-[10px] text-neutral-400">
              Note (optional)
              <textarea
                value={requestNote}
                onChange={(event) => setRequestNote(event.target.value)}
                className={`${inputClassName} min-h-[52px] resize-y`}
                placeholder="Reason for request..."
              />
            </label>
            <button
              onClick={() => void handleRequestDelegation()}
              disabled={requesting}
              className="mt-3 rounded border border-blue-500/40 bg-blue-500/10 px-2.5 py-1 text-[10px] text-blue-200 transition-colors hover:border-blue-400/70 disabled:opacity-50"
            >
              {requesting ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>

          <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 px-3 py-3">
            <h3 className="text-xs font-medium text-neutral-200">Grant Delegation</h3>
            <p className="mt-1 text-[10px] text-neutral-500">
              Immediately allow another user to route plan reviews through your bridge scope.
            </p>
            <UserIdField
              label="Delegate user"
              value={grantDelegateUserId}
              onChange={setGrantDelegateUserId}
              options={userPickerOptions}
              inputClassName={inputClassName}
              placeholder="e.g. 2"
            />
            <div className="mt-1 text-[10px] text-neutral-500">
              {directoryLoading ? 'Loading users...' : `${userPickerOptions.length} user option(s) available`}
            </div>
            <label className="mt-2 block text-[10px] text-neutral-400">
              Plan scope (optional)
              <input
                value={grantPlanId}
                onChange={(event) => setGrantPlanId(event.target.value)}
                className={inputClassName}
                placeholder="unified-task-agent-architecture"
              />
            </label>
            <label className="mt-2 block text-[10px] text-neutral-400">
              Allowed profile IDs (optional, comma-separated)
              <input
                value={grantAllowedProfileIds}
                onChange={(event) => setGrantAllowedProfileIds(event.target.value)}
                className={inputClassName}
                placeholder="profile-a, profile-b"
              />
            </label>
            <label className="mt-2 block text-[10px] text-neutral-400">
              Allowed bridge client IDs (optional, comma-separated)
              <input
                value={grantAllowedBridgeIds}
                onChange={(event) => setGrantAllowedBridgeIds(event.target.value)}
                className={inputClassName}
                placeholder="bridge-client-a"
              />
            </label>
            <label className="mt-2 block text-[10px] text-neutral-400">
              Allowed agent IDs (optional, comma-separated)
              <input
                value={grantAllowedAgentIds}
                onChange={(event) => setGrantAllowedAgentIds(event.target.value)}
                className={inputClassName}
                placeholder="profile-xyz"
              />
            </label>
            <label className="mt-2 block text-[10px] text-neutral-400">
              Note (optional)
              <textarea
                value={grantNote}
                onChange={(event) => setGrantNote(event.target.value)}
                className={`${inputClassName} min-h-[52px] resize-y`}
                placeholder="Reason for grant..."
              />
            </label>
            <button
              onClick={() => void handleGrantDelegation()}
              disabled={granting}
              className="mt-3 rounded border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[10px] text-emerald-200 transition-colors hover:border-emerald-400/70 disabled:opacity-50"
            >
              {granting ? 'Granting...' : 'Grant Access'}
            </button>
          </div>
        </div>

        <div className="rounded-lg border border-neutral-800 bg-neutral-900/40">
          <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-2">
            <h3 className="text-xs font-medium text-neutral-200">Bridge Machines</h3>
            <span className="text-[10px] text-neutral-500">
              {onlineCount}/{machines.length} online
            </span>
          </div>
          {machines.length === 0 ? (
            <div className="px-3 py-3 text-[11px] text-neutral-500">
              No bridge machines recorded for this user yet.
            </div>
          ) : (
            <div className="space-y-2 p-3">
              {machines.map((machine) => (
                <div key={machine.bridge_client_id} className="rounded border border-neutral-800 bg-neutral-950/40 px-2.5 py-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${
                        machine.online
                          ? 'border-green-500/30 bg-green-500/15 text-green-300'
                          : 'border-neutral-500/30 bg-neutral-500/15 text-neutral-300'
                      }`}
                    >
                      {machine.online ? 'Online' : 'Offline'}
                    </span>
                    <code className="text-[10px] text-neutral-200" title={machine.bridge_client_id}>
                      {formatActorLabel({ fallback: machine.bridge_client_id })}
                    </code>
                    {machine.agent_type ? (
                      <span className="text-[10px] text-neutral-500">{machine.agent_type}</span>
                    ) : null}
                  </div>
                  <div className="mt-1 text-[10px] text-neutral-500">
                    Last seen: {formatDateTime(machine.last_seen_at)}
                    {machine.client_host ? ` | Host: ${machine.client_host}` : ''}
                    {machine.model ? ` | Model: ${machine.model}` : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <DelegationList
            title="Delegations Granted By You"
            emptyLabel="No active or historical delegations granted by you."
            items={asGrantor}
            currentUserId={currentUser?.id}
            actionBusyKey={actionBusyKey}
            canApprove={canApproveDelegation}
            canRevoke={canRevokeDelegation}
            onApprove={handleApproveDelegation}
            onRevoke={handleRevokeDelegation}
          />
          <DelegationList
            title="Delegations Granted To You"
            emptyLabel="No delegations requested or granted to you."
            items={asDelegate}
            currentUserId={currentUser?.id}
            actionBusyKey={actionBusyKey}
            canApprove={canApproveDelegation}
            canRevoke={canRevokeDelegation}
            onApprove={handleApproveDelegation}
            onRevoke={handleRevokeDelegation}
          />
        </div>
      </div>
    </div>
  );
}
