import {
  Badge,
  Button,
  ConfirmModal,
  FormField,
  Input,
  SearchInput,
  SectionHeader,
  Select,
  Switch,
} from '@pixsim7/shared.ui';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  adminDeactivateUser,
  adminUpdateUser,
  extractErrorMessage,
  listBridgeMachines,
  listAdminUsers,
  updateAdminUserPermissions,
  type AdminUserPermissions,
  type BridgeMachine,
} from '@lib/api';
import { CODEGEN_PERMISSION, isAdminUser } from '@lib/auth/userRoles';
import { formatActorLabel } from '@lib/identity/actorDisplay';

import { useAuthStore } from '@/stores/authStore';

function normalizePermissions(permissions: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const raw of permissions) {
    const permission = (raw || '').trim().toLowerCase();
    if (!permission || seen.has(permission)) {
      continue;
    }
    seen.add(permission);
    normalized.push(permission);
  }
  return normalized;
}

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin' },
  { value: 'user', label: 'User' },
  { value: 'guest', label: 'Guest' },
] as const;

const ROLE_BADGE_COLOR: Record<string, 'purple' | 'blue' | 'gray'> = {
  admin: 'purple',
  user: 'blue',
  guest: 'gray',
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  return new Date(dateStr).toLocaleString();
}

// --- User List Item ---

