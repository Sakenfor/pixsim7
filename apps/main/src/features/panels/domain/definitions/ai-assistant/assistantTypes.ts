/**
 * Shared types, constants, and helpers for the AI Assistant panel.
 * Leaf module — no internal dependencies except assistantChatStore/Bridge types.
 */

import type { IconName } from '@lib/icons';

import type { BridgeResult } from './assistantChatBridge';
import type { ChatMessage, AgentCommand } from './assistantChatStore';

// =============================================================================
// Types
// =============================================================================

export interface PoolSessionInfo {
  session_id: string;
  cli_session_id?: string | null;
  cli_model?: string | null;
  state: string;
  context_window: number;
  total_tokens: number;
  context_pct?: number | null;
  cost_usd?: number | null;
}

export interface BridgeAgentEntry {
  bridge_client_id: string;
  pool_sessions: PoolSessionInfo[];
}

export interface BridgeStatus {
  connected: number;
  available: number;
  process_alive?: boolean;
  managed_by?: string | null;
  agents?: BridgeAgentEntry[];
}

/** Unified profile — both agent identity and assistant persona */
export interface UnifiedProfile {
  id: string;
  label: string;
  description: string | null;
  icon: string | null;
  agent_type: string;
  method: string | null;
  model_id: string | null;
  system_prompt: string | null;
  audience: string;
  status: string;
  is_default: boolean;
  is_global: boolean;
  config: Record<string, unknown> | null;
}

export interface ChatSessionEntry {
  id: string;
  engine: string;
  profile_id: string | null;
  scope_key?: string | null;
  last_plan_id?: string | null;
  last_contract_id?: string | null;
  label: string;
  message_count: number;
  last_used_at: string;
}

export interface ReferenceScope {
  planId: string | null;
  contractId: string | null;
  scopeKey: string | null;
}

// =============================================================================
// Cross-panel event constants
// =============================================================================

export const INJECT_PROMPT_EVENT = 'ai-assistant:inject-prompt';
export const RESUME_SESSION_EVENT = 'ai-assistant:resume-session';
export const OPEN_PLAN_CHAT_EVENT = 'ai-assistant:open-plan-chat';

export interface InjectPromptDetail {
  prompt: string;
  mode?: 'replace' | 'append';
}

export interface ResumeSessionDetail {
  sessionId: string;
  engine: string;
  label: string;
  profileId?: string | null;
}

export interface OpenPlanChatDetail {
  planId: string;
  planTitle?: string;
}

// =============================================================================
// Constants
// =============================================================================

export const EMPTY_CHAT_MESSAGES: ChatMessage[] = [];
export const EMPTY_THINKING_LOG: Array<{ action: string; detail: string; timestamp?: number }> = [];

/** Agent commands available in cmd (bridge) mode */
export const AGENT_COMMANDS: { id: AgentCommand; label: string; icon: IconName }[] = [
  { id: 'claude', label: 'Claude', icon: 'messageSquare' },
  { id: 'codex', label: 'Codex', icon: 'cpu' },
];

// =============================================================================
// Helpers
// =============================================================================

export function isSameThinkingLog(
  left: Array<{ action: string; detail: string; timestamp?: number }>,
  right: Array<{ action: string; detail: string; timestamp?: number }>,
): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    if (left[i].action !== right[i].action) return false;
    if (left[i].detail !== right[i].detail) return false;
    if ((left[i].timestamp ?? null) !== (right[i].timestamp ?? null)) return false;
  }
  return true;
}

export function renderBridgeError(result: Pick<BridgeResult, 'error' | 'error_code' | 'error_details'>): string {
  const code = result.error_code || '';
  if (code === 'scoped_session_busy' || code === 'conversation_session_busy') {
    const details = result.error_details || {};
    const activity = typeof details.activity === 'string' ? details.activity : null;
    const busyFor = typeof details.busy_for_s === 'number' ? details.busy_for_s : null;
    const extra: string[] = [];
    if (typeof busyFor === 'number' && busyFor >= 0) extra.push(`busy for ${busyFor}s`);
    if (activity) extra.push(activity);
    const suffix = extra.length ? ` (${extra.join(' - ')})` : '';
    return `This tab already has an active request. Wait for it to finish or cancel and retry.${suffix}`;
  }
  return result.error || 'No response from agent';
}

/** Find the pool session matching a tab's CLI session ID. */
export function findPoolSession(bridge: BridgeStatus | null, cliSessionId: string | null): PoolSessionInfo | null {
  if (!bridge?.agents || !cliSessionId) return null;
  for (const agent of bridge.agents) {
    for (const ps of agent.pool_sessions) {
      if (ps.cli_session_id === cliSessionId) return ps;
    }
  }
  return null;
}

export function normalizeReferenceId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/[)\],.;!?]+$/g, '');
  return trimmed || null;
}

export function extractReferenceScope(text: string): ReferenceScope {
  let planId: string | null = null;
  const planRegex = /@plan:([^\s]+)/gi;

  let match: RegExpExecArray | null;
  while ((match = planRegex.exec(text)) !== null) {
    const normalized = normalizeReferenceId(match[1]);
    if (normalized) planId = normalized;
  }

  const scopeKey = planId ? `plan:${planId}` : null;

  return { planId, contractId: null, scopeKey };
}
