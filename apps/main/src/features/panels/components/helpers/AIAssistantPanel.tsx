/**
 * AI Assistant Panel — tabbed chat panel with agent profile binding.
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
} from '@pixsim7/shared.ui';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import { pixsimClient } from '@lib/api/client';
import { Icon, type IconName } from '@lib/icons';
import { useReferences, useReferenceInput, ReferencePicker } from '@lib/references';

import { chatBridge } from './assistantChatBridge';


// =============================================================================
// Types
// =============================================================================

interface BridgeStatus { connected: number; available: number }
/** Unified profile — both agent identity and assistant persona */
interface UnifiedProfile {
  id: string;
  label: string;
  description: string | null;
  icon: string | null;
  agent_type: string;
  system_prompt: string | null;
  audience: string;
  status: string;
  is_default: boolean;
  is_global: boolean;
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'error' | 'system';
  text: string;
  duration_ms?: number;
  timestamp: Date;
}

/** Supported agent engines */
type AgentEngine = 'claude' | 'codex' | 'api';
const AGENT_ENGINES: { id: AgentEngine; label: string; icon: IconName }[] = [
  { id: 'claude', label: 'Claude', icon: 'messageSquare' },
  { id: 'codex', label: 'Codex', icon: 'cpu' },
  { id: 'api', label: 'API', icon: 'zap' },
];

/** A single chat tab */
interface ChatTab {
  id: string;
  label: string;
  sessionId: string | null;    // conversation UUID (assigned by agent)
  profileId: string | null;    // persona profile ID (system prompt, scope, etc.)
  engine: AgentEngine;         // which agent command to use
  usePersona: boolean;         // whether to inject profile persona
  createdAt: string;
}

// =============================================================================
// Persistence
// =============================================================================

const TABS_KEY = 'ai-assistant:tabs';
const ACTIVE_TAB_KEY = 'ai-assistant:active-tab';
const DRAFT_KEY_PREFIX = 'ai-assistant:draft:';
const MSG_KEY_PREFIX = 'ai-assistant:msg:';
const INJECT_PROMPT_EVENT = 'ai-assistant:inject-prompt';
// Legacy keys for migration
const LEGACY_SESSIONS_KEY = 'ai-assistant:sessions';
const LEGACY_ACTIVE_SESSION_KEY = 'ai-assistant:active-session';

interface InjectPromptDetail {
  prompt: string;
  mode?: 'replace' | 'append';
}

function loadTabs(): ChatTab[] {
  try {
    const raw = localStorage.getItem(TABS_KEY);
    if (raw) return (JSON.parse(raw) as ChatTab[]).map((t) => ({ usePersona: true, engine: 'claude' as AgentEngine, ...t }));
  } catch { /* ignore */ }

  // Migrate from legacy sessions → tabs (one-time)
  try {
    const legacySessions = localStorage.getItem(LEGACY_SESSIONS_KEY);
    if (legacySessions) {
      const sessions = JSON.parse(legacySessions) as Array<{ id: string; label: string; lastUsed: string; messageCount: number }>;
      const tabs: ChatTab[] = sessions.map((s) => ({
        id: s.id,
        label: s.label,
        sessionId: s.id,
        assistantProfileId: null,
        agentProfileId: null,
        createdAt: s.lastUsed,
      }));
      if (tabs.length > 0) {
        persistTabs(tabs);
        // Clean up legacy keys
        localStorage.removeItem(LEGACY_SESSIONS_KEY);
        localStorage.removeItem(LEGACY_ACTIVE_SESSION_KEY);
        return tabs;
      }
    }
  } catch { /* ignore */ }

  return [];
}

function persistTabs(tabs: ChatTab[]) {
  try { localStorage.setItem(TABS_KEY, JSON.stringify(tabs.slice(0, 20))); }
  catch { /* ignore */ }
}

function getActiveTabId(): string | null {
  try { return localStorage.getItem(ACTIVE_TAB_KEY); }
  catch { return null; }
}

function setActiveTabId(id: string | null) {
  try {
    if (id) localStorage.setItem(ACTIVE_TAB_KEY, id);
    else localStorage.removeItem(ACTIVE_TAB_KEY);
  } catch { /* ignore */ }
}

function msgKey(tabId: string): string { return `${MSG_KEY_PREFIX}${tabId}`; }
function draftKey(tabId: string): string { return `${DRAFT_KEY_PREFIX}${tabId}`; }

