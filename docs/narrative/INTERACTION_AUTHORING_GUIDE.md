# Interaction Authoring Guide

Complete guide for creating and configuring interactions (NPCs, items, locations) in Pixsim7.

## Table of Contents

1. [Introduction](#introduction)
2. [Quick Start](#quick-start)
3. [Interaction Templates](#interaction-templates)
4. [Custom Interactions](#custom-interactions)
5. [Gating Rules](#gating-rules)
6. [Outcomes & Effects](#outcomes--effects)
7. [Surfaces & UI](#surfaces--ui)
8. [Best Practices](#best-practices)
9. [Validation & Debugging](#validation--debugging)
10. [Examples](#examples)

## Introduction

NPC interactions are the primary way players engage with characters in Pixsim7. The interaction system provides:

- **Unified framework** for all interaction types
- **Template library** for common patterns
- **Flexible gating** based on stats, time, flags, etc.
- **Rich outcomes** including stat changes, dialogue, scenes, and more
- **Multiple surfaces** for different UI contexts

## Quick Start

### Using Templates (Recommended)

The fastest way to create interactions is using templates:

```typescript
import { createFromTemplate } from '@pixsim7/game.engine/interactions';

// Create a greeting interaction
const greeting = createFromTemplate('greeting', {
  id: 'sophia:greeting',
  label: 'Greet Sophia',
  targetIds: [1], // Sophia's ID
  npcName: 'Sophia',
});

// Create a gift-giving interaction
const giftFlowers = createFromTemplate('giftGiving', {
  id: 'sophia:gift:flowers',
  label: 'Give Flowers to Sophia',
  targetIds: [1],
  npcName: 'Sophia',
  itemId: 'item_flowers',
  itemName: 'flowers',
  affinityBoost: 8,
});
```

### Bulk Creation

Create a full interaction suite for an NPC:

```typescript
import { createFullInteractionSuite } from '@pixsim7/game.engine/interactions';

const sophiaInteractions = createFullInteractionSuite(1, 'Sophia', {
  includeSocial: true,
  includeRomantic: true,
  gifts: [
    { itemId: 'item_flowers', itemName: 'flowers', affinityBoost: 8 },
    { itemId: 'item_book', itemName: 'book', affinityBoost: 10 },
  ],
  quests: [
    {
      questId: 'sophia_lost_necklace',
      questName: "Sophia's Lost Necklace",
      rewardItemId: 'item_silver_ring',
      rewardItemName: 'silver ring',
    },
  ],
});
```

### Participants (Cross-Entity)

Interactions can involve multiple entities by specifying `participants` with role labels.
Use `primaryRole` to indicate which participant drives gating and default outcomes.

```typescript
import type { InteractionDefinition } from '@pixsim7/types';

const inspectStatue: InteractionDefinition = {
  id: 'plaza:inspect:statue',
  label: 'Inspect Statue',
  surface: 'inline',
  participants: [
    { role: 'actor', kind: 'npc', id: 12 },
    { role: 'location', kind: 'location', id: 5 },
    { role: 'prop', kind: 'prop', templateKind: 'propTemplate', templateId: 'statue_01' },
  ],
  primaryRole: 'actor',
};
```

## Interaction Templates

### Available Templates

**Social:**
- `greeting` - Friendly greeting (+2 affinity, +1 trust)
- `compliment` - Give compliment (+3 affinity, +2 chemistry)
- `askAboutDay` - Ask about their day (+1 trust, +1 affinity)

**Transactional:**
- `giftGiving` - Give item as gift (customizable affinity boost)
- `trade` - Exchange items

**Narrative:**
- `questStart` - Begin a quest
- `questComplete` - Turn in completed quest
- `storyBeat` - Advance narrative arc

**Romantic:**
- `flirt` - Flirtatious interaction (+3 chemistry, +2 affinity)
- `dateInvitation` - Invite on date (+5 chemistry, launches scene)

**Hostile:**
- `insult` - Insulting remark (-3 affinity, +2 tension)

### Template Options

All templates support these options:

```typescript
{
  id: string;              // Required: unique identifier
  label: string;           // Required: display text
  targetIds?: number[]; // Optional: specific NPCs
  icon?: string;           // Optional: emoji or icon
  surface?: InteractionSurface; // Optional: override default
  gating?: Partial<InteractionGating>; // Optional: additional restrictions
  outcome?: Partial<InteractionOutcome>; // Optional: additional effects

  // Template-specific options...
}
```

## Custom Interactions

### Basic Structure

```typescript
import type { InteractionDefinition } from '@pixsim7/types';

const customInteraction: InteractionDefinition = {
  id: 'unique_id',
  label: 'Display Text',
  icon: '🎯',
  surface: 'dialogue',
  priority: 75,
  targetIds: [1, 2, 3],

  gating: {
    // Restrictions...
  },

  outcome: {
    // Effects...
  },

  targetCanInitiate: false,
};
```

### Field Reference

**Required Fields:**
- `id` - Unique identifier (alphanumeric, `_`, `-`, `:`)
- `label` - User-facing text (keep under 50 chars)
- `surface` - UI mode: `inline`, `dialogue`, `scene`, `notification`, `menu`

**Optional Fields:**
- `icon` - Emoji or icon character
- `priority` - Display order (0-100, higher = shown first)
- `targetIds` - Limit to specific NPCs
- `targetRolesOrIds` - Limit to NPCs with specific roles
- `gating` - Availability restrictions
- `outcome` - What happens when executed
- `targetCanInitiate` - Can NPCs trigger this?

## Gating Rules

Gating controls when interactions are available.

### Stat Gating (Relationships)

```typescript
gating: {
  statGating: {
    allOf: [
      // Tier requirements
      {
        definitionId: 'relationships',
        axis: 'affinity',
        minTierId: 'friend',        // Requires at least 'friend' tier
        maxTierId: 'close_friend',  // Requires at most 'close_friend'
        entityType: 'npc',
      },

      // Metric requirements (0-100)
      { definitionId: 'relationships', axis: 'affinity', minValue: 40, entityType: 'npc' },
      { definitionId: 'relationships', axis: 'trust', minValue: 30, entityType: 'npc' },
      { definitionId: 'relationships', axis: 'chemistry', minValue: 50, entityType: 'npc' },
      { definitionId: 'relationships', axis: 'tension', maxValue: 20, entityType: 'npc' },
    ],
  },
}
```

**Relationship Tiers:**
`stranger` → `acquaintance` → `friend` → `close_friend` → `lover`

### Time-of-Day Gating

```typescript
gating: {
  timeOfDay: {
    // Hour range (0-23)
    minHour: 18,                 // After 6 PM
    maxHour: 22,                 // Before 10 PM

    // Or use periods
    periods: ['evening', 'night'], // Evening or night only
  }
}
```

**Time Periods:**
- `morning` (6-12)
- `afternoon` (12-18)
- `evening` (18-22)
- `night` (22-6)

### Behavior & Mood Gating

```typescript
gating: {
  behavior: {
    allowedStates: ['idle', 'socializing'], // Only when in these states
    forbiddenStates: ['working', 'sleeping'], // Never when in these states
  },

  mood: {
    allowedMoods: ['happy', 'neutral'], // Only in these moods
    forbiddenMoods: ['angry', 'sad'],   // Never in these moods
  }
}
```

### Flag Gating

```typescript
gating: {
  requiredFlags: [
    'quest:main_01:started',     // Must have this flag
    'has_item:key',              // Must have key
  ],

  forbiddenFlags: [
    'quest:main_01:completed',   // Must NOT have completed quest
    'npc:sophia:angry',          // Must NOT have angered Sophia
  ],
}
```

### Cooldown

```typescript
gating: {
  cooldownSeconds: 3600,         // 1 hour cooldown
}
```

## Outcomes & Effects

Outcomes define what happens when an interaction executes.

### Stat Deltas (Relationships)

```typescript
outcome: {
  statDeltas: [
    {
      packageId: 'core.relationships',
      definitionId: 'relationships',
      entityType: 'npc',
      axes: {
        affinity: 5,             // +5 affinity
        trust: 3,                // +3 trust
        chemistry: 2,            // +2 chemistry
        tension: -1,             // -1 tension
      },
    },
  ],
}
```

**Guidelines:**
- Keep deltas between -5 and +5 for gradual progression
- Use larger deltas (±10-20) for major events only
- Negative values decrease the metric

### Flag Changes

```typescript
outcome: {
  flagChanges: {
    // Set flags
    set: {
      'quest:main_01:started': true,
      'visited:tavern': true,
    },

    // Delete flags
    delete: ['temp_flag_1', 'temp_flag_2'],

    // Increment counters
    increment: {
      'times_talked:sophia': 1,
      'player_reputation': 10,
    },

    // Update quest status
    questUpdates: {
      'main_01': 'active',
      'side_05': 'completed',
    },

    // Update arc stages
    arcStages: {
      'romance_sophia': 'stage_2',
    },

    // Trigger/end events
    triggerEvents: ['festival_starts'],
    endEvents: ['storm_weather'],
  },
}
```

### Inventory Changes

```typescript
outcome: {
  inventoryChanges: {
    add: [
      { itemId: 'item_gold', quantity: 100 },
      { itemId: 'item_sword', quantity: 1 },
    ],

    remove: [
      { itemId: 'item_flowers', quantity: 1 },
    ],
  },
}
```

### Target Effects

```typescript
outcome: {
  targetEffects: {
    effects: [
      // Create memory
      {
        type: 'npc.create_memory',
        payload: {
          topic: 'gift_received',
          summary: 'Player gave me flowers',
          importance: 'important',
          memoryType: 'long_term',
          tags: ['gift', 'flowers', 'kind'],
        },
      },

      // Trigger emotion
      {
        type: 'npc.trigger_emotion',
        payload: {
          emotion: 'happy',
          intensity: 0.8,              // 0.0-1.0
          durationSeconds: 3600,       // 1 hour
        },
      },

      // Register world event
      {
        type: 'npc.register_world_event',
        payload: {
          eventType: 'social',
          eventName: 'player_gift',
          description: 'Player gave Sophia flowers',
          relevanceScore: 0.9,
        },
      },
    ],
  },
}
```

### Scene Launch

```typescript
outcome: {
  sceneLaunch: {
    // Direct scene ID
    sceneId: 42,

    // OR scene intent (resolved from world metadata)
    sceneIntentId: 'romantic_date',

    // Initial state
    initialState: {
      customFlag: true,
    },
  },
}
```

### Dialogue Generation

```typescript
outcome: {
  generationLaunch: {
    dialogueRequest: {
      programId: 'casual_greeting',     // Prompt program to use
      systemPrompt: 'You are cheerful', // Optional override
    },

    branchIntent: 'maintain',           // 'escalate' | 'cool_down' | 'side_branch' | 'maintain' | 'resolve'
  },
}
```

### Success Message

```typescript
outcome: {
  successMessage: 'Sophia smiles warmly at your gift.',
}
```

## Surfaces & UI

Surfaces determine how interactions appear to players.

### `inline`

Quick actions in the game world (no modal/overlay).

**Best for:**
- Simple actions
- Location interactions
- Quick toggles

**Example:** Opening a door, picking up an item

### `dialogue`

Full dialogue interface with text and choices.

**Best for:**
- Conversations
- Storytelling
- Character interactions

**Example:** Talking to an NPC, asking questions

### `scene`

Immersive scene with media (images/video).

**Best for:**
- Cutscenes
- Romantic interactions
- Major events

**Example:** Date scene, quest completion scene

### `notification`

Toast/notification message (minimal).

**Best for:**
- Background effects
- Passive interactions
- Status updates

**Example:** Overhearing conversation, weather change

### `menu`

Dedicated menu/panel (detailed).

**Best for:**
- Complex choices
- Trading
- Detailed information

**Example:** Shop menu, crafting interface

## Best Practices

### DO:

✅ Use templates for common patterns
✅ Keep relationship stat deltas small (-5 to +5)
✅ Add helpful success messages
✅ Use appropriate surfaces for context
✅ Add cooldowns to repeatable interactions
✅ Gate interactions on meaningful requirements
✅ Validate interactions before deploying

### DON'T:

❌ Use very long labels (>50 chars)
❌ Make deltas too large (>20)
❌ Require impossible combinations (e.g., both required and forbidden flag)
❌ Use menu surface for NPC-initiated interactions
❌ Forget to specify surface
❌ Skip validation

### Naming Conventions

**Interaction IDs:**
- Format: `{npc}:{action}:{variant}`
- Example: `sophia:greeting`, `sophia:gift:flowers`, `sophia:quest:start`

**Flag Names:**
- Format: `{category}:{identifier}:{property}`
- Example: `quest:main_01:started`, `has_item:key`, `visited:tavern`

## Validation & Debugging

### Validation

```typescript
import { validateInteraction, formatValidationResult } from '@pixsim7/game.engine/interactions';

const result = validateInteraction(myInteraction);

if (!result.valid) {
  console.error(formatValidationResult(result));
}
```

### Common Errors

**"Interaction ID is required"**
- Add a unique ID to the interaction

**"Surface is required"**
- Specify which UI surface to use

**"Both minTier and maxTier specified"**
- This creates a narrow tier range - usually unintentional

**"Same flag is both required and forbidden"**
- A flag cannot be both required and forbidden

### Debugging Tips

1. **Enable validation** in development
2. **Check console** for validation errors
3. **Use templates** to avoid common mistakes
4. **Test with dev tools** to simulate different states
5. **Review** the interaction history panel

## Examples

### Example 1: Simple Greeting

```typescript
const greeting = createFromTemplate('greeting', {
  id: 'marcus:greeting',
  label: 'Greet Marcus',
  targetIds: [5],
  npcName: 'Marcus',
});
```

### Example 2: Quest Chain

```typescript
const [questStart, questComplete] = createQuestInteractions(
  5,
  'Marcus',
  'find_artifact',
  'The Lost Artifact',
  'item_ancient_coin',
  'ancient coin'
);
```

### Example 3: Romantic Progression

```typescript
const romanticInteractions = [
  // Stage 1: Flirting (requires friend tier)
  createFromTemplate('flirt', {
    id: 'elena:flirt',
    label: 'Flirt with Elena',
    targetIds: [7],
    npcName: 'Elena',
  }),

  // Stage 2: Date invitation (requires close_friend tier)
  createFromTemplate('dateInvitation', {
    id: 'elena:date_invite',
    label: 'Ask Elena on a date',
    targetIds: [7],
    npcName: 'Elena',
  }),
];
```

### Example 4: Custom Complex Interaction

```typescript
const customInteraction: InteractionDefinition = {
  id: 'tavern:perform_song',
  label: 'Perform a Song',
  icon: '🎵',
  surface: 'scene',
  priority: 80,

  gating: {
    statGating: {
      allOf: [
        { definitionId: 'relationships', axis: 'affinity', minValue: 30, entityType: 'npc' },
      ],
    },
    timeOfDay: {
      periods: ['evening', 'night'], // Only during tavern hours
    },
    requiredFlags: [
      'has_item:lute',
      'learned:music_skill',
    ],
    cooldownSeconds: 7200, // 2 hour cooldown
  },

  outcome: {
    successMessage: 'Your performance captivates the tavern!',

    statDeltas: [
      {
        packageId: 'core.relationships',
        definitionId: 'relationships',
        entityType: 'npc',
        axes: {
          affinity: 3, // Gain affinity with all tavern NPCs
        },
      },
    ],

    flagChanges: {
      increment: {
        'tavern:performances': 1,
        'player:reputation': 5,
      },
      set: {
        'tavern:performed_today': true,
      },
    },

    inventoryChanges: {
      add: [
        { itemId: 'item_gold', quantity: 50 },
      ],
    },

    sceneLaunch: {
      sceneIntentId: 'tavern_performance',
    },
  },
};
```

## Advanced Topics

### NPC-Initiated Interactions

Set `targetCanInitiate: true` to allow NPCs to trigger interactions:

```typescript
{
  id: 'npc_greeting',
  label: 'Greet Player',
  targetCanInitiate: true,
  // ...
}
```

NPCs will emit interaction intents based on their behavior/mood/schedule.

### Dynamic Interaction Creation

Create interactions at runtime based on game state:

```typescript
function createDynamicGift(itemId: string, itemName: string): InteractionDefinition {
  return createFromTemplate('giftGiving', {
    id: `dynamic:gift:${itemId}`,
    label: `Give ${itemName}`,
    itemId,
    itemName,
    // Calculate affinity boost based on NPC preferences
    affinityBoost: calculateAffinityBoost(itemId),
  });
}
```

### Interaction Chains

Create sequences of interactions:

```typescript
// Chain interactions via flags
const chain = [
  {
    id: 'chain:1',
    label: 'Start Investigation',
    outcome: {
      flagChanges: {
        set: { 'investigation:stage_1_complete': true },
      },
    },
  },
  {
    id: 'chain:2',
    label: 'Follow Lead',
    gating: {
      requiredFlags: ['investigation:stage_1_complete'],
    },
    outcome: {
      flagChanges: {
        set: { 'investigation:stage_2_complete': true },
      },
    },
  },
];
```

---

## Further Reading

- [NPC Interaction API Reference](./API.md)
- [Relationship System Guide](./RELATIONSHIPS.md)
- [Quest System Integration](./QUESTS.md)
- [Scene Builder Guide](./SCENES.md)

## Support

For questions or issues:
- Check validation errors first
- Review examples in this guide
- Test with different game states
- Consult the API reference
