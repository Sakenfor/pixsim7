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
  SidebarPaneShell,
} from '@pixsim7/shared.ui';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import { pixsimClient } from '@lib/api/client';
import { Icon } from '@lib/icons';
import { useReferences, useReferenceInput, ReferencePicker } from '@lib/references';

import { navigateToPlan } from '@features/workspace/lib/openPanel';

import { chatBridge } from './assistantChatBridge';
import {
  useAssistantChatStore,
  fetchServerMessages,
  buildResumedTab,
  normalizeProfileId,
  createTabId,
  type ChatTab,
  type AgentEngine,
} from './assistantChatStore';
import {
  ProfileEditor,
  ResumeSessionPicker,
  InlineResumePicker,
  ActionPicker,
  WorkSummaryBadge,
  ModelSelector,
  SystemPromptPreview,
  QUICK_SHORTCUTS,
} from './assistantSubPanels';
import {
  type BridgeStatus,
  type UnifiedProfile,
  type InjectPromptDetail,
  type ResumeSessionDetail,
  type OpenPlanChatDetail,
  EMPTY_CHAT_MESSAGES,
  EMPTY_THINKING_LOG,
  INJECT_PROMPT_EVENT,
  RESUME_SESSION_EVENT,
  OPEN_PLAN_CHAT_EVENT,
  isSameThinkingLog,
  renderBridgeError,
  extractReferenceScope,
} from './assistantTypes';
import { MessageBubble, ThinkingBlock } from './ChatMessageComponents';
import { EngineProfileIcon, resolveProfileIcon, engineFromProfile } from './EngineProfileIcon';
import { SessionItem } from './SessionItem';

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
  // Messages from Zustand store (survives HMR)
  const messages = useAssistantChatStore((s) => s.messagesByTab[tab.id] ?? EMPTY_CHAT_MESSAGES);
  // Hydrate store cache from localStorage on mount (safe in effect, not render)
  useEffect(() => {
    const s = useAssistantChatStore.getState();
    if (s.messagesByTab[tab.id] === undefined) {
      s.setMessages(tab.id, s.getMessages(tab.id));
    }
  }, [tab.id]);

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
    if (!result) return; // Already consumed (effect re-fired after store update) — normal
    const errorText = renderBridgeError(result);
    const s = useAssistantChatStore.getState();
    // Clear persisted thinking entries — they're now part of the final message
    s.clearThinking(tab.id);

    if (result.error_code === 'cancelled' || result.error === 'cancelled') {
      s.appendMessage(tab.id, { role: 'system', text: 'Request cancelled', timestamp: new Date() });
      chatBridge.ack(tab.id);
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
      // Ack AFTER appendMessage has persisted to localStorage — safe to clear backup
      chatBridge.ack(tab.id);
    } else {
      // Reconnect failure — try recovering from server-stored messages.
      const isReconnectFailure = result.reconnected || result.error_code === 'task_not_found' || (result.error || '').includes('not found');
      if (isReconnectFailure && tab.sessionId) {
        fetchServerMessages(tab.sessionId).then((serverMsgs) => {
          if (serverMsgs.length === 0) {
            useAssistantChatStore.getState().appendMessage(tab.id, { role: 'error', text: errorText, timestamp: new Date() });
            chatBridge.ack(tab.id);
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
              chatBridge.ack(tab.id);
              return;
            }
          }
          useAssistantChatStore.getState().appendMessage(tab.id, { role: 'error', text: errorText, timestamp: new Date() });
          chatBridge.ack(tab.id);
        }).catch(() => {
          useAssistantChatStore.getState().appendMessage(tab.id, { role: 'error', text: errorText, timestamp: new Date() });
          chatBridge.ack(tab.id);
        });
      } else {
        s.appendMessage(tab.id, { role: 'error', text: errorText, timestamp: new Date() });
        chatBridge.ack(tab.id);
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
    if (tab.injectToken && resolvedProfileId) {
      try {
        const res = await pixsimClient.post<{ access_token: string }>(`/dev/agent-profiles/${resolvedProfileId}/token`, null, { params: { hours: 24, scope: 'dev' } });
        body.user_token = res.access_token;
      } catch (err) {
        console.warn('[ai-assistant] Token mint failed for profile', resolvedProfileId, err);
      }
    }

    // Fire-and-forget — the bridge singleton manages the SSE fetch.
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
              onResume={(sessionId, engine, label, resumeProfileId, lastPlanId) => {
                const resumed = buildResumedTab({ id: sessionId, engine, label, profile_id: resumeProfileId, last_plan_id: lastPlanId });
                onUpdateTab({
                  sessionId: resumed.sessionId,
                  engine: resumed.engine,
                  label: resumed.label,
                  profileId: resumed.profileId,
                  injectToken: resumed.injectToken,
                  planId: resumed.planId,
                });
                // Fetch server-side message history for this session
                fetchServerMessages(sessionId).then((serverMsgs) => {
                  if (serverMsgs.length > 0) {
                    useAssistantChatStore.getState().setMessages(tab.id, serverMsgs);
                  } else {
                    // Server has no messages — show a system note so the user knows
                    useAssistantChatStore.getState().setMessages(tab.id, [{
                      role: 'system' as const,
                      text: `Session resumed (${label || sessionId.slice(0, 8)}) — previous messages not available on server`,
                      timestamp: new Date(),
                    }]);
                  }
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

          {/* Model override — fetched from backend registry or bridge */}
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
    const tab = s.tabs.find((t) => t.id === tabId);
    // Archive the server session so it moves to "archived" in resume picker
    if (tab?.sessionId) {
      pixsimClient.delete(`/meta/agents/chat-sessions/${tab.sessionId}`).catch(() => {});
    }
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
        const s2 = useAssistantChatStore.getState();
        if (serverMsgs.length > 0) {
          s2.setMessages(newTab.id, serverMsgs);
        } else {
          s2.setMessages(newTab.id, [{
            role: 'system' as const,
            text: `Session resumed (${newTab.label}) — previous messages not available on server`,
            timestamp: new Date(),
          }]);
        }
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
      const existing = tabs.find((t) => t.planId === planId);
      if (existing) { setActiveTab(existing.id); return; }
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

  const startRename = useCallback((tabId: string, currentLabel: string) => {
    setRenamingTabId(tabId);
    setRenameValue(currentLabel);
  }, []);

  const renderItem = (tab: ChatTab, isActive: boolean) => {
    const bridgeReq = chatBridge.get(tab.id);
    const isSending = bridgeReq?.status === 'pending' || bridgeReq?.status === 'streaming';
    return (
      <SessionItem
        key={tab.id}
        tab={tab}
        isActive={isActive}
        profiles={profiles}
        tabCount={tabs.length}
        isSending={isSending}
        renamingTabId={renamingTabId}
        renameValue={renameValue}
        onSetActive={setActiveTab}
        onStartRename={startRename}
        onCommitRename={commitRename}
        onCancelRename={() => setRenamingTabId(null)}
        onSetRenameValue={setRenameValue}
        onClose={closeTab}
        onUnlinkPlan={(id) => updateTab(id, { planId: null })}
      />
    );
  };

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
                {items.map((tab) => renderItem(tab, tab.id === activeTabId))}
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
            {ungroupedTabs.map((tab) => renderItem(tab, tab.id === activeTabId))}

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
                const s2 = useAssistantChatStore.getState();
                if (serverMsgs.length > 0) {
                  s2.setMessages(newTab.id, serverMsgs);
                } else {
                  s2.setMessages(newTab.id, [{
                    role: 'system' as const,
                    text: `Session resumed (${label || sessionId.slice(0, 8)}) — previous messages not available on server`,
                    timestamp: new Date(),
                  }]);
                }
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
