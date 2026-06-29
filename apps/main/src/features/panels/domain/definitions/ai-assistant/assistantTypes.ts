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

export interface FailedEngineEntry {
  engine: string;
  /** Opaque diagnostic from the bridge's startup probe (e.g. "binary_not_found", "timeout_8.0s"). */
  reason: string;
}

export interface BridgeAgentEntry {
  bridge_client_id: string;
  /** Bridge's primary registered agent_type, e.g. "claude-cli" / "codex-cli". */
  agent_type?: string;
  /**
   * Engines this bridge has alive in its pool. Reported by the client as
   * `["claude-cli", "codex-cli"]` etc.; suffix-stripped for comparison via
   * `normalizeEngine`. Falls back to `[agent_type]` when the pool report
   * hasn't landed yet.
   */
  engines?: string[];
  /**
   * Engines that failed the bridge's startup `<engine> --version` probe.
   * Distinct from "engine not advertised" — this means the binary was
   * configured but couldn't be launched. Surfaced in the engine-health
   * tooltip so the user knows whether to install codex or repair an
   * existing install.
   */
  failed_engines?: FailedEngineEntry[];
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
  /** Privilege level of auto-minted session tokens: 'basic' (default) | 'admin'.
      'admin' only actually elevates when the minting user is an admin. */
  token_level?: string;
}

export interface ChatSessionEntry {
  id: string;
  engine: string;
  profile_id: string | null;
  scope_key?: string | null;
  last_plan_id?: string | null;
  last_contract_id?: string | null;
  label: string;
  /**
   * Agent-set identity mirrored onto the session (survives tab close), so the
   * resume picker + `buildResumedTab` can restore the same icon/subtitle the
   * tab showed when live. Null until the agent set it via `set_tab_identity`.
   */
  icon?: string | null;
  subtitle?: string | null;
  message_count: number;
  source?: string | null;  // 'chat' | 'mcp' | 'mcp-auto' | 'bridge'
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

const LIMIT_ERROR_CODES = new Set(['agent_rate_limited']);
const SESSION_LIMIT_TEXT_RE = /\b(?:you(?:'|\u2019)ve|you have)\s+hit\s+your\s+(?:session|usage|rate)\s+limit\b|\b(?:hit|reached|exceeded)\s+(?:your\s+)?session\s+limit\b|\bsession\s+limit\s+(?:hit|reached|exceeded)\b|\b(?:session|usage)\s+limit\b[^.!?\n]{0,80}\breset(?:s|ting)?\b|\brate[-\s]?limited\b|\btoo many requests\b/i;

export function isAgentLimitError(
  value: Pick<BridgeResult, 'error' | 'error_code' | 'response'> | string | null | undefined,
): boolean {
  if (!value) return false;
  if (typeof value === 'string') return SESSION_LIMIT_TEXT_RE.test(value);
  if (value.error_code && LIMIT_ERROR_CODES.has(value.error_code)) return true;
  return SESSION_LIMIT_TEXT_RE.test([value.error, value.response].filter(Boolean).join('\n'));
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
