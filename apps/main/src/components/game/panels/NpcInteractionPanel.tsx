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

import type {
  MoodState,
  InteractionSuggestion,
  InteractionChain,
  ChainState,
} from '@pixsim7/game.engine';
import { Button } from '@pixsim7/shared.ui';
import { useState } from 'react';

import {
  MoodIndicator,
  InteractionSuggestions,
  ChainList,
  InteractionHistory,
  PendingDialoguePanel,
  type InteractionHistoryEntry,
} from '@features/interactions';

import type { ExecutedDialogue } from '@/hooks/usePendingDialogue';

import './NpcInteractionPanel.css';

export interface NpcInteractionPanelProps {
  npcId: number;
  npcName: string;
  sessionId?: number;

  // Mood state
  mood?: MoodState;

  // Suggestions
  suggestions?: InteractionSuggestion[];
  onSuggestionSelect?: (interaction: InteractionSuggestion['interaction']) => void;

  // Active chains
  activeChains?: InteractionChain[];
  chainStates?: Record<string, ChainState | null>;
  onChainStepClick?: (chainId: string, stepId: string) => void;

  // Interaction history
  history?: InteractionHistoryEntry[];

  // Pending dialogue
  showPendingDialogue?: boolean;
  onDialogueExecuted?: (result: ExecutedDialogue) => void;

  // Panel controls
  onClose?: () => void;
}

export function NpcInteractionPanel({
  npcId,
  npcName,
  sessionId,
  mood,
  suggestions = [],
  onSuggestionSelect,
  activeChains = [],
  chainStates = {},
  onChainStepClick,
  history = [],
  showPendingDialogue = false,
  onDialogueExecuted,
  onClose,
}: NpcInteractionPanelProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'history'>('overview');
  const canShowPendingDialogue = showPendingDialogue && sessionId !== undefined;
  const handleSuggestionSelect =
    onSuggestionSelect ?? (() => {});

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
            {canShowPendingDialogue && (
              <PendingDialoguePanel
                sessionId={sessionId}
                onDialogueExecuted={onDialogueExecuted}
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
                <ChainList
                  chains={activeChains}
                  states={chainStates}
                  onStepClick={onChainStepClick}
                />
              </div>
            )}

            {/* Interaction Suggestions */}
            {suggestions.length > 0 && (
              <div className="section">
                <InteractionSuggestions
                  suggestions={suggestions}
                  onSelect={handleSuggestionSelect}
                />
              </div>
            )}

            {/* Empty state */}
            {!canShowPendingDialogue &&
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
              <InteractionHistory history={history} />
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
