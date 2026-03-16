/**
 * AI Assistant Panel — user-facing floating chat panel.
 *
 * Sends messages to a connected Claude agent via the backend bridge.
 * Available to all logged-in users, not just devtools.
 *
 * Shortcuts shown as suggestion chips for common actions.
 */

import {
  Badge,
  Button,
  EmptyState,
} from '@pixsim7/shared.ui';
import { useCallback, useEffect, useRef, useState } from 'react';

import { pixsimClient } from '@lib/api/client';
import { Icon } from '@lib/icons';

// =============================================================================
// Types
// =============================================================================

interface BridgeStatus {
  connected: number;
  available: number;
}

interface SendResponse {
  ok: boolean;
  agent_id: string;
  response: string | null;
  error: string | null;
  duration_ms: number | null;
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'error';
  text: string;
  duration_ms?: number;
  timestamp: Date;
}

interface Shortcut {
  label: string;
  prompt: string;
  icon?: string;
}

// =============================================================================
// Shortcuts — grouped by capability from user.assistant contract
// =============================================================================

interface ShortcutGroup {
  capability: string;
  label: string;
  icon: string;
  shortcuts: Shortcut[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    capability: 'general',
    label: 'General',
    icon: 'messageSquare',
    shortcuts: [
      { label: 'What can you help with?', prompt: 'What capabilities do you have? What can I ask you to do?', icon: 'compass' },
      { label: 'My recent activity', prompt: 'Summarize my recent activity — what assets did I work on, what generations ran?', icon: 'clock' },
    ],
  },
  {
    capability: 'asset_browsing',
    label: 'Assets',
    icon: 'image',
    shortcuts: [
      { label: 'List my assets', prompt: 'List my most recent assets with their types and status.', icon: 'image' },
      { label: 'Asset stats', prompt: 'Give me a summary of my asset library — counts by type, total storage, recent uploads.', icon: 'barChart' },
    ],
  },
  {
    capability: 'generation_assistance',
    label: 'Generation',
    icon: 'sparkles',
    shortcuts: [
      { label: 'Generation status', prompt: 'What generations are currently running or recently completed?', icon: 'sparkles' },
      { label: 'Help me write a prompt', prompt: 'Help me write a good generation prompt. Ask me what I want to create.', icon: 'prompt' },
    ],
  },
  {
    capability: 'scene_management',
    label: 'Scenes',
    icon: 'film',
    shortcuts: [
      { label: 'List scenes', prompt: 'List the available scenes in the current world.', icon: 'film' },
    ],
  },
  {
    capability: 'character_assistance',
    label: 'Characters',
    icon: 'user',
    shortcuts: [
      { label: 'List characters', prompt: 'List the characters in the current world with their basic info.', icon: 'user' },
    ],
  },
];

// Flatten for the default view
const ALL_SHORTCUTS: Shortcut[] = SHORTCUT_GROUPS.flatMap((g) => g.shortcuts);

// =============================================================================
// Component
// =============================================================================

export function AIAssistantPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [bridge, setBridge] = useState<BridgeStatus | null>(null);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Poll bridge status
  useEffect(() => {
    const poll = () => {
      pixsimClient
        .get<BridgeStatus>('/meta/agents/bridge')
        .then(setBridge)
        .catch(() => setBridge(null));
    };
    poll();
    const interval = setInterval(poll, 8_000);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || sending) return;

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text, timestamp: new Date() }]);
    setSending(true);

    try {
      const res = await pixsimClient.post<SendResponse>('/meta/agents/bridge/send', {
        message: text,
        timeout: 120,
      });

      if (res.ok && res.response) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', text: res.response!, duration_ms: res.duration_ms ?? undefined, timestamp: new Date() },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: 'error', text: res.error || 'No response from agent', timestamp: new Date() },
        ]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'error', text: err instanceof Error ? err.message : 'Request failed', timestamp: new Date() },
      ]);
    } finally {
      setSending(false);
    }
  }, [sending]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void sendMessage(input);
      }
    },
    [input, sendMessage],
  );

  const connected = bridge?.connected ?? 0;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-neutral-950">
      {/* Header */}
      <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-800 flex items-center gap-2">
        <Icon name="messageSquare" size={14} className="text-neutral-400" />
        <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">AI Assistant</span>
        <div className="ml-auto">
          <Badge color={connected > 0 ? 'green' : 'gray'} className="text-[10px]">
            {connected > 0 ? 'Connected' : 'Offline'}
          </Badge>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && connected > 0 && (
          <div className="space-y-3">
            <EmptyState message="Ask anything or pick a category" size="sm" />

            {/* Capability group tabs */}
            <div className="flex flex-wrap gap-1 justify-center">
              {SHORTCUT_GROUPS.map((g) => (
                <button
                  key={g.capability}
                  onClick={() => setActiveGroup(activeGroup === g.capability ? null : g.capability)}
                  className={`flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg transition-colors ${
                    activeGroup === g.capability
                      ? 'bg-accent text-white'
                      : 'border border-neutral-200 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                  }`}
                >
                  <Icon name={g.icon as any} size={12} />
                  {g.label}
                </button>
              ))}
            </div>

            {/* Shortcuts for active group (or all if none selected) */}
            <div className="flex flex-wrap gap-1.5 justify-center">
              {(activeGroup
                ? SHORTCUT_GROUPS.find((g) => g.capability === activeGroup)?.shortcuts ?? []
                : ALL_SHORTCUTS.slice(0, 4)
              ).map((s) => (
                <button
                  key={s.label}
                  onClick={() => void sendMessage(s.prompt)}
                  disabled={sending}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-full border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors disabled:opacity-50"
                >
                  {s.icon && <Icon name={s.icon as any} size={12} />}
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.length === 0 && connected === 0 && (
          <EmptyState
            message="AI assistant is offline"
            description="An agent session needs to be running to use the assistant"
            size="sm"
          />
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 ${
                msg.role === 'user'
                  ? 'bg-accent text-white'
                  : msg.role === 'error'
                    ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
                    : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100'
              }`}
            >
              <pre className="whitespace-pre-wrap text-xs font-sans leading-relaxed">{msg.text}</pre>
              {msg.duration_ms != null && (
                <div className="text-[10px] opacity-50 mt-1">{(msg.duration_ms / 1000).toFixed(1)}s</div>
              )}
            </div>
          </div>
        ))}

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

      {/* Input */}
      <div className="border-t border-neutral-200 dark:border-neutral-800 p-2">
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={connected > 0 ? 'Ask something... (Enter to send)' : 'No agent connected'}
            disabled={connected === 0 || sending}
            rows={1}
            className="flex-1 px-3 py-2 text-sm rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 resize-none focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
            style={{ minHeight: '36px', maxHeight: '120px' }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = Math.min(el.scrollHeight, 120) + 'px';
            }}
          />
          <Button
            size="sm"
            onClick={() => void sendMessage(input)}
            disabled={connected === 0 || sending || !input.trim()}
          >
            <Icon name="send" size={14} />
          </Button>
        </div>
      </div>
    </div>
  );
}