function UserListItem({
  user,
  isSelected,
  onSelect,
}: {
  user: AdminUserPermissions;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const machineTotal = user.bridge_machines_total ?? 0;
  const machineOnline = user.bridge_machines_online ?? 0;
  return (
    <button
      onClick={onSelect}
      className={`flex w-full items-center gap-2 border-b border-neutral-200 px-3 py-2 text-left text-[11px] transition-colors dark:border-neutral-800 ${
        isSelected
          ? 'bg-blue-50 dark:bg-blue-950/40'
          : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/40'
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-medium text-neutral-900 dark:text-neutral-100">
            {user.username}
          </span>
          {!user.is_active && (
            <Badge color="red" className="!text-[9px] !px-1.5 !py-0">
              Inactive
            </Badge>
          )}
        </div>
        <div className="truncate text-[10px] text-neutral-500">{user.email}</div>
        {machineTotal > 0 && (
          <div className="text-[9px] text-neutral-500">
            {machineOnline}/{machineTotal} bridge machine{machineTotal !== 1 ? 's' : ''} online
          </div>
        )}
      </div>
      <Badge color={ROLE_BADGE_COLOR[user.role] ?? 'gray'} className="!text-[9px] shrink-0">
        {user.role}
      </Badge>
    </button>
  );
}

// --- User Detail Panel ---

function UserDetailPanel({
  user,
  currentUserId,
  machinesLoading,
  onRefreshMachines,
  onUpdate,
}: {
  user: AdminUserPermissions;
  currentUserId: number | undefined;
  machinesLoading: boolean;
  onRefreshMachines: () => void;
  onUpdate: (updated: AdminUserPermissions) => void;
}) {
  const [editRole, setEditRole] = useState(user.role);
  const [editActive, setEditActive] = useState(user.is_active);
  const [newPassword, setNewPassword] = useState('');
  const [newPermission, setNewPermission] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);

  const isSelf = currentUserId === user.id;
  const permissions = normalizePermissions(user.permissions || []);
  const hasCodegen = permissions.includes(CODEGEN_PERMISSION);
  const bridgeMachines = user.bridge_machines ?? [];
  const bridgeMachinesTotal = user.bridge_machines_total ?? bridgeMachines.length;
  const bridgeMachinesOnline =
    user.bridge_machines_online ?? bridgeMachines.filter((machine) => machine.online).length;

  // Reset form when user changes
  useEffect(() => {
    setEditRole(user.role);
    setEditActive(user.is_active);
    setNewPassword('');
    setNewPermission('');
    setError('');
    setSuccess('');
  }, [user.id, user.role, user.is_active]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const updates: Record<string, unknown> = {};
      if (editRole !== user.role) updates.role = editRole;
      if (editActive !== user.is_active) updates.is_active = editActive;
      if (newPassword.trim()) updates.password = newPassword.trim();

      if (Object.keys(updates).length === 0) {
        setError('No changes to save');
        return;
      }

      const updated = await adminUpdateUser(user.id, updates as Parameters<typeof adminUpdateUser>[1]);
      onUpdate(updated);
      setNewPassword('');
      setSuccess('Saved');
      setTimeout(() => setSuccess(''), 2000);
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to update user'));
    } finally {
      setSaving(false);
    }
  }, [editRole, editActive, newPassword, user, onUpdate]);

  const togglePermission = useCallback(
    async (permission: string, enabled: boolean) => {
      const current = normalizePermissions(user.permissions || []);
      const next = enabled
        ? normalizePermissions([...current, permission])
        : current.filter((p) => p !== permission);

      setError('');
      try {
        const updated = await updateAdminUserPermissions(user.id, next);
        onUpdate(updated);
      } catch (err) {
        setError(extractErrorMessage(err, 'Failed to update permissions'));
      }
    },
    [user, onUpdate],
  );

  const addPermission = useCallback(async () => {
    const perm = newPermission.trim().toLowerCase();
    if (!perm) return;
    const current = normalizePermissions(user.permissions || []);
    if (current.includes(perm)) {
      setError(`Permission "${perm}" already exists`);
      return;
    }
    setError('');
    try {
      const updated = await updateAdminUserPermissions(user.id, [...current, perm]);
      onUpdate(updated);
      setNewPermission('');
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to add permission'));
    }
  }, [newPermission, user, onUpdate]);

  const removePermission = useCallback(
    async (permission: string) => {
      const current = normalizePermissions(user.permissions || []);
      setError('');
      try {
        const updated = await updateAdminUserPermissions(
          user.id,
          current.filter((p) => p !== permission),
        );
        onUpdate(updated);
      } catch (err) {
        setError(extractErrorMessage(err, 'Failed to remove permission'));
      }
    },
    [user, onUpdate],
  );

  const handleDeactivate = useCallback(async () => {
    setError('');
    try {
      const updated = await adminDeactivateUser(user.id);
      onUpdate(updated);
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to deactivate user'));
    }
  }, [user.id, onUpdate]);

  const hasChanges = editRole !== user.role || editActive !== user.is_active || newPassword.trim() !== '';

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="space-y-4 p-3">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              {user.username}
            </div>
            <div className="text-[11px] text-neutral-500">{user.email}</div>
          </div>
          <Badge color={user.is_active ? 'green' : 'red'}>
            {user.is_active ? 'Active' : 'Inactive'}
          </Badge>
        </div>

        {/* Info row */}
        <div className="flex gap-4 text-[10px] text-neutral-500">
          <span>Created: {formatDate(user.created_at)}</span>
          <span>Last login: {formatDate(user.last_login_at)}</span>
        </div>

        {/* Error / Success */}
        {error && (
          <div className="rounded border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded border border-green-200 bg-green-50 px-2.5 py-1.5 text-[11px] text-green-700 dark:border-green-900/60 dark:bg-green-950/30 dark:text-green-300">
            {success}
          </div>
        )}

        {/* -- Account section -- */}
        <SectionHeader>Account</SectionHeader>

        <FormField label="Role">
          <Select
            value={editRole}
            onChange={(e) => setEditRole(e.target.value)}
            size="sm"
            disabled={isSelf}
          >
            {ROLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField label="Active">
          <div className="flex items-center gap-2">
            <Switch
              checked={editActive}
              onCheckedChange={setEditActive}
              size="sm"
              disabled={isSelf}
            />
            <span className="text-[11px] text-neutral-600 dark:text-neutral-400">
              {editActive ? 'Account enabled' : 'Account disabled'}
            </span>
          </div>
        </FormField>

        <FormField label="Set new password" optional>
          <Input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Leave blank to keep current"
            size="sm"
          />
        </FormField>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="primary"
            onClick={() => void handleSave()}
            loading={saving}
            disabled={!hasChanges}
          >
            Save changes
          </Button>
          {isSelf && (
            <span className="text-[10px] text-amber-600 dark:text-amber-400">
              Cannot modify own role/status
            </span>
          )}
        </div>

        {/* -- Permissions section -- */}
        <SectionHeader className="mt-2">Permissions</SectionHeader>

        <div className="flex items-center justify-between">
          <span className="text-[11px] text-neutral-700 dark:text-neutral-300">Codegen access</span>
          <Switch
            checked={hasCodegen}
            onCheckedChange={(checked) => void togglePermission(CODEGEN_PERMISSION, checked)}
            size="sm"
          />
        </div>

        {permissions.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {permissions.map((perm) => (
              <span
                key={perm}
                className="inline-flex items-center gap-1 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
              >
                <code>{perm}</code>
                <button
                  onClick={() => void removePermission(perm)}
                  className="ml-0.5 text-neutral-400 hover:text-red-500"
                  title={`Remove ${perm}`}
                >
                  x
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center gap-1.5">
          <Input
            type="text"
            value={newPermission}
            onChange={(e) => setNewPermission(e.target.value)}
            placeholder="Add permission..."
            size="sm"
            onKeyDown={(e) => {
              if (e.key === 'Enter') void addPermission();
            }}
          />
          <Button size="sm" variant="outline" onClick={() => void addPermission()}>
            Add
          </Button>
        </div>

        {/* -- Bridge machines section -- */}
        <SectionHeader className="mt-2">Bridge machines</SectionHeader>

        <div className="flex items-center justify-between text-[10px] text-neutral-500">
          <span>
            {bridgeMachinesOnline}/{bridgeMachinesTotal} online
          </span>
          <Button size="sm" variant="ghost" onClick={onRefreshMachines} loading={machinesLoading}>
            Refresh
          </Button>
        </div>

        {machinesLoading ? (
          <div className="text-[11px] text-neutral-500">Loading bridge machines...</div>
        ) : bridgeMachines.length === 0 ? (
          <div className="rounded border border-neutral-200 bg-neutral-50 px-2.5 py-2 text-[11px] text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900/30">
            No bridge machines recorded for this user yet.
          </div>
        ) : (
          <div className="space-y-1.5">
            {bridgeMachines.map((machine: BridgeMachine) => (
              <div
                key={machine.bridge_client_id}
                className="rounded border border-neutral-200 bg-white px-2.5 py-2 dark:border-neutral-800 dark:bg-neutral-900/40"
              >
                <div className="flex items-center gap-2">
                  <Badge color={machine.online ? 'green' : 'gray'} className="!text-[9px] !px-1.5 !py-0">
                    {machine.online ? 'Online' : 'Offline'}
                  </Badge>
                  <code
                    className="text-[10px] text-neutral-700 dark:text-neutral-200"
                    title={machine.bridge_client_id}
                  >
                    {formatActorLabel({ fallback: machine.bridge_client_id })}
                  </code>
                  {machine.agent_type && (
                    <span className="text-[10px] text-neutral-500">{machine.agent_type}</span>
                  )}
                </div>
                <div className="mt-1 text-[10px] text-neutral-500">
                  Last seen: {formatDateTime(machine.last_seen_at)}
                  {machine.bridge_id ? ` - Bridge: ${machine.bridge_id}` : ''}
                  {machine.client_host ? ` - Host: ${machine.client_host}` : ''}
                  {machine.model ? ` - Model: ${machine.model}` : ''}
                </div>
              </div>
            ))}
          </div>
        )}

        {!isSelf && (
          <>
            <SectionHeader className="mt-2">Danger zone</SectionHeader>
            <Button
              size="sm"
              variant="danger"
              onClick={() => setShowDeactivateConfirm(true)}
              disabled={!user.is_active}
            >
              {user.is_active ? 'Deactivate account' : 'Already deactivated'}
            </Button>
          </>
        )}
      </div>

      <ConfirmModal
        isOpen={showDeactivateConfirm}
        onCancel={() => setShowDeactivateConfirm(false)}
        onConfirm={() => void handleDeactivate()}
        title="Deactivate user"
        message={`This will deactivate ${user.username}'s account. They will no longer be able to log in. This can be reversed by re-enabling the Active toggle.`}
        confirmText="Deactivate"
        variant="danger"
      />
    </div>
  );
}

// --- Main ---

export function AccessSettings() {
  const currentUser = useAuthStore((s) => s.user);
  const canManageAccess = isAdminUser(currentUser);

  const [users, setUsers] = useState<AdminUserPermissions[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [machinesLoadingUserId, setMachinesLoadingUserId] = useState<number | null>(null);

  const activeSearch = search.trim();

  const refreshUsers = useCallback(async () => {
    if (!canManageAccess) return;
    setIsLoading(true);
    setError('');
    try {
      const response = await listAdminUsers({
        search: activeSearch || undefined,
        limit: 200,
        offset: 0,
      });
      setUsers((prev) => {
        const previousById = new Map(prev.map((user) => [user.id, user]));
        return response.users.map((user) => {
          const existing = previousById.get(user.id);
          if (!existing) return user;
          return {
            ...user,
            bridge_machines: existing.bridge_machines,
            bridge_machines_total: existing.bridge_machines_total,
            bridge_machines_online: existing.bridge_machines_online,
          };
        });
      });
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to load users'));
    } finally {
      setIsLoading(false);
    }
  }, [activeSearch, canManageAccess]);

  useEffect(() => {
    void refreshUsers();
  }, [refreshUsers]);

  const sortedUsers = useMemo(
    () =>
      [...users].sort((a, b) => {
        if (a.role !== b.role) return a.role.localeCompare(b.role);
        return a.username.localeCompare(b.username);
      }),
    [users],
  );

  const selectedUser = useMemo(
    () => (selectedUserId != null ? users.find((u) => u.id === selectedUserId) : undefined),
    [users, selectedUserId],
  );

  const refreshSelectedUserMachines = useCallback(async () => {
    if (!canManageAccess || selectedUserId == null) return;
    const targetUserId = selectedUserId;
    setMachinesLoadingUserId(targetUserId);
    setError('');
    try {
      const response = await listBridgeMachines({
        user_id: targetUserId,
        limit: 100,
      });
      const onlineCount = response.machines.filter((machine) => machine.online).length;
      setUsers((prev) =>
        prev.map((user) =>
          user.id === targetUserId
            ? {
                ...user,
                bridge_machines: response.machines,
                bridge_machines_total: response.total,
                bridge_machines_online: onlineCount,
              }
            : user,
        ),
      );
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to load bridge machines'));
    } finally {
      setMachinesLoadingUserId((current) => (current === targetUserId ? null : current));
    }
  }, [canManageAccess, selectedUserId]);

  useEffect(() => {
    void refreshSelectedUserMachines();
  }, [refreshSelectedUserMachines]);

  const handleUserUpdated = useCallback((updated: AdminUserPermissions) => {
    setUsers((prev) =>
      prev.map((user) =>
        user.id === updated.id
          ? {
              ...user,
              ...updated,
              bridge_machines: updated.bridge_machines ?? user.bridge_machines,
              bridge_machines_total: updated.bridge_machines_total ?? user.bridge_machines_total,
              bridge_machines_online: updated.bridge_machines_online ?? user.bridge_machines_online,
            }
          : user,
      ),
    );
  }, []);

  const selectedUserMachinesLoading =
    selectedUser != null && machinesLoadingUserId === selectedUser.id;

  if (!canManageAccess) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-800">
        Admin role is required to manage user permissions.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="flex overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-800" style={{ minHeight: 360 }}>
        {/* -- Left: User list -- */}
        <div className="flex w-[220px] shrink-0 flex-col border-r border-neutral-200 bg-neutral-50/50 dark:border-neutral-800 dark:bg-neutral-900/30">
          <div className="border-b border-neutral-200 p-2 dark:border-neutral-800">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search users..."
              size="sm"
              debounceMs={250}
            />
          </div>

          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="px-3 py-4 text-[11px] text-neutral-500">Loading...</div>
            ) : sortedUsers.length === 0 ? (
              <div className="px-3 py-4 text-[11px] text-neutral-500">No users found.</div>
            ) : (
              sortedUsers.map((user) => (
                <UserListItem
                  key={user.id}
                  user={user}
                  isSelected={selectedUserId === user.id}
                  onSelect={() => setSelectedUserId(user.id)}
                />
              ))
            )}
          </div>

          <div className="border-t border-neutral-200 px-3 py-1.5 text-[10px] text-neutral-500 dark:border-neutral-800">
            {users.length} user{users.length !== 1 ? 's' : ''}
          </div>
        </div>

        {/* -- Right: User detail -- */}
        <div className="flex-1 overflow-hidden">
          {selectedUser ? (
            <UserDetailPanel
              user={selectedUser}
              currentUserId={currentUser?.id}
              machinesLoading={selectedUserMachinesLoading}
              onRefreshMachines={() => void refreshSelectedUserMachines()}
              onUpdate={handleUserUpdated}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-[11px] text-neutral-400">
              Select a user to view and edit
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
