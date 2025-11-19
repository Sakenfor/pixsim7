/**
 * Interaction Components Demo
 *
 * Demonstrates all new interaction components with mock data.
 */

import { useState } from 'react';
import { NpcInteractionPanel } from '../components/game/NpcInteractionPanel';
import type {
  MoodState,
  InteractionSuggestion,
  ChainState,
  InteractionHistoryEntry,
} from '@pixsim7/game-core';
import { Button, Panel } from '@pixsim7/ui';
import './InteractionComponentsDemo.css';

// Mock data
const mockMood: MoodState = {
  general: {
    mood: 'content',
    valence: 0.7,
    arousal: 0.4,
  },
  intimacy: {
    mood: 'playful',
    intensity: 0.6,
  },
  activeEmotions: [
    {
      emotion: 'Happy',
      intensity: 0.8,
      trigger: 'Player gave gift',
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    },
    {
      emotion: 'Curious',
      intensity: 0.5,
      trigger: 'New topic mentioned',
      expiresAt: Math.floor(Date.now() / 1000) + 1800,
    },
  ],
};

const mockSuggestions: InteractionSuggestion[] = [
  {
    interaction: {
      id: 'morning-coffee',
      label: 'Share morning coffee',
      icon: '☕',
      surface: 'dialogue',
      priority: 50,
    } as any,
    score: 85,
    reason: 'chain_continuation',
    explanation: 'Continue the "Daily Routine" chain with Sarah',
    context: {
      chainId: 'daily-routine',
      chainName: 'Daily Routine',
      currentStep: 2,
      totalSteps: 5,
      nextInteractionId: 'morning-coffee',
    },
  },
  {
    interaction: {
      id: 'ask-about-work',
      label: 'Ask about her work',
      icon: '💼',
      surface: 'dialogue',
      priority: 40,
    } as any,
    score: 70,
    reason: 'relationship_milestone',
    explanation: 'You\'re close to reaching "Friend" tier (85/100)',
    context: {
      tier: 'Acquaintance',
      nextTier: 'Friend',
      nextTierAffinity: 100,
    },
  },
  {
    interaction: {
      id: 'compliment-outfit',
      label: 'Compliment her outfit',
      icon: '👗',
      surface: 'inline',
      priority: 30,
    } as any,
    score: 60,
    reason: 'npc_preference',
    explanation: 'Perfect for her current mood (playful)',
  },
];

const mockChains: ChainState[] = [
  {
    chainId: 'daily-routine',
    currentStep: 2,
    completed: false,
    startedAt: Math.floor(Date.now() / 1000) - 3600,
    completedSteps: ['wake-up', 'breakfast'],
    skippedSteps: [],
  },
  {
    chainId: 'coffee-date',
    currentStep: 0,
    completed: false,
    startedAt: Math.floor(Date.now() / 1000),
    completedSteps: [],
    skippedSteps: [],
  },
];

const mockHistory: InteractionHistoryEntry[] = [
  {
    interactionId: 'breakfast',
    label: 'Have breakfast together',
    surface: 'dialogue',
    timestamp: Math.floor(Date.now() / 1000) - 1800,
    outcome: {
      success: true,
      message: 'Sarah enjoyed breakfast with you. She shared stories about her childhood.',
    },
    relationshipChanges: {
      affinity: 5,
      trust: 3,
    },
  },
  {
    interactionId: 'wake-up',
    label: 'Morning greeting',
    surface: 'inline',
    timestamp: Math.floor(Date.now() / 1000) - 3600,
    outcome: {
      success: true,
      message: 'Sarah greeted you warmly.',
    },
    relationshipChanges: {
      affinity: 2,
    },
  },
  {
    interactionId: 'goodnight',
    label: 'Say goodnight',
    surface: 'dialogue',
    timestamp: Math.floor(Date.now() / 1000) - 43200,
    outcome: {
      success: true,
      message: 'Sarah wished you sweet dreams.',
    },
    relationshipChanges: {
      affinity: 3,
    },
  },
];

export function InteractionComponentsDemo() {
  const [showPanel, setShowPanel] = useState(true);
  const [hasPendingDialogue, setHasPendingDialogue] = useState(true);

  return (
    <div className="interaction-demo">
      <div className="demo-header">
        <div>
          <h1 className="demo-title">Interaction Components Demo</h1>
          <p className="demo-subtitle">
            Showcasing MoodIndicator, InteractionSuggestions, ChainProgress, InteractionHistory, and PendingDialoguePanel
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() => window.open('/', '_self')}
        >
          Back to Home
        </Button>
      </div>

      <div className="demo-content">
        <Panel className="demo-info">
          <h2 className="info-title">Component Features</h2>
          <ul className="feature-list">
            <li>
              <strong>Mood Indicator:</strong> Shows NPC's general and intimacy moods with
              valence/arousal bars and active emotions
            </li>
            <li>
              <strong>Interaction Suggestions:</strong> Context-aware suggestions scored by
              relevance (chains, relationships, time, mood, etc.)
            </li>
            <li>
              <strong>Chain Progress:</strong> Displays multi-step interaction sequences with
              progress tracking
            </li>
            <li>
              <strong>Interaction History:</strong> Timeline of past interactions with outcomes
              and relationship changes
            </li>
            <li>
              <strong>Pending Dialogue Panel:</strong> Notification when NPC wants to talk
            </li>
          </ul>

          <div className="demo-controls">
            <Button
              variant={showPanel ? 'secondary' : 'primary'}
              onClick={() => setShowPanel(!showPanel)}
            >
              {showPanel ? 'Hide' : 'Show'} Interaction Panel
            </Button>
            <Button
              variant="secondary"
              onClick={() => setHasPendingDialogue(!hasPendingDialogue)}
            >
              {hasPendingDialogue ? 'Clear' : 'Show'} Pending Dialogue
            </Button>
          </div>
        </Panel>

        {showPanel && (
          <div className="panel-container">
            <NpcInteractionPanel
              npcId={1}
              npcName="Sarah"
              mood={mockMood}
              suggestions={mockSuggestions}
              onSuggestionClick={(suggestion) => {
                alert(
                  `Clicked suggestion: ${suggestion.interaction.label}\nReason: ${suggestion.explanation}`
                );
              }}
              activeChains={mockChains}
              onChainStepClick={(chainId, stepId) => {
                alert(`Clicked chain step: ${chainId} / ${stepId}`);
              }}
              history={mockHistory}
              hasPendingDialogue={hasPendingDialogue}
              pendingDialogueMessage="Hey! I wanted to talk to you about something..."
              onAcceptDialogue={() => {
                alert('Accepted dialogue - would open dialogue interface');
                setHasPendingDialogue(false);
              }}
              onDismissDialogue={() => {
                setHasPendingDialogue(false);
              }}
              onClose={() => setShowPanel(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
