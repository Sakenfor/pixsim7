import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  extractErrorMessage,
  listAdminUsers,
  updateAdminUserPermissions,
  type AdminUserPermissions,
} from '@lib/api';
import { CODEGEN_PERMISSION, isAdminUser } from '@lib/auth/userRoles';

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

export function AccessSettings() {
  const currentUser = useAuthStore((s) => s.user);
  const canManageAccess = isAdminUser(currentUser);

  const [users, setUsers] = useState<AdminUserPermissions[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [pendingUserIds, setPendingUserIds] = useState<Record<number, boolean>>({});

  const activeSearch = search.trim();

  const refreshUsers = useCallback(async () => {
    if (!canManageAccess) {
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      const response = await listAdminUsers({
        search: activeSearch || undefined,
        limit: 200,
        offset: 0,
      });
      setUsers(response.users);
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to load users'));
    } finally {
      setIsLoading(false);
    }
  }, [activeSearch, canManageAccess]);

  useEffect(() => {
    void refreshUsers();
  }, [refreshUsers]);

  const toggleCodegenPermission = useCallback(
    async (target: AdminUserPermissions, enabled: boolean) => {
      const currentPermissions = normalizePermissions(target.permissions || []);
      const nextPermissions = enabled
        ? normalizePermissions([...currentPermissions, CODEGEN_PERMISSION])
        : currentPermissions.filter((permission) => permission !== CODEGEN_PERMISSION);

      setPendingUserIds((prev) => ({ ...prev, [target.id]: true }));
      setError('');
      try {
        const updated = await updateAdminUserPermissions(target.id, nextPermissions);
        setUsers((prev) => prev.map((user) => (user.id === updated.id ? updated : user)));
      } catch (err) {
        setError(extractErrorMessage(err, `Failed to update permissions for ${target.username}`));
      } finally {
        setPendingUserIds((prev) => {
          const next = { ...prev };
          delete next[target.id];
          return next;
        });
      }
    },
    [],
  );

  const sortedUsers = useMemo(
    () =>
      [...users].sort((a, b) => {
        if (a.role !== b.role) {
          return a.role.localeCompare(b.role);
        }
        return a.username.localeCompare(b.username);
      }),
    [users],
  );

  if (!canManageAccess) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-800">
        Admin role is required to manage user permissions.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-[11px] text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-300">
        Manage explicit grants for backend scoped permissions. Codegen access is controlled by{' '}
        <code>{CODEGEN_PERMISSION}</code>.
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search users by email or username..."
          className="min-w-[260px] flex-1 rounded border border-neutral-300 bg-white px-3 py-2 text-[11px] text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
        />
        <button
          onClick={() => void refreshUsers()}
          disabled={isLoading}
          className="rounded border border-neutral-300 bg-white px-3 py-2 text-[11px] font-medium hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800 dark:hover:bg-neutral-700"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="rounded border border-neutral-200 dark:border-neutral-800">
        <table className="w-full text-left text-[11px]">
          <thead className="bg-neutral-50 dark:bg-neutral-900/40">
            <tr className="border-b border-neutral-200 dark:border-neutral-800">
              <th className="px-3 py-2 font-semibold">User</th>
              <th className="px-3 py-2 font-semibold">Role</th>
              <th className="px-3 py-2 font-semibold">Codegen</th>
              <th className="px-3 py-2 font-semibold">Permissions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-neutral-500">
                  Loading users...
                </td>
              </tr>
            ) : sortedUsers.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-neutral-500">
                  No users found.
                </td>
              </tr>
            ) : (
              sortedUsers.map((user) => {
                const permissions = normalizePermissions(user.permissions || []);
                const hasCodegen = permissions.includes(CODEGEN_PERMISSION);
                const pending = !!pendingUserIds[user.id];

                return (
                  <tr key={user.id} className="border-b border-neutral-200 dark:border-neutral-800">
                    <td className="px-3 py-2">
                      <div className="font-medium">{user.username}</div>
                      <div className="text-neutral-500">{user.email}</div>
                    </td>
                    <td className="px-3 py-2 uppercase text-neutral-600 dark:text-neutral-300">{user.role}</td>
                    <td className="px-3 py-2">
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={hasCodegen}
                          disabled={pending}
                          onChange={(event) => void toggleCodegenPermission(user, event.target.checked)}
                        />
                        <span>{pending ? 'Updating...' : hasCodegen ? 'Enabled' : 'Disabled'}</span>
                      </label>
                    </td>
                    <td className="px-3 py-2">
                      {permissions.length === 0 ? (
                        <span className="text-neutral-500">none</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {permissions.map((permission) => (
                            <code
                              key={permission}
                              className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
                            >
                              {permission}
                            </code>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

