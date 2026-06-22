/**
 * useChatUnread — React hook over the shared chat-unread poll.
 *
 * notification-system Phase 4a, step 3. One singleton poll (not N) feeds
 * both the AI Assistant activity-bar aggregate badge (`total`) and the
 * per-tab pip (`countsBySessionId[sessionId]`). `markReadBySession` is the
 * pip's clear-on-focus: it POSTs `mark-read-by-ref` then optimistically
 * decrements both the per-session count and the aggregate total.
 */

import { useCallback, useEffect, useState } from 'react';

import { pixsimClient } from '@lib/api/client';

import {
  applyClearQuestionByTab,
  applyMarkReadBySession,
  getChatUnreadSnapshot,
  refreshChatUnread,
  subscribeChatUnread,
  type ChatUnreadSnapshot,
} from '../lib/chatUnreadPoll';

export interface UseChatUnreadResult {
  /** ChatSession id -> unread reply count. Missing key == zero. */
  countsBySessionId: Record<string, number>;
  /** Aggregate unread replies across all chat sessions. */
  total: number;
  /** ChatTab id -> pending agent-question count. Missing key == zero. */
  questionsByTabId: Record<string, number>;
  /** Number of tabs with a pending agent question (Phase 4b). */
  questionsTotal: number;
  /**
   * ChatSession id -> monotonic cross-device activity counter (pip-free).
   * Edge-detect a rise to know a message was typed on another device and
   * re-pull the transcript; never read the absolute value (it only grows).
   */
  activityBySessionId: Record<string, number>;
  loading: boolean;
  refresh: () => Promise<void>;
  /** Clear-on-focus for one bound session's unread replies. */
  markReadBySession: (sessionId: string | null | undefined) => Promise<void>;
  /** Clear-on-focus for one tab's pending question (Phase 4b). */
  markQuestionReadByTab: (tabId: string | null | undefined) => Promise<void>;
}

export function useChatUnread(): UseChatUnreadResult {
  const [snap, setSnap] = useState<ChatUnreadSnapshot>(getChatUnreadSnapshot);

  useEffect(() => subscribeChatUnread(setSnap), []);

  const refresh = useCallback(() => refreshChatUnread(), []);

  const markReadBySession = useCallback(
    async (sessionId: string | null | undefined) => {
      if (!sessionId) return;
      if ((getChatUnreadSnapshot().countsBySessionId[sessionId] ?? 0) === 0) {
        return;
      }
      // Optimistic first so the badge/pip clears instantly; the POST is
      // best-effort (next poll re-reconciles if it failed).
      applyMarkReadBySession(sessionId);
      try {
        await pixsimClient.post('/notifications/mark-read-by-ref', {
          ref_type: 'chat_session',
          ref_id: sessionId,
        });
      } catch {
        // Silent — the 15s poll will restore the true count if this lost.
      }
    },
    [],
  );

  const markQuestionReadByTab = useCallback(
    async (tabId: string | null | undefined) => {
      if (!tabId) return;
      if ((getChatUnreadSnapshot().questionsByTabId[tabId] ?? 0) === 0) {
        return;
      }
      // Optimistic first so the orange pip/badge clears instantly; the POST
      // is best-effort (next poll re-reconciles if it failed).
      applyClearQuestionByTab(tabId);
      try {
        await pixsimClient.post('/notifications/mark-read-by-ref', {
          ref_type: 'chat_tab',
          ref_id: tabId,
        });
      } catch {
        // Silent — the 15s poll will restore the true state if this lost.
      }
    },
    [],
  );

  return {
    countsBySessionId: snap.countsBySessionId,
    total: snap.total,
    questionsByTabId: snap.questionsByTabId,
    questionsTotal: snap.questionsTotal,
    activityBySessionId: snap.activityBySessionId,
    loading: snap.loading,
    refresh,
    markReadBySession,
    markQuestionReadByTab,
  };
}
