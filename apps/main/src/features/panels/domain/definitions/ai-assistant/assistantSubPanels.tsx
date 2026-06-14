/* eslint-disable react-refresh/only-export-components */
/**
 * Secondary UI panels/widgets for the AI Assistant — pickers, editors, badges.
 */

import {
  Badge,
  Button,
  Popover,
  useHoverExpand,
} from '@pixsim7/shared.ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getEngineBrand } from '@lib/agent/engineBrands';
import { pixsimClient } from '@lib/api/client';
import { Icon, getIcon, type IconName } from '@lib/icons';

import { refreshChatUnread } from '@features/notifications/lib/chatUnreadPoll';

import type { AgentEngine } from './assistantChatStore';
import type { ChatSessionEntry, UnifiedProfile } from './assistantTypes';
import { AGENT_COMMANDS } from './assistantTypes';
import { listOrphanSessions } from './chatTabsApi';
import { EngineProfileIcon, iconForEngine } from './EngineProfileIcon';

/**
 * Resume callback shared by both resume pickers. `icon`/`subtitle` carry the
 * agent-set tab identity (persisted on the session, survives tab close) so the
 * resumed tab renders the same glyph/secondary line it had when live.
 */
export type ResumeHandler = (
  sessionId: string,
  engine: string,
  label: string,
  profileId: string | null,
  lastPlanId?: string | null,
  icon?: string | null,
  subtitle?: string | null,
) => void;

// =============================================================================
// Profile Editor
// =============================================================================

interface ProfileEditorProps {
  profile: UnifiedProfile | null;  // null = create new
  onSave: (updated: UnifiedProfile) => void;
  onCancel: () => void;
}

