/**
 * Interaction Menu Component
 *
 * Phase 17.4+: Display and execute NPC interactions with cooldown timers
 */

import React, { useState, useEffect } from 'react';
import type { NpcInteractionInstance, InteractionSurface } from '@pixsim7/shared.types';
import {
  getRemainingCooldown,
  formatCooldownSmart,
  getCooldownProgress,
} from '@pixsim7/game.engine';
import './InteractionMenu.css';

export interface InteractionMenuProps {
  /** Available interactions to display */
  interactions: NpcInteractionInstance[];

  /** Callback when an interaction is selected */
  onSelect: (interaction: NpcInteractionInstance) => void;

  /** NPC name for display */
  npcName?: string;

  /** Show unavailable interactions (grayed out) */
  showUnavailable?: boolean;

  /** Custom CSS class */
  className?: string;

  /** Loading state */
  loading?: boolean;

  /** Maximum interactions to show (for compact mode) */
  maxVisible?: number;

  /** Cooldown data: map of interaction ID to last used timestamp */
  cooldowns?: Record<string, number>;

  /** Show cooldown timers (default: true) */
  showCooldowns?: boolean;
}

/**
 * Get icon for interaction surface
 */
function getSurfaceIcon(surface: InteractionSurface): string {
  switch (surface) {
    case 'dialogue':
      return '💬';
    case 'scene':
      return '🎬';
    case 'inline':
      return '⚡';
    case 'notification':
      return '📬';
    case 'menu':
      return '📋';
    default:
      return '•';
  }
}

/**
 * Interaction menu item component
 */
function InteractionMenuItem({
  interaction,
  onClick,
  cooldownSeconds,
  lastUsedTimestamp,
  showCooldown = true,
}: {
  interaction: NpcInteractionInstance;
  onClick: () => void;
  cooldownSeconds?: number;
  lastUsedTimestamp?: number;
  showCooldown?: boolean;
}) {
  const [currentTime, setCurrentTime] = useState(Math.floor(Date.now() / 1000));

  // Update current time every second
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Math.floor(Date.now() / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const isDisabled = !interaction.available;
  const remainingCooldown = getRemainingCooldown(
    lastUsedTimestamp,
    cooldownSeconds,
    currentTime
  );
  const onCooldown = remainingCooldown > 0;
  const cooldownProgress = getCooldownProgress(
    lastUsedTimestamp,
    cooldownSeconds,
    currentTime
  );

  return (
    <button
      className={`interaction-menu-item ${isDisabled ? 'disabled' : ''} ${
        onCooldown ? 'on-cooldown' : ''
      }`}
      onClick={onClick}
      disabled={isDisabled || onCooldown}
      title={
        onCooldown
          ? `On cooldown: ${formatCooldownSmart(remainingCooldown)}`
          : isDisabled
          ? interaction.disabledMessage || 'Not available'
          : interaction.label
      }
    >
      <span className="interaction-icon">
        {interaction.icon || getSurfaceIcon(interaction.surface)}
      </span>
      <span className="interaction-label">{interaction.label}</span>

      {showCooldown && onCooldown && (
        <span className="interaction-cooldown">
          <span className="cooldown-icon">⏱️</span>
          <span className="cooldown-time">{formatCooldownSmart(remainingCooldown)}</span>
        </span>
      )}

      {showCooldown && onCooldown && (
        <div
          className="cooldown-progress-bar"
          style={{ width: `${cooldownProgress}%` }}
        />
      )}

      {isDisabled && !onCooldown && interaction.disabledMessage && (
        <span className="interaction-disabled-reason">
          {interaction.disabledMessage}
        </span>
      )}
    </button>
  );
}

/**
 * Main interaction menu component
 */
export function InteractionMenu({
  interactions,
  onSelect,
  npcName,
  showUnavailable = false,
  className = '',
  loading = false,
  maxVisible,
  cooldowns = {},
  showCooldowns = true,
}: InteractionMenuProps) {
  // Filter interactions
  const displayInteractions = showUnavailable
    ? interactions
    : interactions.filter((i) => i.available);

  // Limit if maxVisible specified
  const visibleInteractions = maxVisible
    ? displayInteractions.slice(0, maxVisible)
    : displayInteractions;

  const hasMore = maxVisible && displayInteractions.length > maxVisible;

  if (loading) {
    return (
      <div className={`interaction-menu loading ${className}`}>
        <div className="interaction-menu-header">
          {npcName && <h3>{npcName}</h3>}
        </div>
        <div className="interaction-menu-body">
          <div className="loading-spinner">Loading interactions...</div>
        </div>
      </div>
    );
  }

  if (visibleInteractions.length === 0) {
    return (
      <div className={`interaction-menu empty ${className}`}>
        <div className="interaction-menu-header">
          {npcName && <h3>{npcName}</h3>}
        </div>
        <div className="interaction-menu-body">
          <p className="empty-message">No interactions available</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`interaction-menu ${className}`}>
      <div className="interaction-menu-header">
        {npcName && <h3>{npcName}</h3>}
        <span className="interaction-count">
          {displayInteractions.filter((i) => i.available).length} available
        </span>
      </div>
      <div className="interaction-menu-body">
        {visibleInteractions.map((interaction) => {
          // Extract cooldown from interaction instance metadata
          const lastUsed = cooldowns[interaction.id];
          // Cooldown seconds should come from the interaction definition
          const cooldownSeconds = (interaction as any).cooldownSeconds;

          return (
            <InteractionMenuItem
              key={interaction.id}
              interaction={interaction}
              onClick={() => onSelect(interaction)}
              cooldownSeconds={cooldownSeconds}
              lastUsedTimestamp={lastUsed}
              showCooldown={showCooldowns}
            />
          );
        })}
        {hasMore && (
          <div className="interaction-menu-more">
            +{displayInteractions.length - maxVisible!} more
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Compact inline interaction display (for 2D HUD)
 */
export function InlineInteractionHint({
  interactions,
  onSelect,
  keyHint = 'E',
}: {
  interactions: NpcInteractionInstance[];
  onSelect: (interaction: NpcInteractionInstance) => void;
  keyHint?: string;
}) {
  // Show only the highest priority available interaction
  const primary = interactions.find((i) => i.available);

  if (!primary) {
    return null;
  }

  return (
    <div className="interaction-hint-inline">
      <kbd>{keyHint}</kbd>
      <span className="interaction-hint-label">{primary.label}</span>
      {primary.icon && <span className="interaction-hint-icon">{primary.icon}</span>}
    </div>
  );
}
