/**
 * AI Assistant Panel — user-facing floating chat panel.
 *
 * Features:
 * - Chat with AI via bridge or direct API
 * - "+" action picker from meta contracts
 * - Session-persisted messages + draft input
 * - Retry on error, copy responses, lightweight markdown rendering
 */

import {
  Badge,
  Button,
  EmptyState,
} from '@pixsim7/shared.ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { pixsimClient } from '@lib/api/client';
import { Icon, type IconName } from '@lib/icons';

// =============================================================================
// Types
// =============================================================================

interface BridgeStatus { connected: number; available: number }
interface SendResponse { ok: boolean; agent_id: string; response: string | null; error: string | null; duration_ms: number | null; claude_session_id?: string | null }
interface StartBridgeResponse { ok: boolean; pid: number | null; message: string }

interface ChatMessage {
  role: 'user' | 'assistant' | 'error';
  text: string;
  duration_ms?: number;
  timestamp: Date;
}

// Claude session history (persisted to localStorage — survives tab close)
interface SessionEntry {
  id: string;
  label: string;       // first user message or "Session <short-id>"
  lastUsed: string;     // ISO timestamp
  messageCount: number;
}

// =============================================================================
// Persistence (sessionStorage)
// =============================================================================

const MSG_KEY = 'ai-assistant:messages';
const DRAFT_KEY = 'ai-assistant:draft';
const SESSIONS_KEY = 'ai-assistant:sessions';
const ACTIVE_SESSION_KEY = 'ai-assistant:active-session';

function loadSessions(): SessionEntry[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function persistSessions(sessions: SessionEntry[]) {
  try { localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions.slice(0, 20))); }
  catch { /* ignore */ }
}

function getActiveSessionId(): string | null {
  try { return sessionStorage.getItem(ACTIVE_SESSION_KEY); }
  catch { return null; }
}

function setActiveSessionId(id: string | null) {
  try {
    if (id) sessionStorage.setItem(ACTIVE_SESSION_KEY, id);
    else sessionStorage.removeItem(ACTIVE_SESSION_KEY);
  } catch { /* ignore */ }
}

function upsertSession(sessions: SessionEntry[], id: string, firstMessage: string, msgCount: number): SessionEntry[] {
  const existing = sessions.find((s) => s.id === id);
  if (existing) {
    existing.lastUsed = new Date().toISOString();
    existing.messageCount = msgCount;
    return [...sessions];
  }
  const label = firstMessage.slice(0, 40) || `Session ${id.slice(0, 8)}`;
  return [{ id, label, lastUsed: new Date().toISOString(), messageCount: msgCount }, ...sessions];
}

function loadMessages(): ChatMessage[] {
  try {
    const raw = sessionStorage.getItem(MSG_KEY);
    if (!raw) return [];
    return (JSON.parse(raw) as Array<Record<string, unknown>>).map((m) => ({
      role: m.role as ChatMessage['role'],
      text: m.text as string,
      duration_ms: m.duration_ms as number | undefined,
      timestamp: new Date(m.timestamp as string),
    }));
  } catch { return []; }
}

function persistMessages(messages: ChatMessage[]) {
  try { sessionStorage.setItem(MSG_KEY, JSON.stringify(messages.slice(-50))); }
  catch { /* ignore */ }
}

function loadDraft(): string {
  try { return sessionStorage.getItem(DRAFT_KEY) || ''; }
  catch { return ''; }
}

