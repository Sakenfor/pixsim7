/**
 * Chat Tabs API client — thin wrapper over the new server endpoints.
 *
 * Mirrors the server schemas defined in
 * `pixsim7/backend/main/api/v1/chat_tabs.py`. Field names match the
 * server's camelCase responses; request bodies use the snake_case keys
 * the server expects.
 *
 * See plan `chat-tab-server-persistence` checkpoint B.
 */

import { pixsimClient } from '@lib/api/client';

/** Server response shape — camelCase, mirrors `ChatTabResponse`. */
export interface ServerChatTab {
  id: string;
  /**
   * Nullable: tabs are created unbound and get bound on first turn when the
   * bridge surfaces Claude's real ``cli_session_id``. See plan
   * `chat-tab-server-persistence` (first-turn resume-failure fix).
   */
  sessionId: string | null;
  label: string;
  /**
   * Agent-set tab identity (plan `agent-freeform-tab-identity`). `icon` is an
   * `@lib/icons` IconName; `subtitle` renders under the tab title in the
   * profile-name slot. Null until the agent sets them via `set_tab_identity`.
   */
  icon: string | null;
  subtitle: string | null;
  draft: string | null;
  orderIndex: number;
  planId: string | null;
  /**
   * Derived plan the left sidebar groups this tab under: `planId` if set,
   * else the most-recent open session claim (so an agent-self-assigned-only
   * tab still groups). List-endpoint only; create/PATCH echo `planId`.
   * Plan `unify-tab-plan-categorization`. Optional (mirrors `icon`/
   * `subtitle`): older payloads / non-list responses omit it and the
   * store falls back to `planId`.
   */
  primaryPlanId?: string | null;
  /**
   * Session-derived preference hints. Used by clients that do not yet have
   * local tab-prefs for this tab id (cross-device open).
   */
  engine?: string | null;
  profileId?: string | null;
  scopeKey: string | null;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  /**
   * Client-only flag. `'creating'` while an optimistic insert's `POST
   * /chat-tabs` is in flight (the row exists locally with a client-minted id
   * but the server hasn't persisted it yet); `'create-failed'` when that POST
   * rejected and the row was preserved in the snapshot instead of being
   * silently rolled back. Either value means "the server doesn't know this
   * tab id yet" — gate server-side ops (PATCH, plan-claims fetch) on its
   * absence to avoid 404s. See plan `chat-tab-server-persistence`
   * checkpoint F. The server never sends this — `apiCreate*` responses leave
   * it undefined.
   */
  pending?: 'creating' | 'create-failed';
}

interface ChatTabsListResponse {
  tabs: ServerChatTab[];
}

/** POST body — snake_case to match server. */
export interface CreateChatTabPayload {
  /** Optional client-minted UUID for sync optimistic UI. */
  id?: string;
  session_id?: string;
  label?: string;
  icon?: string | null;
  subtitle?: string | null;
  plan_id?: string | null;
  scope_key?: string | null;
  pinned?: boolean;
  draft?: string | null;
  order_index?: number;
  // Only used when session_id is omitted (server auto-creates a ChatSession):
  engine?: string;
  profile_id?: string;
}

/** PATCH body — only fields present are written. `null` clears nullable cols. */
export interface UpdateChatTabPayload {
  label?: string;
  /** Agent-set identity. `null` clears (plan `agent-freeform-tab-identity`). */
  icon?: string | null;
  subtitle?: string | null;
  plan_id?: string | null;
  scope_key?: string | null;
  pinned?: boolean;
  draft?: string | null;
  order_index?: number;
  /**
   * First-turn bind: set when the bridge surfaces Claude's real
   * ``cli_session_id``. Server validates ownership before persisting.
   * See plan `chat-tab-server-persistence` (first-turn resume-failure fix).
   */
  session_id?: string | null;
}

export interface ReorderEntry {
  id: string;
  order_index: number;
}

interface ReorderResponse {
  ok: boolean;
  updated: number;
}

const SURFACE_HEADER = {
  'X-Client-Surface': 'lib:chat-tabs-api',
} as const;

export async function listChatTabs(): Promise<ServerChatTab[]> {
  const res = await pixsimClient.get<ChatTabsListResponse>('/chat-tabs', {
    headers: SURFACE_HEADER,
  });
  return res.tabs;
}

export async function createChatTab(
  payload: CreateChatTabPayload,
): Promise<ServerChatTab> {
  return pixsimClient.post<ServerChatTab>('/chat-tabs', payload, {
    headers: SURFACE_HEADER,
  });
}

export async function updateChatTab(
  tabId: string,
  payload: UpdateChatTabPayload,
): Promise<ServerChatTab> {
  return pixsimClient.patch<ServerChatTab>(
    `/chat-tabs/${tabId}`,
    payload,
    { headers: SURFACE_HEADER },
  );
}

export async function deleteChatTab(tabId: string): Promise<void> {
  await pixsimClient.delete(`/chat-tabs/${tabId}`, {
    headers: SURFACE_HEADER,
  });
}

export async function reorderChatTabs(
  tabs: ReorderEntry[],
): Promise<ReorderResponse> {
  return pixsimClient.post<ReorderResponse>(
    '/chat-tabs/reorder',
    { tabs },
    { headers: SURFACE_HEADER },
  );
}

/**
 * A ChatSession the caller could re-open into a new tab (no ChatTab points
 * at it yet). See plan `chat-tab-server-persistence` checkpoint E.
 */
export interface OrphanSession {
  id: string;
  engine: string;
  label: string;
  /** Agent-set identity mirrored from the (closed) tab — see `ServerChatTab`. */
  icon: string | null;
  subtitle: string | null;
  profileId: string | null;
  scopeKey: string | null;
  lastPlanId: string | null;
  messageCount: number;
  lastUsedAt: string;
  createdAt: string;
  source: string | null;
}

interface OrphanSessionsResponse {
  sessions: OrphanSession[];
}

export async function listOrphanSessions(limit = 50): Promise<OrphanSession[]> {
  const res = await pixsimClient.get<OrphanSessionsResponse>(
    '/chat-tabs/orphan-sessions',
    { headers: SURFACE_HEADER, params: { limit } },
  );
  return res.sessions;
}

/**
 * One plan this tab's chat session is on (multi-plan membership). Mirrors
 * `TabPlanClaim` in `pixsim7/backend/main/api/v1/chat_tabs.py`.
 *
 * `primary` marks the single plan the left sidebar groups this tab under
 * (the derived `ChatTab.plan_id`); the rest are surfaced only in the chat
 * header. See plan `plan-participant-liveness` /
 * `unify-tab-plan-categorization`.
 */
export interface TabPlanClaim {
  planId: string;
  planTitle: string | null;
  checkpointId: string | null;
  claimedAt: string | null;
  primary: boolean;
}

export interface TabPlanClaimsResponse {
  tabId: string;
  sessionId: string | null;
  primaryPlanId: string | null;
  plans: TabPlanClaim[];
}

export async function listTabPlanClaims(
  tabId: string,
): Promise<TabPlanClaimsResponse> {
  return pixsimClient.get<TabPlanClaimsResponse>(
    `/chat-tabs/${tabId}/plan-claims`,
    { headers: SURFACE_HEADER },
  );
}
