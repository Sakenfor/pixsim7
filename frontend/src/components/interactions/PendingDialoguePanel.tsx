/**
 * Panel for displaying and executing pending dialogue requests
 *
 * Example usage:
 * <PendingDialoguePanel
 *   sessionId={sessionId}
 *   onDialogueExecuted={(result) => console.log('NPC said:', result.text)}
 * />
 */

import React from 'react';
import { usePendingDialogue } from '../../lib/hooks/usePendingDialogue';
import type { ExecutedDialogue } from '../../lib/hooks/usePendingDialogue';
import './PendingDialoguePanel.css';

export interface PendingDialoguePanelProps {
  /** Game session ID */
  sessionId: number;
  /** Auto-execute pending dialogues (default: false) */
  autoExecute?: boolean;
  /** Callback when dialogue is executed */
  onDialogueExecuted?: (result: ExecutedDialogue) => void;
  /** Custom className */
  className?: string;
}

export function PendingDialoguePanel({
  sessionId,
  autoExecute = false,
  onDialogueExecuted,
  className = '',
}: PendingDialoguePanelProps) {
  const { pending, loading, error, execute, clear, executing } =
    usePendingDialogue({
      sessionId,
      autoExecute,
      onDialogueExecuted,
    });

  if (loading && pending.length === 0) {
    return (
      <div className={`pending-dialogue-panel loading ${className}`}>
        <div className="loading-spinner">Loading dialogues...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`pending-dialogue-panel error ${className}`}>
        <div className="error-message">
          Error loading dialogues: {error.message}
        </div>
      </div>
    );
  }

  if (pending.length === 0) {
    return null; // Hide when no pending dialogues
  }

  return (
    <div className={`pending-dialogue-panel ${className}`}>
      <div className="panel-header">
        <h3>Pending Dialogues</h3>
        <span className="count-badge">{pending.length}</span>
      </div>

      <div className="dialogue-list">
        {pending.map((request) => (
          <div key={request.requestId} className="dialogue-item">
            <div className="dialogue-info">
              <div className="npc-id">NPC #{request.npcId}</div>
              <div className="program-id">{request.programId}</div>
              {request.playerInput && (
                <div className="player-input">
                  Player: "{request.playerInput}"
                </div>
              )}
              <div className="timestamp">
                {new Date(request.createdAt).toLocaleTimeString()}
              </div>
            </div>

            <div className="dialogue-actions">
              <button
                className="execute-btn"
                onClick={() => execute(request.requestId)}
                disabled={executing[request.requestId]}
              >
                {executing[request.requestId] ? '⏳ Executing...' : '▶️ Execute'}
              </button>
              <button
                className="clear-btn"
                onClick={() => clear(request.requestId)}
                disabled={executing[request.requestId]}
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
