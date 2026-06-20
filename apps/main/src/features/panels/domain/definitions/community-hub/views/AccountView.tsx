import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  getCurrentUserProfile,
  listMyAgentProfiles,
  listMyProjectScopeOptions,
  listMyWorldScopeOptions,
  listScopeContractOptions,
  listScopePlanOptions,
  updateCurrentUserProfile,
  type AdminAgentProfile,
  type UserProfile,
} from '@lib/api';
import { CODEGEN_PERMISSION, DIAGNOSTICS_PERMISSION } from '@lib/auth/userRoles';
import { Icon } from '@lib/icons';

import { draftFor } from '@/features/settings/components/modules/agentScopeDraft';
import {
  ProfileScopeSummary,
  type ScopeOptionMaps,
} from '@/features/settings/components/modules/ProfileScopeSummary';
import { useAuthStore } from '@/stores/authStore';

// ---------------------------------------------------------------------------
// Account view — functional editor for the current user's basic profile.
//
// Backend supports `username` + `display_name` on PATCH /users/me today; avatar
// upload / password change are not wired yet (see the disabled rows below).
// ---------------------------------------------------------------------------

type Status =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'error'; message: string };

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Read-only capability row. Granting/revoking is admin-only (Settings → Access);
// this just shows what the current user — and the agents they spawn — can do.
function CapabilityRow({
  label,
  enabled,
  note,
}: {
  label: string;
  enabled: boolean;
  note?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <span className="text-xs text-neutral-300">{label}</span>
        {note && <p className="text-[10px] text-neutral-500 mt-0.5 leading-snug">{note}</p>}
      </div>
      <span
        className={`shrink-0 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded ${
          enabled ? 'bg-emerald-600/20 text-emerald-300' : 'bg-neutral-800 text-neutral-500'
        }`}
      >
        {enabled && <Icon name="check" size={10} />}
        {enabled ? 'Enabled' : 'Off'}
      </span>
    </div>
  );
}

