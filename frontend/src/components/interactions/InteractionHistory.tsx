/**
 * Interaction History Panel
 *
 * Displays recent interactions with an NPC, showing what was done,
 * when it happened, and what the outcomes were.
 */

import React, { useState, useEffect } from 'react';
import type { ExecuteInteractionResponse } from '@pixsim7/types';
import { formatCooldownSmart } from '@pixsim7/game-core/interactions/cooldownUtils';
import './InteractionHistory.css';

export interface InteractionHistoryEntry {
  /** When the interaction happened */
  timestamp: number;
  /** Interaction ID */
  interactionId: string;
  /** Interaction label */
  label: string;
  /** Interaction icon */
  icon?: string;
  /** NPC ID */
  npcId: number;
  /** NPC name */
  npcName?: string;
  /** Success message */
  message?: string;
  /** Relationship changes */
  relationshipDeltas?: {
    affinity?: number;
    trust?: number;
    chemistry?: number;
    tension?: number;
  };
  /** Flag changes count */
  flagChangesCount?: number;
  /** Inventory changes */
  inventoryChanges?: {
    added?: string[];
    removed?: string[];
  };
  /** Scene launched */
  launchedSceneId?: number;
  /** Generation request ID */
  generationRequestId?: string;
}

export interface InteractionHistoryProps {
  /** History entries to display */
  history: InteractionHistoryEntry[];
  /** Maximum entries to show */
  maxEntries?: number;
  /** Show relative time (e.g., "5 minutes ago") */
  showRelativeTime?: boolean;
  /** Custom className */
  className?: string;
  /** Callback when an entry is clicked (for details) */
  onEntryClick?: (entry: InteractionHistoryEntry) => void;
}

/**
 * Format timestamp as relative time
 */
function formatRelativeTime(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const elapsed = now - timestamp;

  if (elapsed < 60) {
    return 'Just now';
  }

  if (elapsed < 3600) {
    const minutes = Math.floor(elapsed / 60);
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  }

  if (elapsed < 86400) {
    const hours = Math.floor(elapsed / 3600);
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  }

  const days = Math.floor(elapsed / 86400);
  return `${days} day${days > 1 ? 's' : ''} ago`;
}

/**
 * Format relationship changes as summary
 */
function formatRelationshipChanges(deltas?: {
  affinity?: number;
  trust?: number;
  chemistry?: number;
  tension?: number;
}): string | null {
  if (!deltas) return null;

  const changes: string[] = [];

  if (deltas.affinity) {
    const sign = deltas.affinity > 0 ? '+' : '';
    changes.push(`${sign}${deltas.affinity} affinity`);
  }

  if (deltas.trust) {
    const sign = deltas.trust > 0 ? '+' : '';
    changes.push(`${sign}${deltas.trust} trust`);
  }

  if (deltas.chemistry) {
    const sign = deltas.chemistry > 0 ? '+' : '';
    changes.push(`${sign}${deltas.chemistry} chemistry`);
  }

  if (deltas.tension) {
    const sign = deltas.tension > 0 ? '+' : '';
    changes.push(`${sign}${deltas.tension} tension`);
  }

  return changes.length > 0 ? changes.join(', ') : null;
}

/**
 * Individual history entry component
 */
