/**
 * NPC Interaction Panel
 *
 * Comprehensive panel that integrates:
 * - Mood Indicator
 * - Interaction Suggestions
 * - Chain Progress
 * - Interaction History
 * - Pending Dialogue
 */

import { useState } from 'react';
import {
  MoodIndicator,
  InteractionSuggestions,
  ChainProgress,
  InteractionHistory,
  PendingDialoguePanel,
} from '@/components/interactions';
import type {
  MoodState,
  InteractionSuggestion,
  ChainState,
  InteractionHistoryEntry,
} from '@pixsim7/game.engine';
import { Button, Panel } from '@pixsim7/shared.ui';
import './NpcInteractionPanel.css';

export interface NpcInteractionPanelProps {
  npcId: number;
  npcName: string;

  // Mood state
  mood?: MoodState;

  // Suggestions
  suggestions?: InteractionSuggestion[];
  onSuggestionClick?: (suggestion: InteractionSuggestion) => void;

  // Active chains
  activeChains?: ChainState[];
  onChainStepClick?: (chainId: string, stepId: string) => void;

  // Interaction history
  history?: InteractionHistoryEntry[];

  // Pending dialogue
  hasPendingDialogue?: boolean;
  pendingDialogueMessage?: string;
  onAcceptDialogue?: () => void;
  onDismissDialogue?: () => void;

  // Panel controls
  onClose?: () => void;
}

export function NpcInteractionPanel({
  npcId,
  npcName,
  mood,
  suggestions = [],
  onSuggestionClick,
  activeChains = [],
  onChainStepClick,
  history = [],
  hasPendingDialogue = false,
  pendingDialogueMessage,
  onAcceptDialogue,
  onDismissDialogue,
  onClose,
}: NpcInteractionPanelProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'history'>('overview');

  return (
    <div className="npc-interaction-panel">
      <div className="panel-header">
        <div className="header-info">
          <h2 className="npc-name">{npcName}</h2>
          <span className="npc-id">NPC #{npcId}</span>
        </div>
        {onClose && (
          <Button size="sm" variant="secondary" onClick={onClose}>
            Close
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="panel-tabs">
        <button
          className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          className={`tab ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          History ({history.length})
        </button>
      </div>

      <div className="panel-content">
        {activeTab === 'overview' && (
          <div className="overview-tab">
            {/* Pending Dialogue (if any) */}
            {hasPendingDialogue && (
              <PendingDialoguePanel
                npcId={npcId}
                npcName={npcName}
                message={pendingDialogueMessage}
                onAccept={onAcceptDialogue}
                onDismiss={onDismissDialogue}
              />
            )}

            {/* Mood Indicator */}
            {mood && (
              <div className="section">
                <h3 className="section-title">Current Mood</h3>
                <MoodIndicator mood={mood} />
              </div>
            )}

            {/* Active Chains */}
            {activeChains.length > 0 && (
              <div className="section">
                <h3 className="section-title">Active Chains</h3>
                {activeChains.map((chain) => (
                  <ChainProgress
                    key={chain.chainId}
                    chainState={chain}
                    onStepClick={onChainStepClick}
                  />
                ))}
              </div>
            )}

            {/* Interaction Suggestions */}
            {suggestions.length > 0 && (
              <div className="section">
                <InteractionSuggestions
                  suggestions={suggestions}
                  onSuggestionClick={onSuggestionClick}
                />
              </div>
            )}

            {/* Empty state */}
            {!hasPendingDialogue &&
              !mood &&
              activeChains.length === 0 &&
              suggestions.length === 0 && (
                <div className="empty-state">
                  <div className="empty-icon">💬</div>
                  <p className="empty-text">
                    No interaction data available for this NPC yet.
                  </p>
                </div>
              )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="history-tab">
            {history.length > 0 ? (
              <InteractionHistory entries={history} />
            ) : (
              <div className="empty-state">
                <div className="empty-icon">📜</div>
                <p className="empty-text">
                  No interaction history with this NPC yet.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
