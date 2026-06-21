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

import { useProviders } from '@features/providers/hooks/useProviders';

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

// Slot-share rule (account-family endpoints; snake_case, unlike delegation).
interface GrantRule {
  id: number;
  owner_user_id: number;
  recipient_user_id: number;
  recipient_username: string | null;
  provider_id: string;
  model: string | null;
  account_id: number | null;
  slot_limit: number;
  note: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
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

type AccessKind = 'slots' | 'delegation';
type Direction = 'grant' | 'request';

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

function kindChipClass(kind: AccessKind): string {
  return kind === 'slots'
    ? 'border-cyan-500/30 bg-cyan-500/15 text-cyan-200'
    : 'border-violet-500/30 bg-violet-500/15 text-violet-200';
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

// Normalized ledger row spanning both resource kinds.
interface AccessRow {
  key: string;
  kind: AccessKind;
  kindLabel: string;
  title: string;
  lines: string[];
  status: string;
  note?: string | null;
  footer?: string;
  canApprove?: boolean;
  canRevoke?: boolean;
  revokeLabel?: string;
  approveBusy?: boolean;
  revokeBusy?: boolean;
  onApprove?: () => void;
  onRevoke?: () => void;
}

function LedgerCard({ title, emptyLabel, rows }: { title: string; emptyLabel: string; rows: AccessRow[] }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/40">
      <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-2">
        <h3 className="text-xs font-medium text-neutral-200">{title}</h3>
        <span className="text-[10px] text-neutral-500">
          {rows.length} item{rows.length === 1 ? '' : 's'}
        </span>
      </div>
      {rows.length === 0 ? (
        <div className="px-3 py-3 text-[11px] text-neutral-500">{emptyLabel}</div>
      ) : (
        <div className="space-y-2 p-3">
          {rows.map((row) => (
            <div key={row.key} className="rounded border border-neutral-800 bg-neutral-950/40 px-2.5 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`rounded border px-1.5 py-0.5 text-[9px] uppercase tracking-wide ${kindChipClass(row.kind)}`}
                  >
                    {row.kindLabel}
                  </span>
                  <span className="text-[11px] text-neutral-200">{row.title}</span>
                </div>
                <span
                  className={`rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${statusPillClass(row.status)}`}
                >
                  {row.status}
                </span>
              </div>
              {row.lines.map((line, idx) => (
                <div key={idx} className="mt-1 text-[10px] text-neutral-500">
                  {line}
                </div>
              ))}
              {row.note ? <div className="mt-1 text-[10px] text-neutral-400">{row.note}</div> : null}
              {row.footer ? <div className="mt-1 text-[10px] text-neutral-600">{row.footer}</div> : null}
              {(row.canApprove || row.canRevoke) && (
                <div className="mt-2 flex items-center gap-2">
                  {row.canApprove ? (
                    <button
                      onClick={row.onApprove}
                      disabled={row.approveBusy || row.revokeBusy}
                      className="rounded border border-green-500/40 bg-green-500/10 px-2 py-0.5 text-[10px] text-green-200 transition-colors hover:border-green-400/70 disabled:opacity-50"
                    >
                      {row.approveBusy ? 'Approving...' : 'Approve'}
                    </button>
                  ) : null}
                  {row.canRevoke ? (
                    <button
                      onClick={row.onRevoke}
                      disabled={row.approveBusy || row.revokeBusy}
                      className="rounded border border-neutral-600 bg-neutral-900 px-2 py-0.5 text-[10px] text-neutral-300 transition-colors hover:border-neutral-500 hover:text-neutral-100 disabled:opacity-50"
                    >
                      {row.revokeBusy ? 'Updating...' : row.revokeLabel ?? 'Revoke'}
                    </button>
                  ) : null}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ProfileView() {
  const currentUser = useAuthStore((state) => state.user);
  const isAdmin = isAdminUser(currentUser);
  const { providers } = useProviders();

  const [directoryUsers, setDirectoryUsers] = useState<AdminUserPermissions[]>([]);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [directoryError, setDirectoryError] = useState('');
  const [machines, setMachines] = useState<BridgeMachine[]>([]);
  const [liveBridgeAgents, setLiveBridgeAgents] = useState<BridgeStatusAgent[]>([]);
  const [delegations, setDelegations] = useState<PlanReviewDelegationListResponse | null>(null);
  const [slotsIssued, setSlotsIssued] = useState<GrantRule[]>([]);
  const [slotsReceived, setSlotsReceived] = useState<GrantRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mutationError, setMutationError] = useState('');
  const [mutationNotice, setMutationNotice] = useState('');
  const [actionBusyKey, setActionBusyKey] = useState<string | null>(null);

  // Unified "add access" builder.
  const [kind, setKind] = useState<AccessKind>('slots');
  const [direction, setDirection] = useState<Direction>('grant');
  const [recipient, setRecipient] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // slots fields
  const [providerId, setProviderId] = useState('');
  const [model, setModel] = useState('');
  const [slots, setSlots] = useState('1');
  const [expiresDays, setExpiresDays] = useState('');
  // delegation fields
  const [planId, setPlanId] = useState('');
  const [allowedProfileIds, setAllowedProfileIds] = useState('');
  const [allowedBridgeIds, setAllowedBridgeIds] = useState('');
  const [allowedAgentIds, setAllowedAgentIds] = useState('');

  const inputClassName =
    'mt-1 w-full rounded border border-neutral-700 bg-neutral-950/60 px-2 py-1 text-[11px] text-neutral-100 outline-none placeholder:text-neutral-500 focus:border-neutral-500';

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [machineResponse, delegationResponse, issued, received] = await Promise.all([
        listBridgeMachines({ limit: 100 }),
        pixsimClient.get<PlanReviewDelegationListResponse>('/dev/plans/reviews/delegations'),
        pixsimClient.get<GrantRule[]>('/accounts/grants/issued'),
        pixsimClient.get<GrantRule[]>('/accounts/grants/received'),
      ]);
      setMachines(machineResponse.machines || []);
      setDelegations(delegationResponse);
      setSlotsIssued(issued ?? []);
      setSlotsReceived(received ?? []);
      const bridgeStatus = await pixsimClient.get<BridgeStatusResponse>('/meta/agents/bridge').catch(() => null);
      setLiveBridgeAgents(bridgeStatus?.agents ?? []);
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to load access data.'));
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
        if (!cancelled) setDirectoryUsers(response.users ?? []);
      } catch (err) {
        if (!cancelled) setDirectoryError(extractErrorMessage(err, 'Failed to load user directory.'));
      } finally {
        if (!cancelled) setDirectoryLoading(false);
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
  const providerOptions = useMemo(
    () => [...providers].sort((a, b) => a.name.localeCompare(b.name)),
    [providers],
  );

  // Resolve a recipient input (numeric id or username) to a numeric user id.
  // Username resolution relies on the admin directory; non-admins use numeric ids.
  const resolveRecipientId = useCallback(
    (text: string): number | null => {
      const trimmed = text.trim();
      if (/^\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10);
      const match = directoryUsers.find((u) => u.username.toLowerCase() === trimmed.toLowerCase());
      return match ? match.id : null;
    },
    [directoryUsers],
  );

  const buildDelegationPayload = useCallback((): PlanReviewDelegationPayload => {
    const payload: PlanReviewDelegationPayload = {};
    const profileIds = parseIdList(allowedProfileIds);
    const bridgeIds = parseIdList(allowedBridgeIds);
    const agentIds = parseIdList(allowedAgentIds);
    if (planId.trim()) payload.plan_id = planId.trim();
    if (profileIds) payload.allowed_profile_ids = profileIds;
    if (bridgeIds) payload.allowed_bridge_ids = bridgeIds;
    if (agentIds) payload.allowed_agent_ids = agentIds;
    if (note.trim()) payload.note = note.trim();
    return payload;
  }, [allowedAgentIds, allowedBridgeIds, allowedProfileIds, note, planId]);

  const resetBuilder = useCallback(() => {
    setRecipient('');
    setNote('');
    setModel('');
    setSlots('1');
    setExpiresDays('');
    setPlanId('');
    setAllowedProfileIds('');
    setAllowedBridgeIds('');
    setAllowedAgentIds('');
  }, []);

  const handleSubmit = useCallback(async () => {
    setMutationError('');
    setMutationNotice('');
    const recipientTrimmed = recipient.trim();
    if (!recipientTrimmed) {
      setMutationError('Recipient (username or #id) is required.');
      return;
    }

    setSubmitting(true);
    try {
      if (kind === 'slots') {
        if (!providerId) {
          setMutationError('Pick a provider to share.');
          return;
        }
        const slotLimit = Number.parseInt(slots, 10);
        if (!Number.isInteger(slotLimit) || slotLimit < 1) {
          setMutationError('Slots must be a positive number.');
          return;
        }
        const payload: Record<string, unknown> = { provider_id: providerId, slot_limit: slotLimit };
        if (/^\d+$/.test(recipientTrimmed)) payload.recipient_user_id = Number.parseInt(recipientTrimmed, 10);
        else payload.recipient_username = recipientTrimmed;
        if (model.trim()) payload.model = model.trim();
        if (note.trim()) payload.note = note.trim();
        if (expiresDays.trim()) {
          const days = Number.parseFloat(expiresDays);
          if (!Number.isFinite(days) || days <= 0) {
            setMutationError('Expiry (days) must be a positive number.');
            return;
          }
          payload.expires_at = new Date(Date.now() + days * 86_400_000).toISOString();
        }
        await pixsimClient.post<GrantRule>('/accounts/grants', payload);
        setMutationNotice('Slot share rule added.');
      } else {
        const userId = resolveRecipientId(recipientTrimmed);
        if (userId == null) {
          setMutationError('Delegation needs a numeric user id (or a known username).');
          return;
        }
        if (direction === 'grant') {
          await pixsimClient.post('/dev/plans/reviews/delegations/grants', {
            delegate_user_id: userId,
            ...buildDelegationPayload(),
          });
          setMutationNotice(`Delegation granted to User #${userId}.`);
        } else {
          await pixsimClient.post('/dev/plans/reviews/delegations/requests', {
            grantor_user_id: userId,
            ...buildDelegationPayload(),
          });
          setMutationNotice(`Delegation request sent to User #${userId}.`);
        }
      }
      resetBuilder();
      await refresh();
    } catch (err) {
      setMutationError(extractErrorMessage(err, 'Failed to add access rule.'));
    } finally {
      setSubmitting(false);
    }
  }, [
    buildDelegationPayload,
    direction,
    kind,
    model,
    note,
    providerId,
    recipient,
    refresh,
    resetBuilder,
    resolveRecipientId,
    slots,
    expiresDays,
  ]);

  // ---- delegation action gates (unchanged behavior) ----
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
        await pixsimClient.post(`/dev/plans/reviews/delegations/${encodeURIComponent(entry.id)}/approve`, {});
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
      setActionBusyKey(`revoke-deleg:${entry.id}`);
      setMutationError('');
      setMutationNotice('');
      try {
        await pixsimClient.post(`/dev/plans/reviews/delegations/${encodeURIComponent(entry.id)}/revoke`, {});
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

  const handleRevokeSlot = useCallback(
    async (rule: GrantRule) => {
      setActionBusyKey(`revoke-slot:${rule.id}`);
      setMutationError('');
      setMutationNotice('');
      try {
        await pixsimClient.delete(`/accounts/grants/${rule.id}`);
        setMutationNotice('Slot share rule revoked.');
        await refresh();
      } catch (err) {
        setMutationError(extractErrorMessage(err, 'Failed to revoke slot rule.'));
      } finally {
        setActionBusyKey(null);
      }
    },
    [refresh],
  );

  // ---- normalize both resource kinds into one ledger ----
  const delegationRow = useCallback(
    (entry: PlanReviewDelegationEntry): AccessRow => {
      const scopeBits: string[] = [];
      if (entry.allowedProfileIds.length > 0) scopeBits.push(`profiles ${entry.allowedProfileIds.length}`);
      if (entry.allowedBridgeIds.length > 0) scopeBits.push(`bridges ${entry.allowedBridgeIds.length}`);
      if (entry.allowedAgentIds.length > 0) scopeBits.push(`agents ${entry.allowedAgentIds.length}`);
      const normalizedStatus = entry.status.trim().toLowerCase();
      const revokeLabel =
        normalizedStatus === 'pending' &&
        currentUser?.id === entry.delegateUserId &&
        currentUser?.id !== entry.grantorUserId
          ? 'Cancel'
          : 'Revoke';
      return {
        key: `deleg:${entry.id}`,
        kind: 'delegation',
        kindLabel: 'Delegation',
        title: `${userLabel(entry.grantorUserId, currentUser?.id)} -> ${userLabel(entry.delegateUserId, currentUser?.id)}`,
        lines: [
          `Plan scope: ${entry.planId || 'Any plan'}`,
          `Scope: ${scopeBits.length > 0 ? scopeBits.join(' | ') : 'No explicit target filters'}`,
        ],
        status: entry.status,
        note: entry.note,
        footer: `Updated ${formatDateTime(entry.updatedAt)}${entry.expiresAt ? ` | Expires ${formatDateTime(entry.expiresAt)}` : ''}`,
        canApprove: canApproveDelegation(entry),
        canRevoke: canRevokeDelegation(entry),
        revokeLabel,
        approveBusy: actionBusyKey === `approve:${entry.id}`,
        revokeBusy: actionBusyKey === `revoke-deleg:${entry.id}`,
        onApprove: () => void handleApproveDelegation(entry),
        onRevoke: () => void handleRevokeDelegation(entry),
      };
    },
    [actionBusyKey, canApproveDelegation, canRevokeDelegation, currentUser?.id, handleApproveDelegation, handleRevokeDelegation],
  );

  const slotRow = useCallback(
    (rule: GrantRule, canRevoke: boolean): AccessRow => {
      const recipientLabel =
        rule.recipient_user_id === currentUser?.id
          ? 'You'
          : rule.recipient_username
            ? `${rule.recipient_username} (#${rule.recipient_user_id})`
            : `User #${rule.recipient_user_id}`;
      return {
        key: `slot:${rule.id}`,
        kind: 'slots',
        kindLabel: 'Slots',
        title: `${userLabel(rule.owner_user_id, currentUser?.id)} -> ${recipientLabel}`,
        lines: [
          `${rule.provider_id} · ${rule.model || 'all models'} · ${rule.account_id ? `account #${rule.account_id}` : 'pooled'}`,
          `${rule.slot_limit} concurrent slot${rule.slot_limit === 1 ? '' : 's'}${rule.expires_at ? ` · expires ${formatDateTime(rule.expires_at)}` : ''}`,
        ],
        status: 'active',
        note: rule.note,
        canRevoke,
        revokeLabel: 'Revoke',
        revokeBusy: actionBusyKey === `revoke-slot:${rule.id}`,
        onRevoke: () => void handleRevokeSlot(rule),
      };
    },
    [actionBusyKey, currentUser?.id, handleRevokeSlot],
  );

  const rowsByYou = useMemo<AccessRow[]>(
    () => [...slotsIssued.map((r) => slotRow(r, true)), ...asGrantor.map(delegationRow)],
    [asGrantor, delegationRow, slotRow, slotsIssued],
  );
  const rowsToYou = useMemo<AccessRow[]>(
    () => [...slotsReceived.map((r) => slotRow(r, false)), ...asDelegate.map(delegationRow)],
    [asDelegate, delegationRow, slotRow, slotsReceived],
  );

  const userOptionCount = directoryUsers.length;

  return (
    <div className="h-full overflow-auto bg-neutral-900 p-4 text-neutral-200">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium text-neutral-100">Profile & Access</h2>
            <p className="text-xs text-neutral-500">
              One surface to share what's yours — generation slots and review delegation — and review what's shared with you.
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
          <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-200">{error}</div>
        ) : null}
        {mutationError ? (
          <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-200">{mutationError}</div>
        ) : null}
        {mutationNotice ? (
          <div className="rounded border border-green-500/30 bg-green-500/10 px-3 py-2 text-[11px] text-green-200">{mutationNotice}</div>
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

        {/* Unified "Add access" builder */}
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 px-3 py-3">
          <h3 className="text-xs font-medium text-neutral-200">Add Access</h3>
          <p className="mt-1 text-[10px] text-neutral-500">
            Pick what to share, who with, then add. Stack as many rules as you like.
          </p>

          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <label className="block text-[10px] text-neutral-400">
              What to share
              <select
                value={kind}
                onChange={(event) => setKind(event.target.value as AccessKind)}
                className={inputClassName}
              >
                <option value="slots">Generation slots</option>
                <option value="delegation">Review delegation</option>
              </select>
            </label>
            {kind === 'delegation' ? (
              <label className="block text-[10px] text-neutral-400">
                Direction
                <select
                  value={direction}
                  onChange={(event) => setDirection(event.target.value as Direction)}
                  className={inputClassName}
                >
                  <option value="grant">Grant to user</option>
                  <option value="request">Request from user</option>
                </select>
              </label>
            ) : (
              <label className="block text-[10px] text-neutral-400">
                Provider
                <select
                  value={providerId}
                  onChange={(event) => setProviderId(event.target.value)}
                  className={inputClassName}
                >
                  <option value="">Select provider...</option>
                  {providerOptions.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <label className="mt-2 block text-[10px] text-neutral-400">
            {kind === 'delegation' && direction === 'request' ? 'User to request from' : 'Recipient'} (username or #id)
            <input
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
              className={inputClassName}
              placeholder="e.g. claude or 28"
            />
          </label>
          {isAdmin ? (
            <div className="mt-1 text-[10px] text-neutral-500">
              {directoryLoading ? 'Loading users...' : `${userOptionCount} known user(s) for username lookup`}
            </div>
          ) : null}

          {kind === 'slots' ? (
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className="block text-[10px] text-neutral-400">
                Model (optional)
                <input
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  className={inputClassName}
                  placeholder="All models — or e.g. gemini-3.1"
                />
              </label>
              <label className="block text-[10px] text-neutral-400">
                Slots
                <input
                  type="number"
                  min={1}
                  value={slots}
                  onChange={(event) => setSlots(event.target.value)}
                  className={inputClassName}
                />
              </label>
              <label className="block text-[10px] text-neutral-400">
                Expires in days (optional)
                <input
                  type="number"
                  min={0}
                  step="0.5"
                  value={expiresDays}
                  onChange={(event) => setExpiresDays(event.target.value)}
                  className={inputClassName}
                  placeholder="never"
                />
              </label>
            </div>
          ) : (
            <>
              <label className="mt-2 block text-[10px] text-neutral-400">
                Plan scope (optional)
                <input
                  value={planId}
                  onChange={(event) => setPlanId(event.target.value)}
                  className={inputClassName}
                  placeholder="unified-task-agent-architecture"
                />
              </label>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <label className="block text-[10px] text-neutral-400">
                  Profile IDs
                  <input
                    value={allowedProfileIds}
                    onChange={(event) => setAllowedProfileIds(event.target.value)}
                    className={inputClassName}
                    placeholder="profile-a, profile-b"
                  />
                </label>
                <label className="block text-[10px] text-neutral-400">
                  Bridge IDs
                  <input
                    value={allowedBridgeIds}
                    onChange={(event) => setAllowedBridgeIds(event.target.value)}
                    className={inputClassName}
                    placeholder="bridge-client-a"
                  />
                </label>
                <label className="block text-[10px] text-neutral-400">
                  Agent IDs
                  <input
                    value={allowedAgentIds}
                    onChange={(event) => setAllowedAgentIds(event.target.value)}
                    className={inputClassName}
                    placeholder="profile-xyz"
                  />
                </label>
              </div>
            </>
          )}

          <label className="mt-2 block text-[10px] text-neutral-400">
            Note (optional)
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className={inputClassName}
              placeholder="Reason / context..."
            />
          </label>

          <button
            onClick={() => void handleSubmit()}
            disabled={submitting}
            className="mt-3 rounded border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[10px] text-emerald-200 transition-colors hover:border-emerald-400/70 disabled:opacity-50"
          >
            {submitting ? 'Adding...' : kind === 'delegation' && direction === 'request' ? 'Send request' : 'Add'}
          </button>
          {kind === 'slots' ? (
            <p className="mt-2 text-[10px] text-neutral-600">
              Leave model blank to share every model on the provider. Pinning to one account is available from the account card.
            </p>
          ) : null}
        </div>

        {/* Bridge machines (unchanged) */}
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/40">
          <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-2">
            <h3 className="text-xs font-medium text-neutral-200">Bridge Machines</h3>
            <span className="text-[10px] text-neutral-500">
              {onlineCount}/{machines.length} online
            </span>
          </div>
          {machines.length === 0 ? (
            <div className="px-3 py-3 text-[11px] text-neutral-500">No bridge machines recorded for this user yet.</div>
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
                    {machine.agent_type ? <span className="text-[10px] text-neutral-500">{machine.agent_type}</span> : null}
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

        {/* Unified ledger across both resource kinds */}
        <div className="grid gap-3 lg:grid-cols-2">
          <LedgerCard
            title="Shared By You"
            emptyLabel="You haven't shared any access yet."
            rows={rowsByYou}
          />
          <LedgerCard
            title="Shared With You"
            emptyLabel="Nothing has been shared with you."
            rows={rowsToYou}
          />
        </div>
      </div>
    </div>
  );
}
