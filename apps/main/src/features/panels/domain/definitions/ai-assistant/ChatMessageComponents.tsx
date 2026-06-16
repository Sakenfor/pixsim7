/* eslint-disable react-refresh/only-export-components */
/**
 * Chat message rendering pipeline — markdown, thinking blocks, message bubbles.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Icon, type IconName } from '@lib/icons';

import type { AgentPromptType, AgentPromptChoice } from './assistantChatBridge';
import type { ChatMessage, AgentEngine } from './assistantChatStore';
import { EngineProfileIcon } from './EngineProfileIcon';

function legacyCopyText(text: string): boolean {
  if (typeof document === 'undefined') return false;
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.left = '0';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  document.body.removeChild(textarea);
  return ok;
}

// =============================================================================
// Timestamp helpers (shared with AIAssistantPanel for the day divider)
// =============================================================================

/** Coerce a stored timestamp to a Date, returning null when unparseable. */
export function toDate(value: Date | string | number | null | undefined): Date | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Format as HH:MM in the user's locale (24h). Empty string when missing. */
export function formatMessageTime(value: Date | string | number | null | undefined): string {
  const d = toDate(value);
  if (!d) return '';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
}

/** Verbose date+time for hover tooltips. */
export function formatMessageTitle(value: Date | string | number | null | undefined): string {
  const d = toDate(value);
  if (!d) return '';
  return d.toLocaleString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

/** True when two Dates fall on the same calendar day in local time. */
export function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Day-divider label: "Today", "Yesterday", or a full weekday/date. */
export function formatDayDivider(d: Date, now: Date = new Date()): string {
  if (isSameLocalDay(d, now)) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameLocalDay(d, yesterday)) return 'Yesterday';
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(undefined, sameYear
    ? { weekday: 'long', month: 'long', day: 'numeric' }
    : { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

// =============================================================================
// Lightweight Markdown Renderer
// =============================================================================

export function MarkdownText({ text }: { text: string }) {
  const parts = useMemo(() => renderMarkdown(text), [text]);
  return <div className="text-xs leading-relaxed space-y-1.5">{parts}</div>;
}

export function renderMarkdown(text: string): React.ReactNode[] {
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

export function inlineFormat(text: string): React.ReactNode {
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
      parts.push(<span key={parts.length} className="text-signal-warning">&quot;{match[5]}&quot;</span>);
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
// Thinking Block — collapsible heartbeat log
// =============================================================================

export function dedupeEntries(entries: Array<{ action: string; detail: string }>): Array<{ action: string; detail: string }> {
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

export function ThinkingBlock({ entries, live, userMessage }: { entries: Array<{ action: string; detail: string }>; live?: boolean; userMessage?: string }) {
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
        className="flex items-center gap-1.5 text-[10px] text-th-secondary hover:text-th transition-colors"
      >
        <Icon name={live ? 'loader' : 'cpu'} size={10} className={live ? 'animate-spin' : ''} />
        <span>{live ? 'Thinking...' : `${deduped.length} step${deduped.length !== 1 ? 's' : ''}`}</span>
        {deduped.length > 0 && (
          <span className={`text-[9px] px-1 py-0.5 rounded ${expanded ? 'bg-accent/10 text-accent' : 'bg-surface-inset text-th-secondary'}`}>
            {expanded ? 'hide' : 'show'}
          </span>
        )}
      </button>
      {expanded && (
        <div className="mt-1.5 pl-3 border-l-2 border-th space-y-1 max-h-[240px] overflow-y-auto">
          {deduped.map((e, i) => (
            <div key={i} className="flex gap-2 text-[10px] leading-relaxed py-1 px-1.5 rounded bg-surface-secondary">
              <span className="text-th-muted font-mono shrink-0 select-none">{i + 1}</span>
              <span className="text-th-secondary">{e.detail || e.action}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Agent Prompt Card — inline prompt from agent (approve/deny, choice, text input)
// =============================================================================


/** Live agent prompt — rendered in the sending area while agent is blocked. */
export function ConfirmationCard({
  title,
  description,
  toolName,
  toolInput,
  interactionType = 'approve_deny',
  choices,
  placeholder,
  onApprove,
  onDeny,
  onChoice,
  onMultiChoice,
  onTextSubmit,
}: {
  title: string;
  description: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  interactionType?: AgentPromptType;
  choices?: AgentPromptChoice[];
  placeholder?: string;
  onApprove: () => void;
  onDeny: () => void;
  onChoice?: (choiceId: string) => void;
  onMultiChoice?: (choiceIds: string[]) => void;
  onTextSubmit?: (text: string) => void;
}) {
  const [textValue, setTextValue] = useState('');
  const [multiSelected, setMultiSelected] = useState<Set<string>>(new Set());

  const toggleMulti = (id: string): void => {
    setMultiSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="rounded-xl border border-signal-warning/40 bg-signal-warning/10 px-3 py-2.5 space-y-2">
      <div className="flex items-center gap-1.5">
        <Icon name="alertCircle" size={12} className="text-signal-warning shrink-0" />
        <span className="text-xs font-medium text-signal-warning">{title}</span>
      </div>
      {description && (
        <p className="text-[11px] text-signal-warning leading-relaxed">{description}</p>
      )}
      {toolName && (
        <div className="rounded-lg bg-signal-warning/15 px-2.5 py-1.5 space-y-1">
          <div className="flex items-center gap-1.5">
            <Icon name="terminal" size={10} className="text-signal-warning" />
            <code className="text-[10px] font-mono font-medium text-signal-warning">{toolName}</code>
          </div>
          {toolInput && Object.keys(toolInput).length > 0 && (
            <pre className="text-[10px] font-mono text-signal-warning/90 whitespace-pre-wrap max-h-[120px] overflow-y-auto leading-relaxed">
              {JSON.stringify(toolInput, null, 2)}
            </pre>
          )}
        </div>
      )}

      {/* Approve / Deny */}
      {interactionType === 'approve_deny' && (
        <div className="flex items-center gap-2 pt-0.5">
          <button onClick={onApprove} className="px-3 py-1 rounded-md text-[11px] font-medium bg-signal-success hover:opacity-90 text-white transition-colors">
            Approve
          </button>
          <button onClick={onDeny} className="px-3 py-1 rounded-md text-[11px] font-medium bg-surface-inset hover:bg-surface-secondary text-th-secondary transition-colors">
            Deny
          </button>
        </div>
      )}

      {/* Multiple Choice (single-select) */}
      {interactionType === 'choice' && choices && (
        <div className="space-y-1 pt-0.5">
          {choices.map((c) => (
            <button
              key={c.id}
              onClick={() => onChoice?.(c.id)}
              className="w-full text-left px-3 py-1.5 rounded-md text-[11px] border border-signal-warning/30 hover:bg-signal-warning/15 transition-colors"
            >
              <span className="font-medium text-signal-warning">{c.label}</span>
              {c.description && <span className="text-signal-warning ml-1.5">— {c.description}</span>}
            </button>
          ))}
          {/* Freeform escape hatch — write a custom answer instead of picking an
              offered option (mirrors the CLI's "Other" choice). The backend
              ask_user handler surfaces this text when no choice id is returned. */}
          {onTextSubmit && (
            <div className="flex items-center gap-1.5 pt-1">
              <input
                type="text"
                value={textValue}
                onChange={(e) => setTextValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && textValue.trim()) onTextSubmit(textValue.trim()); }}
                placeholder={placeholder || 'Or write your own answer…'}
                className="flex-1 min-w-0 px-2.5 py-1.5 rounded-md text-[11px] border border-signal-warning/30 bg-surface text-th focus:outline-none focus:ring-1 focus:ring-signal-warning"
              />
              <button
                onClick={() => { if (textValue.trim()) onTextSubmit(textValue.trim()); }}
                disabled={!textValue.trim()}
                className="shrink-0 px-3 py-1 rounded-md text-[11px] font-medium bg-signal-success hover:opacity-90 text-white transition-colors disabled:opacity-40"
              >
                Send
              </button>
            </div>
          )}
          <button onClick={onDeny} className="px-3 py-1 rounded-md text-[11px] text-th-secondary hover:text-th transition-colors">
            Cancel
          </button>
        </div>
      )}

      {/* Multi-Select (checkboxes + Submit) */}
      {interactionType === 'multi_choice' && choices && (
        <div className="space-y-1 pt-0.5">
          {choices.map((c) => {
            const checked = multiSelected.has(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggleMulti(c.id)}
                className={`w-full text-left px-3 py-1.5 rounded-md text-[11px] border transition-colors flex items-center gap-2 ${
                  checked
                    ? 'border-signal-warning/60 bg-signal-warning/15'
                    : 'border-signal-warning/30 hover:bg-signal-warning/15'
                }`}
                aria-pressed={checked}
              >
                <span
                  className={`inline-flex items-center justify-center w-3.5 h-3.5 rounded border text-[10px] leading-none ${
                    checked
                      ? 'bg-signal-warning border-signal-warning text-white'
                      : 'border-signal-warning/50 bg-surface'
                  }`}
                  aria-hidden
                >
                  {checked ? '✓' : ''}
                </span>
                <span className="flex-1">
                  <span className="font-medium text-signal-warning">{c.label}</span>
                  {c.description && <span className="text-signal-warning ml-1.5">— {c.description}</span>}
                </span>
              </button>
            );
          })}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => onMultiChoice?.(Array.from(multiSelected))}
              disabled={multiSelected.size === 0}
              className="px-3 py-1 rounded-md text-[11px] font-medium bg-signal-success hover:opacity-90 text-white transition-colors disabled:opacity-40"
            >
              Submit ({multiSelected.size})
            </button>
            <button onClick={onDeny} className="px-3 py-1 rounded-md text-[11px] text-th-secondary hover:text-th transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Text Input */}
      {interactionType === 'text_input' && (
        <div className="space-y-1.5 pt-0.5">
          <input
            type="text"
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && textValue.trim()) onTextSubmit?.(textValue.trim()); }}
            placeholder={placeholder || 'Type your response...'}
            className="w-full px-2.5 py-1.5 rounded-md text-[11px] border border-signal-warning/30 bg-surface text-th focus:outline-none focus:ring-1 focus:ring-signal-warning"
            autoFocus
          />
          <div className="flex items-center gap-2">
            <button
              onClick={() => { if (textValue.trim()) onTextSubmit?.(textValue.trim()); }}
              disabled={!textValue.trim()}
              className="px-3 py-1 rounded-md text-[11px] font-medium bg-signal-success hover:opacity-90 text-white transition-colors disabled:opacity-40"
            >
              Submit
            </button>
            <button onClick={onDeny} className="px-3 py-1 rounded-md text-[11px] text-th-secondary hover:text-th transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Resolved confirmation — rendered inline within a system message. */
export function ResolvedConfirmationBadge({
  title,
  toolName,
  resolved,
}: {
  title: string;
  toolName?: string;
  resolved: 'approved' | 'denied';
}) {
  const isApproved = resolved === 'approved';
  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] ${
      isApproved
        ? 'bg-signal-success/15 text-signal-success'
        : 'bg-signal-error/15 text-signal-error'
    }`}>
      <Icon name={isApproved ? 'check' : 'x'} size={9} />
      <span>{isApproved ? 'Approved' : 'Denied'}: {toolName || title}</span>
    </div>
  );
}

// =============================================================================
// Message Bubble
// =============================================================================

export function MessageBubble({
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
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const copyTimerRef = useRef<number | null>(null);
  const canHover = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(hover: hover) and (pointer: fine)').matches
    : true;
  const canCopy = msg.role === 'assistant' || msg.role === 'user' || msg.role === 'error';
  const handleCopy = useCallback(async () => {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(msg.text);
      } else if (!legacyCopyText(msg.text)) {
        throw new Error('clipboard_unavailable');
      }
      setCopyState('copied');
    } catch {
      // Fallback for mobile webviews / non-secure contexts where async clipboard is blocked.
      setCopyState(legacyCopyText(msg.text) ? 'copied' : 'failed');
    }
    if (copyTimerRef.current != null) window.clearTimeout(copyTimerRef.current);
    copyTimerRef.current = window.setTimeout(() => setCopyState('idle'), 1500);
  }, [msg.text]);
  useEffect(() => () => {
    if (copyTimerRef.current != null) window.clearTimeout(copyTimerRef.current);
  }, []);
  const showAssistantIcon = msg.role === 'assistant' || msg.role === 'error';

  const timeLabel = formatMessageTime(msg.timestamp);
  const timeTitle = formatMessageTitle(msg.timestamp);

  if (msg.role === 'system') {
    const isRecoveryHeader = msg.recovered;
    return (
      <div className="flex justify-center">
        <div
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] ${
            isRecoveryHeader
              ? 'bg-signal-warning/15 text-signal-warning border border-dashed border-signal-warning/50'
              : 'bg-surface-secondary text-th-secondary'
          }`}
          title={timeTitle || undefined}
        >
          {msg.confirmation
            ? <ResolvedConfirmationBadge title={msg.confirmation.title} toolName={msg.confirmation.toolName} resolved={msg.confirmation.resolved} />
            : <><Icon name={isRecoveryHeader ? 'history' : 'refreshCw'} size={9} /><span>{msg.text}</span></>
          }
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} group ${showAssistantIcon ? 'items-start gap-2' : ''}`}>
      {showAssistantIcon && <EngineProfileIcon engine={engine} icon={profileIcon} size={11} className="mt-0.5" />}
      <div className={`max-w-[85%] rounded-xl px-3 py-2 ${
        msg.role === 'user' ? 'bg-accent text-accent-text'
          : msg.role === 'error' ? 'bg-signal-error/10 text-signal-error border border-signal-error/30'
          : msg.recovered ? 'bg-signal-warning/10 text-th border border-dashed border-signal-warning/50'
          : 'bg-surface-secondary text-th'
      }`}>
        {msg.role === 'assistant' && msg.thinkingLog && msg.thinkingLog.length > 0 && (
          <ThinkingBlock entries={msg.thinkingLog} userMessage={userMessage} />
        )}
        {msg.role === 'assistant' ? <MarkdownText text={msg.text} /> : <pre className="whitespace-pre-wrap text-xs font-sans leading-relaxed">{msg.text}</pre>}
        <div className="flex items-center gap-2 mt-1">
          {timeLabel && (
            <span className="text-[10px] opacity-50 tabular-nums" title={timeTitle || undefined}>
              {timeLabel}
            </span>
          )}
          {msg.duration_ms != null && <span className="text-[10px] opacity-50">{(msg.duration_ms / 1000).toFixed(1)}s</span>}
          <div className={`ml-auto flex items-center gap-1 transition-opacity ${
            canHover ? 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100' : 'opacity-100'
          }`}>
            {canCopy && (
              <button
                onClick={handleCopy}
                className={`h-7 min-w-7 px-1.5 rounded text-[10px] transition-colors opacity-80 hover:opacity-100 focus-visible:opacity-100 ${
                  copyState === 'failed'
                    ? 'text-signal-error'
                    : 'text-th-secondary hover:bg-surface-secondary'
                }`}
                title={copyState === 'failed' && !canHover ? 'Clipboard blocked here. Long-press the message text to copy.' : 'Copy message'}
                aria-label="Copy message"
              >
                {!canHover || copyState !== 'idle'
                  ? (copyState === 'copied' ? 'Copied' : copyState === 'failed' ? (canHover ? 'Failed' : 'Long-press') : 'Copy')
                  : <Icon name="copy" size={11} />}
              </button>
            )}
            {msg.role === 'error' && onRetry && (
              <button onClick={onRetry} className="text-[10px] text-signal-error hover:opacity-80 flex items-center gap-0.5">
                <Icon name="refreshCw" size={10} /> Retry
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
