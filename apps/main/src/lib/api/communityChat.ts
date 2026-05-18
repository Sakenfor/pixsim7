/**
 * Community chat API (web wrapper).
 *
 * Plan `community-chat` / checkpoint `community-room`. Single shared room:
 * fetch history + send via REST; live updates arrive over the
 * `/ws/community-chat` WebSocket (see ChatView).
 */
import { pixsimClient } from './client';

export interface CommunityChatMessage {
  id: string;
  conversation_id: string;
  sender: string;
  body: string;
  created_at: string;
}

export interface CommunityRoomResponse {
  conversation_id: string;
  messages: CommunityChatMessage[];
  unread_count: number;
}

export async function getCommunityRoom(): Promise<CommunityRoomResponse> {
  return pixsimClient.get<CommunityRoomResponse>('/community-chat/room');
}

export async function sendCommunityMessage(
  body: string,
): Promise<CommunityChatMessage> {
  return pixsimClient.post<CommunityChatMessage>('/community-chat/messages', {
    body,
  });
}

export async function markCommunityRoomRead(): Promise<void> {
  await pixsimClient.post('/community-chat/room/read', {});
}