function HistoryEntry({
  entry,
  showRelativeTime,
  onClick,
}: {
  entry: InteractionHistoryEntry;
  showRelativeTime: boolean;
  onClick?: () => void;
}) {
  const [currentTime, setCurrentTime] = useState(Math.floor(Date.now() / 1000));

  // Update every minute for relative time
  useEffect(() => {
    if (!showRelativeTime) return;

    const interval = setInterval(() => {
      setCurrentTime(Math.floor(Date.now() / 1000));
    }, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [showRelativeTime]);

  const relationshipSummary = formatRelationshipChanges(entry.relationshipDeltas);
  const timeDisplay = showRelativeTime
    ? formatRelativeTime(entry.timestamp)
    : new Date(entry.timestamp * 1000).toLocaleString();

  return (
    <div
      className={`history-entry ${onClick ? 'clickable' : ''}`}
      onClick={onClick}
    >
      <div className="entry-header">
        <div className="entry-icon">{entry.icon || '⚡'}</div>
        <div className="entry-main">
          <div className="entry-label">{entry.label}</div>
          <div className="entry-time">{timeDisplay}</div>
        </div>
      </div>

      {entry.message && (
        <div className="entry-message">{entry.message}</div>
      )}

      {(relationshipSummary ||
        entry.inventoryChanges ||
        entry.launchedSceneId ||
        entry.generationRequestId) && (
        <div className="entry-outcomes">
          {relationshipSummary && (
            <div className="outcome relationship">
              <span className="outcome-icon">💕</span>
              <span className="outcome-text">{relationshipSummary}</span>
            </div>
          )}

          {entry.inventoryChanges?.added && entry.inventoryChanges.added.length > 0 && (
            <div className="outcome inventory-add">
              <span className="outcome-icon">📦</span>
              <span className="outcome-text">
                +{entry.inventoryChanges.added.length} item
                {entry.inventoryChanges.added.length > 1 ? 's' : ''}
              </span>
            </div>
          )}

          {entry.inventoryChanges?.removed && entry.inventoryChanges.removed.length > 0 && (
            <div className="outcome inventory-remove">
              <span className="outcome-icon">📤</span>
              <span className="outcome-text">
                -{entry.inventoryChanges.removed.length} item
                {entry.inventoryChanges.removed.length > 1 ? 's' : ''}
              </span>
            </div>
          )}

          {entry.launchedSceneId && (
            <div className="outcome scene">
              <span className="outcome-icon">🎬</span>
              <span className="outcome-text">Scene launched</span>
            </div>
          )}

          {entry.generationRequestId && (
            <div className="outcome dialogue">
              <span className="outcome-icon">💬</span>
              <span className="outcome-text">Dialogue generated</span>
            </div>
          )}

          {entry.flagChangesCount && entry.flagChangesCount > 0 && (
            <div className="outcome flags">
              <span className="outcome-icon">🚩</span>
              <span className="outcome-text">
                {entry.flagChangesCount} flag{entry.flagChangesCount > 1 ? 's' : ''} changed
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Main interaction history panel
 */
export function InteractionHistory({
  history,
  maxEntries = 20,
  showRelativeTime = true,
  className = '',
  onEntryClick,
}: InteractionHistoryProps) {
  const displayHistory = history.slice(0, maxEntries);
  const hasMore = history.length > maxEntries;

  if (history.length === 0) {
    return (
      <div className={`interaction-history empty ${className}`}>
        <div className="history-header">
          <h3>Interaction History</h3>
        </div>
        <div className="history-body">
          <p className="empty-message">No interactions yet</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`interaction-history ${className}`}>
      <div className="history-header">
        <h3>Interaction History</h3>
        <span className="history-count">{history.length} total</span>
      </div>

      <div className="history-body">
        {displayHistory.map((entry, index) => (
          <HistoryEntry
            key={`${entry.interactionId}-${entry.timestamp}-${index}`}
            entry={entry}
            showRelativeTime={showRelativeTime}
            onClick={onEntryClick ? () => onEntryClick(entry) : undefined}
          />
        ))}

        {hasMore && (
          <div className="history-more">
            +{history.length - maxEntries} more interactions
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Convert ExecuteInteractionResponse to history entry
 */
export function responseToHistoryEntry(
  response: ExecuteInteractionResponse,
  interactionId: string,
  label: string,
  npcId: number,
  npcName?: string,
  icon?: string
): InteractionHistoryEntry {
  return {
    timestamp: response.timestamp || Math.floor(Date.now() / 1000),
    interactionId,
    label,
    icon,
    npcId,
    npcName,
    message: response.message,
    relationshipDeltas: response.relationshipDeltas,
    flagChangesCount: response.flagChanges ? response.flagChanges.length : undefined,
    inventoryChanges: response.inventoryChanges,
    launchedSceneId: response.launchedSceneId,
    generationRequestId: response.generationRequestId,
  };
}
