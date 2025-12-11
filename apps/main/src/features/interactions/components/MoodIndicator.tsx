/**
 * NPC Mood Indicator
 *
 * Shows current NPC mood state with visual indicators
 */

import React from 'react';
import { getMoodIcon, getMoodColor } from '@pixsim7/game.engine';
import type { GeneralMood, IntimacyMood, MoodState } from '@pixsim7/game.engine';
import './MoodIndicator.css';

export interface MoodIndicatorProps {
  /** Current mood state */
  mood: MoodState;
  /** Show detailed mood info */
  showDetails?: boolean;
  /** Compact mode */
  compact?: boolean;
  /** Custom className */
  className?: string;
}

/**
 * Format mood name for display
 */
function formatMoodName(mood: string): string {
  return mood.charAt(0).toUpperCase() + mood.slice(1);
}

/**
 * Mood bar (valence/arousal visualization)
 */
function MoodBar({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  const percentage = Math.round(value * 100);

  return (
    <div className="mood-bar-container">
      <div className="mood-bar-label">{label}</div>
      <div className="mood-bar-track">
        <div
          className="mood-bar-fill"
          style={{
            width: `${percentage}%`,
            background: color,
          }}
        />
      </div>
      <div className="mood-bar-value">{percentage}%</div>
    </div>
  );
}

/**
 * Active emotion pill
 */
function EmotionPill({
  emotion,
  intensity,
  expiresAt,
}: {
  emotion: string;
  intensity: number;
  expiresAt?: number;
}) {
  const now = Math.floor(Date.now() / 1000);
  const timeRemaining = expiresAt ? expiresAt - now : null;

  return (
    <div
      className="emotion-pill"
      style={{
        opacity: 0.5 + intensity * 0.5,
      }}
    >
      <span className="emotion-name">{formatMoodName(emotion)}</span>
      {timeRemaining && timeRemaining > 0 && (
        <span className="emotion-time">
          {Math.floor(timeRemaining / 60)}m
        </span>
      )}
    </div>
  );
}

/**
 * Main mood indicator component
 */
export function MoodIndicator({
  mood,
  showDetails = false,
  compact = false,
  className = '',
}: MoodIndicatorProps) {
  const generalIcon = getMoodIcon(mood.general.mood as GeneralMood);
  const generalColor = getMoodColor(mood.general.mood as GeneralMood);

  if (compact) {
    return (
      <div className={`mood-indicator compact ${className}`}>
        <span className="mood-icon" title={formatMoodName(mood.general.mood)}>
          {generalIcon}
        </span>
        {mood.intimacy && (
          <span
            className="mood-icon intimacy"
            title={formatMoodName(mood.intimacy.mood)}
          >
            {getMoodIcon(mood.intimacy.mood as IntimacyMood)}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={`mood-indicator ${className}`}>
      <div className="mood-header">
        <div className="mood-primary">
          <span className="mood-icon" style={{ color: generalColor }}>
            {generalIcon}
          </span>
          <span className="mood-name">{formatMoodName(mood.general.mood)}</span>
        </div>

        {mood.intimacy && (
          <div className="mood-secondary">
            <span
              className="mood-icon"
              style={{ color: getMoodColor(mood.intimacy.mood as IntimacyMood) }}
            >
              {getMoodIcon(mood.intimacy.mood as IntimacyMood)}
            </span>
            <span className="mood-name intimacy">
              {formatMoodName(mood.intimacy.mood)}
            </span>
          </div>
        )}
      </div>

      {showDetails && (
        <>
          <div className="mood-metrics">
            <MoodBar
              label="Valence"
              value={mood.general.valence}
              color="linear-gradient(90deg, #F44336, #4CAF50)"
            />
            <MoodBar
              label="Arousal"
              value={mood.general.arousal}
              color="linear-gradient(90deg, #2196F3, #FF9800)"
            />
          </div>

          {mood.activeEmotions && mood.activeEmotions.length > 0 && (
            <div className="active-emotions">
              <div className="emotions-label">Active Emotions</div>
              <div className="emotions-list">
                {mood.activeEmotions.map((emotion, index) => (
                  <EmotionPill
                    key={`${emotion.emotion}-${index}`}
                    emotion={emotion.emotion}
                    intensity={emotion.intensity}
                    expiresAt={emotion.expiresAt}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
