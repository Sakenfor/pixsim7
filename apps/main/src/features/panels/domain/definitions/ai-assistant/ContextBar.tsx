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

interface ContextBarProps {
  tab: ChatTab;
  profile: UnifiedProfile | null;
  poolSession: PoolSessionInfo | null;
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

export function ContextBar({ tab, poolSession }: ContextBarProps) {
  const chips: React.ReactNode[] = [];

  // Plan scope
  if (tab.planId) {
    chips.push(
      <span key="plan" className="inline-flex items-center gap-0.5 text-emerald-500">
        <Icon name="clipboard" size={9} />
        <span className="truncate max-w-[100px]">{tab.planId}</span>
      </span>,
    );
  }

  // Context window usage (from pool session)
  if (poolSession && poolSession.total_tokens > 0) {
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

  // Model (from pool session or override)
  const model = poolSession?.cli_model || tab.modelOverride;
  if (model) {
    chips.push(
      <span key="model" className="inline-flex items-center gap-0.5 text-neutral-400">
        <Icon name="cpu" size={9} />
        <span>{model}</span>
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