function parseMessages(raw: string | null): ChatMessage[] {
  if (!raw) return [];
  try {
    return (JSON.parse(raw) as Array<Record<string, unknown>>).map((m) => ({
      role: m.role as ChatMessage['role'],
      text: m.text as string,
      duration_ms: m.duration_ms as number | undefined,
      timestamp: new Date(m.timestamp as string),
    }));
  } catch { return []; }
}

function loadTabMessages(tabId: string): ChatMessage[] {
  try { return parseMessages(localStorage.getItem(msgKey(tabId))); }
  catch { return []; }
}

function persistTabMessages(tabId: string, messages: ChatMessage[]) {
  try { localStorage.setItem(msgKey(tabId), JSON.stringify(messages.slice(-50))); }
  catch { /* ignore */ }
}

function loadTabDraft(tabId: string): string {
  try { return localStorage.getItem(draftKey(tabId)) || ''; }
  catch { return ''; }
}

function persistTabDraft(tabId: string, text: string) {
  try {
    if (text) localStorage.setItem(draftKey(tabId), text);
    else localStorage.removeItem(draftKey(tabId));
  } catch { /* ignore */ }
}

function createTabId(): string {
  return `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
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
  const regex = /(\*\*(.+?)\*\*|`([^`]+)`|\*(.+?)\*)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    if (match[2]) parts.push(<strong key={parts.length}>{match[2]}</strong>);
    else if (match[3]) parts.push(<code key={parts.length} className="px-1 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700 text-[11px] font-mono">{match[3]}</code>);
    else if (match[4]) parts.push(<em key={parts.length}>{match[4]}</em>);
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
        const res = await pixsimClient.post<{ profile: UnifiedProfile }>('/dev/agent-profiles', {
          id: slug, label: label.trim(), description: description.trim() || null,
          icon: icon.trim() || null, system_prompt: systemPrompt.trim() || null,
          agent_type: 'claude-cli', audience: 'user',
        });
        onSave(res.profile);
      } else {
        const updates: Record<string, unknown> = {};
        if (label !== profile.label) updates.label = label.trim();
        if (description !== (profile.description || '')) updates.description = description.trim() || null;
        if (icon !== (profile.icon || '')) updates.icon = icon.trim() || null;
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
  }, [isNew, id, label, description, icon, systemPrompt, profile, onSave, onCancel]);

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
  label: string;
  message_count: number;
  last_used_at: string;
}

