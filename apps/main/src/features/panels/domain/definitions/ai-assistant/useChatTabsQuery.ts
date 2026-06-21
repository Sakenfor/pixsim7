/**
 * useChatTabsQuery — React hook over the shared chat-tabs poll.
 *
 * Wraps the singleton subscription pattern (mirrors `useNotifications`)
 * plus mutation helpers that:
 *   1. Mint a client UUID for optimistic insert
 *   2. Apply the change to the in-memory snapshot
 *   3. Fire the server call
 *   4. Rollback on failure
 *
 * The mutation helpers are also exported as module-level functions so
 * non-React consumers (and unit tests) can call them directly.
 *
 * See plan `chat-tab-server-persistence` checkpoint B.
 */

import { useCallback, useEffect, useState } from 'react';

import {
  createChatTab as apiCreateChatTab,
  deleteChatTab as apiDeleteChatTab,
  reorderChatTabs as apiReorderChatTabs,
  updateChatTab as apiUpdateChatTab,
  type CreateChatTabPayload,
  type UpdateChatTabPayload,
} from './chatTabsApi';
import {
  applyInsertTab,
  applyRemoveTab,
  applyReorder,
  applyRollback,
  applyUpdateTab,
  clearPending,
  clearLastError,
  getChatTabsSnapshot,
  refreshChatTabs,
  setLastError,
  subscribeChatTabs,
  type ChatTabsSnapshot,
  type ServerChatTab,
} from './chatTabsPoll';

export interface ReorderOrder {
  id: string;
  orderIndex: number;
}

export interface UseChatTabsQueryResult {
  tabs: ServerChatTab[];
  loading: boolean;
  hydrated: boolean;
  refresh: () => Promise<void>;
  createTab: (payload: CreateChatTabPayload) => Promise<ServerChatTab>;
  updateTab: (tabId: string, payload: UpdateChatTabPayload) => Promise<ServerChatTab>;
  deleteTab: (tabId: string) => Promise<void>;
  reorderTabs: (order: ReorderOrder[]) => Promise<void>;
}

/**
 * Mint a UUID v4 for optimistic tab creation.
 *
 * Falls back to a manual implementation for old test environments where
 * `crypto.randomUUID` isn't available.
 */
export function mintTabId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = Math.floor(Math.random() * 16);
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ---------------------------------------------------------------------------
// Module-level mutation helpers — testable without React Testing Library.
// Each: snapshot → optimistic apply → server call → on success reconcile,
// on failure full-snapshot rollback.
// ---------------------------------------------------------------------------

export async function createTabOptimistic(
  payload: CreateChatTabPayload,
): Promise<ServerChatTab> {
  const id = payload.id ?? mintTabId();
  const nowIso = new Date().toISOString();
  const before = getChatTabsSnapshot().tabs;
  const optimistic: ServerChatTab = {
    id,
    // Tabs are created unbound; the server now leaves session_id NULL until
    // the bridge binds it on first turn (plan `chat-tab-server-persistence`
    // — first-turn resume-failure fix). Use null directly so the optimistic
    // row matches the server's shape.
    sessionId: payload.session_id ?? null,
    label: payload.label ?? 'Untitled',
    icon: payload.icon ?? null,
    subtitle: payload.subtitle ?? null,
    draft: payload.draft ?? null,
    orderIndex:
      payload.order_index ??
      (before.length === 0 ? 0 : Math.max(...before.map((t) => t.orderIndex)) + 1),
    planId: payload.plan_id ?? null,
    engine: payload.engine ?? null,
    profileId: payload.profile_id ?? null,
    scopeKey: payload.scope_key ?? null,
    pinned: payload.pinned ?? false,
    createdAt: nowIso,
    updatedAt: nowIso,
    // Mark in-flight so server-side ops (PATCH, plan-claims fetch) gate off
    // this row until the POST below persists it — otherwise they 404 on a
    // tab id the server hasn't seen yet.
    pending: 'creating',
  };
  applyInsertTab(optimistic);
  try {
    const server = await apiCreateChatTab({ ...payload, id });
    // Replace optimistic row with server truth (session_id may have been
    // server-assigned, createdAt is canonical, etc.), then clear the
    // `pending` marker via the dedicated path — `applyUpdateTab` skips
    // `undefined` keys, so `pending: undefined` would be a silent no-op and
    // the `'creating'` flag would stick until the next poll.
    applyUpdateTab(id, server);
    clearPending(id);
    clearLastError();
    return server;
  } catch (err) {
    // Preserve the optimistic row instead of yanking it — the user sees
    // "creation failed, retry?" rather than a vanishing tab. The row's
    // sessionId is still the empty-string placeholder; the panel must
    // gate server-side ops on `pending` until retry succeeds.
    applyUpdateTab(id, { pending: 'create-failed' });
    setLastError({
      kind: 'create',
      message: errorMessage(err),
      at: Date.now(),
      tabId: id,
    });
    throw err;
  }
}

