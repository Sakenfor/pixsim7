import { getAuthTokenProvider } from '@pixsim7/shared.auth.core';
import { useCallback, useEffect, useRef, useState } from 'react';


import {
  getCommunityRoom,
  sendCommunityMessage,
  markCommunityRoomRead,
  type CommunityChatMessage,
} from '@lib/api';
import { API_BASE_URL } from '@lib/api/client';
import { Icon } from '@lib/icons';

import { useAuthStore } from '@/stores/authStore';

// ---------------------------------------------------------------------------
// Community shared room. Plan `community-chat` / checkpoint `community-room`.
// Send via REST, receive live over /ws/community-chat. Lightweight inline
// rendering — shared bubble extraction is a later checkpoint (ui-extraction).
// ---------------------------------------------------------------------------

function computeCommunityWsUrl(token: string | null): string {
  const path = '/ws/community-chat';
  if (API_BASE_URL.startsWith('/') && typeof window !== 'undefined') {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const pathname = API_BASE_URL.replace(/\/$/, '') + path;
    const q = token ? `?token=${encodeURIComponent(token)}` : '';
    return `${proto}//${window.location.host}${pathname}${q}`;
  }
  try {
    const base = new URL(API_BASE_URL);
    base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
    base.pathname = base.pathname.replace(/\/$/, '') + path;
    base.search = '';
    base.hash = '';
    if (token) base.searchParams.set('token', token);
    return base.toString();
  } catch {
    const proto =
      typeof window !== 'undefined' && window.location.protocol === 'https:'
        ? 'wss:'
        : 'ws:';
    const host = typeof window !== 'undefined' ? window.location.host : 'localhost:8000';
    const q = token ? `?token=${encodeURIComponent(token)}` : '';
    return `${proto}//${host}/api/v1${path}${q}`;
  }
}

function senderLabel(sender: string, mine: boolean): string {
  if (mine) return 'You';
  if (sender.startsWith('user:')) return `User ${sender.slice(5)}`;
  return sender;
}

export function ChatView() {
  const currentUser = useAuthStore((s) => s.user);
  const myActor = currentUser ? `user:${currentUser.id}` : null;

  const [messages, setMessages] = useState<CommunityChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [connected, setConnected] = useState(false);
  const [sending, setSending] = useState(false);

  const seenIds = useRef<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const mountedRef = useRef(true);

  // Clear-on-view: while the panel is mounted the user is "looking", so
  // keep last_read_at fresh. Best-effort — unread truth lives server-side
  // (plan community-chat / read-state).
  const markRead = useCallback(() => {
    void markCommunityRoomRead().catch(() => {});
  }, []);

  const addMessages = useCallback((incoming: CommunityChatMessage[]) => {
    const fresh = incoming.filter((m) => !seenIds.current.has(m.id));
    if (fresh.length === 0) return;
    fresh.forEach((m) => seenIds.current.add(m.id));
    setMessages((prev) => [...prev, ...fresh]);
  }, []);

  // Scroll the message container (scoped — never the document; see
  // panel-autoscroll memory note).
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight });
  }, [messages]);

  // Load history.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const room = await getCommunityRoom();
        if (cancelled) return;
        seenIds.current = new Set(room.messages.map((m) => m.id));
        setMessages(room.messages);
        setStatus('ready');
        markRead();
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [markRead]);

  // Live WebSocket with basic reconnect + keepalive.
  useEffect(() => {
    mountedRef.current = true;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let pingTimer: ReturnType<typeof setInterval> | undefined;

    const scheduleReconnect = () => {
      if (!mountedRef.current) return;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => void connect(), 3000);
    };

    const connect = async () => {
      if (!mountedRef.current) return;
      try {
        // Token may be momentarily unavailable right after mount; treat
        // that as a transient failure to retry, not a permanent abort.
        let token: string | null = null;
        try {
          token = await Promise.resolve(getAuthTokenProvider().getAccessToken());
        } catch (err) {
          console.warn('[community-chat] token unavailable, will retry', err);
        }
        if (!mountedRef.current) return;

        const ws = new WebSocket(computeCommunityWsUrl(token));
        wsRef.current = ws;

        ws.onopen = () => {
          if (!mountedRef.current) return;
          setConnected(true);
          pingTimer = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) ws.send('ping');
          }, 30000);
        };

        ws.onmessage = (ev) => {
          if (typeof ev.data !== 'string' || ev.data === 'pong') return;
          try {
            const data = JSON.parse(ev.data);
            if (data?.type === 'message' && data.message) {
              addMessages([data.message as CommunityChatMessage]);
              if (mountedRef.current) markRead();
            }
          } catch {
            /* ignore non-JSON frames */
          }
        };

        ws.onclose = () => {
          setConnected(false);
          if (pingTimer) clearInterval(pingTimer);
          scheduleReconnect();
        };

        ws.onerror = () => ws.close();
      } catch (err) {
        // new WebSocket() can throw synchronously (bad URL). Without this
        // there is no socket -> no onclose -> reconnect never fires.
        console.error('[community-chat] WS connect failed, retrying', err);
        setConnected(false);
        scheduleReconnect();
      }
    };

    void connect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (pingTimer) clearInterval(pingTimer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [addMessages, markRead]);

  const handleSend = useCallback(async () => {
    const body = input.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const msg = await sendCommunityMessage(body);
      addMessages([msg]); // optimistic; WS echo is deduped by id
      setInput('');
    } catch {
      /* keep the text so the user can retry */
    } finally {
      setSending(false);
    }
  }, [input, sending, addMessages]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-neutral-800">
        <Icon name="users" size={14} className="text-neutral-500" />
        <span className="text-xs font-medium text-neutral-300">General</span>
        <span
          className={`ml-auto w-1.5 h-1.5 rounded-full ${
            connected ? 'bg-emerald-500' : 'bg-neutral-600'
          }`}
          title={connected ? 'Connected' : 'Disconnected'}
        />
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-auto p-4 space-y-2">
        {status === 'loading' && (
          <p className="text-xs text-neutral-600 text-center py-8">Loading…</p>
        )}
        {status === 'error' && (
          <p className="text-xs text-red-400 text-center py-8">
            Couldn't load the chat.
          </p>
        )}
        {status === 'ready' && messages.length === 0 && (
          <p className="text-xs text-neutral-600 text-center py-8">
            No messages yet. Start a conversation!
          </p>
        )}
        {messages.map((m) => {
          const mine = myActor !== null && m.sender === myActor;
          return (
            <div
              key={m.id}
              className={`flex flex-col max-w-[80%] ${
                mine ? 'ml-auto items-end' : 'items-start'
              }`}
            >
              <span className="text-[10px] text-neutral-600 mb-0.5">
                {senderLabel(m.sender, mine)}
              </span>
              <div
                className={`text-xs rounded-lg px-3 py-1.5 whitespace-pre-wrap break-words ${
                  mine
                    ? 'bg-indigo-600/30 text-indigo-100'
                    : 'bg-neutral-800 text-neutral-200'
                }`}
              >
                {m.body}
              </div>
            </div>
          );
        })}
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 px-3 py-2 border-t border-neutral-800">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
          placeholder="Type a message..."
          className="flex-1 bg-neutral-800 text-xs text-neutral-200 placeholder:text-neutral-600 rounded px-3 py-1.5 outline-none focus:ring-1 focus:ring-indigo-500/50"
        />
        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={!input.trim() || sending}
          className="text-neutral-500 hover:text-indigo-400 disabled:opacity-30 disabled:hover:text-neutral-500 transition-colors"
        >
          <Icon name="arrowRight" size={14} />
        </button>
      </div>
    </div>
  );
}