export function ProfileEditor({ profile, onSave, onCancel }: ProfileEditorProps) {
  const isNew = !profile;
  const [id, setId] = useState(profile?.id || '');
  const [label, setLabel] = useState(profile?.label || '');
  const [description, setDescription] = useState(profile?.description || '');
  const [icon, setIcon] = useState(profile?.icon || '');
  const [agentType, setAgentType] = useState(profile?.agent_type || 'claude');
  const [method, setMethod] = useState(profile?.method || 'remote');
  const [modelId, setModelId] = useState(profile?.model_id || '');
  const [reasoningEffort, setReasoningEffort] = useState((profile?.config?.reasoning_effort as string) || '');
  const [systemPrompt, setSystemPrompt] = useState(profile?.system_prompt || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = useCallback(async () => {
    if (!label.trim()) return;
    setSaving(true);
    setError(null);
    try {
      if (isNew) {
        const slug = id.trim() || `profile-${Date.now().toString(36)}`;
        const config = reasoningEffort ? { reasoning_effort: reasoningEffort } : null;
        const res = await pixsimClient.post<{ profile: UnifiedProfile }>('/dev/agent-profiles', {
          id: slug, label: label.trim(), description: description.trim() || null,
          icon: icon.trim() || null, system_prompt: systemPrompt.trim() || null,
          agent_type: agentType, method: method || null, model_id: modelId.trim() || null,
          config, audience: 'user',
        });
        onSave(res.profile);
      } else {
        const updates: Record<string, unknown> = {};
        if (label !== profile.label) updates.label = label.trim();
        if (description !== (profile.description || '')) updates.description = description.trim() || null;
        if (icon !== (profile.icon || '')) updates.icon = icon.trim() || null;
        if (agentType !== profile.agent_type) updates.agent_type = agentType;
        if (method !== (profile.method || 'remote')) updates.method = method || null;
        if (modelId !== (profile.model_id || '')) updates.model_id = modelId.trim() || null;
        const prevEffort = (profile.config?.reasoning_effort as string) || '';
        if (reasoningEffort !== prevEffort) {
          updates.config = { ...(profile.config || {}), reasoning_effort: reasoningEffort || null };
        }
        if (systemPrompt !== (profile.system_prompt || '')) updates.system_prompt = systemPrompt.trim() || null;
        if (Object.keys(updates).length > 0) {
          const res = await pixsimClient.patch<{ profile: UnifiedProfile }>(`/dev/agent-profiles/${profile.id}`, updates);
          onSave(res.profile);
        } else {
          onCancel();
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [isNew, id, label, description, icon, agentType, method, modelId, reasoningEffort, systemPrompt, profile, onSave, onCancel]);

  return (
    <div className="p-2 space-y-2">
      <div className="text-[11px] font-medium text-th-secondary">
        {isNew ? 'New Profile' : `Edit: ${profile.label}`}
      </div>

      {isNew && (
        <input value={id} onChange={(e) => setId(e.target.value)} placeholder="ID (slug, optional)"
          className="w-full px-2 py-1 text-[11px] rounded border border-th bg-surface-elevated focus:outline-none focus:ring-1 focus:ring-accent" />
      )}

      <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Name *"
        className="w-full px-2 py-1 text-[11px] rounded border border-th bg-surface-elevated focus:outline-none focus:ring-1 focus:ring-accent" />

      <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description"
        className="w-full px-2 py-1 text-[11px] rounded border border-th bg-surface-elevated focus:outline-none focus:ring-1 focus:ring-accent" />

      <input value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="Icon (e.g. sparkles, code, cpu)"
        className="w-full px-2 py-1 text-[11px] rounded border border-th bg-surface-elevated focus:outline-none focus:ring-1 focus:ring-accent" />

      {/* Engine + Method + Model */}
      <div className="flex gap-1.5">
        <select value={agentType} onChange={(e) => setAgentType(e.target.value)}
          className="flex-1 px-2 py-1 text-[11px] rounded border border-th bg-surface-elevated focus:outline-none focus:ring-1 focus:ring-accent">
          <option value="claude">Claude</option>
          <option value="codex">Codex</option>
          <option value="custom">Custom</option>
        </select>
        <select value={method} onChange={(e) => setMethod(e.target.value)}
          className="flex-1 px-2 py-1 text-[11px] rounded border border-th bg-surface-elevated focus:outline-none focus:ring-1 focus:ring-accent">
          <option value="remote">CMD (bridge)</option>
          <option value="api">API (direct)</option>
        </select>
      </div>

      <ProfileModelSelect
        value={modelId}
        onChange={setModelId}
        agentType={agentType}
        className="w-full px-2 py-1 text-[11px] rounded border border-th bg-surface-elevated focus:outline-none focus:ring-1 focus:ring-accent"
      />

      <select value={reasoningEffort} onChange={(e) => setReasoningEffort(e.target.value)}
        className="w-full px-2 py-1 text-[11px] rounded border border-th bg-surface-elevated focus:outline-none focus:ring-1 focus:ring-accent">
        <option value="">Effort (default)</option>
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High</option>
        {agentType === 'claude' && <option value="max">Max</option>}
        {agentType === 'codex' && <option value="xhigh">Extra High</option>}
      </select>

      <textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} placeholder="Persona / system prompt"
        rows={3}
        className="w-full px-2 py-1 text-[11px] rounded border border-th bg-surface-elevated resize-none focus:outline-none focus:ring-1 focus:ring-accent" />

      {error && <div className="text-[10px] text-signal-error">{error}</div>}

      <div className="flex gap-1.5 justify-end">
        <button onClick={onCancel} className="px-2 py-1 text-[10px] text-th-secondary hover:text-th">
          Cancel
        </button>
        <Button size="sm" onClick={handleSave} disabled={saving || !label.trim()}>
          {saving ? '...' : isNew ? 'Create' : 'Save'}
        </Button>
      </div>
    </div>
  );
}

// =============================================================================
// Resume Session Picker (sidebar button)
// =============================================================================

const RESUME_SESSION_PAGE_SIZE = 100;
const RESUME_SESSION_MAX_LIMIT = 100;

export function ResumeSessionPicker({ onResume, profileId, profileLabels }: {
  onResume: ResumeHandler;
  profileId?: string | null;
  profileLabels?: ReadonlyMap<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<ChatSessionEntry[]>([]);
  const [limit, setLimit] = useState<number>(RESUME_SESSION_PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('');
  const [showArchived, setShowArchived] = useState(false);
  const [profileOnly, setProfileOnly] = useState(false);
  // "Recent Chats" mode — show only sessions with no open ChatTab. Backed by
  // GET /chat-tabs/orphan-sessions. Plan `chat-tab-server-persistence`
  // checkpoint E.
  const [orphansOnly, setOrphansOnly] = useState(false);
  const [pasteId, setPasteId] = useState('');
  const [pasteBusy, setPasteBusy] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const handleClose = useCallback(() => setOpen(false), []);
  // Bump to trigger re-fetch after archive/restore
  const [fetchKey, setFetchKey] = useState(0);

  useEffect(() => {
    if (!open) {
      setLimit(RESUME_SESSION_PAGE_SIZE);
      setLoading(false);
      setActionError(null);
      return;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setActionError(null);

    if (orphansOnly) {
      // Recent-chats mode: orphan endpoint already filters by user_id and
      // excludes archived; engine filter applies client-side below.
      listOrphanSessions(limit)
        .then((rows) => {
          if (cancelled) return;
          // Map camelCase OrphanSession → snake_case ChatSessionEntry shape so
          // the existing list renderer doesn't need a separate code path.
          const mapped: ChatSessionEntry[] = rows.map((r) => ({
            id: r.id,
            engine: r.engine,
            profile_id: r.profileId,
            scope_key: r.scopeKey,
            last_plan_id: r.lastPlanId,
            label: r.label,
            message_count: r.messageCount,
            source: r.source,
            last_used_at: r.lastUsedAt,
          }));
          setSessions(mapped);
        })
        .catch(() => { if (!cancelled) setSessions([]); })
        .finally(() => { if (!cancelled) setLoading(false); });
    } else {
      const params: Record<string, unknown> = { limit, include_empty: false };
      if (filter) params.engine = filter;
      if (showArchived) params.status = 'archived';
      pixsimClient
        .get<{ sessions: ChatSessionEntry[] }>('/meta/agents/chat-sessions', { params })
        .then((r) => { if (!cancelled) setSessions(r.sessions || []); })
        .catch(() => { if (!cancelled) setSessions([]); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }
    return () => { cancelled = true; };
  }, [open, limit, filter, showArchived, fetchKey, orphansOnly]);

  const filtered = useMemo(() => {
    let list = sessions;
    if (profileOnly && profileId) list = list.filter((s) => s.profile_id === profileId);
    return list;
  }, [sessions, profileOnly, profileId]);
  const canLoadMore = !loading && sessions.length >= limit && limit < RESUME_SESSION_MAX_LIMIT;

  const archiveSession = useCallback(async (session: ChatSessionEntry) => {
    if (actionId) return;
    const label = session.label.trim() || `${session.engine} session`;
    if (!confirm(`Archive session "${label}"?`)) return;
    setActionError(null);
    setActionId(session.id);
    try {
      await pixsimClient.delete(`/meta/agents/chat-sessions/${session.id}`);
      setSessions((prev) => prev.filter((s) => s.id !== session.id));
    } catch {
      setActionError(`Failed to archive "${label}".`);
    } finally {
      setActionId(null);
    }
  }, [actionId]);

  const resumeById = useCallback(async () => {
    const raw = pasteId.trim();
    if (!raw || pasteBusy) return;
    setPasteBusy(true);
    setActionError(null);
    try {
      const data = await pixsimClient.get<{
        id: string;
        engine: string;
        label: string;
        profile_id: string | null;
        last_plan_id?: string | null;
      }>(`/meta/agents/chat-sessions/${encodeURIComponent(raw)}`);
      onResume(
        data.id,
        data.engine,
        data.label,
        data.profile_id ?? null,
        data.last_plan_id ?? null,
      );
      setPasteId('');
      setOpen(false);
    } catch {
      setActionError(`Session "${raw.slice(0, 16)}${raw.length > 16 ? '…' : ''}" not found.`);
    } finally {
      setPasteBusy(false);
    }
  }, [pasteId, pasteBusy, onResume]);

  const restoreSession = useCallback(async (session: ChatSessionEntry) => {
    if (actionId) return;
    setActionError(null);
    setActionId(session.id);
    try {
      await pixsimClient.post(`/meta/agents/chat-sessions/${session.id}/restore`);
      setSessions((prev) => prev.filter((s) => s.id !== session.id));
      setFetchKey((k) => k + 1);
    } catch {
      setActionError('Failed to restore session.');
    } finally {
      setActionId(null);
    }
  }, [actionId]);

  return (
    <>
      <button
        ref={ref}
        onClick={() => setOpen(!open)}
        className="tap-target text-th-muted hover:text-th"
        title="Resume session"
      >
        <Icon name="history" size={12} />
      </button>

      <Popover
        anchor={ref.current}
        placement="top"
        align="start"
        offset={6}
        open={open}
        onClose={handleClose}
        triggerRef={ref}
        className="w-72 rounded-lg border border-th bg-surface shadow-lg"
      >
        <div className="h-[350px] overflow-y-auto">
          {/* Engine filter tabs */}
          <div className="flex items-center gap-1 px-2 py-1.5 border-b border-th-secondary">
            <button onClick={() => setFilter('')} className={`px-1.5 py-0.5 text-[9px] rounded ${!filter ? 'bg-accent text-accent-text' : 'text-th-secondary hover:bg-surface-secondary'}`}>All</button>
            {[...AGENT_COMMANDS, { id: 'api' as const, label: 'API', icon: 'zap' as IconName }].map((e) => (
              <button key={e.id} onClick={() => setFilter(e.id)} className={`px-1.5 py-0.5 text-[9px] rounded ${filter === e.id ? 'bg-accent text-accent-text' : 'text-th-secondary hover:bg-surface-secondary'}`}>{e.label}</button>
            ))}
            <div className="ml-auto flex items-center gap-1">
              {profileId && (
                <button
                  onClick={() => setProfileOnly(!profileOnly)}
                  className={`px-1.5 py-0.5 text-[9px] rounded ${profileOnly ? 'bg-accent text-accent-text' : 'text-th-secondary hover:bg-surface-secondary'}`}
                  title="Filter by current profile"
                >
                  <Icon name="user" size={9} />
                </button>
              )}
              <button
                onClick={() => {
                  // Mutually-exclusive with archived view (orphan endpoint
                  // already excludes archived). Enter "Recent Chats" mode.
                  setOrphansOnly((v) => !v);
                  if (!orphansOnly) setShowArchived(false);
                }}
                className={`px-1.5 py-0.5 text-[9px] rounded ${orphansOnly ? 'bg-signal-info/20 text-signal-info' : 'text-th-secondary hover:bg-surface-secondary'}`}
                title={orphansOnly ? 'Showing recent chats with no open tab — click for all' : 'Recent chats — sessions without an open tab'}
              >
                <Icon name="messageSquare" size={9} />
              </button>
              <button
                onClick={() => {
                  setShowArchived((v) => !v);
                  if (!showArchived) setOrphansOnly(false);
                }}
                className={`px-1.5 py-0.5 text-[9px] rounded ${showArchived ? 'bg-signal-warning/20 text-signal-warning' : 'text-th-secondary hover:bg-surface-secondary'}`}
                title={showArchived ? 'Showing archived — click for active' : 'Show archived sessions'}
              >
                <Icon name="archive" size={9} />
              </button>
            </div>
          </div>

          {/* Paste session id to resume (pixsim7 id or agent CLI resume hash) */}
          <div className="flex items-center gap-1 px-2 py-1.5 border-b border-th-secondary">
            <input
              type="text"
              value={pasteId}
              onChange={(e) => setPasteId(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void resumeById(); } }}
              placeholder="Paste session id to resume…"
              disabled={pasteBusy}
              className="flex-1 min-w-0 px-2 py-1 text-[10px] rounded border border-th bg-surface text-th placeholder:text-th-muted focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <button
              type="button"
              onClick={() => void resumeById()}
              disabled={!pasteId.trim() || pasteBusy}
              className="shrink-0 px-2 py-1 text-[10px] rounded bg-accent text-accent-text hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {pasteBusy ? '…' : 'Resume'}
            </button>
          </div>

          {loading && sessions.length === 0 && (
            <div className="p-3 text-center text-[11px] text-th-secondary">Loading sessions...</div>
          )}
          {actionError && (
            <div className="px-3 py-1.5 text-[10px] text-signal-error border-b border-th-secondary">{actionError}</div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="p-3 text-center text-[11px] text-th-secondary">No sessions found</div>
          )}

          {filtered.map((s) => {
            const sessionProfileLabel = s.profile_id && profileLabels?.get(s.profile_id)
              ? profileLabels.get(s.profile_id)!
              : null;
            // Agent-set identity (mirrors SessionItem): a valid @lib/icons name
            // wins as the leading glyph; subtitle replaces the profile label on
            // the secondary line. Garbage/unset falls back to engine + profile.
            const agentIcon = s.icon?.trim();
            const validAgentIcon = agentIcon && getIcon(agentIcon) ? (agentIcon as IconName) : null;
            const sessionSubtitle = s.subtitle?.trim() || null;
            const engineColor = getEngineBrand(s.engine).textColor;
            const scopeKeyChip = s.scope_key
              && !(s.last_plan_id && s.scope_key === `plan:${s.last_plan_id}`)
              && !(s.last_contract_id && s.scope_key === `contract:${s.last_contract_id}`)
              ? s.scope_key
              : null;
            return (
              <div
                key={s.id}
                className="group w-full flex items-center gap-1 px-1 border-b border-th-secondary last:border-0 hover:bg-surface-secondary"
              >
                <button
                  onClick={() => {
                    if (showArchived) pixsimClient.post(`/meta/agents/chat-sessions/${s.id}/restore`).catch(() => {});
                    onResume(s.id, s.engine, s.label, s.profile_id ?? null, s.last_plan_id, s.icon ?? null, s.subtitle ?? null);
                    setOpen(false);
                  }}
                  className="flex-1 min-w-0 flex items-center gap-2 px-2 py-2 text-left"
                >
                  <EngineProfileIcon
                    engine={s.engine}
                    icon={validAgentIcon ?? AGENT_COMMANDS.find((c) => c.id === s.engine)?.icon ?? iconForEngine(s.engine)}
                    size={11}
                  />
                  <div className="flex-1 min-w-0">
                    <div className={`text-[11px] truncate flex items-center gap-1 ${engineColor}`}>
                      {(s.source === 'mcp' || s.source === 'mcp-auto') && (
                        <span
                          className="shrink-0 px-1 rounded bg-signal-warning/15 text-signal-warning text-[8px] font-semibold tracking-wide"
                          title="Started from CLI/MCP — chat will show work summaries as context"
                        >
                          CLI
                        </span>
                      )}
                      <span className="truncate">{s.label}</span>
                    </div>
                    <div className="text-[9px] text-th-muted">
                      {(sessionSubtitle ?? sessionProfileLabel) ? `${sessionSubtitle ?? sessionProfileLabel} · ` : ''}
                      {s.message_count} msgs · {new Date(s.last_used_at).toLocaleDateString()} {new Date(s.last_used_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    {(s.last_contract_id || s.last_plan_id || scopeKeyChip) && (
                      <div className="mt-0.5 flex flex-wrap items-center gap-1">
                        {s.last_contract_id && (
                          <Badge color="blue" className="text-[8px]">{s.last_contract_id}</Badge>
                        )}
                        {s.last_plan_id && (
                          <Badge color="green" className="text-[8px]">plan:{s.last_plan_id}</Badge>
                        )}
                        {scopeKeyChip && (
                          <Badge color="gray" className="text-[8px]">{scopeKeyChip}</Badge>
                        )}
                      </div>
                    )}
                  </div>
                  <span className={`text-[8px] uppercase shrink-0 opacity-0 group-hover:opacity-60 transition-opacity ${engineColor}`}>{s.engine}</span>
                </button>
                {showArchived ? (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void restoreSession(s);
                    }}
                    disabled={actionId === s.id}
                    className="shrink-0 w-6 h-6 rounded text-th-muted hover:text-signal-success hover:bg-surface-secondary disabled:opacity-50 disabled:cursor-not-allowed opacity-0 group-hover:opacity-100 transition"
                    title="Restore session"
                  >
                    <Icon name="rotateCcw" size={10} />
                  </button>
                ) : (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void archiveSession(s);
                    }}
                    disabled={actionId === s.id}
                    className="shrink-0 w-6 h-6 rounded text-th-muted hover:text-signal-error hover:bg-surface-secondary disabled:opacity-50 disabled:cursor-not-allowed opacity-0 group-hover:opacity-100 transition"
                    title="Archive session"
                  >
                    <Icon name="trash2" size={10} />
                  </button>
                )}
              </div>
            );
          })}

          {canLoadMore && (
            <button
              onClick={() => setLimit((prev) => Math.min(prev + RESUME_SESSION_PAGE_SIZE, RESUME_SESSION_MAX_LIMIT))}
              className="w-full px-3 py-2 text-[10px] font-medium text-th-secondary hover:bg-surface-secondary border-t border-th-secondary"
            >
              Load more sessions
            </button>
          )}
          {loading && sessions.length > 0 && (
            <div className="px-3 py-2 text-center text-[10px] text-th-secondary border-t border-th-secondary">
              Loading...
            </div>
          )}
        </div>
      </Popover>
    </>
  );
}

// =============================================================================
// Inline Resume Picker (empty chat state)
// =============================================================================

export function InlineResumePicker({ profileId, profileLabels, onResume }: {
  profileId: string | null;
  profileLabels?: ReadonlyMap<string, string>;
  onResume: ResumeHandler;
}) {
  const [sessions, setSessions] = useState<ChatSessionEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => {
    if (fetched) return;
    setLoading(true);
    const params: Record<string, unknown> = { limit: 30, include_empty: false };
    if (profileId) params.profile_id = profileId;
    pixsimClient.get<{ sessions: ChatSessionEntry[] }>('/meta/agents/chat-sessions', { params })
      .then((r) => setSessions((r.sessions || []).filter((s) => s.message_count > 0)))
      .catch(() => {})
      .finally(() => { setLoading(false); setFetched(true); });
  }, [profileId, fetched]);

  useEffect(() => { load(); }, [load]);

  if (!fetched || sessions.length === 0) return null;

  return (
    <div className="flex justify-center">
      <div className="relative">
        <button
          onClick={() => setOpen(!open)}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1 text-[10px] rounded-full border border-th bg-surface-elevated text-th-secondary hover:bg-surface-secondary cursor-pointer transition-colors"
        >
          <Icon name="rotateCcw" size={10} />
          Resume a session ({sessions.length})
          <Icon name="chevronDown" size={10} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 w-72 max-h-[200px] overflow-y-auto rounded-lg border border-th bg-surface shadow-lg z-20">
            {sessions.map((s) => {
              const profileName = s.profile_id && profileLabels?.get(s.profile_id);
              const agentIcon = s.icon?.trim();
              const validAgentIcon = agentIcon && getIcon(agentIcon) ? (agentIcon as IconName) : null;
              const sessionSubtitle = s.subtitle?.trim() || null;
              const engineColor = getEngineBrand(s.engine).textColor;
              return (
                <button
                  key={s.id}
                  onClick={() => { onResume(s.id, s.engine, s.label, s.profile_id ?? null, s.last_plan_id, s.icon ?? null, s.subtitle ?? null); setOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-surface-secondary transition-colors"
                >
                  <EngineProfileIcon
                    engine={s.engine}
                    icon={validAgentIcon ?? (s.engine === 'codex' ? 'terminal' : s.engine === 'api' ? 'zap' : 'messageSquare')}
                    size={11}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-medium text-th truncate">{s.label}</div>
                    <div className="flex items-center gap-1 text-[9px] text-th-muted">
                      {sessionSubtitle
                        ? <span className="truncate">{sessionSubtitle}</span>
                        : profileName && <span className={engineColor}>{profileName}</span>}
                      {s.engine !== 'claude' && <span>{s.engine}</span>}
                      <span>{s.message_count} msgs</span>
                      {s.last_plan_id && <span className="text-signal-success">plan:{s.last_plan_id}</span>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Action Picker
// =============================================================================

interface ContractEndpoint { id: string; method: string; path: string; summary: string }
interface ContractEntry { id: string; name: string; summary: string; provides: string[]; sub_endpoints: ContractEndpoint[] }
interface ContractsResponse { contracts: ContractEntry[] }
interface ActionItem { label: string; prompt: string; icon: IconName; contractId: string }
interface ActionGroup { id: string; label: string; icon: IconName; actions: ActionItem[] }

const CONTRACT_ICONS: Record<string, IconName> = {
  'user.assistant': 'messageSquare',
  'prompts.authoring': 'edit',
  'prompts.analysis': 'search',
  'blocks.discovery': 'layers',
  'plans.management': 'clipboard',
};

function buildActionGroups(contracts: ContractEntry[]): ActionGroup[] {
  return contracts
    .filter((c) => c.sub_endpoints.length > 0)
    .map((c) => ({
      id: c.id,
      label: c.name.replace(/ Contract$/, '').replace(/^User /, ''),
      icon: (CONTRACT_ICONS[c.id] || 'compass') as IconName,
      actions: c.sub_endpoints
        .filter((ep) => ep.path.startsWith('/'))
        .map((ep) => ({
          label: ep.summary.replace(/\.$/, ''),
          prompt: ep.method === 'GET'
            ? `${ep.summary.replace(/\.$/, '').toLowerCase()}. Show me the results.`
            : `I'd like to ${ep.summary.replace(/\.$/, '').toLowerCase()}. Help me set it up.`,
          icon: (ep.method === 'GET' ? 'search' : 'sparkles') as IconName,
          contractId: c.id,
        })),
    }))
    .filter((g) => g.actions.length > 0);
}

export function ActionPicker({ open, onClose, onSelect, disabled }: {
  open: boolean; onClose: () => void; onSelect: (prompt: string) => void; disabled: boolean;
}) {
  const [groups, setGroups] = useState<ActionGroup[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || loaded) return;
    pixsimClient
      .get<ContractsResponse>('/meta/contracts', { params: { audience: 'user' } })
      .then((d) => { setGroups(buildActionGroups(d.contracts || [])); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, [open, loaded]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div ref={ref} className="absolute bottom-full left-0 right-0 mb-1 mx-2 max-h-[300px] overflow-y-auto rounded-lg border border-th bg-surface shadow-lg z-10">
      {groups.length === 0 && (
        <div className="p-3 text-center text-xs text-th-secondary">{loaded ? 'No actions available' : 'Loading...'}</div>
      )}
      {groups.map((g) => {
        const isOpen = expanded === g.id;
        return (
          <div key={g.id}>
            <button onClick={() => setExpanded(isOpen ? null : g.id)} className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-surface-secondary transition-colors">
              <Icon name={g.icon} size={13} className="text-th-muted shrink-0" />
              <span className="font-medium text-th-secondary">{g.label}</span>
              <Badge color="gray" className="text-[9px] ml-auto">{g.actions.length}</Badge>
              <Icon name="chevronRight" size={10} className={`text-th-muted transition-transform ${isOpen ? 'rotate-90' : ''}`} />
            </button>
            {isOpen && (
              <div className="pl-3">
                {g.actions.map((a, i) => (
                  <button key={`${a.contractId}-${i}`} onClick={() => { onSelect(a.prompt); onClose(); }} disabled={disabled}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-th-secondary hover:bg-surface-secondary disabled:opacity-40 transition-colors">
                    <Icon name={a.icon} size={11} className="shrink-0 text-th-muted" />
                    <span className="truncate text-left">{a.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// =============================================================================
// Work Summary Badge — shows summary count, hover to expand
// =============================================================================

interface WorkSummaryEntry {
  detail: string;
  timestamp: string;
  plan_id?: string | null;
  metadata?: {
    commit?: string;
    next?: string;
    decisions?: string[];
    blockers?: string[];
    evidence?: string[];
  } | null;
}

/**
 * Salvage historical log_work entries where an upstream tool-call serializer
 * collapsed `<next>…</next><decisions>[…]</decisions><evidence>[…]</evidence>`
 * siblings into a single `metadata.next` string. The server-side handler now
 * intercepts new calls; this client-side mirror cleans up rows already stored.
 *
 * Only lifts a sibling when its dict key is missing or empty — never clobbers
 * an explicit value.
 */
const LEAKED_TAG_TAIL_RE =
  /<\/(?:next|summary)>\s*((?:<(?:decisions|evidence|blockers)>[\s\S]*?<\/(?:decisions|evidence|blockers)>\s*)+)\s*(?:<\/invoke>)?\s*$/;
const LEAKED_TAG_INNER_RE =
  /<(decisions|evidence|blockers)>([\s\S]*?)<\/\1>/g;

function salvageWorkSummary(entry: WorkSummaryEntry): WorkSummaryEntry {
  const next = entry.metadata?.next;
  if (typeof next !== 'string' || !next.includes('</next>')) return entry;
  const tail = LEAKED_TAG_TAIL_RE.exec(next);
  if (!tail) return entry;
  const cleanedNext = next.slice(0, tail.index).trimEnd();
  const md = { ...(entry.metadata ?? {}) };
  md.next = cleanedNext || undefined;
  LEAKED_TAG_INNER_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = LEAKED_TAG_INNER_RE.exec(tail[1]))) {
    const key = m[1] as 'decisions' | 'evidence' | 'blockers';
    try {
      const parsed = JSON.parse(m[2].trim());
      if (!Array.isArray(parsed) || !parsed.every((x) => typeof x === 'string')) continue;
      // Merge: keep existing (e.g. server-injected commit SHA) + salvaged, deduped.
      const existing = md[key] ?? [];
      const seen = new Set(existing);
      md[key] = [...existing, ...parsed.filter((x) => !seen.has(x) && (seen.add(x), true))];
    } catch { /* leave key as-is */ }
  }
  return { ...entry, metadata: md };
}

/** Color per summary: green = has commit, blue = plan-linked, amber = no commit, red outline = has blockers */
function summaryColor(s: WorkSummaryEntry): string {
  if (s.metadata?.blockers?.length) return 'text-signal-error';
  const hasCommit = s.metadata?.commit || (s.metadata?.evidence ?? []).some((e) => /^[0-9a-f]{7,40}$/i.test(e));
  if (hasCommit) return 'text-signal-success';
  if (s.plan_id) return 'text-signal-info';
  return 'text-signal-warning';
}

/**
 * Single retractable section inside the work-summary popover.
 *
 * - `defaultExpanded` decides the initial state — callers pass an auto-by-size
 *   heuristic (short text / few items = expanded, long = collapsed).
 * - The toggle uses `onMouseDown` preventDefault so the click doesn't steal
 *   focus and trigger a page scroll inside the portaled popover (see the
 *   overlay-button-focus convention used across other overlay popovers).
 */
function CollapsibleSection({
  label,
  count,
  className,
  defaultExpanded,
  divider,
  children,
}: {
  label: string;
  count?: number;
  className?: string;
  defaultExpanded: boolean;
  divider?: boolean;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <div className={`mt-1 ${divider ? 'pt-1.5 border-t border-th-secondary' : ''} text-[10px] ${className ?? ''}`}>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1 w-full text-left hover:opacity-80 cursor-pointer"
      >
        <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={10} />
        <span className="font-medium">{label}</span>
        {typeof count === 'number' && <span className="opacity-60">({count})</span>}
      </button>
      {expanded && <div className="mt-0.5 pl-3.5 leading-relaxed">{children}</div>}
    </div>
  );
}

// Heuristics — short content stays open on hover, long content stays retracted
// until the user clicks to expand. Numbers picked to keep most "normal" entries
// fully readable without scrolling but stop a 2KB next-block from blowing up
// the popover.
const AUTO_EXPAND_TEXT_CHARS = 220;
const AUTO_EXPAND_LIST_ITEMS = 3;

function WorkSummaryIcon({ summary: rawSummary }: { summary: WorkSummaryEntry }) {
  const { isExpanded, handlers } = useHoverExpand({ expandDelay: 120, collapseDelay: 300 });
  const summary = useMemo(() => salvageWorkSummary(rawSummary), [rawSummary]);
  // Split evidence into commit SHAs (rendered as a clickable chip in the
  // header row) and file paths (rendered as a separate collapsible section).
  const evidence = summary.metadata?.evidence ?? [];
  const commits = evidence.filter((e) => /^[0-9a-f]{7,40}$/i.test(e));
  const files = evidence.filter((e) => !/^[0-9a-f]{7,40}$/i.test(e));
  const sha = commits[0]?.slice(0, 9) || summary.metadata?.commit || null;
  const fullSha = commits[0] || summary.metadata?.commit || null;
  const time = new Date(summary.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const detail = summary.detail ?? '';
  const next = summary.metadata?.next ?? '';
  const decisions = summary.metadata?.decisions ?? [];
  const blockers = summary.metadata?.blockers ?? [];

  return (
    <div className="relative" {...handlers}>
      <div className={`${summaryColor(summary)} cursor-default`}>
        <Icon name="fileText" size={12} />
      </div>
      {isExpanded && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-80 max-h-[60vh] overflow-y-auto rounded-lg border border-th bg-surface shadow-xl z-30 p-2.5">
          {/* Compact header row — time, SHA, plan id. Always visible. */}
          <div className="flex items-center gap-1.5 text-[9px] text-th-muted flex-wrap">
            <span>{time}</span>
            {sha && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                className="font-mono text-signal-info hover:underline hover:opacity-80"
                onClick={() => { if (fullSha) navigator.clipboard.writeText(fullSha); }}
                title={`${fullSha}\nClick to copy`}
              >
                {sha}
              </button>
            )}
            {summary.plan_id && <span className="text-signal-info">{summary.plan_id}</span>}
          </div>

          {/* Summary (the `detail` field) — primary content; only auto-retracts
              when very long, since users almost always want to read it. */}
          {detail && (
            <CollapsibleSection
              label="Summary"
              defaultExpanded={detail.length <= AUTO_EXPAND_TEXT_CHARS * 2}
              divider
              className="text-th-secondary"
            >
              <div className="text-[11px]">{detail}</div>
            </CollapsibleSection>
          )}

          {next && (
            <CollapsibleSection
              label="Next"
              defaultExpanded={next.length <= AUTO_EXPAND_TEXT_CHARS}
              divider
              className="text-signal-warning"
            >
              {next}
            </CollapsibleSection>
          )}

          {decisions.length > 0 && (
            <CollapsibleSection
              label="Decisions"
              count={decisions.length}
              defaultExpanded={decisions.length <= AUTO_EXPAND_LIST_ITEMS}
              className="text-violet-500"
            >
              <ul className="list-disc pl-3 space-y-0.5">
                {decisions.map((d, i) => <li key={i}>{d}</li>)}
              </ul>
            </CollapsibleSection>
          )}

          {/* Blockers stay expanded by default regardless of count — they're
              the highest-signal item on the card. */}
          {blockers.length > 0 && (
            <CollapsibleSection
              label="Blocked"
              count={blockers.length}
              defaultExpanded
              className="text-signal-error"
            >
              <ul className="list-disc pl-3 space-y-0.5">
                {blockers.map((b, i) => <li key={i}>{b}</li>)}
              </ul>
            </CollapsibleSection>
          )}

          {files.length > 0 && (
            <CollapsibleSection
              label="Files"
              count={files.length}
              defaultExpanded={files.length <= AUTO_EXPAND_LIST_ITEMS}
              className="text-th-secondary"
            >
              <ul className="space-y-0.5 font-mono">
                {files.map((f, i) => <li key={i} className="truncate" title={f}>{f}</li>)}
              </ul>
            </CollapsibleSection>
          )}
        </div>
      )}
    </div>
  );
}

export function WorkSummaryBadge({ sessionId, messageCount, sending }: { sessionId: string | null; messageCount?: number; sending?: boolean }) {
  const [summaries, setSummaries] = useState<WorkSummaryEntry[]>([]);
  const prevSendingRef = useRef(sending);

  // Re-fetch when session changes or new messages arrive
  useEffect(() => {
    if (!sessionId) { setSummaries([]); return; }
    let cancelled = false;
    pixsimClient.get<{ entries: WorkSummaryEntry[] }>('/meta/agents/history', {
      params: { session_id: sessionId, action: 'work_summary', limit: 20 },
    }).then((res) => {
      if (!cancelled) setSummaries(res.entries ?? []);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [sessionId, messageCount]);

  // Also re-fetch when agent stops working (sending true→false) — log_work is typically called then
  useEffect(() => {
    const wasSending = prevSendingRef.current;
    prevSendingRef.current = sending;
    if (wasSending && !sending && sessionId) {
      // Small delay — log_work may run slightly after the result is delivered
      const timer = setTimeout(() => {
        pixsimClient.get<{ entries: WorkSummaryEntry[] }>('/meta/agents/history', {
          params: { session_id: sessionId, action: 'work_summary', limit: 20 },
        }).then((res) => setSummaries(res.entries ?? [])).catch(() => {});
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [sending, sessionId]);

  if (summaries.length === 0) return null;

  return (
    <div className="shrink-0 h-7 flex items-center gap-0.5 px-0.5">
      {summaries.map((s, i) => (
        <WorkSummaryIcon key={i} summary={s} />
      ))}
    </div>
  );
}

// =============================================================================
// Bridge Settings Popover — schema-driven from launcher service settings
// =============================================================================

interface ToolOptionSchema {
  name: string;
  short_name?: string;
  description?: string;
  method?: string;
  write?: boolean;
}

interface SettingFieldSchema {
  key: string;
  type: string;
  label: string;
  description?: string;
  default?: unknown;
  options?: string[];
  option_groups?: { group: string; label: string; tools: ToolOptionSchema[] }[];
}

interface BridgeSettingsData {
  service_key: string;
  schema: SettingFieldSchema[];
  values: Record<string, unknown>;
}

export function BridgeSettingsPopover() {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<BridgeSettingsData | null>(null);

  // Fetch schema + values when popover opens
  useEffect(() => {
    if (!open) return;
    pixsimClient.get<BridgeSettingsData>('/meta/agents/bridge/settings')
      .then(setData)
      .catch(() => {});
  }, [open]);

  const updateField = (key: string, value: unknown) => {
    // Optimistic update
    setData((prev) => prev ? { ...prev, values: { ...prev.values, [key]: value } } : prev);
    pixsimClient.patch<BridgeSettingsData>('/meta/agents/bridge/settings', { values: { [key]: value } })
      .then(setData)
      .catch(() => {
        // Revert on error — re-fetch
        pixsimClient.get<BridgeSettingsData>('/meta/agents/bridge/settings').then(setData).catch(() => {});
      });
  };

  // Only show fields relevant to the chat UI (skip hook_port, log_level, etc.)
  const visibleFields = data?.schema.filter((f) =>
    ['multi_select', 'boolean'].includes(f.type) || f.key === 'pool_size' || f.key === 'timeout'
  ) ?? [];

  return (
    <>
      <button
        ref={ref}
        onClick={() => setOpen(!open)}
        className="tap-target text-th-muted hover:text-th"
        title="Bridge settings"
      >
        <Icon name="settings" size={12} />
      </button>

      <Popover
        anchor={ref.current}
        placement="top"
        align="start"
        offset={6}
        open={open}
        onClose={() => setOpen(false)}
        triggerRef={ref}
        className="w-72 rounded-lg border border-th bg-surface shadow-lg"
      >
        <div className="p-3 space-y-3">
          <div className="text-[10px] font-semibold text-th-secondary uppercase tracking-wide">
            Bridge Settings
          </div>
          <div className="text-[9px] text-th-muted">
            Changes take effect on next restart.
          </div>

          {!data && (
            <div className="text-[10px] text-th-muted py-2 text-center">Loading...</div>
          )}

          {visibleFields.map((field) => (
            <BridgeSettingField
              key={field.key}
              field={field}
              value={data!.values[field.key]}
              onChange={(v) => updateField(field.key, v)}
            />
          ))}

          {/* Agent capabilities — discoverability pointer. The agent acts on
              your behalf and inherits your devtools.* grants; the live state +
              management live elsewhere, so just point there rather than
              duplicate it here. */}
          <div className="pt-2 border-t border-th/60 space-y-1">
            <div className="text-[10px] font-semibold text-th-secondary uppercase tracking-wide">
              Agent capabilities
            </div>
            <div className="text-[9px] text-th-muted leading-relaxed">
              Agents act on your behalf and inherit your capabilities (e.g. Diagnostics access).
              See them under <span className="text-th-secondary">Community → Account → Capabilities</span>;
              admins grant them in <span className="text-th-secondary">Settings → Access</span>.
            </div>
          </div>
        </div>
      </Popover>
    </>
  );
}

/**
 * Quick-mute popover for the per-tab chat / question nudges
 * (notification-system Phase 4b s2). The full per-category matrix lives in
 * Settings → Notifications; this is the in-context shortcut next to the
 * nudge itself so users don't have to dig into global settings to silence
 * an orange question pip or blue chat pip.
 *
 * Writes through the per-category-safe `PATCH /notifications/categories/{id}`
 * endpoint (Phase 3 s1) — NOT the generic full-dict preference path — so
 * toggling one category never disturbs the user's other notification prefs.
 */
interface NudgeMuteCategory {
  id: string;
  label: string;
  description: string;
  currentGranularity: string;
}

const NUDGE_MUTE_CATEGORY_IDS: readonly string[] = ['agent_question', 'chat'];

export function NotificationMutePopover() {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [cats, setCats] = useState<NudgeMuteCategory[] | null>(null);

  const reload = useCallback(() => {
    pixsimClient
      .get<{ categories: NudgeMuteCategory[] }>('/notifications/categories')
      .then((d) =>
        setCats(
          d.categories.filter((c) =>
            NUDGE_MUTE_CATEGORY_IDS.includes(c.id),
          ),
        ),
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (open) reload();
  }, [open, reload]);

  const anyMuted = cats?.some((c) => c.currentGranularity === 'off') ?? false;

  const setGranularity = (id: string, granularity: string) => {
    // Optimistic — the pip/badge should feel instant.
    setCats((prev) =>
      prev
        ? prev.map((c) =>
            c.id === id ? { ...c, currentGranularity: granularity } : c,
          )
        : prev,
    );
    pixsimClient
      .patch<NudgeMuteCategory>(`/notifications/categories/${id}`, {
        granularity,
      })
      .then((updated) => {
        setCats((prev) =>
          prev
            ? prev.map((c) =>
                c.id === updated.id
                  ? { ...c, currentGranularity: updated.currentGranularity }
                  : c,
              )
            : prev,
        );
        // Muting flows through the scoped unread query — re-poll so the
        // orange/blue surfaces reflect it without waiting for the 15s tick.
        void refreshChatUnread();
      })
      .catch(reload); // revert to server truth on failure
  };

  return (
    <>
      <button
        ref={ref}
        onClick={() => setOpen(!open)}
        className={
          anyMuted
            ? 'tap-target text-signal-warning hover:opacity-80'
            : 'tap-target text-th-muted hover:text-th'
        }
        title={anyMuted ? 'Nudges muted' : 'Mute chat / question nudges'}
      >
        <Icon name="bell" size={12} />
      </button>

      <Popover
        anchor={ref.current}
        placement="top"
        align="start"
        offset={6}
        open={open}
        onClose={() => setOpen(false)}
        triggerRef={ref}
        className="w-64 rounded-lg border border-th bg-surface shadow-lg"
      >
        <div className="p-3 space-y-3">
          <div className="text-[10px] font-semibold text-th-secondary uppercase tracking-wide">
            Nudge mute
          </div>
          <div className="text-[9px] text-th-muted">
            Silence these per-tab nudges. Full controls in Settings →
            Notifications.
          </div>

          {!cats && (
            <div className="text-[10px] text-th-muted py-2 text-center">
              Loading...
            </div>
          )}

          {cats?.map((c) => {
            const muted = c.currentGranularity === 'off';
            return (
              <div
                key={c.id}
                className="flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="text-[10px] font-medium text-th-secondary">
                    {c.label}
                  </div>
                  <div className="text-[9px] text-th-muted truncate">
                    {c.description}
                  </div>
                </div>
                <button
                  onClick={() =>
                    setGranularity(c.id, muted ? 'all' : 'off')
                  }
                  className={`shrink-0 px-2 py-0.5 text-[9px] rounded border transition-colors ${
                    muted
                      ? 'bg-signal-warning/15 border-signal-warning/40 text-signal-warning'
                      : 'border-th text-th-secondary hover:border-th-secondary'
                  }`}
                  title={muted ? 'Muted — click to unmute' : 'On — click to mute'}
                >
                  {muted ? 'Muted' : 'On'}
                </button>
              </div>
            );
          })}
        </div>
      </Popover>
    </>
  );
}

function BridgeSettingField({ field, value, onChange }: {
  field: SettingFieldSchema;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] font-medium text-th-secondary">{field.label}</div>
      {field.description && (
        <div className="text-[9px] text-th-muted leading-relaxed">{field.description}</div>
      )}
      {field.type === 'multi_select' && (() => {
        const selected = Array.isArray(value) ? (value as string[]) : [];
        const toggle = (opt: string) =>
          onChange(selected.includes(opt) ? selected.filter((v) => v !== opt) : [...selected, opt]);
        // type=button + preventDefault keeps focus out of the portaled popover
        // (overlay-button-focus-scroll rule).
        const Chip = (opt: string, label: string, method?: string, write?: boolean, desc?: string) => {
          const active = selected.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => toggle(opt)}
              title={desc || opt}
              className={`px-1.5 py-0.5 text-[9px] rounded border transition-colors inline-flex items-center gap-1 ${
                active
                  ? 'bg-accent/10 border-accent/30 text-accent'
                  : 'border-th text-th-muted hover:border-th-secondary'
              }`}
            >
              <span className="truncate max-w-[120px]">{label}</span>
              {method && (
                <span className={`text-[8px] font-mono px-0.5 rounded ${
                  write ? 'bg-amber-500/20 text-amber-500' : 'bg-th-muted/10 text-th-muted'
                }`}>
                  {method}
                </span>
              )}
            </button>
          );
        };
        if (field.option_groups && field.option_groups.length > 0) {
          return (
            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
              {field.option_groups.map((g) => (
                <div key={g.group} className="space-y-1">
                  <div className="text-[9px] font-semibold text-th-secondary">{g.label}</div>
                  <div className="flex flex-wrap gap-1">
                    {g.tools.map((t) => Chip(t.name, t.short_name ?? t.name, t.method, t.write, t.description))}
                  </div>
                </div>
              ))}
            </div>
          );
        }
        return (
          <div className="flex flex-wrap gap-1">
            {(field.options ?? []).map((opt) => Chip(opt, opt))}
          </div>
        );
      })()}
      {field.type === 'number' && (
        <input
          type="number"
          value={typeof value === 'number' ? value : 0}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10);
            if (!isNaN(n)) onChange(n);
          }}
          className="w-20 px-2 py-0.5 text-[10px] rounded border border-th bg-surface text-th-secondary focus:outline-none focus:ring-1 focus:ring-accent"
        />
      )}
      {field.type === 'boolean' && (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange(e.target.checked)}
            className="rounded text-accent focus:ring-accent h-3.5 w-3.5"
          />
          <span className="text-[10px] text-th-secondary">{value ? 'Enabled' : 'Disabled'}</span>
        </label>
      )}
    </div>
  );
}

// =============================================================================
// Model fetching hook + selectors
// =============================================================================

interface AiModelEntry { id: string; label: string; provider_id: string; is_default?: boolean; hidden?: boolean }

/** Bridge model shape returned by /meta/agents/bridge/models */
interface BridgeModel { id: string; label: string; model: string; is_default?: boolean; hidden?: boolean }

/** Derive the engine-like key used for model fetching from an agent_type string. */
export function engineForAgentType(agentType: string): AgentEngine {
  if (agentType === 'codex') return 'codex';
  return 'claude';
}

const CLAUDE_MODELS: AiModelEntry[] = [
  { id: 'sonnet', label: 'Sonnet', provider_id: 'anthropic' },
  { id: 'opus', label: 'Opus', provider_id: 'anthropic' },
  { id: 'haiku', label: 'Haiku', provider_id: 'anthropic' },
];

/** Provider filter per engine — only show models from the relevant provider. */
const ENGINE_PROVIDER_FILTER: Record<string, string | null> = {
  claude: 'anthropic',
  codex: null,  // codex has its own fetch path
  api: null,    // api mode: show all providers
};

/** Fetch models appropriate for the given engine. Re-fetches on engine change. */
export function useModelsForEngine(engine: AgentEngine) {
  const [models, setModels] = useState<AiModelEntry[]>([]);

  const fetchModels = useCallback((eng: AgentEngine) => {
    if (eng === 'codex') {
      pixsimClient.get<{ models: BridgeModel[] }>('/meta/agents/bridge/models', { params: { agent_type: 'codex' } })
        .then((r) => {
          console.log('[useModelsForEngine] codex bridge response:', r);
          const bridgeModels = (r.models || [])
            .map((m) => ({ id: m.id, label: m.label || m.id, provider_id: 'codex', is_default: m.is_default, hidden: m.hidden }));
          setModels(bridgeModels);
        })
        .catch((err) => { console.warn('[useModelsForEngine] codex fetch failed:', err); setModels([]); });
    } else {
      const providerFilter = ENGINE_PROVIDER_FILTER[eng];
      pixsimClient.get<Record<string, unknown>[]>('/dev/ai-models')
        .then((raw) => {
          const all = Array.isArray(raw) ? raw : [];
          const filtered = all.filter((m) => {
            const kind = (m.kind as string) || '';
            if (kind === 'parser' || kind === 'embedding') return false;
            if (providerFilter && m.provider_id !== providerFilter) return false;
            return true;
          }).map((m) => ({
            id: m.id as string,
            label: (m.label as string) || (m.id as string),
            provider_id: (m.provider_id as string) || 'unknown',
          }));
          setModels(filtered.length > 0 ? filtered : CLAUDE_MODELS);
        })
        .catch(() => setModels(CLAUDE_MODELS));
    }
  }, []);

  // Fetch on mount and whenever engine changes
  useEffect(() => {
    console.log('[useModelsForEngine] engine changed to:', engine);
    setModels([]);
    fetchModels(engine);
  }, [engine, fetchModels]);

  // Sort: default first, then visible, then hidden
  const sorted = useMemo(() =>
    [...models].sort((a, b) => {
      if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
      if (a.hidden !== b.hidden) return a.hidden ? 1 : -1;
      return 0;
    }),
  [models]);

  const grouped = useMemo(() => {
    const map = new Map<string, AiModelEntry[]>();
    for (const m of sorted) {
      const group = map.get(m.provider_id) || [];
      group.push(m);
      map.set(m.provider_id, group);
    }
    return map;
  }, [sorted]);

  return { models, grouped };
}

// Native <option>/<optgroup> popups default to a white system background, which
// clashes with dark themes and renders th-secondary text hard to read. Chromium
// (and thus Electron) honors bg/color set on these elements in the popup list,
// so theme them explicitly to match the surrounding surface.
const MODEL_OPTION_CLASS = 'bg-surface-secondary text-th';

/** Compact model selector for the chat input bar */
export function ModelSelector({ value, onChange, disabled, engine }: {
  value: string | null;
  onChange: (v: string | null) => void;
  disabled: boolean;
  engine: AgentEngine;
}) {
  const { grouped } = useModelsForEngine(engine);

  return (
    <select
      value={value || ''}
      onChange={(e) => onChange(e.target.value || null)}
      disabled={disabled}
      className="shrink-0 h-8 px-1 text-[9px] text-th bg-surface-secondary rounded-lg border-0 focus:outline-none focus:ring-0 cursor-pointer disabled:opacity-40"
      title={value ? `Model: ${value}` : 'Model (profile default)'}
    >
      <option value="" className={MODEL_OPTION_CLASS}>model</option>
      {Array.from(grouped.entries()).map(([provider, items]) => (
        <optgroup key={provider} label={provider} className={MODEL_OPTION_CLASS}>
          {items.map((m) => (
            <option key={m.id} value={m.id} className={MODEL_OPTION_CLASS}>{m.hidden ? '\u00B7 ' : ''}{m.label || m.id}{m.is_default ? ' \u2605' : ''}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

/**
 * Reasoning-effort options per engine. `claude` adds `max`, `codex` adds
 * `xhigh` — mirrors the profile editor's effort dropdown (kept in sync).
 */
function effortOptionsForEngine(engine: AgentEngine): ReadonlyArray<{ value: string; label: string }> {
  const base = [
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
  ];
  if (engine === 'claude') return [...base, { value: 'max', label: 'Max' }];
  if (engine === 'codex') return [...base, { value: 'xhigh', label: 'Extra High' }];
  return base;
}

/**
 * Compact per-tab reasoning-effort selector for the chat input bar. Sister to
 * `ModelSelector`: null = profile default, sent per-turn as `reasoning_effort`.
 * The `api` engine has no effort knob, so it renders nothing.
 */
export function EffortSelector({ value, onChange, disabled, engine }: {
  value: string | null;
  onChange: (v: string | null) => void;
  disabled: boolean;
  engine: AgentEngine;
}) {
  if (engine !== 'claude' && engine !== 'codex') return null;
  const options = effortOptionsForEngine(engine);
  return (
    <select
      value={value || ''}
      onChange={(e) => onChange(e.target.value || null)}
      disabled={disabled}
      className="shrink-0 h-8 px-1 text-[9px] text-th bg-surface-secondary rounded-lg border-0 focus:outline-none focus:ring-0 cursor-pointer disabled:opacity-40"
      title={value ? `Reasoning effort: ${value}` : 'Reasoning effort (profile default)'}
    >
      <option value="" className={MODEL_OPTION_CLASS}>effort</option>
      {options.map((o) => (
        <option key={o.value} value={o.value} className={MODEL_OPTION_CLASS}>{o.label}</option>
      ))}
    </select>
  );
}

/** Full-width model select for the profile editor */
function ProfileModelSelect({ value, onChange, agentType, className }: {
  value: string;
  onChange: (v: string) => void;
  agentType: string;
  className?: string;
}) {
  const engine = engineForAgentType(agentType);
  const { models } = useModelsForEngine(engine);

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className}
    >
      <option value="" className={MODEL_OPTION_CLASS}>Default (no override)</option>
      {models.map((m) => (
        <option key={m.id} value={m.id} className={MODEL_OPTION_CLASS}>{m.hidden ? '\u00B7 ' : ''}{m.label || m.id}{m.is_default ? ' \u2605' : ''}</option>
      ))}
    </select>
  );
}

// =============================================================================
// Quick Shortcuts
// =============================================================================

export const QUICK_SHORTCUTS = [
  { label: 'What can you help with?', shortLabel: 'Help', prompt: 'What capabilities do you have? What can I ask you to do?', icon: 'compass' as IconName },
  { label: 'List my assets', shortLabel: 'Assets', prompt: 'List my most recent assets with their types and status.', icon: 'image' as IconName },
  { label: 'Generation status', shortLabel: 'Gen status', prompt: 'What generations are currently running or recently completed?', icon: 'sparkles' as IconName },
  { label: 'List characters', shortLabel: 'Characters', prompt: 'List the characters in the current world with their basic info.', icon: 'user' as IconName },
];

// =============================================================================
// System Prompt Preview — shown in empty state before first message
// =============================================================================

interface FocusAreaEntry { id: string; label: string; children?: FocusAreaEntry[] }

export function SystemPromptPreview({ profileId, customInstructions, onChangeInstructions, focusAreas, onChangeFocus }: {
  profileId: string | null;
  customInstructions: string;
  onChangeInstructions: (text: string) => void;
  focusAreas: string[];
  onChangeFocus: (areas: string[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [basePrompt, setBasePrompt] = useState<string | null>(null);
  const [persona, setPersona] = useState<string | null>(null);
  const [availableFocus, setAvailableFocus] = useState<FocusAreaEntry[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    const params: Record<string, string> = {};
    if (profileId) params.profile_id = profileId;
    if (focusAreas.length > 0) params.focus = focusAreas.join(',');
    pixsimClient.get<{ base_prompt: string; persona: string | null; focus_areas: FocusAreaEntry[] }>('/meta/agents/system-prompt-preview', { params })
      .then((r) => { setBasePrompt(r.base_prompt); setPersona(r.persona); setAvailableFocus(r.focus_areas || []); })
      .catch(() => {});
  }, [profileId, focusAreas]);

  const toggleFocus = useCallback((id: string, children?: FocusAreaEntry[]) => {
    const isActive = focusAreas.includes(id);
    if (isActive) {
      const toRemove = new Set([id, ...(children || []).map((c) => c.id)]);
      onChangeFocus(focusAreas.filter((f) => !toRemove.has(f)));
    } else {
      onChangeFocus([...focusAreas, id]);
    }
  }, [focusAreas, onChangeFocus]);

  const toggleChildFocus = useCallback((parentId: string, childId: string) => {
    const isActive = focusAreas.includes(childId);
    let next = [...focusAreas];
    if (isActive) {
      next = next.filter((f) => f !== childId);
    } else {
      next = next.filter((f) => f !== parentId);
      next.push(childId);
    }
    onChangeFocus(next);
  }, [focusAreas, onChangeFocus]);

  const toggleGroupExpand = useCallback((id: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  if (basePrompt === null) return null;

  const hasFocus = focusAreas.length > 0;

  const hasActiveChild = (entry: FocusAreaEntry) =>
    entry.children?.some((c) => focusAreas.includes(c.id)) ?? false;

  return (
    <div className="rounded-lg border border-th bg-surface-elevated overflow-hidden">
      {/* Focus area chips — always visible for quick toggling */}
      {availableFocus.length > 0 && (
        <div className="px-3 py-2 flex flex-wrap gap-1 items-center">
          <span className="text-[9px] font-medium text-th-secondary uppercase tracking-wide mr-1">Focus</span>
          {availableFocus.map((f) => {
            const active = focusAreas.includes(f.id);
            const childActive = hasActiveChild(f);
            const isGroup = f.children && f.children.length > 0;
            const groupExpanded = expandedGroups.has(f.id);
            return (
              <span key={f.id} className="inline-flex items-center gap-0.5">
                <button
                  onClick={() => toggleFocus(f.id, f.children)}
                  className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${
                    active || childActive
                      ? 'bg-accent/15 text-accent'
                      : 'bg-surface-secondary text-th-secondary hover:bg-surface-inset'
                  } ${isGroup ? 'rounded-l-full' : 'rounded-full'}`}
                >
                  {f.label}
                  {childActive && !active && <span className="ml-0.5 text-[8px] opacity-60">({f.children!.filter((c) => focusAreas.includes(c.id)).length})</span>}
                </button>
                {isGroup && (
                  <button
                    onClick={() => toggleGroupExpand(f.id)}
                    className={`px-1 py-0.5 rounded-r-full text-[10px] transition-colors border-l ${
                      active || childActive
                        ? 'bg-accent/15 text-accent border-accent/20'
                        : 'bg-surface-secondary text-th-secondary hover:bg-surface-inset border-th'
                    }`}
                    title={groupExpanded ? 'Collapse sub-focuses' : 'Expand sub-focuses'}
                  >
                    <Icon name="chevronRight" size={8} className={`transition-transform ${groupExpanded ? 'rotate-90' : ''}`} />
                  </button>
                )}
              </span>
            );
          })}
          {hasFocus && (
            <button onClick={() => onChangeFocus([])} className="text-[9px] text-th-muted hover:text-th ml-1">clear</button>
          )}
        </div>
      )}

      {/* Expanded sub-focus children */}
      {availableFocus.filter((f) => f.children && expandedGroups.has(f.id)).map((f) => (
        <div key={`sub-${f.id}`} className="px-3 pb-1.5 flex flex-wrap gap-1 items-center ml-4">
          <span className="text-[8px] text-th-muted mr-0.5">{f.label}:</span>
          {f.children!.map((child) => {
            const active = focusAreas.includes(child.id);
            return (
              <button
                key={child.id}
                onClick={() => toggleChildFocus(f.id, child.id)}
                className={`px-1.5 py-0.5 rounded-full text-[9px] font-medium transition-colors ${
                  active
                    ? 'bg-accent/20 text-accent'
                    : 'bg-surface-secondary text-th-muted hover:bg-surface-inset'
                }`}
              >
                {child.label}
              </button>
            );
          })}
        </div>
      ))}

      {/* Collapsible details header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-th-secondary hover:bg-surface-secondary transition-colors border-t border-th"
      >
        <Icon name="fileText" size={12} className="shrink-0 text-th-muted" />
        <span className="font-medium">System Prompt</span>
        {persona && <Badge color="blue" className="text-[8px]">+ persona</Badge>}
        {customInstructions.trim() && <Badge color="amber" className="text-[8px]">+ custom</Badge>}
        {hasFocus && <Badge color="green" className="text-[8px]">{focusAreas.length} focus</Badge>}
        <Icon name="chevronRight" size={10} className={`ml-auto text-th-muted transition-transform ${expanded ? 'rotate-90' : ''}`} />
      </button>

      {expanded && (
        <div className="border-t border-th px-3 py-2 space-y-2">
          <div>
            <div className="text-[9px] font-medium text-th-secondary uppercase tracking-wide mb-1">Base prompt</div>
            <pre className="text-[10px] leading-relaxed text-th-secondary whitespace-pre-wrap max-h-[120px] overflow-y-auto font-mono bg-surface-secondary rounded p-2">
              {basePrompt}
            </pre>
          </div>

          {persona && (
            <div>
              <div className="text-[9px] font-medium text-th-secondary uppercase tracking-wide mb-1">Persona (from profile)</div>
              <pre className="text-[10px] leading-relaxed text-th-secondary whitespace-pre-wrap max-h-[80px] overflow-y-auto font-mono bg-accent-subtle rounded p-2">
                {persona}
              </pre>
            </div>
          )}

          <div>
            <div className="text-[9px] font-medium text-th-secondary uppercase tracking-wide mb-1">Custom instructions (appended)</div>
            <textarea
              value={customInstructions}
              onChange={(e) => onChangeInstructions(e.target.value)}
              placeholder="Add extra instructions for this conversation..."
              rows={2}
              className="w-full px-2 py-1.5 text-[11px] rounded border border-th bg-surface text-th resize-none focus:outline-none focus:ring-1 focus:ring-accent placeholder:text-th-muted"
            />
          </div>
        </div>
      )}
    </div>
  );
}