function ResumeSessionPicker({ onResume }: {
  onResume: (sessionId: string, engine: string, label: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<ChatSessionEntry[]>([]);
  const [filter, setFilter] = useState<string>('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    pixsimClient.get<{ sessions: ChatSessionEntry[] }>('/meta/agents/chat-sessions', { params: { limit: 30 } })
      .then((r) => setSessions(r.sessions))
      .catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = filter
    ? sessions.filter((s) => s.engine === filter)
    : sessions;

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
            {AGENT_ENGINES.map((e) => (
              <button key={e.id} onClick={() => setFilter(e.id)} className={`px-1.5 py-0.5 text-[9px] rounded ${filter === e.id ? 'bg-accent text-white' : 'text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800'}`}>{e.label}</button>
            ))}
          </div>

          {filtered.length === 0 && (
            <div className="p-3 text-center text-[11px] text-neutral-500">No sessions found</div>
          )}

          {filtered.map((s) => (
            <button
              key={s.id}
              onClick={() => { onResume(s.id, s.engine, s.label); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800 border-b border-neutral-50 dark:border-neutral-800/50 last:border-0"
            >
              <Icon name={AGENT_ENGINES.find((e) => e.id === s.engine)?.icon ?? 'messageSquare'} size={11} className="shrink-0 text-neutral-400" />
              <div className="flex-1 min-w-0">
                <div className="text-[11px] text-neutral-700 dark:text-neutral-300 truncate">{s.label}</div>
                <div className="text-[9px] text-neutral-400">
                  {s.message_count} msgs · {new Date(s.last_used_at).toLocaleDateString()} {new Date(s.last_used_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
              <span className="text-[8px] text-neutral-400 uppercase shrink-0">{s.engine}</span>
            </button>
          ))}
        </div>
      )}
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
// Message Bubble
// =============================================================================

function MessageBubble({ msg, onRetry }: { msg: ChatMessage; onRetry?: () => void }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(msg.text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  }, [msg.text]);

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
    <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} group`}>
      <div className={`max-w-[85%] rounded-xl px-3 py-2 ${
        msg.role === 'user' ? 'bg-accent text-white'
          : msg.role === 'error' ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
          : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100'
      }`}>
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
// Quick Shortcuts
// =============================================================================

const QUICK_SHORTCUTS = [
  { label: 'What can you help with?', prompt: 'What capabilities do you have? What can I ask you to do?', icon: 'compass' as IconName },
  { label: 'List my assets', prompt: 'List my most recent assets with their types and status.', icon: 'image' as IconName },
  { label: 'Generation status', prompt: 'What generations are currently running or recently completed?', icon: 'sparkles' as IconName },
  { label: 'List characters', prompt: 'List the characters in the current world with their basic info.', icon: 'user' as IconName },
];

// =============================================================================
// Tab Chat View — one per tab, owns its own message state
// =============================================================================

function TabChatView({ tab, onUpdateTab, bridge, profiles, onRefreshProfiles }: {
  tab: ChatTab;
  onUpdateTab: (updates: Partial<ChatTab>) => void;
  bridge: BridgeStatus | null;
  profiles: UnifiedProfile[];
  onRefreshProfiles: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadTabMessages(tab.id));
  const [input, setInput] = useState(() => loadTabDraft(tab.id));
  const [actionPickerOpen, setActionPickerOpen] = useState(false);

  // Sending state derived from the bridge singleton (survives unmount)
  useSyncExternalStore(chatBridge.subscribe.bind(chatBridge), chatBridge.getSnapshot.bind(chatBridge));
  const bridgeReq = chatBridge.get(tab.id);
  const sending = bridgeReq?.status === 'pending' || bridgeReq?.status === 'streaming';
  const activity = bridgeReq?.activity ?? null;

  // Consume completed/error results (may have arrived while panel was closed)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- runs every render; consume is idempotent
  useEffect(() => {
    if (!bridgeReq || (bridgeReq.status !== 'completed' && bridgeReq.status !== 'error')) return;
    const result = chatBridge.consume(tab.id);
    if (!result) return;

    if (result.error === 'cancelled') {
      setMessages((m) => [...m, { role: 'system', text: 'Request cancelled', timestamp: new Date() }]);
    } else if (result.ok && result.response) {
      const prevSessionId = tab.sessionId;
      if (result.claude_session_id && result.claude_session_id !== prevSessionId) {
        onUpdateTab({ sessionId: result.claude_session_id });
        if (prevSessionId) {
          setMessages((m) => [...m, { role: 'system', text: 'New session — previous conversation not available', timestamp: new Date() }]);
        }
      } else if (result.claude_session_id && prevSessionId && result.claude_session_id === prevSessionId) {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === 'system' && last.text.startsWith('Reconnected')) {
            return [...prev.slice(0, -1), { ...last, text: `Session resumed (verified: ${prevSessionId.slice(0, 8)})` }];
          }
          return prev;
        });
      }
      setMessages((m) => [...m, { role: 'assistant', text: result.response!, duration_ms: result.duration_ms, timestamp: new Date() }]);
      if (!tab.sessionId) {
        // Use the first user message as tab label
        const lastUserMsg = messages.findLast((m) => m.role === 'user');
        if (lastUserMsg) onUpdateTab({ label: lastUserMsg.text.slice(0, 30) });
      }
    } else {
      setMessages((m) => [...m, { role: 'error', text: result.error || 'No response from agent', timestamp: new Date() }]);
    }
  });

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
      setMessages((m) => [...m, { role: 'system', text: label, timestamp: new Date() }]);
    } else if (connected === 0 && prev > 0 && messages.length > 0) {
      sawDisconnectRef.current = true;
      setMessages((m) => [...m, { role: 'system', text: 'Bridge disconnected', timestamp: new Date() }]);
    }
  }, [connected]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist (guard: don't wipe messages on transient empty state from HMR remount)
  const hasPersistedRef = useRef(false);
  useEffect(() => {
    if (messages.length > 0 || hasPersistedRef.current) {
      persistTabMessages(tab.id, messages);
      hasPersistedRef.current = true;
    }
  }, [messages, tab.id]);
  useEffect(() => { persistTabDraft(tab.id, input); }, [input, tab.id]);

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
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text, timestamp: new Date() }]);

    const body: Record<string, unknown> = { message: text, timeout: 120, engine: tab.engine };
    if (tab.profileId) body.assistant_id = tab.profileId;
    if (tab.sessionId) body.claude_session_id = tab.sessionId;
    if (tab.profileId && !tab.usePersona) body.skip_persona = true;

    // Fire-and-forget — the bridge singleton manages the SSE fetch.
    // Results are consumed by the useEffect above, even if the panel unmounts.
    void chatBridge.send(tab.id, body);
  }, [sending, tab.id, tab.profileId, tab.sessionId, tab.engine, tab.usePersona]);

  const retryLast = useCallback(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        setMessages(messages.slice(0, i));
        void sendMessage(messages[i].text);
        return;
      }
    }
  }, [messages, sendMessage]);

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
  const profileDisplay = activeProfile?.label || 'General';
  const isAgentProfile = activeProfile && !activeProfile.id.startsWith('assistant:');

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto min-h-0 p-3 space-y-3">
        {messages.length === 0 && connected > 0 && (
          <div className="space-y-3">
            <EmptyState message="Ask anything or pick an action" size="sm" />
            <div className="flex flex-wrap gap-1.5 justify-center">
              {QUICK_SHORTCUTS.map((s) => (
                <button key={s.label} onClick={() => void sendMessage(s.prompt)} disabled={sending}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-full border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors disabled:opacity-50">
                  <Icon name={s.icon} size={12} />{s.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.length === 0 && connected === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-8">
            <EmptyState message="AI assistant is offline" description="Start an agent bridge to connect" size="sm" />
            <Button size="sm" onClick={() => { pixsimClient.post('/meta/agents/bridge/start', { pool_size: 1, claude_args: '--dangerously-skip-permissions' }).catch(() => {}); }}>
              <Icon name="play" size={12} className="mr-1.5" />Start Bridge
            </Button>
          </div>
        )}
        {messages.map((msg, i) => (
          <MessageBubble key={i} msg={msg} onRetry={msg.role === 'error' ? retryLast : undefined} />
        ))}
        {sending && (
          <div className="flex justify-start gap-2 items-end">
            <div className="bg-neutral-100 dark:bg-neutral-800 rounded-xl px-3 py-2">
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  <div className="w-1.5 h-1.5 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-1.5 h-1.5 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-1.5 h-1.5 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                {activity && <span className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate max-w-[200px]">{activity}</span>}
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
        <div className="flex gap-1.5 items-end">
          <button onClick={() => setActionPickerOpen(!actionPickerOpen)} disabled={connected === 0}
            className={`shrink-0 w-8 h-8 flex items-center justify-center rounded-lg transition-colors disabled:opacity-30 ${actionPickerOpen ? 'bg-accent text-white' : 'text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'}`}
            title="Browse actions">
            <Icon name="plus" size={16} />
          </button>

          {/* Engine toggle */}
          <button
            disabled={sending}
            onClick={() => {
              const idx = AGENT_ENGINES.findIndex((e) => e.id === tab.engine);
              const next = AGENT_ENGINES[(idx + 1) % AGENT_ENGINES.length];
              onUpdateTab({ engine: next.id, sessionId: null }); // new engine = new session
            }}
            className="shrink-0 h-8 flex items-center gap-1 px-1.5 rounded-lg text-[10px] text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors disabled:opacity-40 disabled:pointer-events-none"
            title={sending ? 'Cannot switch while processing' : `Engine: ${AGENT_ENGINES.find((e) => e.id === tab.engine)?.label ?? tab.engine} (click to switch)`}
          >
            <Icon name={AGENT_ENGINES.find((e) => e.id === tab.engine)?.icon ?? 'cpu'} size={11} />
            <span className="text-[9px] uppercase tracking-wide">{tab.engine}</span>
          </button>

          {/* Profile picker */}
          <div className="relative shrink-0" ref={profilePickerRef}>
            <button
              disabled={sending}
              onClick={() => { setShowProfilePicker(!showProfilePicker); setEditingProfile(null); }}
              className={`h-8 flex items-center gap-1 px-1.5 rounded-lg text-[10px] transition-colors disabled:opacity-40 disabled:pointer-events-none ${
                showProfilePicker ? 'bg-accent text-white' : 'text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800'
              }`}
              title={`Profile: ${profileDisplay}`}
            >
              <Icon name={(activeProfile?.icon || (isAgentProfile ? 'cpu' : 'messageSquare')) as IconName} size={12} />
              <span className="max-w-[60px] truncate">{profileDisplay}</span>
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

                    {tab.profileId && <div className="border-t border-neutral-100 dark:border-neutral-800" />}

                    {/* General (no profile) */}
                    <button
                      onClick={() => { onUpdateTab({ profileId: null }); setShowProfilePicker(false); }}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-left hover:bg-neutral-50 dark:hover:bg-neutral-800 ${
                        !tab.profileId ? 'bg-blue-50/50 dark:bg-blue-900/10 text-blue-600' : 'text-neutral-600 dark:text-neutral-400'
                      }`}
                    >
                      <Icon name="messageSquare" size={12} className="shrink-0" />
                      <span>General</span>
                    </button>
                    <div className="border-t border-neutral-100 dark:border-neutral-800" />

                    {/* Profile list with edit + token buttons */}
                    {profiles.map((p) => (
                      <div
                        key={p.id}
                        className={`group w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-left hover:bg-neutral-50 dark:hover:bg-neutral-800 ${
                          tab.profileId === p.id ? 'bg-blue-50/50 dark:bg-blue-900/10 text-blue-600' : 'text-neutral-600 dark:text-neutral-400'
                        }`}
                      >
                        <button
                          onClick={() => { onUpdateTab({ profileId: p.id, usePersona: true }); setShowProfilePicker(false); }}
                          className="flex items-center gap-2 flex-1 min-w-0"
                        >
                          <Icon name={(p.icon || (p.id.startsWith('assistant:') ? 'messageSquare' : 'cpu')) as IconName} size={12} className="shrink-0" />
                          <span className="truncate">{p.label}</span>
                        </button>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              const res = await pixsimClient.post<{ access_token: string }>(`/dev/agent-profiles/${p.id}/token`, null, { params: { hours: 24, scope: 'dev' } });
                              await navigator.clipboard.writeText(res.access_token);
                              setMessages((prev) => [...prev, { role: 'system', text: `Token minted for ${p.label} (24h, copied to clipboard)`, timestamp: new Date() }]);
                              setShowProfilePicker(false);
                            } catch {
                              setMessages((prev) => [...prev, { role: 'error', text: `Failed to mint token for ${p.label}`, timestamp: new Date() }]);
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

          <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown}
            placeholder={connected > 0 ? 'Ask something... (@ to reference)' : 'No agent connected'}
            disabled={connected === 0 || sending} rows={1}
            className="flex-1 px-3 py-2 text-sm rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 resize-none focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
            style={{ minHeight: '36px', maxHeight: '120px' }}
            onInput={handleTextareaInput}
          />
          <Button size="sm" onClick={() => void sendMessage(input)} disabled={connected === 0 || sending || !input.trim()} className="shrink-0">
            <Icon name="send" size={14} />
          </Button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function AIAssistantPanel() {
  const [tabs, setTabs] = useState<ChatTab[]>(loadTabs);
  const [activeTabId, setActiveTabIdState] = useState<string | null>(() => {
    const stored = getActiveTabId();
    // Ensure the stored tab still exists
    const loaded = loadTabs();
    if (stored && loaded.some((t) => t.id === stored)) return stored;
    return loaded[0]?.id ?? null;
  });
  const [bridge, setBridge] = useState<BridgeStatus | null>(null);
  const [bridgeStarting, setBridgeStarting] = useState(false);
  const [profiles, setProfiles] = useState<UnifiedProfile[]>([]);

  // Persist tabs
  useEffect(() => { persistTabs(tabs); }, [tabs]);

  // Load unified profiles
  const refreshProfiles = useCallback(() => {
    pixsimClient.get<{ profiles: UnifiedProfile[] }>('/dev/agent-profiles', { params: { include_global: true } })
      .then((r) => setProfiles(r.profiles))
      .catch(() => {});
  }, []);

  useEffect(() => { refreshProfiles(); }, [refreshProfiles]);

  // Poll bridge
  useEffect(() => {
    const poll = () => { pixsimClient.get<BridgeStatus>('/meta/agents/bridge').then(setBridge).catch(() => setBridge(null)); };
    poll();
    const interval = setInterval(poll, 8_000);
    return () => clearInterval(interval);
  }, []);

  const setActiveTab = useCallback((id: string | null) => {
    setActiveTabIdState(id);
    setActiveTabId(id);
  }, []);

  const createTab = useCallback((profileId?: string) => {
    const id = createTabId();
    const profile = profileId ? profiles.find((p) => p.id === profileId) : undefined;
    const newTab: ChatTab = {
      id,
      label: profile?.label || 'New Chat',
      sessionId: null,
      profileId: profileId || null,
      engine: 'claude',
      usePersona: true,
      createdAt: new Date().toISOString(),
    };
    setTabs((prev) => [newTab, ...prev]);
    setActiveTab(id);
  }, [profiles, setActiveTab]);

  const closeTab = useCallback((tabId: string) => {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== tabId);
      if (activeTabId === tabId) {
        const newActive = next[0]?.id ?? null;
        setActiveTab(newActive);
      }
      // Clean up storage
      try {
        localStorage.removeItem(msgKey(tabId));
        localStorage.removeItem(draftKey(tabId));
      } catch { /* ignore */ }
      return next;
    });
  }, [activeTabId, setActiveTab]);

  const updateTab = useCallback((tabId: string, updates: Partial<ChatTab>) => {
    setTabs((prev) => prev.map((t) => t.id === tabId ? { ...t, ...updates } : t));
  }, []);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const connected = bridge?.connected ?? 0;

  // Auto-create a tab if none exist
  useEffect(() => {
    if (tabs.length === 0) createTab();
  }, [tabs.length, createTab]);

  return (
    <div className="flex flex-col h-full min-h-0 bg-white dark:bg-neutral-950">
      {/* Tab bar */}
      <div className="flex items-center border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 min-h-[32px] shrink-0">
        <div className="flex-1 flex items-center overflow-x-auto scrollbar-none">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            const tabProfile = profiles.find((p) => p.id === tab.profileId);
            const tabIcon = (tabProfile?.icon || (tabProfile && tabProfile.id.startsWith('assistant:') ? 'messageSquare' : 'cpu')) as IconName;
            return (
              <div
                key={tab.id}
                role="tab"
                tabIndex={0}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={(e) => { if (e.key === 'Enter') setActiveTab(tab.id); }}
                className={`group flex items-center gap-1.5 px-3 py-1.5 text-[11px] border-r border-neutral-200 dark:border-neutral-800 shrink-0 transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100'
                    : 'text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                }`}
              >
                <Icon name={tabIcon} size={10} className={isActive ? 'text-accent' : 'text-neutral-400'} />
                <span className="max-w-[80px] truncate">{tab.label}</span>
                {tabs.length > 1 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                    className="opacity-0 group-hover:opacity-100 text-neutral-400 hover:text-neutral-600 transition-opacity"
                  >
                    <Icon name="x" size={8} />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* New tab + resume + status */}
        <div className="flex items-center gap-1 px-2 shrink-0">
          <button onClick={() => createTab()} className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300" title="New chat">
            <Icon name="plus" size={12} />
          </button>
          <ResumeSessionPicker onResume={(sessionId, engine, label) => {
            const id = createTabId();
            const newTab: ChatTab = { id, label: label || 'Resumed', sessionId, profileId: null, engine: (engine || 'claude') as AgentEngine, usePersona: true, createdAt: new Date().toISOString() };
            setTabs((prev) => [newTab, ...prev]);
            setActiveTab(id);
          }} />
          {connected === 0 && (
            <button
              onClick={() => { setBridgeStarting(true); pixsimClient.post('/meta/agents/bridge/start', { pool_size: 1, claude_args: '--dangerously-skip-permissions' }).catch(() => {}); setTimeout(() => setBridgeStarting(false), 5000); }}
              disabled={bridgeStarting}
              className="text-[9px] px-1.5 py-0.5 rounded bg-accent text-white hover:bg-accent/90 disabled:opacity-50"
            >
              {bridgeStarting ? '...' : 'Connect'}
            </button>
          )}
          <div className={`w-1.5 h-1.5 rounded-full ${connected > 0 ? 'bg-green-500' : 'bg-neutral-300'}`} title={connected > 0 ? 'Connected' : 'Offline'} />
        </div>
      </div>

      {/* Active tab content */}
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
          <EmptyState message="No chat tabs" />
        </div>
      )}
    </div>
  );
}
