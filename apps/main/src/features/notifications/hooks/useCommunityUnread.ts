/**
 * React hook over the community-chat unread poll (plan `community-chat`
 * Phase 3B). Mirrors `useChatUnread` for the AI Assistant.
 *
 * Returns a snapshot of unread counts per conversation + the aggregate
 * total, plus a `markReadByConversation` action that optimistically clears
 * locally and fires `POST /notifications/mark-read-by-ref`. Caller pays no
 * attention to the poll lifecycle — start/stop is ref-counted across all
 * subscribers.
 */
import { useCallback, useEffect, useState } from 'react';

import { pixsimClient } from '@lib/api/client';

import {
  applyMarkReadByConversation,
  getCommunityUnreadSnapshot,
  refreshCommunityUnread,
  subscribeCommunityUnread,
  type CommunityUnreadSnapshot,
} from '../lib/communityUnreadPoll';

export interface UseCommunityUnreadResult {
  countsByConversationId: Record<string, number>;
  total: number;
  loading: boolean;
  refresh: () => Promise<void>;
  markReadByConversation: (conversationId: string | null | undefined) => Promise<void>;
}

export function useCommunityUnread(): UseCommunityUnreadResult {
  const [snap, setSnap] = useState<CommunityUnreadSnapshot>(getCommunityUnreadSnapshot);

  useEffect(() => subscribeCommunityUnread(setSnap), []);

  const refresh = useCallback(() => refreshCommunityUnread(), []);

  const markReadByConversation = useCallback(
    async (conversationId: string | null | undefined) => {
      if (!conversationId) return;
      applyMarkReadByConversation(conversationId); // optimistic
      try {
        await pixsimClient.post('/notifications/mark-read-by-ref', {
          ref_type: 'conversation',
          ref_id: conversationId,
        });
      } catch {
        // Silent — next 15s poll reconciles if POST failed.
      }
    },
    [],
  );

  return {
    countsByConversationId: snap.countsByConversationId,
    total: snap.total,
    loading: snap.loading,
    refresh,
    markReadByConversation,
  };
}
