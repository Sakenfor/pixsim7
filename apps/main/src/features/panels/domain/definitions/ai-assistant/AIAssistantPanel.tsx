/**
 * AI Assistant Panel â€" tabbed chat panel with agent profile binding.
 *
 * Each tab = independent conversation with its own:
 * - Session (Claude session ID)
 * - Agent profile binding (determines identity + instructions)
 * - Message history (persisted to localStorage)
 */

import {
  Badge,
  Button,
  EmptyState,
  SidebarPaneShell,
  useHoverExpand,
} from '@pixsim7/shared.ui';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import { getEngineBrand } from '@lib/agent/engineBrands';
import { pixsimClient } from '@lib/api/client';
import { Icon, type IconName } from '@lib/icons';
import { useReferences, useReferenceInput, ReferencePicker } from '@lib/references';

import { navigateToPlan } from '@features/workspace/lib/openPanel';

import { chatBridge, type BridgeResult } from './assistantChatBridge';
import {
  useAssistantChatStore,
  fetchServerMessages,
  buildResumedTab,
  normalizeProfileId,
  createTabId,
  type ChatTab,
  type ChatMessage,
  type AgentEngine,
  type AgentCommand,
} from './assistantChatStore';


// =============================================================================
// Types
// =============================================================================

interface BridgeStatus { connected: number; available: number; process_alive?: boolean; managed_by?: string | null }
/** Unified profile â€" both agent identity and assistant persona */
interface UnifiedProfile {
  id: string;
  label: string;
  description: string | null;
  icon: string | null;
  agent_type: string;
  method: string | null;
  model_id: string | null;
  system_prompt: string | null;
  audience: string;
  status: string;
  is_default: boolean;
  is_global: boolean;
  config: Record<string, unknown> | null;
}

const EMPTY_CHAT_MESSAGES: ChatMessage[] = [];
const EMPTY_THINKING_LOG: Array<{ action: string; detail: string; timestamp?: number }> = [];

function isSameThinkingLog(
  left: Array<{ action: string; detail: string; timestamp?: number }>,
  right: Array<{ action: string; detail: string; timestamp?: number }>,
): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    if (left[i].action !== right[i].action) return false;
    if (left[i].detail !== right[i].detail) return false;
    if ((left[i].timestamp ?? null) !== (right[i].timestamp ?? null)) return false;
  }
  return true;
}

function renderBridgeError(result: Pick<BridgeResult, 'error' | 'error_code' | 'error_details'>): string {
  const code = result.error_code || '';
  if (code === 'scoped_session_busy' || code === 'conversation_session_busy') {
    const details = result.error_details || {};
    const activity = typeof details.activity === 'string' ? details.activity : null;
    const busyFor = typeof details.busy_for_s === 'number' ? details.busy_for_s : null;
    const extra: string[] = [];
    if (typeof busyFor === 'number' && busyFor >= 0) extra.push(`busy for ${busyFor}s`);
    if (activity) extra.push(activity);
    const suffix = extra.length ? ` (${extra.join(' - ')})` : '';
    return `This tab already has an active request. Wait for it to finish or cancel and retry.${suffix}`;
  }
  return result.error || 'No response from agent';
}

/** Agent commands available in cmd (bridge) mode */
const AGENT_COMMANDS: { id: AgentCommand; label: string; icon: IconName }[] = [
  { id: 'claude', label: 'Claude', icon: 'messageSquare' },
  { id: 'codex', label: 'Codex', icon: 'cpu' },
];

const ENGINE_ICON_STYLES: Record<'blue' | 'purple' | 'orange' | 'gray', { icon: string; circle: string }> = {
  blue: {
    icon: 'text-blue-600 dark:text-blue-300',
    circle: 'bg-blue-100 dark:bg-blue-500/20 border-blue-200 dark:border-blue-400/35',
  },
  purple: {
    icon: 'text-violet-600 dark:text-violet-300',
    circle: 'bg-violet-100 dark:bg-violet-500/20 border-violet-200 dark:border-violet-400/35',
  },
  orange: {
    icon: 'text-orange-600 dark:text-orange-300',
    circle: 'bg-orange-100 dark:bg-orange-500/20 border-orange-200 dark:border-orange-400/35',
  },
  gray: {
    icon: 'text-neutral-600 dark:text-neutral-300',
    circle: 'bg-neutral-100 dark:bg-neutral-700/40 border-neutral-200 dark:border-neutral-600/50',
  },
};

function iconForEngine(engine: string | null | undefined): IconName {
  if (engine === 'codex') return 'cpu';
  if (engine === 'api') return 'zap';
  return 'messageSquare';
}

function resolveProfileIcon(engine: string | null | undefined, icon: string | null | undefined): IconName {
  if (icon && icon.trim()) return icon as IconName;
  return iconForEngine(engine);
}