/**
 * Retry a previously-failed create. Pass the same payload the original call
 * used — the row id is already in the snapshot from the first attempt, so we
 * re-POST with that id (the server expects to see the row absent and inserts
 * fresh). On success, the pending flag is cleared and the snapshot row is
 * reconciled with the server's response.
 */
export async function retryFailedCreate(
  tabId: string,
  payload: CreateChatTabPayload,
): Promise<ServerChatTab> {
  // Clear the failed flag while the retry is in flight (dedicated path —
  // `applyUpdateTab` can't remove `pending` via `undefined`).
  clearPending(tabId);
  try {
    const server = await apiCreateChatTab({ ...payload, id: tabId });
    applyUpdateTab(tabId, server);
    clearPending(tabId);
    clearLastError();
    return server;
  } catch (err) {
    applyUpdateTab(tabId, { pending: 'create-failed' });
    setLastError({
      kind: 'create',
      message: errorMessage(err),
      at: Date.now(),
      tabId,
    });
    throw err;
  }
}

/**
 * Drop a failed-create row from the snapshot without contacting the server.
 * Used by the "Dismiss" affordance next to the inline create-failed badge.
 * Safe to call on any tab id — non-pending rows are a no-op.
 */
export function dismissFailedCreate(tabId: string): void {
  const tab = getChatTabsSnapshot().tabs.find((t) => t.id === tabId);
  if (!tab || tab.pending !== 'create-failed') return;
  applyRemoveTab(tabId);
  // Clear the banner only if it was scoped to this same tab.
  const err = getChatTabsSnapshot().lastError;
  if (err?.kind === 'create' && err.tabId === tabId) {
    clearLastError();
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return 'Unknown error';
  }
}

export async function updateTabOptimistic(
  tabId: string,
  payload: UpdateChatTabPayload,
): Promise<ServerChatTab> {
  const before = getChatTabsSnapshot().tabs;
  // Mirror the snake_case PATCH to the camelCase snapshot shape.
  const camelPatch: Partial<ServerChatTab> = {};
  if (payload.label !== undefined) camelPatch.label = payload.label;
  if (payload.icon !== undefined) camelPatch.icon = payload.icon;
  if (payload.subtitle !== undefined) camelPatch.subtitle = payload.subtitle;
  if (payload.plan_id !== undefined) camelPatch.planId = payload.plan_id;
  if (payload.scope_key !== undefined) camelPatch.scopeKey = payload.scope_key;
  if (payload.pinned !== undefined) camelPatch.pinned = payload.pinned;
  if (payload.draft !== undefined) camelPatch.draft = payload.draft;
  if (payload.order_index !== undefined) camelPatch.orderIndex = payload.order_index;
  if (payload.session_id !== undefined) camelPatch.sessionId = payload.session_id;
  applyUpdateTab(tabId, camelPatch);
  try {
    const server = await apiUpdateChatTab(tabId, payload);
    applyUpdateTab(tabId, server);
    // Per-tab error (matching this id) is now stale — clear it.
    const err = getChatTabsSnapshot().lastError;
    if (err && err.tabId === tabId) clearLastError();
    return server;
  } catch (err) {
    applyRollback(before);
    setLastError({
      kind: 'update',
      message: errorMessage(err),
      at: Date.now(),
      tabId,
    });
    throw err;
  }
}

export async function deleteTabOptimistic(tabId: string): Promise<void> {
  const before = getChatTabsSnapshot().tabs;
  applyRemoveTab(tabId);
  try {
    await apiDeleteChatTab(tabId);
    const err = getChatTabsSnapshot().lastError;
    if (err && err.tabId === tabId) clearLastError();
  } catch (err) {
    applyRollback(before);
    setLastError({
      kind: 'delete',
      message: errorMessage(err),
      at: Date.now(),
      tabId,
    });
    throw err;
  }
}

export async function reorderTabsOptimistic(order: ReorderOrder[]): Promise<void> {
  const before = getChatTabsSnapshot().tabs;
  applyReorder(order);
  try {
    await apiReorderChatTabs(order.map((e) => ({ id: e.id, order_index: e.orderIndex })));
    const err = getChatTabsSnapshot().lastError;
    if (err?.kind === 'reorder') clearLastError();
  } catch (err) {
    applyRollback(before);
    setLastError({
      kind: 'reorder',
      message: errorMessage(err),
      at: Date.now(),
    });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// React hook
// ---------------------------------------------------------------------------

export function useChatTabsQuery(): UseChatTabsQueryResult {
  const [snap, setSnap] = useState<ChatTabsSnapshot>(getChatTabsSnapshot);

  useEffect(() => subscribeChatTabs(setSnap), []);

  const refresh = useCallback(() => refreshChatTabs(), []);
  const createTab = useCallback(createTabOptimistic, []);
  const updateTab = useCallback(updateTabOptimistic, []);
  const deleteTab = useCallback(deleteTabOptimistic, []);
  const reorderTabs = useCallback(reorderTabsOptimistic, []);

  return {
    tabs: snap.tabs,
    loading: snap.loading,
    hydrated: snap.hydrated,
    refresh,
    createTab,
    updateTab,
    deleteTab,
    reorderTabs,
  };
}