export function AccountView() {
  const setUser = useAuthStore((state) => state.setUser);
  const authUser = useAuthStore((state) => state.user);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const load = useCallback(async () => {
    setStatus({ kind: 'loading' });
    try {
      const p = await getCurrentUserProfile();
      setProfile(p);
      setUsername(p.username);
      setFullName(p.display_name ?? '');
      setStatus({ kind: 'idle' });
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : 'Failed to load profile' });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Read-only reflection of the user's OWN agent profiles + what each may touch
  // (agent-scope-admin-ux cp5). Mirrors the admin Settings → Access view via the
  // shared <ProfileScopeSummary>; uses owner-scoped endpoints only. Labels resolve
  // own worlds/projects + global plans/contracts; cross-owner grants fall back to
  // raw ids. Per-source failures are tolerated.
  const [agentProfiles, setAgentProfiles] = useState<AdminAgentProfile[] | null>(null);
  const [scopeOptions, setScopeOptions] = useState<ScopeOptionMaps>({
    plans: [],
    worlds: [],
    projects: [],
    contracts: [],
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [profs, plans, worlds, projects, contracts] = await Promise.all([
        listMyAgentProfiles().catch(() => ({ profiles: [], total: 0 })),
        listScopePlanOptions().catch(() => []),
        listMyWorldScopeOptions().catch(() => []),
        listMyProjectScopeOptions().catch(() => []),
        listScopeContractOptions().catch(() => []),
      ]);
      if (cancelled) return;
      setAgentProfiles(profs.profiles.filter((p) => p.status !== 'archived'));
      setScopeOptions({
        plans,
        worlds: [{ value: 'world:*', label: 'All worlds' }, ...worlds],
        projects,
        contracts,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty = useMemo(() => {
    if (!profile) return false;
    return username.trim() !== profile.username || fullName.trim() !== (profile.display_name ?? '');
  }, [profile, username, fullName]);

  const usernameValid = username.trim().length >= 3 && username.trim().length <= 50;
  const canSave = dirty && usernameValid && status.kind !== 'saving' && status.kind !== 'loading';

  const handleSave = useCallback(async () => {
    if (!profile) return;
    setStatus({ kind: 'saving' });
    try {
      const updated = await updateCurrentUserProfile({
        username: username.trim(),
        display_name: fullName.trim() || null,
      });
      setProfile(updated);
      setUsername(updated.username);
      setFullName(updated.display_name ?? '');
      // Keep the app-wide auth store in sync so the username updates everywhere.
      if (authUser) {
        setUser({ ...authUser, username: updated.username });
      }
      setStatus({ kind: 'saved' });
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : 'Failed to save changes' });
    }
  }, [profile, username, fullName, authUser, setUser]);

  const displayName = (profile?.display_name?.trim() || profile?.username) ?? '';

  // Capabilities are read-only here. Admins pass capability checks implicitly
  // server-side (is_admin), so an admin counts as enabled even without the
  // explicit grant in their permission list.
  const isAdmin = profile?.role === 'admin';
  const perms = profile?.permissions ?? [];
  const hasCodegen = isAdmin || perms.includes(CODEGEN_PERMISSION);
  const hasDiagnostics = isAdmin || perms.includes(DIAGNOSTICS_PERMISSION);
  const otherPerms = perms.filter((p) => p !== CODEGEN_PERMISSION && p !== DIAGNOSTICS_PERMISSION);

  return (
    <div className="p-4 space-y-5 max-w-md">
      <div>
        <h2 className="text-sm font-medium text-neutral-200">Account</h2>
        <p className="text-xs text-neutral-500">Manage your basic profile details.</p>
      </div>

      {status.kind === 'loading' && !profile ? (
        <p className="text-xs text-neutral-500">Loading…</p>
      ) : (
        <>
          {/* Profile icon + identity summary */}
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-indigo-600/20 text-indigo-300 text-sm font-semibold select-none">
              {profile ? initialsOf(displayName) : <Icon name="user" size={20} />}
            </div>
            <div className="min-w-0">
              <div className="text-sm text-neutral-200 truncate">{displayName || '—'}</div>
              <div className="text-xs text-neutral-500 truncate">{profile?.email ?? ''}</div>
            </div>
          </div>

          {/* Editable fields */}
          <div className="space-y-3">
            <label className="block">
              <span className="block text-xs text-neutral-400 mb-1">Username</span>
              <input
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  if (status.kind === 'saved' || status.kind === 'error') setStatus({ kind: 'idle' });
                }}
                className="w-full px-2 py-1.5 text-sm rounded-md bg-neutral-800 border border-neutral-700 text-neutral-200 focus:outline-none focus:border-indigo-500"
              />
              {!usernameValid && (
                <span className="block text-[11px] text-amber-400 mt-1">
                  Username must be 3–50 characters.
                </span>
              )}
            </label>

            <label className="block">
              <span className="block text-xs text-neutral-400 mb-1">Display name</span>
              <input
                type="text"
                value={fullName}
                placeholder="Optional"
                onChange={(e) => {
                  setFullName(e.target.value);
                  if (status.kind === 'saved' || status.kind === 'error') setStatus({ kind: 'idle' });
                }}
                className="w-full px-2 py-1.5 text-sm rounded-md bg-neutral-800 border border-neutral-700 text-neutral-200 focus:outline-none focus:border-indigo-500"
              />
            </label>

            <label className="block">
              <span className="block text-xs text-neutral-400 mb-1">Email</span>
              <input
                type="text"
                value={profile?.email ?? ''}
                disabled
                className="w-full px-2 py-1.5 text-sm rounded-md bg-neutral-900 border border-neutral-800 text-neutral-500 cursor-not-allowed"
              />
              <span className="block text-[11px] text-neutral-600 mt-1">
                Email can't be changed here.
              </span>
            </label>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Icon name="save" size={14} />
              {status.kind === 'saving' ? 'Saving…' : 'Save changes'}
            </button>
            {status.kind === 'saved' && (
              <span className="flex items-center gap-1 text-xs text-emerald-400">
                <Icon name="check" size={14} /> Saved
              </span>
            )}
            {status.kind === 'error' && (
              <span className="flex items-center gap-1 text-xs text-red-400">
                <Icon name="error" size={14} /> {status.message}
              </span>
            )}
          </div>

          {/* Capabilities — read-only. Granting is admin-only (Settings → Access). */}
          {profile && (
            <div className="pt-3 border-t border-neutral-800 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-medium text-neutral-300">Capabilities</h3>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded capitalize ${
                    isAdmin ? 'bg-purple-600/20 text-purple-300' : 'bg-neutral-800 text-neutral-400'
                  }`}
                >
                  {profile.role}
                </span>
              </div>
              <p className="text-[11px] text-neutral-600 leading-snug">
                What you and the agents you spawn can do.
              </p>

              <CapabilityRow label="Codegen access" enabled={hasCodegen} />
              <CapabilityRow
                label="Diagnostics access"
                enabled={hasDiagnostics}
                note="Agents you spawn inherit this capability."
              />

              {otherPerms.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {otherPerms.map((p) => (
                    <code
                      key={p}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400"
                    >
                      {p}
                    </code>
                  ))}
                </div>
              )}

              {!isAdmin && (!hasCodegen || !hasDiagnostics) && (
                <p className="text-[11px] text-neutral-600 leading-snug">
                  Ask an admin to enable a capability in Settings → Access.
                </p>
              )}
            </div>
          )}

          {/* Agent profile scopes — read-only reflection of Settings → Access (cp5). */}
          {agentProfiles && agentProfiles.length > 0 && (
            <div className="pt-3 border-t border-neutral-800 space-y-2">
              <h3 className="text-xs font-medium text-neutral-300">Agent profiles</h3>
              <p className="text-[11px] text-neutral-600 leading-snug">
                What the agents you run may touch. Granting is admin-only (Settings → Access).
              </p>
              <div className="space-y-2">
                {agentProfiles.map((p) => (
                  <div
                    key={p.id}
                    className="rounded border border-neutral-800 bg-neutral-900/40 px-2.5 py-2 space-y-1.5"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded ${
                          p.status === 'active'
                            ? 'bg-emerald-600/20 text-emerald-300'
                            : 'bg-neutral-800 text-neutral-500'
                        }`}
                      >
                        {p.status}
                      </span>
                      <span className="text-xs text-neutral-200 truncate">{p.label}</span>
                      <code className="ml-auto text-[9px] text-neutral-500">{p.agent_type}</code>
                    </div>
                    <ProfileScopeSummary draft={draftFor(p)} options={scopeOptions} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Not-yet-wired controls — surfaced so they aren't silently missing */}
          <div className="pt-3 border-t border-neutral-800 space-y-1">
            <p className="text-[11px] text-neutral-600">
              Avatar upload and password change aren't available yet.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