function EngineProfileIcon({
  engine,
  icon,
  size = 12,
  className = '',
}: {
  engine: string | null | undefined;
  icon: IconName;
  size?: number;
  className?: string;
}) {
  const brand = getEngineBrand(engine);
  const style = ENGINE_ICON_STYLES[brand.badgeColor] ?? ENGINE_ICON_STYLES.gray;
  const circleSize = size + 8;
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center ${className}`}
      style={{ width: `${circleSize}px`, height: `${circleSize}px` }}
    >
      <span className={`absolute inset-0 rounded-full border ${style.circle}`} aria-hidden="true" />
      <Icon name={icon} size={size} className={`relative z-10 ${style.icon}`} />
    </span>
  );
}

/** Derive engine from profile's agent_type + method */
function engineFromProfile(profile: UnifiedProfile | null): AgentEngine {
  if (!profile) return 'claude';
  if (profile.method === 'api') return 'api';
  if (profile.agent_type === 'codex') return 'codex';
  return 'claude';
}

interface ReferenceScope {
  planId: string | null;
  scopeKey: string | null;
}

function normalizeReferenceId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/[)\],.;!?]+$/g, '');
  return trimmed || null;
}

function extractReferenceScope(text: string): ReferenceScope {
  let planId: string | null = null;
  const planRegex = /@plan:([^\s]+)/gi;

  let match: RegExpExecArray | null;
  while ((match = planRegex.exec(text)) !== null) {
    const normalized = normalizeReferenceId(match[1]);
    if (normalized) planId = normalized;
  }

  const scopeKey = planId ? `plan:${planId}` : null;

  return { planId, contractId: null, scopeKey };
}

// =============================================================================
// Cross-panel event constants
// =============================================================================

const INJECT_PROMPT_EVENT = 'ai-assistant:inject-prompt';
const RESUME_SESSION_EVENT = 'ai-assistant:resume-session';
const OPEN_PLAN_CHAT_EVENT = 'ai-assistant:open-plan-chat';

interface InjectPromptDetail {
  prompt: string;
  mode?: 'replace' | 'append';
}

interface ResumeSessionDetail {
  sessionId: string;
  engine: string;
  label: string;
  profileId?: string | null;
}

interface OpenPlanChatDetail {
  planId: string;
  planTitle?: string;
}

// =============================================================================
// Lightweight Markdown Renderer
// =============================================================================

function MarkdownText({ text }: { text: string }) {
  const parts = useMemo(() => renderMarkdown(text), [text]);
  return <div className="text-xs leading-relaxed space-y-1.5">{parts}</div>;
}

function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) { codeLines.push(lines[i]); i++; }
      i++;
      nodes.push(
        <pre key={nodes.length} className="p-2 rounded bg-neutral-900 dark:bg-neutral-950 text-neutral-200 text-[11px] font-mono overflow-x-auto whitespace-pre">
          {lang && <div className="text-[9px] text-neutral-500 mb-1">{lang}</div>}
          {codeLines.join('\n')}
        </pre>
      );
      continue;
    }

    if (!line.trim()) { i++; continue; }

    const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const cls = level === 1 ? 'text-sm font-bold' : level === 2 ? 'text-xs font-semibold' : 'text-xs font-medium';
      nodes.push(<div key={nodes.length} className={cls}>{inlineFormat(headingMatch[2])}</div>);
      i++; continue;
    }

    if (line.match(/^\s*[-*]\s/)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^\s*[-*]\s/)) { items.push(lines[i].replace(/^\s*[-*]\s/, '')); i++; }
      nodes.push(<ul key={nodes.length} className="list-disc pl-4 space-y-0.5">{items.map((item, j) => <li key={j}>{inlineFormat(item)}</li>)}</ul>);
      continue;
    }

    if (line.match(/^\s*\d+\.\s/)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^\s*\d+\.\s/)) { items.push(lines[i].replace(/^\s*\d+\.\s/, '')); i++; }
      nodes.push(<ol key={nodes.length} className="list-decimal pl-4 space-y-0.5">{items.map((item, j) => <li key={j}>{inlineFormat(item)}</li>)}</ol>);
      continue;
    }

    nodes.push(<p key={nodes.length}>{inlineFormat(line)}</p>);
    i++;
  }
  return nodes;
}

function inlineFormat(text: string): React.ReactNode {
  // Order matters: longer/more specific patterns first
  const regex = /(\*\*(.+?)\*\*|`([^`]+)`|\*(.+?)\*|"([^"]{2,})"|((?:\/|[A-Z]:\\)[\w./\\-]+(?:\.\w+)?(?::[\d]+)?))/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    if (match[2]) {
      // **bold**
      parts.push(<strong key={parts.length}>{match[2]}</strong>);
    } else if (match[3]) {
      // `inline code`
      parts.push(<code key={parts.length} className="px-1 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700 text-[11px] font-mono text-blue-700 dark:text-blue-300">{match[3]}</code>);
    } else if (match[4]) {
      // *italic*
      parts.push(<em key={parts.length}>{match[4]}</em>);
    } else if (match[5]) {
      // "quoted string"
      parts.push(<span key={parts.length} className="text-amber-700 dark:text-amber-300">&quot;{match[5]}&quot;</span>);
    } else if (match[6]) {
      // file path (e.g. /foo/bar.ts:42 or C:\foo\bar.py)
      parts.push(<code key={parts.length} className="px-1 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700 text-[11px] font-mono text-emerald-700 dark:text-emerald-300">{match[6]}</code>);
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

// =============================================================================
// Profile Editor (inline)
// =============================================================================

interface ProfileEditorProps {
  profile: UnifiedProfile | null;  // null = create new
  onSave: (updated: UnifiedProfile) => void;
  onCancel: () => void;
}

function ProfileEditor({ profile, onSave, onCancel }: ProfileEditorProps) {
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
      <div className="text-[11px] font-medium text-neutral-700 dark:text-neutral-300">
        {isNew ? 'New Profile' : `Edit: ${profile.label}`}
      </div>

      {isNew && (
        <input value={id} onChange={(e) => setId(e.target.value)} placeholder="ID (slug, optional)"
          className="w-full px-2 py-1 text-[11px] rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 focus:outline-none focus:ring-1 focus:ring-accent" />
      )}

      <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Name *"
        className="w-full px-2 py-1 text-[11px] rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 focus:outline-none focus:ring-1 focus:ring-accent" />

      <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description"
        className="w-full px-2 py-1 text-[11px] rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 focus:outline-none focus:ring-1 focus:ring-accent" />

      <input value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="Icon (e.g. sparkles, code, cpu)"
        className="w-full px-2 py-1 text-[11px] rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 focus:outline-none focus:ring-1 focus:ring-accent" />

      {/* Engine + Method + Model */}
      <div className="flex gap-1.5">
        <select value={agentType} onChange={(e) => setAgentType(e.target.value)}
          className="flex-1 px-2 py-1 text-[11px] rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 focus:outline-none focus:ring-1 focus:ring-accent">
          <option value="claude">Claude</option>
          <option value="codex">Codex</option>
          <option value="custom">Custom</option>
        </select>
        <select value={method} onChange={(e) => setMethod(e.target.value)}
          className="flex-1 px-2 py-1 text-[11px] rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 focus:outline-none focus:ring-1 focus:ring-accent">
          <option value="remote">CMD (bridge)</option>
          <option value="api">API (direct)</option>
        </select>
      </div>

      <ProfileModelSelect
        value={modelId}
        onChange={setModelId}
        agentType={agentType}
        className="w-full px-2 py-1 text-[11px] rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 focus:outline-none focus:ring-1 focus:ring-accent"
      />

      <select value={reasoningEffort} onChange={(e) => setReasoningEffort(e.target.value)}
        className="w-full px-2 py-1 text-[11px] rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 focus:outline-none focus:ring-1 focus:ring-accent">
        <option value="">Effort (default)</option>
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High</option>
        {agentType === 'claude' && <option value="max">Max</option>}
        {agentType === 'codex' && <option value="xhigh">Extra High</option>}
      </select>

      <textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} placeholder="Persona / system prompt"
        rows={3}
        className="w-full px-2 py-1 text-[11px] rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 resize-none focus:outline-none focus:ring-1 focus:ring-accent" />

      {error && <div className="text-[10px] text-red-500">{error}</div>}

      <div className="flex gap-1.5 justify-end">
        <button onClick={onCancel} className="px-2 py-1 text-[10px] text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300">
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
// Resume Session Picker
// =============================================================================

interface ChatSessionEntry {
  id: string;
  engine: string;
  profile_id: string | null;
  scope_key?: string | null;
  last_plan_id?: string | null;
  last_contract_id?: string | null;
  label: string;
  message_count: number;
  last_used_at: string;
}

const RESUME_SESSION_PAGE_SIZE = 50;
const RESUME_SESSION_MAX_LIMIT = 300;

function ResumeSessionPicker({ onResume, profileId, profileLabels }: {
  onResume: (sessionId: string, engine: string, label: string, profileId: string | null, lastPlanId?: string | null) => void;
  profileId?: string | null;
  profileLabels?: ReadonlyMap<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<ChatSessionEntry[]>([]);
  const [limit, setLimit] = useState<number>(RESUME_SESSION_PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('');
  const [profileOnly, setProfileOnly] = useState(!!profileId);
  const ref = useRef<HTMLDivElement>(null);

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
    pixsimClient
      .get<{ sessions: ChatSessionEntry[] }>('/meta/agents/chat-sessions', {
        params: { limit, include_empty: false },
      })
      .then((r) => { if (!cancelled) setSessions(r.sessions || []); })
      .catch(() => { if (!cancelled) setSessions([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, limit]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = useMemo(() => {
    let list = sessions;
    if (filter) list = list.filter((s) => s.engine === filter);
    if (profileOnly && profileId) list = list.filter((s) => s.profile_id === profileId);
    return list;
  }, [sessions, filter, profileOnly, profileId]);
  const canLoadMore = !loading && sessions.length >= limit && limit < RESUME_SESSION_MAX_LIMIT;

  const archiveSession = useCallback(async (session: ChatSessionEntry) => {
    if (archivingId) return;
    const label = session.label.trim() || `${session.engine} session`;
    if (!confirm(`Archive session "${label}"?`)) return;
    setActionError(null);
    setArchivingId(session.id);
    try {
      await pixsimClient.delete(`/meta/agents/chat-sessions/${session.id}`);
      setSessions((prev) => prev.filter((s) => s.id !== session.id));
    } catch {
      setActionError(`Failed to archive "${label}".`);
    } finally {
      setArchivingId(null);
    }
  }, [archivingId]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
        title="Resume session"
      >
        <Icon name="history" size={12} />
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-1 w-72 max-h-[350px] overflow-y-auto rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-lg z-30">
          {/* Engine filter tabs */}
          <div className="flex items-center gap-1 px-2 py-1.5 border-b border-neutral-100 dark:border-neutral-800">
            <button onClick={() => setFilter('')} className={`px-1.5 py-0.5 text-[9px] rounded ${!filter ? 'bg-accent text-white' : 'text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800'}`}>All</button>
            {[...AGENT_COMMANDS, { id: 'api' as const, label: 'API', icon: 'zap' as IconName }].map((e) => (
              <button key={e.id} onClick={() => setFilter(e.id)} className={`px-1.5 py-0.5 text-[9px] rounded ${filter === e.id ? 'bg-accent text-white' : 'text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800'}`}>{e.label}</button>
            ))}
            {profileId && (
              <button
                onClick={() => setProfileOnly(!profileOnly)}
                className={`ml-auto px-1.5 py-0.5 text-[9px] rounded ${profileOnly ? 'bg-accent text-white' : 'text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800'}`}
                title="Filter by current profile"
              >
                <Icon name="user" size={9} />
              </button>
            )}
          </div>

          {loading && sessions.length === 0 && (
            <div className="p-3 text-center text-[11px] text-neutral-500">Loading sessions...</div>
          )}
          {actionError && (
            <div className="px-3 py-1.5 text-[10px] text-red-500 border-b border-neutral-100 dark:border-neutral-800">{actionError}</div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="p-3 text-center text-[11px] text-neutral-500">No sessions found</div>
          )}

          {filtered.map((s) => {
            const sessionProfileLabel = s.profile_id && profileLabels?.get(s.profile_id)
              ? profileLabels.get(s.profile_id)!
              : null;
            const engineColor = getEngineBrand(s.engine).textColor;
            const scopeKeyChip = s.scope_key
              && !(s.last_plan_id && s.scope_key === `plan:${s.last_plan_id}`)
              && !(s.last_contract_id && s.scope_key === `contract:${s.last_contract_id}`)
              ? s.scope_key
              : null;
            return (
              <div
                key={s.id}
                className="group w-full flex items-center gap-1 px-1 border-b border-neutral-50 dark:border-neutral-800/50 last:border-0 hover:bg-neutral-50 dark:hover:bg-neutral-800"
              >
                <button
                  onClick={() => { onResume(s.id, s.engine, s.label, s.profile_id ?? null, s.last_plan_id); setOpen(false); }}
                  className="flex-1 min-w-0 flex items-center gap-2 px-2 py-2 text-left"
                >
                  <EngineProfileIcon
                    engine={s.engine}
                    icon={AGENT_COMMANDS.find((c) => c.id === s.engine)?.icon ?? iconForEngine(s.engine)}
                    size={11}
                  />
                  <div className="flex-1 min-w-0">
                    <div className={`text-[11px] truncate ${engineColor}`}>{s.label}</div>
                    <div className="text-[9px] text-neutral-400">
                      {sessionProfileLabel ? `${sessionProfileLabel} · ` : ''}
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
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void archiveSession(s);
                  }}
                  disabled={archivingId === s.id}
                  className="shrink-0 w-6 h-6 rounded text-neutral-400 hover:text-red-500 hover:bg-white dark:hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed opacity-0 group-hover:opacity-100 transition"
                  title="Archive session"
                >
                  <Icon name="trash2" size={10} />
                </button>
              </div>
            );
          })}

          {canLoadMore && (
            <button
              onClick={() => setLimit((prev) => Math.min(prev + RESUME_SESSION_PAGE_SIZE, RESUME_SESSION_MAX_LIMIT))}
              className="w-full px-3 py-2 text-[10px] font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 border-t border-neutral-100 dark:border-neutral-800"
            >
              Load more sessions
            </button>
          )}
          {loading && sessions.length > 0 && (
            <div className="px-3 py-2 text-center text-[10px] text-neutral-500 border-t border-neutral-100 dark:border-neutral-800">
              Loading...
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Inline Resume Picker (empty chat state)
// =============================================================================

function InlineResumePicker({ profileId, profileLabels, onResume }: {
  profileId: string | null;
  profileLabels?: ReadonlyMap<string, string>;
  onResume: (sessionId: string, engine: string, label: string, profileId: string | null, lastPlanId?: string | null) => void;
}) {
  const [sessions, setSessions] = useState<ChatSessionEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => {
    if (fetched) return;
    setLoading(true);
    const params: Record<string, unknown> = { limit: 15, include_empty: false };
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
          className="flex items-center gap-1.5 px-3 py-1 text-[10px] rounded-full border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer transition-colors"
        >
          <Icon name="rotateCcw" size={10} />
          Resume a session ({sessions.length})
          <Icon name="chevronDown" size={10} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 w-72 max-h-[200px] overflow-y-auto rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-lg z-20">
            {sessions.map((s) => {
              const profileName = s.profile_id && profileLabels?.get(s.profile_id);
              const engineColor = getEngineBrand(s.engine).textColor;
              return (
                <button
                  key={s.id}
                  onClick={() => { onResume(s.id, s.engine, s.label, s.profile_id ?? null, s.last_plan_id); setOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                >
                  <EngineProfileIcon
                    engine={s.engine}
                    icon={s.engine === 'codex' ? 'terminal' : s.engine === 'api' ? 'zap' : 'messageSquare'}
                    size={11}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-medium text-neutral-700 dark:text-neutral-200 truncate">{s.label}</div>
                    <div className="flex items-center gap-1 text-[9px] text-neutral-400">
                      {profileName && <span className={engineColor}>{profileName}</span>}
                      {s.engine !== 'claude' && <span>{s.engine}</span>}
                      <span>{s.message_count} msgs</span>
                      {s.last_plan_id && <span className="text-green-500">plan:{s.last_plan_id}</span>}
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

function ActionPicker({ open, onClose, onSelect, disabled }: {
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
    <div ref={ref} className="absolute bottom-full left-0 right-0 mb-1 mx-2 max-h-[300px] overflow-y-auto rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-lg z-10">
      {groups.length === 0 && (
        <div className="p-3 text-center text-xs text-neutral-500">{loaded ? 'No actions available' : 'Loading...'}</div>
      )}
      {groups.map((g) => {
        const isOpen = expanded === g.id;
        return (
          <div key={g.id}>
            <button onClick={() => setExpanded(isOpen ? null : g.id)} className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors">
              <Icon name={g.icon} size={13} className="text-neutral-400 shrink-0" />
              <span className="font-medium text-neutral-700 dark:text-neutral-300">{g.label}</span>
              <Badge color="gray" className="text-[9px] ml-auto">{g.actions.length}</Badge>
              <Icon name="chevronRight" size={10} className={`text-neutral-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
            </button>
            {isOpen && (
              <div className="pl-3">
                {g.actions.map((a, i) => (
                  <button key={`${a.contractId}-${i}`} onClick={() => { onSelect(a.prompt); onClose(); }} disabled={disabled}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-40 transition-colors">
                    <Icon name={a.icon} size={11} className="shrink-0 text-neutral-400" />
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

/** Color per summary: green = has commit, blue = plan-linked, amber = no commit, red outline = has blockers */
function summaryColor(s: WorkSummaryEntry): string {
  if (s.metadata?.blockers?.length) return 'text-red-500';
  const hasCommit = s.metadata?.commit || (s.metadata?.evidence ?? []).some((e) => /^[0-9a-f]{7,40}$/i.test(e));
  if (hasCommit) return 'text-emerald-500';
  if (s.plan_id) return 'text-blue-500';
  return 'text-amber-500';
}

function WorkSummaryIcon({ summary }: { summary: WorkSummaryEntry }) {
  const { isExpanded, handlers } = useHoverExpand({ expandDelay: 120, collapseDelay: 300 });
  const commits = (summary.metadata?.evidence ?? []).filter((e) => /^[0-9a-f]{7,40}$/i.test(e));
  const sha = commits[0]?.slice(0, 9) || summary.metadata?.commit || null;
  const fullSha = commits[0] || summary.metadata?.commit || null;
  const time = new Date(summary.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="relative" {...handlers}>
      <div className={`${summaryColor(summary)} cursor-default`}>
        <Icon name="fileText" size={12} />
      </div>
      {isExpanded && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-80 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-xl z-30 p-2.5">
          <div className="text-[11px] text-neutral-700 dark:text-neutral-300 leading-relaxed">{summary.detail}</div>
          <div className="flex items-center gap-1.5 mt-1.5 text-[9px] text-neutral-400 flex-wrap">
            <span>{time}</span>
            {sha && (
              <button
                className="font-mono text-blue-400 hover:underline hover:text-blue-300"
                onClick={() => { if (fullSha) navigator.clipboard.writeText(fullSha); }}
                title={`${fullSha}\nClick to copy`}
              >
                {sha}
              </button>
            )}
            {summary.plan_id && <span className="text-blue-500">{summary.plan_id}</span>}
          </div>
          {summary.metadata?.next && (
            <div className="mt-1.5 pt-1.5 border-t border-neutral-100 dark:border-neutral-800 text-[10px] text-amber-600 dark:text-amber-400">
              <span className="font-medium">Next:</span> {summary.metadata.next}
            </div>
          )}
          {summary.metadata?.decisions && summary.metadata.decisions.length > 0 && (
            <div className="mt-1 text-[10px] text-violet-500">
              <span className="font-medium">Decisions:</span> {summary.metadata.decisions.join('; ')}
            </div>
          )}
          {summary.metadata?.blockers && summary.metadata.blockers.length > 0 && (
            <div className="mt-1 text-[10px] text-red-500">
              <span className="font-medium">Blocked:</span> {summary.metadata.blockers.join('; ')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function WorkSummaryBadge({ sessionId }: { sessionId: string | null }) {
  const [summaries, setSummaries] = useState<WorkSummaryEntry[]>([]);

  useEffect(() => {
    if (!sessionId) { setSummaries([]); return; }
    let cancelled = false;
    pixsimClient.get<{ entries: WorkSummaryEntry[] }>('/meta/agents/history', {
      params: { session_id: sessionId, action: 'work_summary', limit: 20 },
    }).then((res) => {
      if (!cancelled) setSummaries(res.entries ?? []);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [sessionId]);

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
// Thinking Block — collapsible heartbeat log
// =============================================================================

function dedupeEntries(entries: Array<{ action: string; detail: string }>): Array<{ action: string; detail: string }> {
  const result: Array<{ action: string; detail: string }> = [];
  for (const e of entries) {
    const text = e.detail || e.action || '';
    if (!text) continue;
    // Filter out generic status noise
    const lower = text.toLowerCase();
    if (lower === 'status: active' || lower === 'status: idle' || lower === 'thinking...' || lower === 'thinking' || lower === 'active') continue;
    const prev = result[result.length - 1];
    const prevText = prev ? (prev.detail || prev.action || '') : '';
    // Skip if shares a 50-char prefix with the previous entry (truncation variants)
    const prefix = text.slice(0, 50);
    const prevPrefix = prevText.slice(0, 50);
    if (prev && prefix === prevPrefix) {
      // Keep the longer version
      if (text.length > prevText.length) result[result.length - 1] = e;
      continue;
    }
    result.push(e);
  }
  return result;
}

function ThinkingBlock({ entries, live, userMessage }: { entries: Array<{ action: string; detail: string }>; live?: boolean; userMessage?: string }) {
  const [expanded, setExpanded] = useState(live ?? false);
  // entries is mutated in place by the bridge singleton, so key on length for recalc
  const deduped = useMemo(() => {
    const filtered = dedupeEntries(entries);
    if (!userMessage) return filtered;
    // Filter out echoed user message (agent echoes prompt in heartbeat)
    const userPrefix = userMessage.slice(0, 50).toLowerCase();
    return filtered.filter((e) => {
      const text = (e.detail || e.action || '').toLowerCase();
      return !text.startsWith(userPrefix);
    });
  }, [entries, entries.length, userMessage]);
  if (deduped.length === 0 && !live) return null;

  return (
    <div className="mb-1.5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-[10px] text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
      >
        <Icon name={live ? 'loader' : 'cpu'} size={10} className={live ? 'animate-spin' : ''} />
        <span>{live ? 'Thinking...' : `${deduped.length} step${deduped.length !== 1 ? 's' : ''}`}</span>
        {deduped.length > 0 && (
          <span className={`text-[9px] px-1 py-0.5 rounded ${expanded ? 'bg-accent/10 text-accent' : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400'}`}>
            {expanded ? 'hide' : 'show'}
          </span>
        )}
      </button>
      {expanded && (
        <div className="mt-1.5 pl-3 border-l-2 border-neutral-200 dark:border-neutral-700 space-y-1 max-h-[240px] overflow-y-auto">
          {deduped.map((e, i) => (
            <div key={i} className="flex gap-2 text-[10px] leading-relaxed py-1 px-1.5 rounded bg-neutral-50 dark:bg-neutral-800/50">
              <span className="text-neutral-400 dark:text-neutral-500 font-mono shrink-0 select-none">{i + 1}</span>
              <span className="text-neutral-600 dark:text-neutral-300">{e.detail || e.action}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Message Bubble
// =============================================================================

function MessageBubble({
  msg,
  onRetry,
  userMessage,
  engine,
  profileIcon,
}: {
  msg: ChatMessage;
  onRetry?: () => void;
  userMessage?: string;
  engine: AgentEngine;
  profileIcon: IconName;
}) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(msg.text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  }, [msg.text]);
  const showAssistantIcon = msg.role === 'assistant' || msg.role === 'error';

  if (msg.role === 'system') {
    return (
      <div className="flex justify-center">
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-neutral-100 dark:bg-neutral-800/50 text-[10px] text-neutral-500 dark:text-neutral-400">
          <Icon name="refreshCw" size={9} />
          <span>{msg.text}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} group ${showAssistantIcon ? 'items-start gap-2' : ''}`}>
      {showAssistantIcon && <EngineProfileIcon engine={engine} icon={profileIcon} size={11} className="mt-0.5" />}
      <div className={`max-w-[85%] rounded-xl px-3 py-2 ${
        msg.role === 'user' ? 'bg-accent text-white'
          : msg.role === 'error' ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
          : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100'
      }`}>
        {msg.role === 'assistant' && msg.thinkingLog && msg.thinkingLog.length > 0 && (
          <ThinkingBlock entries={msg.thinkingLog} userMessage={userMessage} />
        )}
        {msg.role === 'assistant' ? <MarkdownText text={msg.text} /> : <pre className="whitespace-pre-wrap text-xs font-sans leading-relaxed">{msg.text}</pre>}
        <div className="flex items-center gap-2 mt-1">
          {msg.duration_ms != null && <span className="text-[10px] opacity-50">{(msg.duration_ms / 1000).toFixed(1)}s</span>}
          <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {msg.role === 'assistant' && (
              <button onClick={handleCopy} className="text-[10px] opacity-60 hover:opacity-100" title="Copy">
                {copied ? 'Copied!' : <Icon name="copy" size={11} />}
              </button>
            )}
            {msg.role === 'error' && onRetry && (
              <button onClick={onRetry} className="text-[10px] text-red-500 hover:text-red-400 flex items-center gap-0.5">
                <Icon name="refreshCw" size={10} /> Retry
              </button>
            )}
          </div>
        </div>
      </div>
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
function engineForAgentType(agentType: string): AgentEngine {
  if (agentType === 'codex') return 'codex';
  return 'claude';
}

const CLAUDE_MODELS: AiModelEntry[] = [
  { id: 'sonnet', label: 'Sonnet', provider_id: 'anthropic' },
  { id: 'opus', label: 'Opus', provider_id: 'anthropic' },
  { id: 'haiku', label: 'Haiku', provider_id: 'anthropic' },
];

/** Provider filter per engine â€" only show models from the relevant provider. */
const ENGINE_PROVIDER_FILTER: Record<string, string | null> = {
  claude: 'anthropic',
  codex: null,  // codex has its own fetch path
  api: null,    // api mode: show all providers
};

/** Fetch models appropriate for the given engine. Re-fetches on engine change. */
function useModelsForEngine(engine: AgentEngine) {
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

/** Compact model selector for the chat input bar */
function ModelSelector({ value, onChange, disabled, engine }: {
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
      className="shrink-0 h-8 px-1 text-[9px] text-neutral-500 bg-transparent border-0 focus:outline-none focus:ring-0 cursor-pointer disabled:opacity-40"
      title={value ? `Model: ${value}` : 'Model (profile default)'}
    >
      <option value="">model</option>
      {Array.from(grouped.entries()).map(([provider, items]) => (
        <optgroup key={provider} label={provider}>
          {items.map((m) => (
            <option key={m.id} value={m.id}>{m.hidden ? 'Â· ' : ''}{m.label || m.id}{m.is_default ? ' â˜…' : ''}</option>
          ))}
        </optgroup>
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
      <option value="">Default (no override)</option>
      {models.map((m) => (
        <option key={m.id} value={m.id}>{m.hidden ? 'Â· ' : ''}{m.label || m.id}{m.is_default ? ' â˜…' : ''}</option>
      ))}
    </select>
  );
}

// =============================================================================
// Quick Shortcuts
// =============================================================================

const QUICK_SHORTCUTS = [
  { label: 'What can you help with?', prompt: 'What capabilities do you have? What can I ask you to do?', icon: 'compass' as IconName },
  { label: 'List my assets', prompt: 'List my most recent assets with their types and status.', icon: 'image' as IconName },
  { label: 'Generation status', prompt: 'What generations are currently running or recently completed?', icon: 'sparkles' as IconName },
  { label: 'List characters', prompt: 'List the characters in the current world with their basic info.', icon: 'user' as IconName },
];

// =============================================================================
// System Prompt Preview â€" shown in empty state before first message
// =============================================================================

interface FocusAreaEntry { id: string; label: string; children?: FocusAreaEntry[] }

interface SystemPromptPreviewProps {
  profileId: string | null;
  customInstructions: string;
  onChangeInstructions: (text: string) => void;
  focusAreas: string[];
  onChangeFocus: (areas: string[]) => void;
}

function SystemPromptPreview({ profileId, customInstructions, onChangeInstructions, focusAreas, onChangeFocus }: SystemPromptPreviewProps) {
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
      // Deactivate parent + all children
      const toRemove = new Set([id, ...(children || []).map((c) => c.id)]);
      onChangeFocus(focusAreas.filter((f) => !toRemove.has(f)));
    } else {
      // Activate just the parent (coarse mode). Children are opt-in refinements.
      onChangeFocus([...focusAreas, id]);
    }
  }, [focusAreas, onChangeFocus]);

  const toggleChildFocus = useCallback((parentId: string, childId: string) => {
    const isActive = focusAreas.includes(childId);
    let next = [...focusAreas];
    if (isActive) {
      next = next.filter((f) => f !== childId);
      // If no children active, keep parent active (coarse mode)
    } else {
      // Activating a child: remove parent coarse tag, add the child
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

  // Check if a parent's children are active (for visual hint)
  const hasActiveChild = (entry: FocusAreaEntry) =>
    entry.children?.some((c) => focusAreas.includes(c.id)) ?? false;

  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 overflow-hidden">
      {/* Focus area chips — always visible for quick toggling */}
      {availableFocus.length > 0 && (
        <div className="px-3 py-2 flex flex-wrap gap-1 items-center">
          <span className="text-[9px] font-medium text-neutral-500 uppercase tracking-wide mr-1">Focus</span>
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
                      : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700'
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
                        : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700 border-neutral-200 dark:border-neutral-700'
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
            <button onClick={() => onChangeFocus([])} className="text-[9px] text-neutral-400 hover:text-neutral-600 ml-1">clear</button>
          )}
        </div>
      )}

      {/* Expanded sub-focus children */}
      {availableFocus.filter((f) => f.children && expandedGroups.has(f.id)).map((f) => (
        <div key={`sub-${f.id}`} className="px-3 pb-1.5 flex flex-wrap gap-1 items-center ml-4">
          <span className="text-[8px] text-neutral-400 mr-0.5">{f.label}:</span>
          {f.children!.map((child) => {
            const active = focusAreas.includes(child.id);
            return (
              <button
                key={child.id}
                onClick={() => toggleChildFocus(f.id, child.id)}
                className={`px-1.5 py-0.5 rounded-full text-[9px] font-medium transition-colors ${
                  active
                    ? 'bg-accent/20 text-accent'
                    : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-400 dark:text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-700'
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
        className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors border-t border-neutral-200 dark:border-neutral-700"
      >
        <Icon name="fileText" size={12} className="shrink-0 text-neutral-400" />
        <span className="font-medium">System Prompt</span>
        {persona && <Badge color="blue" className="text-[8px]">+ persona</Badge>}
        {customInstructions.trim() && <Badge color="amber" className="text-[8px]">+ custom</Badge>}
        {hasFocus && <Badge color="green" className="text-[8px]">{focusAreas.length} focus</Badge>}
        <Icon name="chevronRight" size={10} className={`ml-auto text-neutral-400 transition-transform ${expanded ? 'rotate-90' : ''}`} />
      </button>

      {expanded && (
        <div className="border-t border-neutral-200 dark:border-neutral-700 px-3 py-2 space-y-2">
          {/* Base prompt (read-only) */}
          <div>
            <div className="text-[9px] font-medium text-neutral-500 uppercase tracking-wide mb-1">Base prompt</div>
            <pre className="text-[10px] leading-relaxed text-neutral-600 dark:text-neutral-400 whitespace-pre-wrap max-h-[120px] overflow-y-auto font-mono bg-neutral-100 dark:bg-neutral-800 rounded p-2">
              {basePrompt}
            </pre>
          </div>

          {/* Persona (read-only, from profile) */}
          {persona && (
            <div>
              <div className="text-[9px] font-medium text-neutral-500 uppercase tracking-wide mb-1">Persona (from profile)</div>
              <pre className="text-[10px] leading-relaxed text-neutral-600 dark:text-neutral-400 whitespace-pre-wrap max-h-[80px] overflow-y-auto font-mono bg-blue-50 dark:bg-blue-900/20 rounded p-2">
                {persona}
              </pre>
            </div>
          )}

          {/* Custom instructions (editable) */}
          <div>
            <div className="text-[9px] font-medium text-neutral-500 uppercase tracking-wide mb-1">Custom instructions (appended)</div>
            <textarea
              value={customInstructions}
              onChange={(e) => onChangeInstructions(e.target.value)}
              placeholder="Add extra instructions for this conversation..."
              rows={2}
              className="w-full px-2 py-1.5 text-[11px] rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 resize-none focus:outline-none focus:ring-1 focus:ring-accent placeholder:text-neutral-400"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Tab Chat View â€" one per tab, owns its own message state
// =============================================================================

function TabChatView({ tab, onUpdateTab, bridge, profiles, onRefreshProfiles }: {
  tab: ChatTab;
  onUpdateTab: (updates: Partial<ChatTab>) => void;
  bridge: BridgeStatus | null;
  profiles: UnifiedProfile[];
  onRefreshProfiles: () => void;
}) {
  // Messages from Zustand store (survives HMR)
  const messages = useAssistantChatStore((s) => s.messagesByTab[tab.id] ?? EMPTY_CHAT_MESSAGES);
  // Ensure messages are lazy-loaded from localStorage on first render
  useEffect(() => { useAssistantChatStore.getState().getMessages(tab.id); }, [tab.id]);

  // Draft: local state for responsive typing, synced to store
  const [input, setInput] = useState(() => useAssistantChatStore.getState().getDraft(tab.id));
  useEffect(() => { useAssistantChatStore.getState().setDraft(tab.id, input); }, [input, tab.id]);

  const [actionPickerOpen, setActionPickerOpen] = useState(false);
  const profileLabelMap = useMemo(() => new Map(profiles.map((p) => [p.id, p.label] as const)), [profiles]);

  // Sending state derived from the bridge singleton (survives unmount)
  const bridgeVersion = useSyncExternalStore(
    chatBridge.subscribe.bind(chatBridge),
    chatBridge.getSnapshot.bind(chatBridge),
  );
  const bridgeReq = chatBridge.get(tab.id);
  const sending = bridgeReq?.status === 'pending' || bridgeReq?.status === 'streaming';
  const activity = bridgeReq?.activity ?? null;

  // Sync thinking entries from bridge to store (persists across HMR + full reload).
  // The bridge's thinkingLog is in-memory only — mirror it to the store so it survives.
  const storeThinking = useAssistantChatStore((s) => s.thinkingByTab[tab.id] ?? EMPTY_THINKING_LOG);
  useEffect(() => {
    if (!bridgeReq || !sending || bridgeReq.thinkingLog.length === 0) {
      return;
    }
    if (isSameThinkingLog(storeThinking, bridgeReq.thinkingLog)) {
      return;
    }
    useAssistantChatStore.getState().syncThinking(tab.id, [...bridgeReq.thinkingLog]);
  }, [bridgeVersion, bridgeReq, sending, storeThinking, tab.id]);
  // Effective thinking entries: bridge (live) or store (survived reload)
  const thinkingEntries = (sending && bridgeReq?.thinkingLog?.length)
    ? bridgeReq.thinkingLog
    : storeThinking;

  // Consume completed/error results from the bridge singleton.
  // The Zustand store handles persistence — no need for eager localStorage writes.
  useEffect(() => {
    if (!bridgeReq || (bridgeReq.status !== 'completed' && bridgeReq.status !== 'error')) return;
    const result = chatBridge.consume(tab.id);
    if (!result) return;
    const errorText = renderBridgeError(result);
    const s = useAssistantChatStore.getState();
    // Clear persisted thinking entries — they're now part of the final message
    s.clearThinking(tab.id);

    if (result.error_code === 'cancelled' || result.error === 'cancelled') {
      s.appendMessage(tab.id, { role: 'system', text: 'Request cancelled', timestamp: new Date() });
    } else if (result.ok && result.response) {
      const prevSessionId = tab.sessionId;
      if (result.bridge_session_id && result.bridge_session_id !== prevSessionId) {
        onUpdateTab({ sessionId: result.bridge_session_id });
        if (prevSessionId) {
          s.appendMessage(tab.id, { role: 'system', text: 'New session — previous conversation not available', timestamp: new Date() });
        }
      } else if (result.bridge_session_id && prevSessionId && result.bridge_session_id === prevSessionId) {
        const msgs = s.getMessages(tab.id);
        const last = msgs[msgs.length - 1];
        if (last?.role === 'system' && last.text.startsWith('Reconnected')) {
          s.setMessages(tab.id, [...msgs.slice(0, -1), { ...last, text: `Session resumed (verified: ${prevSessionId.slice(0, 8)})` }]);
        }
      }
      const thinking = result.thinkingLog?.length ? result.thinkingLog.map((e) => ({ action: e.action, detail: e.detail })) : undefined;
      s.appendMessage(tab.id, { role: 'assistant', text: result.response!, duration_ms: result.duration_ms, thinkingLog: thinking, timestamp: new Date() });
    } else {
      // Reconnect failure — try recovering from server-stored messages.
      const isReconnectFailure = result.reconnected || result.error_code === 'task_not_found' || (result.error || '').includes('not found');
      if (isReconnectFailure && tab.sessionId) {
        fetchServerMessages(tab.sessionId).then((serverMsgs) => {
          if (serverMsgs.length === 0) {
            useAssistantChatStore.getState().appendMessage(tab.id, { role: 'error', text: errorText, timestamp: new Date() });
            return;
          }
          const current = useAssistantChatStore.getState().getMessages(tab.id);
          let lastLocalUserIdx = -1;
          for (let i = current.length - 1; i >= 0; i--) { if (current[i].role === 'user') { lastLocalUserIdx = i; break; } }
          const lastLocalUserText = lastLocalUserIdx >= 0 ? current[lastLocalUserIdx].text : null;
          let serverLastUserIdx = -1;
          for (let i = serverMsgs.length - 1; i >= 0; i--) {
            if (serverMsgs[i].role === 'user' && serverMsgs[i].text === lastLocalUserText) { serverLastUserIdx = i; break; }
          }
          if (serverLastUserIdx >= 0 && serverLastUserIdx < serverMsgs.length - 1) {
            const recovered = serverMsgs.slice(serverLastUserIdx + 1).filter((m) => m.role === 'assistant');
            if (recovered.length > 0) {
              const st = useAssistantChatStore.getState();
              const curr = st.getMessages(tab.id);
              st.setMessages(tab.id, [
                ...curr,
                { role: 'system' as const, text: 'Response recovered from server', timestamp: new Date() },
                ...recovered,
              ]);
              return;
            }
          }
          useAssistantChatStore.getState().appendMessage(tab.id, { role: 'error', text: errorText, timestamp: new Date() });
        }).catch(() => {
          useAssistantChatStore.getState().appendMessage(tab.id, { role: 'error', text: errorText, timestamp: new Date() });
        });
      } else {
        s.appendMessage(tab.id, { role: 'error', text: errorText, timestamp: new Date() });
      }
    }
  }, [bridgeVersion, bridgeReq, onUpdateTab, tab.id, tab.sessionId]);

  const [showProfilePicker, setShowProfilePicker] = useState(false);
  const [editingProfile, setEditingProfile] = useState<UnifiedProfile | null | 'new'>(null); // null=closed, 'new'=create, UnifiedProfile=edit
  const profilePickerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const connected = bridge?.connected ?? 0;
  // Track connection state transitions. Start with current value so first render is a no-op.
  const prevConnectedRef = useRef(connected);
  // Only show reconnect after we've seen a real disconnect during this panel's lifetime
  const sawDisconnectRef = useRef(false);

  // Detect real bridge connect/disconnect transitions
  useEffect(() => {
    const prev = prevConnectedRef.current;
    prevConnectedRef.current = connected;

    // No change
    if (prev === connected) return;

    if (connected > 0 && prev === 0 && sawDisconnectRef.current && messages.length > 0) {
      const label = tab.sessionId
        ? 'Reconnected — resuming conversation'
        : 'Bridge connected';
      useAssistantChatStore.getState().appendMessage(tab.id, { role: 'system', text: label, timestamp: new Date() });
    } else if (connected === 0 && prev > 0 && messages.length > 0) {
      sawDisconnectRef.current = true;
      useAssistantChatStore.getState().appendMessage(tab.id, { role: 'system', text: 'Bridge disconnected', timestamp: new Date() });
    }
  }, [connected]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync messages to server when they change
  useEffect(() => {
    if (tab.sessionId && messages.length > 0) {
      useAssistantChatStore.getState().syncToServer(tab.sessionId, messages);
    }
  }, [messages, tab.sessionId]);

  // Inject prompt from other panels
  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<InjectPromptDetail>;
      const prompt = custom.detail?.prompt?.trim();
      if (!prompt) return;
      setInput((prev) => custom.detail?.mode === 'append' && prev.trim() ? `${prev}\n${prompt}` : prompt);
      setActionPickerOpen(false);
    };
    window.addEventListener(INJECT_PROMPT_EVENT, handler as EventListener);
    return () => window.removeEventListener(INJECT_PROMPT_EVENT, handler as EventListener);
  }, []);

  // Auto-scroll on new messages or activity updates
  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, activity]);

  // Close profile picker on outside click
  useEffect(() => {
    if (!showProfilePicker) return;
    const handler = (e: MouseEvent) => { if (profilePickerRef.current && !profilePickerRef.current.contains(e.target as Node)) setShowProfilePicker(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showProfilePicker]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || sending) return;
    const msgs = useAssistantChatStore.getState().getMessages(tab.id);
    const isFirstUserMessage = !tab.sessionId && !msgs.some((m) => m.role === 'user');
    if (isFirstUserMessage) {
      onUpdateTab({ label: text.slice(0, 30) });
    }
    setInput('');
    // Store handles persist to localStorage
    useAssistantChatStore.getState().appendMessage(tab.id, { role: 'user', text, timestamp: new Date() });

    const timeout = tab.engine === 'codex' ? 600 : 300;
    const body: Record<string, unknown> = { message: text, timeout, engine: tab.engine };
    const tabProfileId = normalizeProfileId(tab.profileId);
    const resolvedProfileId = tabProfileId || profiles.find((p) => p.is_default)?.id || profiles[0]?.id || null;
    if (resolvedProfileId) {
      body.assistant_id = resolvedProfileId;
      if (tab.profileId !== resolvedProfileId) onUpdateTab({ profileId: resolvedProfileId });
    }
    if (tab.sessionId) body.bridge_session_id = tab.sessionId;
    if (resolvedProfileId && !tab.usePersona) body.skip_persona = true;
    if (tab.modelOverride) body.model = tab.modelOverride;
    if (tab.customInstructions.trim()) body.custom_instructions = tab.customInstructions.trim();
    if (tab.focusAreas.length > 0) body.focus = tab.focusAreas;
    const scope = extractReferenceScope(text);
    // Each tab gets its own scoped session — prevents new tabs from reusing
    // another tab's Claude process with stale conversation history.
    // @plan: scope overrides the tab scope when present.
    const effectivePlanId = scope.planId || tab.planId;
    body.scope_key = (effectivePlanId ? `plan:${effectivePlanId}` : null) || scope.scopeKey || `tab:${tab.id}`;
    body.session_policy = 'scoped';
    if (effectivePlanId) {
      body.context = { plan_id: effectivePlanId };
    }
    // Auto-bind tab to plan on first @plan: reference
    if (scope.planId && scope.planId !== tab.planId) {
      onUpdateTab({ planId: scope.planId });
    }

    // Auto-inject token: mint one for the active profile and include it.
    // Token flows two ways: (1) body.user_token → bridge writes to MCP token file
    // for automatic tool auth, (2) bridge prepends it to the first message so the
    // agent is aware it has a token (useful for non-MCP use cases).
    if (tab.injectToken && resolvedProfileId) {
      try {
        const res = await pixsimClient.post<{ access_token: string }>(`/dev/agent-profiles/${resolvedProfileId}/token`, null, { params: { hours: 24, scope: 'dev' } });
        body.user_token = res.access_token;
      } catch (err) {
        console.warn('[ai-assistant] Token mint failed for profile', resolvedProfileId, err);
      }
    }

    // Fire-and-forget â€" the bridge singleton manages the SSE fetch.
    // Results are consumed by the useEffect above, even if the panel unmounts.
    void chatBridge.send(tab.id, body);
  }, [sending, tab.id, tab.profileId, tab.sessionId, tab.engine, tab.usePersona, tab.modelOverride, tab.customInstructions, tab.focusAreas, tab.injectToken, profiles, onUpdateTab]);

  const retryLast = useCallback(() => {
    const msgs = useAssistantChatStore.getState().getMessages(tab.id);
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'user') {
        useAssistantChatStore.getState().setMessages(tab.id, msgs.slice(0, i));
        void sendMessage(msgs[i].text);
        return;
      }
    }
  }, [sendMessage, tab.id]);

  // @reference picker (centralized)
  const refs = useReferences();
  const refInput = useReferenceInput(refs);

  const handleTextareaInput = useCallback((e: React.FormEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    refInput.handleInput(e);
  }, [refInput]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (refInput.handleKeyDown(e)) return; // consumed by reference picker
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
    }
  }, [input, sendMessage, refInput]);

  // Resolve current profile
  const activeProfile = profiles.find((p) => p.id === tab.profileId);
  const activeProfileIcon = resolveProfileIcon(tab.engine, activeProfile?.icon);
  const profileDisplay = activeProfile?.label || 'General';
  const isAgentProfile = activeProfile && !activeProfile.id.startsWith('assistant:');

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto min-h-0 p-3 space-y-3">
        {messages.length === 0 && connected > 0 && (
          <div className="space-y-3">
            <SystemPromptPreview
              profileId={tab.profileId}
              customInstructions={tab.customInstructions}
              onChangeInstructions={(text) => onUpdateTab({ customInstructions: text })}
              focusAreas={tab.focusAreas}
              onChangeFocus={(areas) => onUpdateTab({ focusAreas: areas })}
            />
            <EmptyState message="Ask anything or pick an action" size="sm" />
            <div className="flex flex-wrap gap-1.5 justify-center">
              {QUICK_SHORTCUTS.map((s) => (
                <button key={s.label} onClick={() => void sendMessage(s.prompt)} disabled={sending}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-full border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors disabled:opacity-50">
                  <Icon name={s.icon} size={12} />{s.label}
                </button>
              ))}
            </div>
            <InlineResumePicker
              profileId={tab.profileId}
              profileLabels={profileLabelMap}
              onResume={(sessionId, engine, label, resumeProfileId) => {
                const resumed = buildResumedTab({ id: sessionId, engine, label, profile_id: resumeProfileId });
                onUpdateTab({
                  sessionId: resumed.sessionId,
                  engine: resumed.engine,
                  label: resumed.label,
                  profileId: resumed.profileId,
                  injectToken: resumed.injectToken,
                });
                // Fetch server-side message history for this session
                fetchServerMessages(sessionId).then((serverMsgs) => {
                  if (serverMsgs.length > 0) useAssistantChatStore.getState().setMessages(tab.id, serverMsgs);
                });
              }}
            />
          </div>
        )}
        {messages.length === 0 && connected === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-8">
            {bridge?.process_alive ? (
              <EmptyState message="Bridge is connecting..." description={bridge.managed_by === 'launcher' ? 'Managed by launcher' : 'Waiting for WebSocket connection'} size="sm" />
            ) : (
              <>
                <EmptyState message="AI assistant is offline" description="Start an agent bridge to connect" size="sm" />
                <Button size="sm" onClick={() => { pixsimClient.post('/meta/agents/bridge/start', { pool_size: 1, claude_args: '--dangerously-skip-permissions' }).catch(() => {}); }}>
                  <Icon name="play" size={12} className="mr-1.5" />Start Bridge
                </Button>
              </>
            )}
          </div>
        )}
        {messages.map((msg, i) => {
          // Find preceding user message for echo filtering in thinking steps
          const prevUserMsg = msg.role === 'assistant' ? messages.slice(0, i).findLast((m) => m.role === 'user')?.text : undefined;
          return (
            <MessageBubble
              key={i}
              msg={msg}
              onRetry={msg.role === 'error' ? retryLast : undefined}
              userMessage={prevUserMsg}
              engine={tab.engine}
              profileIcon={activeProfileIcon}
            />
          );
        })}
        {sending && (
          <div className="flex justify-start gap-2 items-end">
            <EngineProfileIcon engine={tab.engine} icon={activeProfileIcon} size={11} className="mb-1" />
            <div className="bg-neutral-100 dark:bg-neutral-800 rounded-xl px-3 py-2 max-w-[85%]">
              {thinkingEntries.length > 0 && (
                <ThinkingBlock entries={thinkingEntries} live userMessage={messages.findLast((m) => m.role === 'user')?.text} />
              )}
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
            <button
              onClick={() => chatBridge.cancel(tab.id)}
              className="text-[10px] text-neutral-400 hover:text-red-500 transition-colors pb-1"
              title="Cancel request"
            >
              <Icon name="x" size={12} />
            </button>
          </div>
        )}
        <div ref={scrollRef} />
      </div>

      {/* Input */}
      <div className="relative shrink-0 border-t border-neutral-200 dark:border-neutral-800 p-2">
        <ActionPicker open={actionPickerOpen} onClose={() => setActionPickerOpen(false)} onSelect={(p) => void sendMessage(p)} disabled={connected === 0 || sending} />
        <ReferencePicker query={refInput.query} items={refs.items} onSelect={(item) => refInput.select(item, setInput)} onClose={refInput.dismiss} visible={refInput.active} />

        {/* Textarea — above the toolbar for more space */}
        <div className="group/input mb-1.5">
          <div className="flex gap-1.5 items-end">
            <div className="flex-1">
              <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown}
                placeholder={connected > 0 ? 'Ask something... (@ to reference)' : 'No agent connected'}
                disabled={connected === 0 || sending} rows={3}
                className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 resize-none focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
                style={{ minHeight: '68px', maxHeight: '160px' }}
                onInput={handleTextareaInput}
              />
            </div>
            <Button size="sm" onClick={() => void sendMessage(input)} disabled={connected === 0 || sending || !input.trim()} className="shrink-0">
              <Icon name="send" size={14} />
            </Button>
          </div>
        </div>

        {/* Toolbar — profile, model, token, actions below the textarea */}
        <div className="flex gap-1.5 items-center">
          <button onClick={() => setActionPickerOpen(!actionPickerOpen)} disabled={connected === 0}
            className={`shrink-0 w-7 h-7 flex items-center justify-center rounded-lg transition-colors disabled:opacity-30 ${actionPickerOpen ? 'bg-accent text-white' : 'text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'}`}
            title="Browse actions">
            <Icon name="plus" size={14} />
          </button>

          {/* Profile picker */}
          <div className="relative shrink-0" ref={profilePickerRef}>
            <button
              disabled={sending}
              onClick={() => { setShowProfilePicker(!showProfilePicker); setEditingProfile(null); }}
              className={`h-7 flex items-center gap-1 px-1.5 rounded-lg text-[10px] transition-colors disabled:opacity-40 disabled:pointer-events-none ${
                showProfilePicker ? 'bg-accent text-white' : 'text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800'
              }`}
              title={`Profile: ${profileDisplay}`}
            >
              <EngineProfileIcon
                engine={tab.engine}
                icon={resolveProfileIcon(tab.engine, activeProfile?.icon || (isAgentProfile ? 'cpu' : 'messageSquare'))}
                size={12}
              />
              <span className="max-w-[60px] truncate">{profileDisplay}</span>
              <span className="text-[8px] text-neutral-400 uppercase">{tab.engine}</span>
            </button>

            {showProfilePicker && (
              <div className="absolute bottom-full left-0 mb-1 w-64 max-h-[400px] overflow-y-auto rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-lg z-20">
                {/* Editor mode */}
                {editingProfile != null ? (
                  <ProfileEditor
                    profile={editingProfile === 'new' ? null : editingProfile}
                    onSave={(updated) => {
                      setEditingProfile(null);
                      onRefreshProfiles();
                      onUpdateTab({ profileId: updated.id });
                      setShowProfilePicker(false);
                    }}
                    onCancel={() => setEditingProfile(null)}
                  />
                ) : (
                  <>
                    {/* Persona toggle (when a profile is selected) */}
                    {tab.profileId && activeProfile && (
                      <label className="flex items-center gap-2 px-3 py-1.5 text-[11px] text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={tab.usePersona}
                          onChange={(e) => onUpdateTab({ usePersona: e.target.checked })}
                          className="rounded border-neutral-300 text-accent focus:ring-accent h-3 w-3"
                        />
                        <span>Use persona</span>
                        <span className="text-[9px] text-neutral-400 ml-auto truncate max-w-[100px]" title={activeProfile.system_prompt || ''}>
                          {activeProfile.system_prompt ? activeProfile.system_prompt.slice(0, 30) + '...' : 'none set'}
                        </span>
                      </label>
                    )}

                    {/* Profile list with edit + token + archive buttons */}
                    {profiles.map((p) => (
                      <div
                        key={p.id}
                        className={`group w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-left hover:bg-neutral-50 dark:hover:bg-neutral-800 ${
                          tab.profileId === p.id ? 'bg-blue-50/50 dark:bg-blue-900/10 text-blue-600' : 'text-neutral-600 dark:text-neutral-400'
                        }`}
                      >
                        <button
                          onClick={() => {
                            onUpdateTab({
                              profileId: p.id,
                              usePersona: true,
                              engine: engineFromProfile(p),
                              sessionId: null,
                              injectToken: true,
                            });
                            setShowProfilePicker(false);
                          }}
                          className="flex items-center gap-2 flex-1 min-w-0"
                        >
                          <EngineProfileIcon
                            engine={engineFromProfile(p)}
                            icon={resolveProfileIcon(engineFromProfile(p), p.icon || (p.id.startsWith('assistant:') ? 'messageSquare' : 'cpu'))}
                            size={12}
                          />
                          <span className="truncate">{p.label}</span>
                          {p.model_id && <span className="text-[9px] text-neutral-400 truncate max-w-[80px]">{p.model_id}</span>}
                        </button>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              const res = await pixsimClient.post<{ access_token: string }>(`/dev/agent-profiles/${p.id}/token`, null, { params: { hours: 24, scope: 'dev' } });
                              await navigator.clipboard.writeText(res.access_token);
                              useAssistantChatStore.getState().appendMessage(tab.id, { role: 'system', text: `Token minted for ${p.label} (24h, copied to clipboard)`, timestamp: new Date() });
                              setShowProfilePicker(false);
                            } catch {
                              useAssistantChatStore.getState().appendMessage(tab.id, { role: 'error', text: `Failed to mint token for ${p.label}`, timestamp: new Date() });
                            }
                          }}
                          className="opacity-0 group-hover:opacity-100 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-opacity shrink-0"
                          title="Mint token (copies to clipboard)"
                        >
                          <Icon name="key" size={10} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditingProfile(p); }}
                          className="opacity-0 group-hover:opacity-100 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-opacity shrink-0"
                          title="Edit profile"
                        >
                          <Icon name="edit" size={10} />
                        </button>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (!confirm(`Archive "${p.label}"? It will be hidden but plan references are preserved.`)) return;
                            try {
                              await pixsimClient.delete(`/dev/agent-profiles/${p.id}`);
                              // If this profile was selected, pick the first remaining
                              if (tab.profileId === p.id) {
                                const remaining = profiles.filter((pr) => pr.id !== p.id);
                                onUpdateTab({ profileId: remaining[0]?.id ?? null });
                              }
                              onRefreshProfiles();
                            } catch {
                              useAssistantChatStore.getState().appendMessage(tab.id, { role: 'error', text: `Failed to archive ${p.label}`, timestamp: new Date() });
                            }
                          }}
                          className="opacity-0 group-hover:opacity-100 text-neutral-400 hover:text-red-500 transition-opacity shrink-0"
                          title="Archive profile"
                        >
                          <Icon name="trash" size={10} />
                        </button>
                      </div>
                    ))}

                    {/* New profile button */}
                    <div className="border-t border-neutral-100 dark:border-neutral-800" />
                    <button
                      onClick={() => setEditingProfile('new')}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-neutral-500 hover:bg-neutral-50 dark:hover:bg-neutral-800"
                    >
                      <Icon name="plus" size={10} className="shrink-0" />
                      <span>New profile</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Model override â€" fetched from backend registry or bridge */}
          <ModelSelector
            value={tab.modelOverride}
            onChange={(v) => onUpdateTab({ modelOverride: v })}
            disabled={sending}
            engine={tab.engine}
          />

          {/* Inject token toggle */}
          <button
            onClick={() => onUpdateTab({ injectToken: !tab.injectToken })}
            disabled={sending || !tab.profileId}
            className={`shrink-0 h-7 flex items-center gap-0.5 px-1 rounded-lg text-[9px] transition-colors disabled:opacity-30 ${
              tab.injectToken ? 'text-amber-600 dark:text-amber-400' : 'text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300'
            }`}
            title={tab.injectToken ? 'Token will be auto-injected (click to disable)' : 'Auto-inject session token'}
          >
            <Icon name="key" size={12} />
          </button>

          {/* Work summaries */}
          <WorkSummaryBadge sessionId={tab.sessionId} />

          {/* Session ID */}
          {tab.sessionId && (
            <button
              onClick={() => { navigator.clipboard.writeText(tab.sessionId!); }}
              className="shrink-0 h-7 flex items-center gap-0.5 px-1 rounded-lg text-[9px] font-mono text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-all ml-auto"
              title={`Session: ${tab.sessionId}\nClick to copy`}
            >
              <Icon name="hash" size={10} />
              <span>{tab.sessionId.slice(0, 6)}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function AIAssistantPanel() {
  const tabs = useAssistantChatStore((s) => s.tabs);
  const activeTabId = useAssistantChatStore((s) => s.activeTabId);
  const store = useAssistantChatStore;
  const [bridge, setBridge] = useState<BridgeStatus | null>(null);
  const [bridgeStarting, setBridgeStarting] = useState(false);
  const [profiles, setProfiles] = useState<UnifiedProfile[]>([]);
  const profileLabels = useMemo(
    () => new Map(profiles.map((profile) => [profile.id, profile.label] as const)),
    [profiles],
  );

  // Load unified profiles
  const refreshProfiles = useCallback(() => {
    pixsimClient.get<{ profiles: UnifiedProfile[] }>('/dev/agent-profiles', { params: { include_global: true } })
      .then((r) => setProfiles(r.profiles))
      .catch(() => {});
  }, []);

  useEffect(() => { refreshProfiles(); }, [refreshProfiles]);

  // Poll bridge — auto-reconnect if it drops unexpectedly (e.g. backend restart)
  const bridgeWasConnectedRef = useRef(false);
  const bridgeManualStopRef = useRef(false);
  useEffect(() => {
    const pollHeaders = { 'X-Client-Surface': 'panel:ai-assistant' };
    const poll = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      pixsimClient.get<BridgeStatus>('/meta/agents/bridge', { headers: pollHeaders }).then((status) => {
        const wasConnected = bridgeWasConnectedRef.current;
        const isConnected = status.connected > 0;
        bridgeWasConnectedRef.current = isConnected;

        if (wasConnected && !isConnected && !bridgeManualStopRef.current && !status.process_alive) {
          // Bridge process died unexpectedly — auto-reconnect
          pixsimClient.post('/meta/agents/bridge/start', { pool_size: 1, claude_args: '--dangerously-skip-permissions' }).catch(() => {});
        }
        if (isConnected) bridgeManualStopRef.current = false;
        setBridge(status);
      }).catch(() => setBridge(null));
    };
    poll();
    const interval = setInterval(poll, 8_000);
    return () => clearInterval(interval);
  }, []);

  const setActiveTab = useCallback((id: string | null) => {
    store.getState().setActiveTab(id);
  }, []);

  const createTab = useCallback((profileId?: string) => {
    const id = createTabId();
    const resolvedProfileId = profileId || profiles.find((p) => p.is_default)?.id || profiles[0]?.id || null;
    const profile = resolvedProfileId ? profiles.find((p) => p.id === resolvedProfileId) : undefined;
    const newTab: ChatTab = {
      id,
      label: profile?.label || 'New Chat',
      sessionId: null,
      profileId: resolvedProfileId,
      engine: (profile ? engineFromProfile(profile) : 'claude') as AgentEngine,
      modelOverride: null,
      usePersona: true,
      customInstructions: '',
      focusAreas: [],
      injectToken: Boolean(resolvedProfileId),
      planId: null,
      createdAt: new Date().toISOString(),
    };
    store.getState().addTab(newTab);
    store.getState().setActiveTab(id);
  }, [profiles]);

  const closeTab = useCallback((tabId: string) => {
    const s = store.getState();
    if (activeTabId === tabId) {
      const remaining = s.tabs.filter((t) => t.id !== tabId);
      s.setActiveTab(remaining[0]?.id ?? null);
    }
    s.closeTab(tabId);
  }, [activeTabId]);

  const updateTab = useCallback((tabId: string, updates: Partial<ChatTab>) => {
    store.getState().updateTab(tabId, updates);
  }, []);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const connected = bridge?.connected ?? 0;
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Auto-create a tab if none exist
  useEffect(() => {
    if (tabs.length === 0) createTab();
  }, [tabs.length, createTab]);

  // Listen for resume-session events from other panels (e.g. Agent Observability)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<ResumeSessionDetail>).detail;
      if (!detail?.sessionId) return;
      // Reuse existing tab if one with the same sessionId already exists
      const existing = tabs.find((t) => t.sessionId === detail.sessionId);
      if (existing) { setActiveTab(existing.id); return; }
      const profile = detail.profileId ? profiles.find((p) => p.id === detail.profileId) : undefined;
      const newTab = buildResumedTab({
        id: detail.sessionId,
        engine: detail.engine,
        label: detail.label || profile?.label || 'Resumed',
        profile_id: detail.profileId,
      });
      const s = useAssistantChatStore.getState();
      s.addTab(newTab);
      s.setActiveTab(newTab.id);
      fetchServerMessages(detail.sessionId).then((serverMsgs) => {
        if (serverMsgs.length > 0) useAssistantChatStore.getState().setMessages(newTab.id, serverMsgs);
      });
    };
    window.addEventListener(RESUME_SESSION_EVENT, handler);
    return () => window.removeEventListener(RESUME_SESSION_EVENT, handler);
  }, [tabs, profiles]);

  // Listen for open-plan-chat events (e.g. from Plan panel "Start Chat" button)
  useEffect(() => {
    const handler = (e: Event) => {
      const { planId, planTitle } = (e as CustomEvent<OpenPlanChatDetail>).detail ?? {};
      if (!planId) return;
      // Reuse existing tab if one is already bound to this plan
      const existing = tabs.find((t) => t.planId === planId);
      if (existing) { setActiveTab(existing.id); return; }
      // Create new tab pre-bound to the plan
      const id = createTabId();
      const defaultProfile = profiles.find((p) => p.is_default) || profiles[0];
      const newTab: ChatTab = {
        id,
        label: planTitle ? `Plan: ${planTitle}` : `Plan: ${planId}`,
        sessionId: null,
        profileId: defaultProfile?.id ?? null,
        engine: (defaultProfile ? engineFromProfile(defaultProfile) : 'claude') as AgentEngine,
        modelOverride: null,
        usePersona: true,
        customInstructions: '',
        focusAreas: [],
        injectToken: Boolean(defaultProfile?.id),
        planId,
        createdAt: new Date().toISOString(),
      };
      const s = useAssistantChatStore.getState();
      s.addTab(newTab);
      s.setActiveTab(id);
      // Pre-fill the input with @plan: reference so scope flows on first message
      s.setDraft(id, `@plan:${planId} `);
    };
    window.addEventListener(OPEN_PLAN_CHAT_EVENT, handler);
    return () => window.removeEventListener(OPEN_PLAN_CHAT_EVENT, handler);
  }, [tabs, profiles]);

  // Group tabs: plan-bound first (grouped by planId), then ungrouped
  const { planGroups, ungroupedTabs } = useMemo(() => {
    const byPlan = new Map<string, ChatTab[]>();
    const ungrouped: ChatTab[] = [];
    for (const tab of tabs) {
      if (tab.planId) {
        const group = byPlan.get(tab.planId) ?? [];
        group.push(tab);
        byPlan.set(tab.planId, group);
      } else {
        ungrouped.push(tab);
      }
    }
    return {
      planGroups: Array.from(byPlan.entries()).map(([planId, items]) => ({ planId, items })),
      ungroupedTabs: ungrouped,
    };
  }, [tabs]);

  const commitRename = useCallback((tabId: string, value: string) => {
    const trimmed = value.trim();
    if (trimmed) updateTab(tabId, { label: trimmed });
    setRenamingTabId(null);
  }, [updateTab]);

  const renderSessionItem = useCallback((tab: ChatTab, isActive: boolean) => {
    const tabProfile = profiles.find((p) => p.id === tab.profileId);
    const tabIcon = resolveProfileIcon(
      tab.engine,
      tabProfile?.icon || (tabProfile && tabProfile.id.startsWith('assistant:') ? 'messageSquare' : 'cpu'),
    );
    const bridgeReq = chatBridge.get(tab.id);
    const isSending = bridgeReq?.status === 'pending' || bridgeReq?.status === 'streaming';
    const isRenaming = renamingTabId === tab.id;

    return (
      <div
        key={tab.id}
        role="option"
        aria-selected={isActive}
        onClick={() => setActiveTab(tab.id)}
        onKeyDown={(e) => { if (e.key === 'Enter') setActiveTab(tab.id); }}
        tabIndex={0}
        className={`group flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${
          isActive
            ? 'bg-blue-50 dark:bg-blue-950/40 text-neutral-900 dark:text-neutral-100'
            : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
        }`}
      >
        <div className="relative shrink-0">
          <EngineProfileIcon engine={tab.engine} icon={tabIcon} size={12} />
          {isSending && (
            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          {isRenaming ? (
            <input
              autoFocus
              className="w-full text-[11px] font-medium bg-white dark:bg-neutral-800 border border-blue-300 dark:border-blue-600 rounded px-1 py-0 outline-none"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={() => commitRename(tab.id, renameValue)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') commitRename(tab.id, renameValue);
                if (e.key === 'Escape') setRenamingTabId(null);
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <div
              className="text-[11px] font-medium truncate"
              onDoubleClick={(e) => { e.stopPropagation(); setRenamingTabId(tab.id); setRenameValue(tab.label); }}
            >
              {tab.label}
            </div>
          )}
          {tab.profileId && tabProfile && !isRenaming && (
            <div className="text-[9px] text-neutral-400 dark:text-neutral-500 truncate">{tabProfile.label}</div>
          )}
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); setRenamingTabId(tab.id); setRenameValue(tab.label); }}
            className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
            title="Rename"
          >
            <Icon name="edit" size={10} />
          </button>
          {tabs.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
              className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
              title="Close"
            >
              <Icon name="x" size={10} />
            </button>
          )}
        </div>
      </div>
    );
  }, [profiles, tabs.length, closeTab, setActiveTab]);

  return (
    <div className="flex h-full min-h-0 bg-white dark:bg-neutral-950">
      {/* Left sidebar */}
      <SidebarPaneShell
        title="Chats"
        collapsible
        resizable
        expandedWidth={200}
        persistKey="ai-assistant:sidebar"
        variant="light"
        bodyScrollable={false}
      >
        <div className="flex flex-col h-full min-h-0">
          {/* Session list */}
          <div className="flex-1 overflow-y-auto px-1 py-1 space-y-0.5">
            {/* Plan-bound groups */}
            {planGroups.map(({ planId, items }) => (
              <div key={planId}>
                <button
                  type="button"
                  onClick={() => navigateToPlan(planId)}
                  className="flex items-center gap-1 px-1.5 py-1 text-[9px] uppercase tracking-wide font-medium text-green-600 dark:text-green-400 hover:underline w-full text-left"
                >
                  <Icon name="clipboard" size={9} className="shrink-0" />
                  <span className="truncate">{planId}</span>
                  <Badge color="green" className="text-[8px] ml-auto">{items.length}</Badge>
                </button>
                {items.map((tab) => renderSessionItem(tab, tab.id === activeTabId))}
              </div>
            ))}

            {/* Ungrouped chats */}
            {ungroupedTabs.length > 0 && planGroups.length > 0 && (
              <div className="flex items-center gap-1 px-1.5 py-1 text-[9px] uppercase tracking-wide font-medium text-neutral-400 dark:text-neutral-500">
                <Icon name="messageSquare" size={9} className="shrink-0" />
                <span>Chats</span>
                <Badge color="gray" className="text-[8px] ml-auto">{ungroupedTabs.length}</Badge>
              </div>
            )}
            {ungroupedTabs.map((tab) => renderSessionItem(tab, tab.id === activeTabId))}

            {tabs.length === 0 && (
              <div className="px-2 py-4 text-[10px] text-neutral-400 text-center">No chats yet</div>
            )}
          </div>

          {/* Sidebar footer: actions + status */}
          <div className="shrink-0 border-t border-neutral-200 dark:border-neutral-700 px-2 py-1.5 flex items-center gap-1.5">
            <button onClick={() => createTab()} className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300" title="New chat">
              <Icon name="plus" size={13} />
            </button>
            <ResumeSessionPicker profileId={activeTab?.profileId} profileLabels={profileLabels} onResume={(sessionId, engine, label, resumeProfileId, lastPlanId) => {
              const existing = tabs.find((t) => t.sessionId === sessionId);
              if (existing) { setActiveTab(existing.id); return; }
              const newTab = buildResumedTab({ id: sessionId, engine, label, profile_id: resumeProfileId, last_plan_id: lastPlanId });
              const s = useAssistantChatStore.getState();
              s.addTab(newTab);
              s.setActiveTab(newTab.id);
              fetchServerMessages(sessionId).then((serverMsgs) => {
                if (serverMsgs.length > 0) useAssistantChatStore.getState().setMessages(newTab.id, serverMsgs);
              });
            }} />
            <div className="ml-auto flex items-center gap-1">
              {connected === 0 && !bridge?.process_alive && (
                <button
                  onClick={() => { setBridgeStarting(true); pixsimClient.post('/meta/agents/bridge/start', { pool_size: 1, claude_args: '--dangerously-skip-permissions' }).catch(() => {}); setTimeout(() => setBridgeStarting(false), 5000); }}
                  disabled={bridgeStarting}
                  className="text-[9px] px-1.5 py-0.5 rounded bg-accent text-white hover:bg-accent/90 disabled:opacity-50"
                >
                  {bridgeStarting ? '...' : 'Connect'}
                </button>
              )}
              {connected > 0 ? (
                <button
                  onClick={() => { bridgeManualStopRef.current = true; pixsimClient.post('/meta/agents/bridge/stop').catch(() => {}); }}
                  className="w-2 h-2 rounded-full bg-green-500 hover:bg-red-500 transition-colors cursor-pointer"
                  title="Connected - click to disconnect"
                />
              ) : bridge?.process_alive ? (
                <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" title="Connecting..." />
              ) : (
                <div className="w-1.5 h-1.5 rounded-full bg-neutral-300" title="Offline" />
              )}
            </div>
          </div>
        </div>
      </SidebarPaneShell>

      {/* Chat content area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {activeTab ? (
          <TabChatView
            key={activeTab.id}
            tab={activeTab}
            onUpdateTab={(updates) => updateTab(activeTab.id, updates)}
            bridge={bridge}
            profiles={profiles}
            onRefreshProfiles={refreshProfiles}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <EmptyState message="No chat sessions" />
          </div>
        )}
      </div>
    </div>
  );
}
