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
  adminUpdateAgentProfileScope,
  adminUpdateUser,
  extractErrorMessage,
  listAdminAgentProfiles,
  listAdminProjectOptions,
  listAdminWorldOptions,
  listAgentRuns,
  listBridgeMachines,
  listAdminUsers,
  listProfileScopeAudit,
  listScopeContractOptions,
  listScopePlanOptions,
  updateAdminUserPermissions,
  type AdminAgentProfile,
  type AdminScopeResourceOption,
  type AdminUserPermissions,
  type AgentRun,
  type AuditEvent,
  type BridgeMachine,
  type ScopeOption,
} from '@lib/api';
import { CODEGEN_PERMISSION, DIAGNOSTICS_PERMISSION, isAdminUser } from '@lib/auth/userRoles';
import { formatActorLabel } from '@lib/identity/actorDisplay';

import { useAuthStore } from '@/stores/authStore';

import {
  denyAllowed,
  draftEquals,
  draftFor,
  draftToScopeUpdate,
  EMPTY_DRAFT,
  type FieldDraft,
  type ScopeDraft,
  type ScopeMode,
} from './agentScopeDraft';
import { ProfileScopeSummary, type ScopeOptionMaps } from './ProfileScopeSummary';

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

// --- Agent profile scopes (scoped-agent-authorization cp5 / agent-scope-admin-ux cp2) ---

