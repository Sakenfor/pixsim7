import { useCallback, useEffect, useMemo, useState } from 'react';

import { getCurrentUserProfile, updateCurrentUserProfile, type UserProfile } from '@lib/api';
import { Icon } from '@lib/icons';

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
