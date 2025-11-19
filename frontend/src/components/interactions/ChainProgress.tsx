/**
 * Chain Progress Display
 *
 * Shows progress through interaction chains/sequences
 */

import React from 'react';
import type { InteractionChain, ChainState } from '@pixsim7/game-core/interactions/chains';
import { getChainProgress } from '@pixsim7/game-core/interactions/chains';
import './ChainProgress.css';

export interface ChainProgressProps {
  /** Chain definition */
  chain: InteractionChain;
  /** Current chain state */
  state: ChainState | null;
  /** Show detailed step list */
  showSteps?: boolean;
  /** Compact mode */
  compact?: boolean;
  /** Custom className */
  className?: string;
  /** Callback when step is clicked */
  onStepClick?: (stepId: string) => void;
}

/**
 * Format step status
 */
function getStepStatus(
  stepId: string,
  stepIndex: number,
  state: ChainState | null
): 'completed' | 'current' | 'skipped' | 'locked' {
  if (!state) {
    return stepIndex === 0 ? 'current' : 'locked';
  }

  if (state.completedSteps.includes(stepId)) {
    return 'completed';
  }

  if (state.skippedSteps.includes(stepId)) {
    return 'skipped';
  }

  if (stepIndex === state.currentStep) {
    return 'current';
  }

  return 'locked';
}

/**
 * Get status icon
 */
function getStatusIcon(status: string): string {
  switch (status) {
    case 'completed':
      return '✅';
    case 'current':
      return '▶️';
    case 'skipped':
      return '⏭️';
    case 'locked':
      return '🔒';
    default:
      return '•';
  }
}

/**
 * Get category icon
 */
function getCategoryIcon(category?: InteractionChain['category']): string {
  switch (category) {
    case 'quest':
      return '📜';
    case 'romance':
      return '💕';
    case 'friendship':
      return '🤝';
    case 'story':
      return '📖';
    case 'tutorial':
      return '📚';
    default:
      return '🔗';
  }
}

/**
 * Chain progress bar
 */
function ProgressBar({ progress }: { progress: number }) {
  const percentage = Math.round(progress * 100);

  return (
    <div className="chain-progress-bar-container">
      <div className="chain-progress-bar" style={{ width: `${percentage}%` }}>
        <span className="chain-progress-text">{percentage}%</span>
      </div>
    </div>
  );
}

/**
 * Chain step item
 */
function ChainStepItem({
  step,
  index,
  state,
  onClick,
}: {
  step: any;
  index: number;
  state: ChainState | null;
  onClick?: () => void;
}) {
  const status = getStepStatus(step.stepId, index, state);
  const icon = getStatusIcon(status);
  const clickable = status === 'current' && onClick;

  return (
    <div
      className={`chain-step ${status} ${clickable ? 'clickable' : ''}`}
      onClick={clickable ? onClick : undefined}
      title={step.interaction.label}
    >
      <span className="step-icon">{icon}</span>
      <span className="step-number">{index + 1}</span>
      <span className="step-label">{step.interaction.label}</span>
      {step.optional && <span className="step-optional-badge">Optional</span>}
    </div>
  );
}

/**
 * Main chain progress component
 */
export function ChainProgress({
  chain,
  state,
  showSteps = true,
  compact = false,
  className = '',
  onStepClick,
}: ChainProgressProps) {
  const progress = getChainProgress(chain, state);
  const categoryIcon = getCategoryIcon(chain.category);
  const isCompleted = state?.completed ?? false;
  const completionCount = state?.completionCount ?? 0;

  if (compact) {
    return (
      <div className={`chain-progress compact ${className}`}>
        <div className="chain-header-compact">
          <span className="chain-icon">{categoryIcon}</span>
          <span className="chain-name">{chain.name}</span>
          {isCompleted && <span className="completion-badge">✓</span>}
          {chain.repeatable && completionCount > 0 && (
            <span className="repeat-count">×{completionCount}</span>
          )}
        </div>
        <ProgressBar progress={progress} />
      </div>
    );
  }

  return (
    <div className={`chain-progress ${className} ${isCompleted ? 'completed' : ''}`}>
      <div className="chain-header">
        <div className="chain-title">
          <span className="chain-icon">{categoryIcon}</span>
          <h4>{chain.name}</h4>
          {isCompleted && <span className="completion-badge">Completed</span>}
        </div>

        {chain.description && <p className="chain-description">{chain.description}</p>}

        <div className="chain-meta">
          <span className="chain-steps-count">
            {state?.completedSteps.length || 0} / {chain.steps.length} steps
          </span>
          {chain.repeatable && (
            <span className="chain-repeatable">
              🔄 Repeatable
              {completionCount > 0 && ` (×${completionCount})`}
            </span>
          )}
        </div>
      </div>

      <ProgressBar progress={progress} />

      {showSteps && (
        <div className="chain-steps-list">
          {chain.steps.map((step, index) => (
            <ChainStepItem
              key={step.stepId}
              step={step}
              index={index}
              state={state}
              onClick={onStepClick ? () => onStepClick(step.stepId) : undefined}
            />
          ))}
        </div>
      )}

      {isCompleted && chain.repeatable && (
        <div className="chain-repeat-info">
          {chain.repeatCooldownSeconds && state?.completedAt && (
            <p className="repeat-cooldown">
              Can repeat in{' '}
              {Math.ceil(
                (chain.repeatCooldownSeconds -
                  (Math.floor(Date.now() / 1000) - state.completedAt)) /
                  3600
              )}{' '}
              hours
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Chain list showing multiple chains
 */
export function ChainList({
  chains,
  states,
  compact = false,
  className = '',
  onStepClick,
}: {
  chains: InteractionChain[];
  states: Record<string, ChainState | null>;
  compact?: boolean;
  className?: string;
  onStepClick?: (chainId: string, stepId: string) => void;
}) {
  if (chains.length === 0) {
    return (
      <div className={`chain-list empty ${className}`}>
        <p className="empty-message">No active chains</p>
      </div>
    );
  }

  return (
    <div className={`chain-list ${className}`}>
      {chains.map((chain) => (
        <ChainProgress
          key={chain.id}
          chain={chain}
          state={states[chain.id] || null}
          compact={compact}
          onStepClick={onStepClick ? (stepId) => onStepClick(chain.id, stepId) : undefined}
        />
      ))}
    </div>
  );
}