function persistDraft(text: string) {
  try {
    if (text) sessionStorage.setItem(DRAFT_KEY, text);
    else sessionStorage.removeItem(DRAFT_KEY);
  } catch { /* ignore */ }
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

    // Code block
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      nodes.push(
        <pre key={nodes.length} className="p-2 rounded bg-neutral-900 dark:bg-neutral-950 text-neutral-200 text-[11px] font-mono overflow-x-auto whitespace-pre">
          {lang && <div className="text-[9px] text-neutral-500 mb-1">{lang}</div>}
          {codeLines.join('\n')}
        </pre>
      );
      continue;
    }

    // Empty line
    if (!line.trim()) { i++; continue; }

    // Heading
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const cls = level === 1 ? 'text-sm font-bold' : level === 2 ? 'text-xs font-semibold' : 'text-xs font-medium';
      nodes.push(<div key={nodes.length} className={cls}>{inlineFormat(headingMatch[2])}</div>);
      i++;
      continue;
    }

    // Bullet list
    if (line.match(/^\s*[-*]\s/)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^\s*[-*]\s/)) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''));
        i++;
      }
      nodes.push(
        <ul key={nodes.length} className="list-disc list-inside space-y-0.5 text-xs">
          {items.map((item, j) => <li key={j}>{inlineFormat(item)}</li>)}
        </ul>
      );
      continue;
    }

    // Numbered list
    if (line.match(/^\s*\d+\.\s/)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^\s*\d+\.\s/)) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i++;
      }
      nodes.push(
        <ol key={nodes.length} className="list-decimal list-inside space-y-0.5 text-xs">
          {items.map((item, j) => <li key={j}>{inlineFormat(item)}</li>)}
        </ol>
      );
      continue;
    }

    // Regular paragraph
    nodes.push(<p key={nodes.length}>{inlineFormat(line)}</p>);
    i++;
  }

  return nodes;
}

/** Inline formatting: **bold**, `code`, *italic* */
function inlineFormat(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*|`(.+?)`|\*(.+?)\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[2]) parts.push(<strong key={parts.length}>{match[2]}</strong>);
    else if (match[3]) parts.push(<code key={parts.length} className="px-1 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700 text-[11px] font-mono">{match[3]}</code>);
    else if (match[4]) parts.push(<em key={parts.length}>{match[4]}</em>);
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

// =============================================================================
// Action Picker (from meta contracts)
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
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-neutral-600 dark:text-neutral-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-700 dark:hover:text-blue-300 transition-colors disabled:opacity-50 text-left">
                    <Icon name={a.icon} size={11} className="shrink-0 opacity-60" />
                    <span className="truncate">{a.label}</span>
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

