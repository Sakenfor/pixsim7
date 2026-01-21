/**
 * Interaction Components Demo
 *
 * Demonstrates all new interaction components with mock data.
 */

import type {
  MoodState,
  InteractionSuggestion,
  ChainState,
  InteractionChain,
} from '@pixsim7/game.engine';
import type {
  NpcInteractionDefinition,
  NpcInteractionInstance,
  StatDelta,
} from '@pixsim7/shared.types';
import { Button, Panel } from '@pixsim7/shared.ui';
import { useState } from 'react';

import type { InteractionHistoryEntry } from '@features/interactions';

import { NpcInteractionPanel } from '@/components/game/panels/NpcInteractionPanel';
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
    interaction: createMockInteraction(
      'morning-coffee',
      'Share morning coffee',
      'dialogue',
      '???'
    ),
    score: 85,
    reason: 'chain_continuation',
    explanation: 'Continue the "Daily Routine" chain with Sarah',
    context: {
      chainInfo: {
        chainId: 'daily-routine',
        chainName: 'Daily Routine',
        stepNumber: 3,
        totalSteps: 5,
      },
      timeRemaining: 900,
    },
  },
  {
    interaction: createMockInteraction(
      'ask-about-work',
      'Ask about her work',
      'dialogue',
      '????'
    ),
    score: 70,
    reason: 'relationship_milestone',
    explanation: "You're close to reaching \"Friend\" tier (85/100)",
    context: {
      tierProgress: {
        current: 'Acquaintance',
        next: 'Friend',
        affinityNeeded: 15,
      },
    },
  },
  {
    interaction: createMockInteraction(
      'compliment-outfit',
      'Compliment her outfit',
      'inline',
      '????'
    ),
    score: 60,
    reason: 'npc_preference',
    explanation: 'Perfect for her current mood (playful)',
  },
];

const mockChains: InteractionChain[] = [
  {
    id: 'daily-routine',
    name: 'Daily Routine',
    npcId: 1,
    description: 'Start the day together and build momentum.',
    category: 'friendship',
    steps: [
      {
        stepId: 'wake-up',
        interaction: createMockDefinition('wake-up', 'Morning greeting', 'dialogue'),
      },
      {
        stepId: 'breakfast',
        interaction: createMockDefinition('breakfast', 'Have breakfast together', 'dialogue'),
      },
      {
        stepId: 'morning-coffee',
        interaction: createMockDefinition('morning-coffee', 'Share morning coffee', 'dialogue'),
      },
    ],
  },
  {
    id: 'coffee-date',
    name: 'Coffee Date',
    npcId: 1,
    description: 'Plan a casual coffee date.',
    category: 'romance',
    steps: [
      {
        stepId: 'invite',
        interaction: createMockDefinition('invite-coffee', 'Invite for coffee', 'dialogue'),
      },
    ],
  },
];

const mockChainStates: Record<string, ChainState | null> = {
  'daily-routine': {
    chainId: 'daily-routine',
    currentStep: 2,
    completed: false,
    startedAt: Math.floor(Date.now() / 1000) - 3600,
    completedSteps: ['wake-up', 'breakfast'],
    skippedSteps: [],
  },
  'coffee-date': {
    chainId: 'coffee-date',
    currentStep: 0,
    completed: false,
    startedAt: Math.floor(Date.now() / 1000),
    completedSteps: [],
    skippedSteps: [],
  },
};

const mockHistory: InteractionHistoryEntry[] = [
  {
    interactionId: 'breakfast',
    label: 'Have breakfast together',
    timestamp: Math.floor(Date.now() / 1000) - 1800,
    npcId: 1,
    message: 'Sarah enjoyed breakfast with you. She shared stories about her childhood.',
    statDeltas: [createRelationshipDelta({ affinity: 5, trust: 3 })],
  },
  {
    interactionId: 'wake-up',
    label: 'Morning greeting',
    timestamp: Math.floor(Date.now() / 1000) - 3600,
    npcId: 1,
    message: 'Sarah greeted you warmly.',
    statDeltas: [createRelationshipDelta({ affinity: 2 })],
  },
  {
    interactionId: 'goodnight',
    label: 'Say goodnight',
    timestamp: Math.floor(Date.now() / 1000) - 43200,
    npcId: 1,
    message: 'Sarah wished you sweet dreams.',
    statDeltas: [createRelationshipDelta({ affinity: 3 })],
  },
];

export function InteractionComponentsDemo() {
  const [showPanel, setShowPanel] = useState(true);
  const [showPendingDialogue, setShowPendingDialogue] = useState(true);

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
              onClick={() => setShowPendingDialogue(!showPendingDialogue)}
            >
              {showPendingDialogue ? 'Hide' : 'Show'} Pending Dialogue
            </Button>
          </div>
        </Panel>

        {showPanel && (
          <div className="panel-container">
            <NpcInteractionPanel
              npcId={1}
              npcName="Sarah"
              sessionId={101}
              showPendingDialogue={showPendingDialogue}
              onDialogueExecuted={() => {
                setShowPendingDialogue(false);
              }}
              mood={mockMood}
              suggestions={mockSuggestions}
              onSuggestionSelect={(interaction) => {
                alert(`Clicked suggestion: ${interaction.label}`);
              }}
              activeChains={mockChains}
              chainStates={mockChainStates}
              onChainStepClick={(chainId, stepId) => {
                alert(`Clicked chain step: ${chainId} / ${stepId}`);
              }}
              history={mockHistory}
              onClose={() => setShowPanel(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function createMockInteraction(
  id: string,
  label: string,
  surface: NpcInteractionInstance['surface'],
  icon?: string
): NpcInteractionInstance {
  return {
    id,
    definitionId: id,
    npcId: 1,
    worldId: 1,
    sessionId: 101,
    surface,
    label,
    icon,
    available: true,
    priority: 50,
  };
}

function createMockDefinition(
  id: string,
  label: string,
  surface: NpcInteractionDefinition['surface']
): NpcInteractionDefinition {
  return {
    id,
    label,
    surface,
  };
}

function createRelationshipDelta(axes: Record<string, number>): StatDelta {
  return {
    packageId: 'core.relationships',
    definitionId: 'relationships',
    axes,
  };
}