// Searchable chip multi-select over resolved options. Selected values render as
// removable chips (unknown values fall back to their raw id); a filter box lists
// the remaining options. Buttons inside use type="button" + preventDefault so the
// portaled-popover focus rule (overlay-button-focus-scroll) is honoured here too.
function ScopeChipPicker({
  options,
  selected,
  onChange,
  disabled,
}: {
  options: ScopeOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const labelFor = useMemo(() => {
    const m = new Map(options.map((o) => [o.value, o.label]));
    return (v: string) => m.get(v) ?? v;
  }, [options]);

  const available = useMemo(() => {
    const sel = new Set(selected);
    const q = query.trim().toLowerCase();
    return options
      .filter((o) => !sel.has(o.value))
      .filter(
        (o) => !q || o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
      )
      .slice(0, 50);
  }, [options, selected, query]);

  const add = useCallback(
    (v: string) => {
      if (!selected.includes(v)) onChange([...selected, v]);
      setQuery('');
    },
    [selected, onChange],
  );
  const remove = useCallback(
    (v: string) => onChange(selected.filter((x) => x !== v)),
    [selected, onChange],
  );

  return (
    <div className="space-y-1">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
              title={v}
            >
              <span className="max-w-[14rem] truncate">{labelFor(v)}</span>
              {!disabled && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => remove(v)}
                  className="text-blue-400 hover:text-blue-600 dark:hover:text-blue-200"
                  aria-label={`Remove ${labelFor(v)}`}
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <Input
          size="sm"
          value={query}
          disabled={disabled}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && available.length > 0) {
              e.preventDefault();
              add(available[0].value);
            }
          }}
          placeholder={selected.length > 0 ? 'Add more…' : 'unrestricted'}
        />
        {open && available.length > 0 && (
          <div className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded border border-neutral-200 bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
            {available.map((o) => (
              <button
                key={o.value}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => add(o.value)}
                className="flex w-full items-center justify-between gap-2 px-2 py-1 text-left text-[11px] hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <span className="truncate text-neutral-800 dark:text-neutral-100">{o.label}</span>
                <code className="shrink-0 text-[9px] text-neutral-400">{o.value}</code>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const MODE_LABEL: Record<ScopeMode, string> = {
  unrestricted: 'Unrestricted',
  restricted: 'Restricted',
  deny: 'Deny all',
};

// One scope field with an explicit tri-state (agent-scope-admin-ux cp3): the mode
// segmented control maps 1:1 to the resolver — Unrestricted (null) / Restricted
// (the chip selection) / Deny all ([]). `canDeny` is false for world/project,
// whose default_scopes scope-strings have no deny-all representation, so they
// show only the first two modes.
function ScopeFieldEditor({
  label,
  options,
  value,
  onChange,
  canDeny,
  disabled,
}: {
  label: string;
  options: ScopeOption[];
  value: FieldDraft;
  onChange: (next: FieldDraft) => void;
  canDeny: boolean;
  disabled?: boolean;
}) {
  const modes: ScopeMode[] = canDeny
    ? ['unrestricted', 'restricted', 'deny']
    : ['unrestricted', 'restricted'];
  const kind = label.toLowerCase();
  return (
    <FormField label={label}>
      <div className="space-y-1">
        <div className="inline-flex overflow-hidden rounded border border-neutral-200 dark:border-neutral-700">
          {modes.map((m) => {
            const active = value.mode === m;
            const activeClass =
              m === 'deny'
                ? 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300'
                : 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300';
            return (
              <button
                key={m}
                type="button"
                disabled={disabled}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onChange({ mode: m, ids: m === 'restricted' ? value.ids : [] })}
                className={`px-2 py-0.5 text-[10px] transition-colors ${
                  active
                    ? activeClass
                    : 'text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                }`}
              >
                {MODE_LABEL[m]}
              </button>
            );
          })}
        </div>
        {value.mode === 'restricted' && (
          <ScopeChipPicker
            options={options}
            selected={value.ids}
            onChange={(ids) => onChange({ mode: 'restricted', ids })}
            disabled={disabled}
          />
        )}
        {value.mode === 'unrestricted' && (
          <p className="text-[10px] text-neutral-400">Full access — no {kind} restriction.</p>
        )}
        {value.mode === 'deny' && (
          <p className="text-[10px] text-red-600 dark:text-red-400">
            Deny-all — this agent may touch no {kind} of this kind.
          </p>
        )}
      </div>
    </FormField>
  );
}

function fmtTs(ts: string | null): string {
  if (!ts) return '—';
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleString();
}

// Collapsible per-profile observability (agent-scope-admin-ux cp4): effective-grants
// recap (shared <ProfileScopeSummary>), recent AgentRuns, and recent scope-change
// audit. Runs/audit are lazy-loaded on first expand so the panel isn't N fetches.
function ProfileDetailPanel({
  profile,
  options,
}: {
  profile: AdminAgentProfile;
  options: ScopeOptionMaps;
}) {
  const [open, setOpen] = useState(false);
  const [runs, setRuns] = useState<AgentRun[] | null>(null);
  const [audit, setAudit] = useState<AuditEvent[] | null>(null);
  const [loading, setLoading] = useState(false);
  const saved = useMemo(() => draftFor(profile), [profile]);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    try {
      const [r, a] = await Promise.all([
        listAgentRuns(profile.id, 8).catch(() => [] as AgentRun[]),
        listProfileScopeAudit(profile.id, 8).catch(() => ({ events: [] as AuditEvent[] })),
      ]);
      setRuns(r);
      setAudit(a.events);
    } finally {
      setLoading(false);
    }
  }, [profile.id]);

  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      if (next && runs === null) void loadDetail();
      return next;
    });
  }, [runs, loadDetail]);

  return (
    <div className="border-t border-neutral-100 pt-1.5 dark:border-neutral-800">
      <button
        type="button"
        onClick={toggle}
        className="text-[10px] text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
      >
        {open ? '▾' : '▸'} Details
      </button>
      {open && (
        <div className="mt-1.5 space-y-2">
          <div>
            <div className="mb-0.5 text-[10px] font-medium text-neutral-400 uppercase">
              Effective grants
            </div>
            <ProfileScopeSummary draft={saved} options={options} />
          </div>

          <div>
            <div className="mb-0.5 text-[10px] font-medium text-neutral-400 uppercase">
              Recent runs
            </div>
            {loading && runs === null ? (
              <div className="text-[10px] text-neutral-400">Loading…</div>
            ) : runs && runs.length > 0 ? (
              <div className="space-y-0.5">
                {runs.map((r) => (
                  <div key={r.id} className="flex items-center gap-1.5 text-[10px]">
                    <Badge
                      color={
                        r.status === 'completed' ? 'green' : r.status === 'failed' ? 'red' : 'gray'
                      }
                      className="!text-[9px] !px-1 !py-0"
                    >
                      {r.status}
                    </Badge>
                    <code className="text-neutral-500">{r.run_id.slice(0, 12)}</code>
                    <span className="ml-auto text-neutral-400">{fmtTs(r.started_at)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-[10px] text-neutral-400">No runs recorded.</div>
            )}
          </div>

          <div>
            <div className="mb-0.5 text-[10px] font-medium text-neutral-400 uppercase">
              Recent scope changes
            </div>
            {audit && audit.length > 0 ? (
              <div className="space-y-0.5">
                {audit.map((e) => (
                  <div key={e.id} className="flex items-center gap-1.5 text-[10px]">
                    <span className="text-neutral-600 dark:text-neutral-300">
                      {e.field ?? e.action}
                    </span>
                    {e.field && (
                      <span className="truncate text-neutral-400">
                        {e.oldValue ?? '∅'} → {e.newValue ?? '∅'}
                      </span>
                    )}
                    <span className="ml-auto shrink-0 text-neutral-400">{fmtTs(e.timestamp)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-[10px] text-neutral-400">No scope changes recorded.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AgentProfileScopes({ userId }: { userId: number }) {
  const [profiles, setProfiles] = useState<AdminAgentProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, ScopeDraft>>({});
  // Drill-down selection within this section: null = profile list, else the
  // expanded scope editor for one profile. Keeps the four scope editors out of
  // sight until a profile is picked — far less vertical stacking, mobile-friendly.
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);

  const [planOptions, setPlanOptions] = useState<ScopeOption[]>([]);
  const [worldOptions, setWorldOptions] = useState<ScopeOption[]>([]);
  const [projectOptions, setProjectOptions] = useState<ScopeOption[]>([]);
  const [contractOptions, setContractOptions] = useState<ScopeOption[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setSelectedProfileId(null); // reset drill-down when the target user changes
    try {
      const resp = await listAdminAgentProfiles(userId);
      setProfiles(resp.profiles);
      setDrafts(Object.fromEntries(resp.profiles.map((p) => [p.id, draftFor(p)])));
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to load agent profiles'));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Option sources for the pickers. All four are owner-agnostic (a scope grant is
  // an edge to a resource, independent of whose profile it is), so they don't
  // depend on the selected user — worlds/projects are listed across owners and
  // labelled with their owner. Tolerant of per-source failures: a picker with no
  // options still works (chips fall back to raw ids), so one 403/500 shouldn't
  // blank the whole panel.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [plans, worlds, projects, contracts] = await Promise.all([
        listScopePlanOptions().catch(() => [] as ScopeOption[]),
        listAdminWorldOptions().catch(() => ({ worlds: [] as AdminScopeResourceOption[] })),
        listAdminProjectOptions().catch(() => [] as AdminScopeResourceOption[]),
        listScopeContractOptions().catch(() => [] as ScopeOption[]),
      ]);
      if (cancelled) return;
      setPlanOptions(plans);
      setWorldOptions([
        { value: 'world:*', label: 'All worlds (world:*)' },
        ...worlds.worlds.map((w) => ({
          value: `world:${w.id}`,
          label: `${w.name} — ${w.owner_label} (#${w.id})`,
        })),
      ]);
      setProjectOptions(
        projects.map((pr) => ({
          value: `project:${pr.id}`,
          label: `${pr.name} — ${pr.owner_label} (#${pr.id})`,
        })),
      );
      setContractOptions(contracts);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const optionMaps: ScopeOptionMaps = useMemo(
    () => ({
      plans: planOptions,
      worlds: worldOptions,
      projects: projectOptions,
      contracts: contractOptions,
    }),
    [planOptions, worldOptions, projectOptions, contractOptions],
  );

  const setDraftField = useCallback((id: string, key: keyof ScopeDraft, val: FieldDraft) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? EMPTY_DRAFT), [key]: val },
    }));
  }, []);

  const applyUpdated = useCallback((updated: AdminAgentProfile) => {
    setProfiles((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    setDrafts((prev) => ({ ...prev, [updated.id]: draftFor(updated) }));
  }, []);

  const saveScopes = useCallback(
    async (p: AdminAgentProfile) => {
      const d = drafts[p.id];
      if (!d) return;
      setSavingId(p.id);
      setError('');
      try {
        applyUpdated(await adminUpdateAgentProfileScope(p.id, draftToScopeUpdate(d)));
      } catch (err) {
        setError(extractErrorMessage(err, 'Failed to update profile scopes'));
      } finally {
        setSavingId(null);
      }
    },
    [drafts, applyUpdated],
  );

  const toggleStatus = useCallback(
    async (p: AdminAgentProfile) => {
      const next = p.status === 'paused' ? 'active' : 'paused';
      setSavingId(p.id);
      setError('');
      try {
        applyUpdated(await adminUpdateAgentProfileScope(p.id, { status: next }));
      } catch (err) {
        setError(extractErrorMessage(err, 'Failed to update status'));
      } finally {
        setSavingId(null);
      }
    },
    [applyUpdated],
  );

  // Derive the drill-down target up here (one profile open at a time) so the
  // editor branch can stay declarative — `find` tolerates a stale id after a
  // reload by resolving to null, which falls back to the list.
  const selectedProfile =
    selectedProfileId != null ? profiles.find((p) => p.id === selectedProfileId) ?? null : null;
  const selDraft = selectedProfile ? drafts[selectedProfile.id] ?? EMPTY_DRAFT : EMPTY_DRAFT;
  const selBusy = selectedProfile ? savingId === selectedProfile.id : false;
  const selDirty = selectedProfile ? !draftEquals(selDraft, draftFor(selectedProfile)) : false;

  return (
    <>
      <SectionHeader className="mt-2">Agent profile scopes</SectionHeader>
      <p className="text-[10px] leading-snug text-neutral-500">
        Restrict what this user&apos;s agents (their Claude) may touch. Per field:{' '}
        <strong>Unrestricted</strong> (full access), <strong>Restricted</strong> (only the picked
        items), or <strong>Deny all</strong>. Worlds and projects can&apos;t express deny-all today,
        so they offer only the first two.
      </p>

      {loading ? (
        <div className="text-[11px] text-neutral-500">Loading agent profiles...</div>
      ) : profiles.length === 0 ? (
        <div className="rounded border border-neutral-200 bg-neutral-50 px-2.5 py-2 text-[11px] text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900/30">
          No agent profiles for this user yet.
        </div>
      ) : selectedProfile ? (
        <div className="space-y-1.5 rounded border border-neutral-200 bg-white px-2.5 py-2 dark:border-neutral-800 dark:bg-neutral-900/40">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedProfileId(null)}
              className="shrink-0 text-[11px] text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
            >
              ‹ Back
            </button>
            <Badge
              color={selectedProfile.status === 'active' ? 'green' : 'gray'}
              className="!text-[9px] !px-1.5 !py-0"
            >
              {selectedProfile.status}
            </Badge>
            <span className="truncate text-[11px] font-medium text-neutral-800 dark:text-neutral-100">
              {selectedProfile.label}
            </span>
            {selectedProfile.is_global && (
              <Badge color="blue" className="!text-[9px] !px-1.5 !py-0">
                global
              </Badge>
            )}
            <code className="ml-auto text-[9px] text-neutral-400" title={selectedProfile.id}>
              {selectedProfile.agent_type}
            </code>
          </div>
          <ScopeFieldEditor
            label="Plans"
            options={planOptions}
            value={selDraft.plans}
            canDeny={denyAllowed('plans')}
            onChange={(next) => setDraftField(selectedProfile.id, 'plans', next)}
            disabled={selBusy}
          />
          <ScopeFieldEditor
            label="Worlds"
            options={worldOptions}
            value={selDraft.worlds}
            canDeny={denyAllowed('worlds')}
            onChange={(next) => setDraftField(selectedProfile.id, 'worlds', next)}
            disabled={selBusy}
          />
          <ScopeFieldEditor
            label="Projects"
            options={projectOptions}
            value={selDraft.projects}
            canDeny={denyAllowed('projects')}
            onChange={(next) => setDraftField(selectedProfile.id, 'projects', next)}
            disabled={selBusy}
          />
          <ScopeFieldEditor
            label="Contracts"
            options={contractOptions}
            value={selDraft.contracts}
            canDeny={denyAllowed('contracts')}
            onChange={(next) => setDraftField(selectedProfile.id, 'contracts', next)}
            disabled={selBusy}
          />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="primary"
              loading={selBusy}
              disabled={!selDirty}
              onClick={() => void saveScopes(selectedProfile)}
            >
              Save scopes
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={selBusy}
              onClick={() => void toggleStatus(selectedProfile)}
            >
              {selectedProfile.status === 'paused' ? 'Resume' : 'Pause'}
            </Button>
          </div>
          <ProfileDetailPanel profile={selectedProfile} options={optionMaps} />
        </div>
      ) : (
        <div className="space-y-1">
          {profiles.map((p) => {
            const dirty = !draftEquals(drafts[p.id] ?? EMPTY_DRAFT, draftFor(p));
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedProfileId(p.id)}
                className="flex w-full items-center gap-2 rounded border border-neutral-200 bg-white px-2.5 py-2 text-left transition-colors hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900/40 dark:hover:bg-neutral-800/40"
              >
                <Badge
                  color={p.status === 'active' ? 'green' : 'gray'}
                  className="!text-[9px] !px-1.5 !py-0 shrink-0"
                >
                  {p.status}
                </Badge>
                <span className="truncate text-[11px] font-medium text-neutral-800 dark:text-neutral-100">
                  {p.label}
                </span>
                {p.is_global && (
                  <Badge color="blue" className="!text-[9px] !px-1.5 !py-0 shrink-0">
                    global
                  </Badge>
                )}
                {dirty && (
                  <span
                    title="Unsaved scope changes"
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
                  />
                )}
                <code className="ml-auto shrink-0 text-[9px] text-neutral-400" title={p.id}>
                  {p.agent_type}
                </code>
                <span className="shrink-0 text-neutral-400">›</span>
              </button>
            );
          })}
        </div>
      )}

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}
    </>
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
  const hasDiagnostics = permissions.includes(DIAGNOSTICS_PERMISSION);
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
            // Treat as a brand-new password, not a sign-in field. Otherwise the
            // browser password manager reads the panel as a login form and
            // autofills the saved username into the nearest text input — the
            // "Search users…" box above the list — which then refetches and
            // drops the selection. Mounting this field is what's tied to select.
            name="new-password"
            autoComplete="new-password"
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

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="text-[11px] text-neutral-700 dark:text-neutral-300">
              Diagnostics access
            </span>
            <p className="mt-0.5 text-[10px] leading-snug text-neutral-500">
              Run allowlisted tools &amp; scripts via the tracked diagnostics runner. Agents this
              user spawns inherit this capability (dry-run by default).
            </p>
          </div>
          <Switch
            checked={hasDiagnostics}
            onCheckedChange={(checked) => void togglePermission(DIAGNOSTICS_PERMISSION, checked)}
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

        {/* -- Agent profile scopes section -- */}
        <AgentProfileScopes userId={user.id} />

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
  // Selection holds the resolved user object, not just an id, so the detail
  // panel survives the list being re-filtered server-side by the search box.
  // Resolving the object out of the search-filtered `users` array (find-by-id,
  // the usual idiom for client-complete lists) would blank the panel the moment
  // a search excluded the selected user. Read-side fresh-ref canon
  // ([media-card-fresh-asset-ref] / [persisted-store-shape-canon]).
  const [selectedUser, setSelectedUser] = useState<AdminUserPermissions | null>(null);
  const selectedUserId = selectedUser?.id ?? null;
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

  // Keep the held selection fresh when the list updates (edits, bridge-machine
  // hydration), but DON'T drop it when a search filters the user out of `users`.
  useEffect(() => {
    if (!selectedUser) return;
    const fresh = users.find((u) => u.id === selectedUser.id);
    if (fresh && fresh !== selectedUser) setSelectedUser(fresh);
  }, [users, selectedUser]);

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
    // h-full + min-h-0 so this fills the bounded SettingsContent wrapper and the
    // inner list/detail columns' overflow-y-auto have a bounded ancestor to
    // scroll against. Without it the panel grows to content height and the
    // parent's overflow-hidden just clips it (bounded-scroll-ancestor rule).
    <div className="flex h-full min-h-0 flex-col gap-3">
      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-800" style={{ minHeight: 360 }}>
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
                  onSelect={() => setSelectedUser(user)}
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