function MessageBubble({ msg, onRetry, onCopy }: {
  msg: ChatMessage;
  onRetry?: () => void;
  onCopy?: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(msg.text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
    onCopy?.();
  }, [msg.text, onCopy]);

  return (
    <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} group`}>
      <div
        className={`max-w-[85%] rounded-xl px-3 py-2 ${
          msg.role === 'user'
            ? 'bg-accent text-white'
            : msg.role === 'error'
              ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
              : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100'
        }`}
      >
        {/* Content */}
        {msg.role === 'assistant' ? (
          <MarkdownText text={msg.text} />
        ) : (
          <pre className="whitespace-pre-wrap text-xs font-sans leading-relaxed">{msg.text}</pre>
        )}

        {/* Footer: duration + actions */}
        <div className="flex items-center gap-2 mt-1">
          {msg.duration_ms != null && (
            <span className="text-[10px] opacity-50">{(msg.duration_ms / 1000).toFixed(1)}s</span>
          )}

          {/* Actions — visible on hover */}
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
// Main Component
// =============================================================================

export function AIAssistantPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>(loadMessages);
  const [input, setInput] = useState(loadDraft);
  const [sending, setSending] = useState(false);
  const [bridge, setBridge] = useState<BridgeStatus | null>(null);
  const [bridgeStarting, setBridgeStarting] = useState(false);
  const [actionPickerOpen, setActionPickerOpen] = useState(false);
  const [sessions, setSessions] = useState<SessionEntry[]>(loadSessions);
  const [activeSessionId, setActiveSessionIdState] = useState<string | null>(getActiveSessionId);
  const [showSessionPicker, setShowSessionPicker] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sessionPickerRef = useRef<HTMLDivElement>(null);

  // Persist
  useEffect(() => { persistMessages(messages); }, [messages]);
  useEffect(() => { persistDraft(input); }, [input]);

  // Track session from responses
  const trackSession = useCallback((claudeSessionId: string) => {
    setActiveSessionIdState(claudeSessionId);
    setActiveSessionId(claudeSessionId);
    const firstUserMsg = messages.find((m) => m.role === 'user')?.text || '';
    const updated = upsertSession(sessions, claudeSessionId, firstUserMsg, messages.length);
    setSessions(updated);
    persistSessions(updated);
  }, [messages, sessions]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    sessionStorage.removeItem(MSG_KEY);
    setActiveSessionIdState(null);
    setActiveSessionId(null);
  }, []);

  // Close session picker on outside click
  useEffect(() => {
    if (!showSessionPicker) return;
    const handler = (e: MouseEvent) => { if (sessionPickerRef.current && !sessionPickerRef.current.contains(e.target as Node)) setShowSessionPicker(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showSessionPicker]);

  // Poll bridge
  useEffect(() => {
    const poll = () => { pixsimClient.get<BridgeStatus>('/meta/agents/bridge').then(setBridge).catch(() => setBridge(null)); };
    poll();
    const interval = setInterval(poll, 8_000);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll
  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || sending) return;
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text, timestamp: new Date() }]);
    setSending(true);
    try {
      const res = await pixsimClient.post<SendResponse>('/meta/agents/bridge/send', { message: text, timeout: 120 });
      if (res.ok && res.response) {
        setMessages((prev) => [...prev, { role: 'assistant', text: res.response!, duration_ms: res.duration_ms ?? undefined, timestamp: new Date() }]);
        if (res.claude_session_id) trackSession(res.claude_session_id);
      } else {
        setMessages((prev) => [...prev, { role: 'error', text: res.error || 'No response from agent', timestamp: new Date() }]);
      }
    } catch (err) {
      setMessages((prev) => [...prev, { role: 'error', text: err instanceof Error ? err.message : 'Request failed', timestamp: new Date() }]);
    } finally {
      setSending(false);
    }
  }, [sending, trackSession]);

  const retryLast = useCallback(() => {
    // Find the last user message before the error
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        // Remove the error message(s) after this user message
        setMessages(messages.slice(0, i));
        void sendMessage(messages[i].text);
        return;
      }
    }
  }, [messages, sendMessage]);

  const startBridge = useCallback(async () => {
    setBridgeStarting(true);
    try { await pixsimClient.post<StartBridgeResponse>('/meta/agents/bridge/start', { pool_size: 1, claude_args: '--dangerously-skip-permissions' }); }
    catch { /* ignore */ }
    setTimeout(() => setBridgeStarting(false), 5000);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage(input); }
  }, [input, sendMessage]);

  const connected = bridge?.connected ?? 0;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-neutral-950">
      {/* Header */}
      <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-800 flex items-center gap-2">
        <Icon name="messageSquare" size={14} className="text-neutral-400" />
        <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">AI Assistant</span>

        {/* Session indicator — clickable to show picker */}
        <div className="relative" ref={sessionPickerRef}>
          <button
            onClick={() => sessions.length > 0 && setShowSessionPicker(!showSessionPicker)}
            className={`text-[9px] font-mono px-1.5 py-0.5 rounded transition-colors ${
              activeSessionId
                ? 'text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                : 'text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            } ${sessions.length === 0 ? 'pointer-events-none' : 'cursor-pointer'}`}
            title={activeSessionId ? `Session: ${activeSessionId}` : 'No active session'}
          >
            {activeSessionId ? activeSessionId.slice(0, 8) : sessions.length > 0 ? 'sessions' : ''}
          </button>

          {/* Session picker dropdown */}
          {showSessionPicker && (
            <div className="absolute top-full right-0 mt-1 w-56 max-h-48 overflow-y-auto rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-lg z-20">
              {/* New session option */}
              <button
                onClick={() => { clearMessages(); setShowSessionPicker(false); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800"
              >
                <Icon name="plus" size={10} className="shrink-0" />
                <span>New session</span>
              </button>
              <div className="border-t border-neutral-100 dark:border-neutral-800" />

              {/* Session list */}
              {sessions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    // Resume: restart bridge with this session
                    setActiveSessionIdState(s.id);
                    setActiveSessionId(s.id);
                    setShowSessionPicker(false);
                    // Start bridge with resume
                    pixsimClient.post('/meta/agents/bridge/start', {
                      pool_size: 1,
                      claude_args: '--dangerously-skip-permissions',
                      resume_session_id: s.id,
                    }).catch(() => {});
                  }}
                  className={`w-full flex items-start gap-2 px-3 py-1.5 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800 ${
                    s.id === activeSessionId ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-medium text-neutral-700 dark:text-neutral-300 truncate">{s.label}</div>
                    <div className="text-[9px] text-neutral-400 flex items-center gap-1.5">
                      <span className="font-mono">{s.id.slice(0, 8)}</span>
                      <span>{s.messageCount} msgs</span>
                    </div>
                  </div>
                  {s.id === activeSessionId && <Badge color="blue" className="text-[8px] shrink-0">active</Badge>}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {messages.length > 0 && (
            <button onClick={clearMessages} className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors" title="Clear chat">
              <Icon name="trash" size={12} />
            </button>
          )}
          <Badge color={connected > 0 ? 'green' : 'gray'} className="text-[10px]">
            {connected > 0 ? 'Connected' : 'Offline'}
          </Badge>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Empty connected state */}
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

        {/* Empty offline state */}
        {messages.length === 0 && connected === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-8">
            <EmptyState message="AI assistant is offline" description="Start an agent bridge to connect" size="sm" />
            <Button size="sm" onClick={startBridge} disabled={bridgeStarting}>
              <Icon name="play" size={12} className="mr-1.5" />
              {bridgeStarting ? 'Starting...' : 'Start Bridge'}
            </Button>
          </div>
        )}

        {/* Messages */}
        {messages.map((msg, i) => (
          <MessageBubble
            key={i}
            msg={msg}
            onRetry={msg.role === 'error' ? retryLast : undefined}
          />
        ))}

        {/* Typing indicator */}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-neutral-100 dark:bg-neutral-800 rounded-xl px-3 py-2">
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={scrollRef} />
      </div>

      {/* Input area */}
      <div className="relative border-t border-neutral-200 dark:border-neutral-800 p-2">
        <ActionPicker open={actionPickerOpen} onClose={() => setActionPickerOpen(false)} onSelect={(p) => void sendMessage(p)} disabled={connected === 0 || sending} />
        <div className="flex gap-1.5 items-end">
          <button onClick={() => setActionPickerOpen(!actionPickerOpen)} disabled={connected === 0}
            className={`shrink-0 w-8 h-8 flex items-center justify-center rounded-lg transition-colors disabled:opacity-30 ${actionPickerOpen ? 'bg-accent text-white' : 'text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-600'}`}
            title="Browse actions">
            <Icon name="plus" size={16} />
          </button>
          <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown}
            placeholder={connected > 0 ? 'Ask something... (Enter to send)' : 'No agent connected'}
            disabled={connected === 0 || sending} rows={1}
            className="flex-1 px-3 py-2 text-sm rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 resize-none focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
            style={{ minHeight: '36px', maxHeight: '120px' }}
            onInput={(e) => { const el = e.currentTarget; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px'; }}
          />
          <Button size="sm" onClick={() => void sendMessage(input)} disabled={connected === 0 || sending || !input.trim()} className="shrink-0">
            <Icon name="send" size={14} />
          </Button>
        </div>
      </div>
    </div>
  );
}
