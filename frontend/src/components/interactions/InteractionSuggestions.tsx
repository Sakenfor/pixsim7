/**
 * Interaction Suggestions Component
 *
 * Shows smart, context-aware suggestions for what the player should do next
 */

import React from 'react';
import type { InteractionSuggestion } from '@pixsim7/game-core/interactions/suggestions';
import {
  getSuggestionIcon,
  getSuggestionColor,
  formatSuggestionScore,
} from '@pixsim7/game-core/interactions/suggestions';
import type { NpcInteractionInstance } from '@pixsim7/types';
import './InteractionSuggestions.css';

export interface InteractionSuggestionsProps {
  /** Suggestions to display */
  suggestions: InteractionSuggestion[];
  /** Callback when suggestion is clicked */
  onSelect: (interaction: NpcInteractionInstance) => void;
  /** Show detailed explanations */
  showExplanations?: boolean;
  /** Compact mode */
  compact?: boolean;
  /** Custom className */
  className?: string;
}

/**
 * Format time remaining
 */
function formatTimeRemaining(seconds: number | undefined): string | null {
  if (!seconds) return null;

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m`;
  }

  return `${seconds}s`;
}

/**
 * Individual suggestion card
 */
function SuggestionCard({
  suggestion,
  onClick,
  showExplanation,
  compact,
}: {
  suggestion: InteractionSuggestion;
  onClick: () => void;
  showExplanation: boolean;
  compact: boolean;
}) {
  const icon = getSuggestionIcon(suggestion.reason);
  const color = getSuggestionColor(suggestion.reason);
  const scoreStars = formatSuggestionScore(suggestion.score);

  return (
    <div
      className={`suggestion-card ${compact ? 'compact' : ''}`}
      onClick={onClick}
      style={{ borderLeftColor: color }}
    >
      <div className="suggestion-header">
        <span className="suggestion-icon" title={suggestion.reason}>
          {icon}
        </span>
        <span className="suggestion-label">{suggestion.interaction.label}</span>
        {scoreStars && <span className="suggestion-stars">{scoreStars}</span>}
      </div>

      {showExplanation && (
        <div className="suggestion-explanation">{suggestion.explanation}</div>
      )}

      {suggestion.context && !compact && (
        <div className="suggestion-context">
          {suggestion.context.tierProgress && (
            <div className="context-item tier-progress">
              <span className="context-label">Milestone:</span>
              <span className="context-value">
                {suggestion.context.tierProgress.affinityNeeded} affinity to{' '}
                {suggestion.context.tierProgress.next}
              </span>
            </div>
          )}

          {suggestion.context.chainInfo && (
            <div className="context-item chain-info">
              <span className="context-label">Chain:</span>
              <span className="context-value">
                {suggestion.context.chainInfo.chainName} (
                {suggestion.context.chainInfo.stepNumber}/
                {suggestion.context.chainInfo.totalSteps})
              </span>
            </div>
          )}

          {suggestion.context.timeRemaining && (
            <div className="context-item time-remaining">
              <span className="context-label">Time left:</span>
              <span className="context-value time-sensitive">
                {formatTimeRemaining(suggestion.context.timeRemaining)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Main suggestions component
 */
export function InteractionSuggestions({
  suggestions,
  onSelect,
  showExplanations = true,
  compact = false,
  className = '',
}: InteractionSuggestionsProps) {
  if (suggestions.length === 0) {
    return null; // Hide when no suggestions
  }

  return (
    <div className={`interaction-suggestions ${compact ? 'compact' : ''} ${className}`}>
      {!compact && (
        <div className="suggestions-header">
          <h4>💡 Suggested Actions</h4>
          <span className="suggestions-count">{suggestions.length}</span>
        </div>
      )}

      <div className="suggestions-list">
        {suggestions.map((suggestion, index) => (
          <SuggestionCard
            key={`${suggestion.interaction.id}-${index}`}
            suggestion={suggestion}
            onClick={() => onSelect(suggestion.interaction)}
            showExplanation={showExplanations}
            compact={compact}
          />
        ))}
      </div>
    </div>
  );
}
