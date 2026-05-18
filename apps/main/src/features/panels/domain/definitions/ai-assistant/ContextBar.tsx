/**
 * ContextBar — compact info strip above the chat textarea.
 *
 * Shows the active context for the current chat tab:
 *   - Bound plan (if any)
 *   - Session state (resumed indicator)
 *   - Context window usage (tokens / % from pool session)
 *   - Cost
 *   - Model (if overridden or from pool session)
 *   - Custom instructions / token injection indicators
 *
 * Renders nothing when there's no meaningful context to show.
 */
import { Icon } from '@lib/icons';

import type { ChatTab } from './assistantChatStore';
import type { PoolSessionInfo, UnifiedProfile } from './assistantTypes';
import type { TabPlanClaim } from './chatTabsApi';

interface ContextBarProps {
  tab: ChatTab;
  profile: UnifiedProfile | null;
  poolSession: PoolSessionInfo | null;
  /**
   * Multi-plan membership for this tab's session (participant-claim
   * ledger). When non-empty, replaces the single plan chip with a chip
   * set: primary first (the plan the sidebar groups this tab under),
   * then every other plan an agent self-assigned in this session. Empty
   * during load / for an unbound tab — falls back to the `tab.planId`
   * single chip. Plan `unify-tab-plan-categorization`.
   */
  planClaims?: TabPlanClaim[];
  sending?: boolean;
  pendingServerMessages?: number;
  serverTranscriptDiverged?: boolean;
  responseLost?: boolean;
  /** Re-fetch the server transcript (e.g. when "response lost" chip is clicked).
   *  Distinct from re-asking the agent — that lives on error message bubbles. */
  onRecheck?: () => void;
  /** Re-send the unresolved user message (one-click recovery from "response lost"). */
  onRetry?: () => void;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function contextColor(pct: number): string {
  if (pct >= 80) return 'text-red-400';
  if (pct >= 60) return 'text-amber-400';
  return 'text-emerald-400';
}

export function ContextBar({
  tab,
  profile,
  poolSession,
  planClaims,
  sending = false,
  pendingServerMessages = 0,
  serverTranscriptDiverged = false,
  responseLost = false,
  onRecheck,
  onRetry,
}: ContextBarProps) {
  const chips: React.ReactNode[] = [];
  // Prefer the live pool-session id (mirrors the in-flight CLI process), but
  // fall back to the tab's persisted sessionId so the binding is still
  // visible after a backend/bridge restart — the live pool_sessions map is
  // rebuilt only on the next dispatch, but the frontend already knows the
  // resume id (tab.sessionId == cli_session_id) and sends it on next send.
  const liveResumeId = poolSession?.cli_session_id?.trim() || null;
  const resumeSessionId = liveResumeId || (tab.sessionId?.trim() || null);
  const resumeIsLive = !!liveResumeId;

  // Plan scope — multi-plan chip set when the session's claim ledger is
  // loaded (primary first, then plans an agent self-assigned in this
  // session); otherwise the single derived-primary chip (load / unbound).
  if (planClaims && planClaims.length > 0) {
    for (const claim of planClaims) {
      chips.push(
        <span
          key={`plan:${claim.planId}`}
          className={`inline-flex items-center gap-0.5 ${
            claim.primary ? 'text-emerald-500' : 'text-emerald-500/60'
          }`}
          title={
            (claim.planTitle ? `${claim.planTitle} (${claim.planId})` : claim.planId) +
            (claim.primary ? ' · primary (sidebar group)' : ' · self-assigned')
          }
        >
          <Icon name="clipboard" size={9} />
          <span className="truncate max-w-[100px]">
            {claim.planTitle ?? claim.planId}
          </span>
        </span>,
      );
    }
  } else if (tab.planId) {
    chips.push(
      <span
        key="plan"
        className="inline-flex items-center gap-0.5 text-emerald-500"
        title={tab.planId}
      >
        <Icon name="clipboard" size={9} />
        <span className="truncate max-w-[100px]">{tab.planId}</span>
      </span>,
    );
  }

  if (!tab.sessionId && sending) {
    chips.push(
      <span key="context-pending" className="inline-flex items-center gap-0.5 text-blue-400" title="Waiting for first reply to establish session context">
        <Icon name="layers" size={9} />
        <span>context: pending</span>
      </span>,
    );
  }

  // Context window usage (from pool session)
  if (poolSession) {
    const used = formatTokens(poolSession.total_tokens);
    if (poolSession.context_window > 0) {
      // Known window — show used/total + percentage
      const pct = poolSession.context_pct ?? 0;
      const total = formatTokens(poolSession.context_window);
      chips.push(
        <span key="context" className={`inline-flex items-center gap-0.5 ${contextColor(pct)}`} title={`${poolSession.total_tokens.toLocaleString()} / ${poolSession.context_window.toLocaleString()} tokens`}>
          <Icon name="layers" size={9} />
          <span>{used}/{total}</span>
          <span className="opacity-60">({pct}%)</span>
        </span>,
      );
    } else {
      // Unknown window (Claude) — just show tokens used
      chips.push(
        <span key="context" className="inline-flex items-center gap-0.5 text-blue-400" title={`${poolSession.total_tokens.toLocaleString()} tokens used`}>
          <Icon name="layers" size={9} />
          <span>{used} tokens</span>
        </span>,
      );
    }
  }

  // Cost
  if (poolSession?.cost_usd != null && poolSession.cost_usd > 0) {
    chips.push(
      <span key="cost" className="inline-flex items-center gap-0.5 text-violet-400">
        <span>${poolSession.cost_usd.toFixed(4)}</span>
      </span>,
    );
  }

  // Server-local transcript gap
  if (responseLost) {
    chips.push(
      <span
        key="response-lost"
        className="inline-flex items-center gap-0.5 text-rose-400"
        title="Server has your message but no assistant response is recorded. The reply may have been lost during agent processing or backend restart. 'check again' refetches the server transcript; 're-ask' re-sends your last question to the agent."
      >
        <Icon name="alertCircle" size={9} />
        <span>response lost</span>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="ml-1 underline hover:text-rose-300"
          >
            re-ask
          </button>
        )}
        {onRecheck && (
          <button
            type="button"
            onClick={onRecheck}
            className="ml-1 underline hover:text-rose-300"
          >
            check again
          </button>
        )}
      </span>,
    );
  } else if (pendingServerMessages > 0) {
    chips.push(
      <span
        key="server-gap"
        className="inline-flex items-center gap-0.5 text-amber-400"
        title={`${pendingServerMessages} assistant message${pendingServerMessages === 1 ? '' : 's'} exist on server but are not visible locally yet`}
      >
        <Icon name="alertTriangle" size={9} />
        <span>{pendingServerMessages} server</span>
      </span>,
    );
  } else if (serverTranscriptDiverged) {
    chips.push(
      <span
        key="server-diverged"
        className="inline-flex items-center gap-0.5 text-amber-400"
        title="Local and server assistant transcript tails differ"
      >
        <Icon name="alertTriangle" size={9} />
        <span>sync warning</span>
      </span>,
    );
  }

  // Internal CLI resume session ID (used by Claude/Codex --resume).
  // Cyan when live (pool session active in the bridge), dimmed when bound
  // but not live yet — happens right after a backend restart, before the
  // next dispatch rebuilds the pool entry. The session is still resumable;
  // we just don't have live token/cost info to attach yet.
  if (resumeSessionId) {
    chips.push(
      <button
        key="agent-session"
        type="button"
        onClick={() => { void navigator.clipboard.writeText(resumeSessionId); }}
        className={`inline-flex items-center gap-0.5 transition-colors ${
          resumeIsLive
            ? 'text-cyan-400 hover:text-cyan-300'
            : 'text-cyan-400/50 hover:text-cyan-400/70'
        }`}
        title={
          resumeIsLive
            ? `Internal resume session: ${resumeSessionId}\nClick to copy`
            : `Bound resume session: ${resumeSessionId}\nNot live in the bridge — will resume on next message.\nClick to copy`
        }
      >
        <Icon name="hash" size={9} />
        <span>{resumeSessionId.slice(0, 8)}</span>
      </button>,
    );
  }

  // Model (manual override, live session model, or profile default)
  const model = tab.modelOverride || poolSession?.cli_model || profile?.model_id;
  if (model) {
    chips.push(
      <span key="model" className="inline-flex items-center gap-0.5 text-neutral-400">
        <Icon name="cpu" size={9} />
        <span>{model}</span>
      </span>,
    );
  } else {
    chips.push(
      <span key="engine" className="inline-flex items-center gap-0.5 text-neutral-400">
        <Icon name="cpu" size={9} />
        <span>{tab.engine}</span>
      </span>,
    );
  }

  // Custom instructions
  if (tab.customInstructions.trim()) {
    chips.push(
      <span key="instructions" className="inline-flex items-center gap-0.5 text-amber-400" title={tab.customInstructions.trim()}>
        <Icon name="fileText" size={9} />
        <span>instructions</span>
      </span>,
    );
  }

  // Token injection
  if (tab.injectToken) {
    chips.push(
      <span key="token" className="inline-flex items-center gap-0.5 text-orange-400">
        <Icon name="key" size={9} />
        <span>token</span>
      </span>,
    );
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex items-center gap-2 px-1 pb-1 text-[9px] font-medium overflow-x-auto whitespace-nowrap scrollbar-none">
      {chips.map((chip, i) => (
        <span key={i} className="contents">
          {i > 0 && <span className="text-neutral-300 dark:text-neutral-700">·</span>}
          {chip}
        </span>
      ))}
    </div>
  );
}
