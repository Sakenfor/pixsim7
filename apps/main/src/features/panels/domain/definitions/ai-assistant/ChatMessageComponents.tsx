/* eslint-disable react-refresh/only-export-components */
/**
 * Chat message rendering pipeline — markdown, thinking blocks, message bubbles.
 */

import { useCallback, useMemo, useState } from 'react';

import { Icon, type IconName } from '@lib/icons';

import type { ChatMessage, AgentEngine } from './assistantChatStore';
import { EngineProfileIcon } from './EngineProfileIcon';

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
