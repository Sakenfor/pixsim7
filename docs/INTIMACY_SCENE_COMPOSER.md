# Intimacy Scene Composer & Relationship Progression Editor

> Visual editor tooling for designing intimate scenes and relationship progression arcs with proper safety controls and content rating management.

> **Status**: Phase 1-2 Implementation Complete (UI, Data Models, Live Preview)
> **Phase 1**: Basic UI and type definitions ✓
> **Phase 2**: Live preview with what-if analysis ✓
> **For Agents**: This doc covers the intimacy scene composer and progression editor UI. See `INTIMACY_AND_GENERATION.md` for the underlying generation system and `RELATIONSHIPS_AND_ARCS.md` for relationship data models.

---

## Overview

The Intimacy Scene Composer provides visual tools for:
- **Designing intimate scenes** with relationship gates and content rating controls
- **Creating progression arcs** showing relationship milestones over time
- **Validating content** against world and user preferences
- **Visualizing gates** with tier/intimacy thresholds
- **Live preview & what-if analysis** - Test gates with simulated relationship states ✓ NEW

**Key principles:**
- **Safety first**: Multi-layer content rating validation and explicit consent requirements
- **Designer-friendly**: Visual tools instead of code for creating relationship-gated content
- **Flexible gating**: Support for tier, intimacy level, metrics, and flag-based requirements
- **Validation feedback**: Real-time validation with clear error/warning messages

---

## Architecture

```
Intimacy Scene Composer
  ├─ IntimacySceneComposer (main panel)
  │   ├─ Basic tab (scene type, intensity, rating)
  │   ├─ Gates tab (relationship requirements)
  │   ├─ Generation tab (live preview with state simulation) ✓ NEW
  │   └─ Validation tab (safety checks)
  │
  ├─ RelationshipGateVisualizer (gate configuration)
  │   ├─ Tier progression display
  │   ├─ Intimacy level display
  │   ├─ Metric requirements (affinity, trust, etc.)
  │   └─ Flag requirements
  │
  ├─ RelationshipStateEditor (Phase 2) ✓ NEW
  │   ├─ Tier/intimacy level selection
  │   ├─ Metric sliders (affinity, trust, chemistry, tension)
  │   ├─ Quick presets (stranger → lover)
  │   └─ Flag management
  │
  ├─ GatePreviewPanel (Phase 2) ✓ NEW
  │   ├─ Live gate checking with simulated state
  │   ├─ Pass/fail indicators
  │   ├─ Missing requirements display
  │   └─ What-if analysis
  │
  └─ ProgressionArcEditor (timeline view)
      ├─ Stage cards with status
      ├─ Gate badges
      ├─ Progress indicator
      ├─ Preview mode with state simulation ✓ NEW
      └─ Stage detail panel

Validation & Preview Systems
  ├─ Content rating checks (world/user limits)
  ├─ Gate validation (requirements, conflicts)
  ├─ Safety checks (consent, ratings)
  ├─ Arc validation (stages, branches)
  └─ Live gate checking (simulated states) ✓ NEW
```

---

## Data Models

### IntimacySceneConfig

Defines an intimacy scene with gates and content controls.

```typescript
interface IntimacySceneConfig {
  sceneType: 'flirt' | 'date' | 'kiss' | 'intimate' | 'custom';
  intensity: 'subtle' | 'light' | 'moderate' | 'intense';
  targetNpcIds: number[];
  gates: RelationshipGate[];
  contentRating: 'sfw' | 'romantic' | 'mature_implied' | 'restricted';
  socialContext?: GenerationSocialContext;
  fallbackSceneId?: string;
  requiresConsent?: boolean;
  tags?: string[];
}
```

### RelationshipGate

Defines requirements that must be met to unlock content.

```typescript
interface RelationshipGate {
  id: string;
  name: string;
  description?: string;
  requiredTier?: string;              // 'stranger', 'friend', 'lover', etc.
  requiredIntimacyLevel?: string;     // 'light_flirt', 'intimate', etc.
  metricRequirements?: {
    minAffinity?: number;             // 0-100
    minTrust?: number;                // 0-100
    minChemistry?: number;            // 0-100
    minTension?: number;              // 0-100
  };
  requiredFlags?: string[];           // Must be true
  blockedFlags?: string[];            // Must be false
}
```

### RelationshipProgressionArc

Defines a full progression timeline with stages.

```typescript
interface RelationshipProgressionArc {
  id: string;
  name: string;
  targetNpcId: number;
  stages: ProgressionStage[];
  maxContentRating: 'sfw' | 'romantic' | 'mature_implied' | 'restricted';
  tags?: string[];
}

interface ProgressionStage {
  id: string;
  name: string;
  tier: string;
  gate: RelationshipGate;
  availableScenes?: string[];
  onEnterEffects?: {
    affinityDelta?: number;
    trustDelta?: number;
    setFlags?: string[];
  };
  timelinePosition?: { x: number; y: number };
}
```

---

## Component Usage

### IntimacySceneComposer

Main editor panel for creating intimacy scenes.

```tsx
import { IntimacySceneComposer } from '@/components/intimacy/IntimacySceneComposer';

function MyEditor() {
  const [scene, setScene] = useState<IntimacySceneConfig>({
    sceneType: 'flirt',
    intensity: 'light',
    targetNpcIds: [12],
    gates: [],
    contentRating: 'romantic',
    requiresConsent: false,
    tags: [],
  });

  return (
    <IntimacySceneComposer
      scene={scene}
      onChange={setScene}
      worldMaxRating="romantic"
      userMaxRating="mature_implied"
      availableNpcs={[
        { id: 12, name: 'Alice' },
        { id: 15, name: 'Bob' },
      ]}
    />
  );
}
```

**Props:**
- `scene` - Current scene configuration
- `onChange` - Callback when scene is modified
- `worldMaxRating` - World's maximum allowed content rating
- `userMaxRating` - User's maximum allowed content rating
- `availableNpcs` - List of NPCs for selection
- `readOnly` - Whether the editor is read-only

**Tabs:**
1. **Basic** - Scene type, intensity, content rating, target NPCs
2. **Gates** - Relationship requirements and thresholds
3. **Generation** - Social context and generation settings (Phase 2)
4. **Validation** - Safety checks and validation results

### RelationshipGateVisualizer

Visual display and configuration for relationship gates.

```tsx
import { RelationshipGateVisualizer } from '@/components/intimacy/RelationshipGateVisualizer';

function MyGateEditor() {
  const [gate, setGate] = useState<RelationshipGate>({
    id: 'gate_1',
    name: 'Friends First',
    requiredTier: 'friend',
    metricRequirements: {
      minAffinity: 30,
      minTrust: 20,
    },
  });

  return (
    <RelationshipGateVisualizer
      gate={gate}
      onChange={setGate}
      readOnly={false}
      expanded={true}
    />
  );
}
```

**Features:**
- Visual tier progression indicators
- Intimacy level badges
- Metric requirement progress bars
- Flag requirements display
- Missing requirements feedback

### ProgressionArcEditor

Timeline editor for relationship progression arcs.

```tsx
import { ProgressionArcEditor } from '@/components/intimacy/ProgressionArcEditor';

function MyProgressionEditor() {
  const [arc, setArc] = useState<RelationshipProgressionArc>({
    id: 'arc_1',
    name: 'Romance Path',
    targetNpcId: 12,
    stages: [
      {
        id: 'stage_1',
        name: 'First Meeting',
        tier: 'acquaintance',
        gate: { id: 'g1', name: 'Initial Gate', requiredTier: 'stranger' },
      },
      {
        id: 'stage_2',
        name: 'Becoming Friends',
        tier: 'friend',
        gate: { id: 'g2', name: 'Friend Gate', requiredTier: 'friend' },
      },
    ],
    maxContentRating: 'romantic',
  });

  return (
    <ProgressionArcEditor
      arc={arc}
      onChange={setArc}
      layout="horizontal"
      worldMaxRating="romantic"
    />
  );
}
```

**Features:**
- Horizontal/vertical/list layout modes
- Stage status indicators (locked/unlocked/current/completed)
- Visual connections between stages
- Stage detail side panel
- Progress tracking (when state provided)

---

## Validation System

### Content Rating Validation

Enforces rating constraints from world and user settings.

```typescript
import { checkContentRating } from '@/lib/intimacy/validation';

const check = checkContentRating(
  'mature_implied',          // Requested rating
  'romantic',                // World max
  'mature_implied'           // User max
);

// Result:
// {
//   requested: 'mature_implied',
//   worldMax: 'romantic',
//   userMax: 'mature_implied',
//   allowed: 'romantic',     // Most restrictive
//   isAllowed: false,
//   reason: 'Content rating exceeds world limit (romantic)'
// }
```

**Rating Hierarchy (least to most permissive):**
```
sfw < romantic < mature_implied < restricted
```

### Scene Validation

Validates complete scene configuration.

```typescript
import { validateIntimacyScene } from '@/lib/intimacy/validation';

const validation = validateIntimacyScene(
  scene,
  worldMaxRating,
  userMaxRating
);

if (!validation.valid) {
  console.error('Errors:', validation.errors);
}

if (validation.warnings.length > 0) {
  console.warn('Warnings:', validation.warnings);
}

// Check safety status
if (!validation.safety.withinWorldLimits) {
  console.error('Scene exceeds world content rating limits');
}
```

**Validation Checks:**
- Content rating within world/user limits
- Target NPCs configured
- All gates valid (no conflicts)
- Consent configured for restricted content
- Fallback or generation config present

### Gate Validation

Validates individual gate requirements.

```typescript
import { validateGate } from '@/lib/intimacy/validation';

const result = validateGate(gate);

// Result:
// {
//   valid: true,
//   errors: [],
//   warnings: ['Gate has no requirements configured']
// }
```

**Gate Checks:**
- Metric requirements in valid range (0-100)
- No conflicting flags (required AND blocked)
- At least one requirement configured (warning)

---

## Node Type Registration

Four new node types are registered for use in scene graphs:

### 1. Intimacy Scene Node (`intimacy_scene`)

Main node for intimacy scenes.

```typescript
{
  id: 'intimacy_scene',
  name: 'Intimacy Scene',
  icon: '💕',
  category: 'custom',
  editorComponent: 'IntimacySceneNodeEditor',
  defaultData: {
    sceneType: 'flirt',
    intensity: 'light',
    targetNpcIds: [],
    gates: [],
    contentRating: 'romantic',
  }
}
```

### 2. Relationship Gate Node (`relationship_gate`)

Standalone gate check with branching outputs.

```typescript
{
  id: 'relationship_gate',
  name: 'Relationship Gate',
  icon: '🚪',
  category: 'logic',
  ports: {
    inputs: [{ id: 'input', label: 'In' }],
    outputs: [
      { id: 'passed', label: 'Gate Passed', color: '#10b981' },
      { id: 'failed', label: 'Gate Failed', color: '#ef4444' }
    ]
  }
}
```

### 3. Progression Stage Node (`progression_stage`)

Marks a milestone in a progression arc.

```typescript
{
  id: 'progression_stage',
  name: 'Progression Stage',
  icon: '⭐',
  category: 'custom',
  editorComponent: 'ProgressionStageNodeEditor',
}
```

### 4. Intimacy Generation Node (`intimacy_generation`)

Extended generation node with social context.

```typescript
{
  id: 'intimacy_generation',
  name: 'Intimacy Generation',
  icon: '✨',
  category: 'custom',
  editorComponent: 'IntimacyGenerationNodeEditor',
  defaultData: {
    generationType: 'transition',
    socialContext: {
      intimacyBand: 'light',
      contentRating: 'romantic',
    }
  }
}
```

---

## Integration with Existing Systems

### Relationship System

Gates integrate with the existing relationship system:

```typescript
// From packages/game-core/src/relationships/
import { computeRelationshipTier } from '@pixsim7/game-core';

// Check if gate is satisfied
function checkGate(
  gate: RelationshipGate,
  relationship: { affinity: number; trust: number; tier: string }
): GateCheckResult {
  const satisfied =
    (!gate.requiredTier || relationship.tier === gate.requiredTier) &&
    (!gate.metricRequirements?.minAffinity || relationship.affinity >= gate.metricRequirements.minAffinity);
    // ... other checks

  return { satisfied, missingRequirements: [...] };
}
```

### Generation Pipeline

Social context flows into generation requests:

```typescript
import { buildGenerationSocialContext } from '@pixsim7/game-core';

// Build context from scene config and current relationship
const socialContext = buildGenerationSocialContext(
  session,
  world,
  scene.targetNpcIds,
  {
    maxContentRating: scene.contentRating,
    reduceIntensity: false,
  }
);

// Use in generation request
const request: GenerateContentRequest = {
  type: 'transition',
  social_context: socialContext,
  // ... other fields
};
```

---

## Phase 2: Live Preview & What-If Analysis

### Overview

Phase 2 adds interactive preview capabilities to test how gates behave with different relationship states. Designers can simulate various relationship scenarios without needing to run the game.

### RelationshipStateEditor

Interactive editor for adjusting simulated relationship metrics.

```tsx
import { RelationshipStateEditor } from '@/components/intimacy/RelationshipStateEditor';

function MyPreview() {
  const [state, setState] = useState(createDefaultState());

  return (
    <RelationshipStateEditor
      state={state}
      onChange={setState}
      readOnly={false}
      showPresets={true}
    />
  );
}
```

**Features:**
- **Quick Presets**: One-click load of typical relationship states (stranger → lover)
- **Tier Selection**: Dropdown for relationship tier
- **Intimacy Level**: Dropdown for intimacy progression
- **Metric Sliders**: Visual sliders for affinity, trust, chemistry, tension (0-100)
- **Flag Management**: Toggle flags on/off
- **State Summary**: Quick overview of current simulated state

### GatePreviewPanel

Shows live gate checking results based on simulated state.

```tsx
import { GatePreviewPanel } from '@/components/intimacy/GatePreviewPanel';

function MyGateTest() {
  const [state, setState] = useState(createDefaultState());

  return (
    <GatePreviewPanel
      gates={myScene.gates}
      simulatedState={state}
      expandByDefault={false}
      onGateClick={(gateId) => console.log('Gate clicked:', gateId)}
    />
  );
}
```

**Features:**
- **Pass/Fail Summary**: Shows X/Y gates passed at a glance
- **Color-Coded Status**: Green for passed, red for failed, amber for partial
- **Expandable Details**: Click to see why a gate passed/failed
- **Missing Requirements**: Clear list of what's needed to unlock
- **Progress Bars**: Visual indicators for metric requirements

### Gate Checking Utilities

Runtime utilities for checking gates against simulated states.

```typescript
import { checkGate, createDefaultState, createStateFromTier } from '@/lib/intimacy/gateChecking';

// Create a simulated state
const state = createStateFromTier('friend'); // Quick preset
// or
const customState = {
  tier: 'close_friend',
  intimacyLevel: 'deep_flirt',
  metrics: { affinity: 70, trust: 65, chemistry: 55, tension: 30 },
  flags: { 'met_parents': true },
};

// Check if a gate is satisfied
const result = checkGate(myGate, state);

if (result.satisfied) {
  console.log('Gate passed! Content unlocked.');
} else {
  console.log('Gate failed. Missing:', result.missingRequirements);
}
```

**Available Presets:**
- `stranger`: affinity: 0, trust: 0, chemistry: 0, tension: 0
- `acquaintance`: affinity: 15, trust: 10, chemistry: 5, tension: 0
- `friend`: affinity: 40, trust: 35, chemistry: 20, tension: 10
- `close_friend`: affinity: 65, trust: 60, chemistry: 50, tension: 30
- `lover`: affinity: 85, trust: 80, chemistry: 75, tension: 50

### Integration in IntimacySceneComposer

The Generation tab now includes live preview:

```tsx
<IntimacySceneComposer
  scene={myScene}
  onChange={setScene}
  worldMaxRating="romantic"
  userMaxRating="mature_implied"
/>
```

**Generation Tab Layout:**
- **Left Panel**: RelationshipStateEditor for adjusting metrics
- **Right Panel**: GatePreviewPanel showing gate results
- Updates in real-time as you adjust metrics

### Integration in ProgressionArcEditor

Preview mode allows simulating progression through an arc:

```tsx
<ProgressionArcEditor
  arc={myArc}
  onChange={setArc}
  layout="horizontal"
/>
```

**Preview Mode:**
- Click "👁️ Preview" button in header to enable
- Expandable panel at top for state editor
- Stage cards show locked/unlocked/current status based on simulated state
- Exit preview mode by clicking "Exit Preview" or toggle button

### Usage Examples

#### Example 1: Testing a Gate

```typescript
// Configure a gate
const friendGate: RelationshipGate = {
  id: 'friend_gate',
  name: 'Must be friends',
  requiredTier: 'friend',
  metricRequirements: {
    minAffinity: 30,
    minTrust: 20,
  },
};

// Create test states
const strangerState = createStateFromTier('stranger');
const friendState = createStateFromTier('friend');

// Check gates
const strangerResult = checkGate(friendGate, strangerState);
console.log(strangerResult.satisfied); // false

const friendResult = checkGate(friendGate, friendState);
console.log(friendResult.satisfied); // true
```

#### Example 2: Preview Progression Arc

1. Open ProgressionArcEditor with your arc
2. Click "👁️ Preview" in the header
3. Use quick presets or adjust metrics manually
4. Watch stage cards update to show which stages are unlocked
5. Click on a stage to see its requirements
6. Adjust metrics until you reach the desired stage

#### Example 3: What-If Analysis

```typescript
// Test different scenarios
const scenarios = [
  { name: 'High affinity, low trust', state: { ...defaultState, metrics: { affinity: 80, trust: 20, chemistry: 30, tension: 10 } } },
  { name: 'Balanced growth', state: createStateFromTier('close_friend') },
  { name: 'Fast chemistry', state: { ...defaultState, metrics: { affinity: 40, trust: 30, chemistry: 70, tension: 50 } } },
];

for (const scenario of scenarios) {
  const result = checkGate(myGate, scenario.state);
  console.log(`${scenario.name}: ${result.satisfied ? 'PASS' : 'FAIL'}`);
}
```

### Tips for Using Preview Mode

1. **Start with Presets**: Use tier presets for quick testing
2. **Incremental Testing**: Gradually increase metrics to find exact thresholds
3. **Multiple Scenarios**: Test edge cases (very low/high metrics, unusual combinations)
4. **Flag Testing**: Toggle flags to test conditional gates
5. **Progression Testing**: In arc editor, simulate full progression paths

---

## Implementation Status

### ✓ Phase 1 - Complete

- [x] Data models (`packages/types/src/intimacy.ts`)
- [x] Node type registrations (`packages/types/src/intimacyNodeTypes.ts`)
- [x] RelationshipGateVisualizer component
- [x] IntimacySceneComposer component
- [x] ProgressionArcEditor component
- [x] Validation utilities (`frontend/src/lib/intimacy/validation.ts`)
- [x] Documentation

### ✓ Phase 2 - Complete

- [x] Live preview with social context (what-if analysis)
- [x] RelationshipStateEditor component (`frontend/src/components/intimacy/RelationshipStateEditor.tsx`)
- [x] GatePreviewPanel component (`frontend/src/components/intimacy/GatePreviewPanel.tsx`)
- [x] Gate checking utilities (`frontend/src/lib/intimacy/gateChecking.ts`)
- [x] Integration in IntimacySceneComposer (Generation tab)
- [x] Preview mode in ProgressionArcEditor
- [x] Quick presets for common relationship states
- [x] Documentation with usage examples

### Phase 3 - Planned

- [ ] Generation integration (backend preview of intimacy scenes)
- [ ] Template library for common patterns
- [ ] Progression state tracking with save/load
- [ ] Advanced what-if scenarios (multi-NPC, temporal)

### Phase 4 - Future

- [ ] Branching progression paths
- [ ] Multi-NPC progression arcs
- [ ] Analytics and playtesting tools
- [ ] Import/export progression packs
- [ ] A/B testing for content variations

---

## Usage Examples

### Example 1: Simple Flirt Scene

```typescript
const flirtScene: IntimacySceneConfig = {
  sceneType: 'flirt',
  intensity: 'light',
  targetNpcIds: [12],
  gates: [
    {
      id: 'friends_gate',
      name: 'Must be friends',
      requiredTier: 'friend',
      metricRequirements: {
        minAffinity: 30,
      },
    },
  ],
  contentRating: 'romantic',
  requiresConsent: false,
  tags: ['casual', 'playful'],
};
```

### Example 2: Progression Arc

```typescript
const romanceArc: RelationshipProgressionArc = {
  id: 'alice_romance',
  name: 'Alice Romance Path',
  targetNpcId: 12,
  stages: [
    {
      id: 'meet',
      name: 'First Meeting',
      tier: 'acquaintance',
      gate: {
        id: 'g1',
        name: 'Initial',
        requiredTier: 'stranger',
      },
      onEnterEffects: {
        affinityDelta: 5,
        setFlags: ['met_alice'],
      },
    },
    {
      id: 'friend',
      name: 'Becoming Friends',
      tier: 'friend',
      gate: {
        id: 'g2',
        name: 'Friend Requirements',
        requiredTier: 'acquaintance',
        metricRequirements: {
          minAffinity: 20,
        },
      },
      onEnterEffects: {
        affinityDelta: 10,
        setFlags: ['alice_friend'],
      },
    },
    {
      id: 'romance',
      name: 'Romance Begins',
      tier: 'close_friend',
      gate: {
        id: 'g3',
        name: 'Romance Gate',
        requiredTier: 'friend',
        requiredIntimacyLevel: 'light_flirt',
        metricRequirements: {
          minAffinity: 50,
          minChemistry: 30,
        },
      },
      availableScenes: ['first_date', 'first_kiss'],
      onEnterEffects: {
        affinityDelta: 15,
        chemistryDelta: 10,
        setFlags: ['alice_romance_started'],
      },
    },
  ],
  maxContentRating: 'romantic',
  tags: ['romance', 'slow_burn'],
};
```

### Example 3: Validation

```typescript
// Validate before saving
const validation = validateIntimacyScene(
  scene,
  'romantic',  // World max
  'mature_implied'  // User max
);

if (!validation.valid) {
  // Show errors in UI
  toast.error(`Cannot save: ${validation.errors.join(', ')}`);
  return;
}

if (validation.warnings.length > 0) {
  // Show warnings but allow save
  toast.warning(`Warnings: ${validation.warnings.join(', ')}`);
}

// Save scene
await saveScene(scene);
```

---

## File Reference

### Types
- `packages/types/src/intimacy.ts` - All intimacy-related type definitions
- `packages/types/src/intimacyNodeTypes.ts` - Node type registrations
- `packages/types/src/generation.ts` - Generation and social context types
- `packages/types/src/index.ts` - Main exports

### Components (Phase 1)
- `frontend/src/components/intimacy/IntimacySceneComposer.tsx` - Main editor
- `frontend/src/components/intimacy/RelationshipGateVisualizer.tsx` - Gate visualization
- `frontend/src/components/intimacy/ProgressionArcEditor.tsx` - Arc timeline editor
- `frontend/src/components/generation/SocialContextPanel.tsx` - Social context display

### Components (Phase 2 - NEW)
- `frontend/src/components/intimacy/RelationshipStateEditor.tsx` - State simulation editor
- `frontend/src/components/intimacy/GatePreviewPanel.tsx` - Live gate preview panel

### Utilities
- `frontend/src/lib/intimacy/validation.ts` - Validation functions
- `frontend/src/lib/intimacy/gateChecking.ts` - Gate checking utilities (Phase 2)

### Documentation
- `docs/INTIMACY_AND_GENERATION.md` - Generation system integration
- `docs/RELATIONSHIPS_AND_ARCS.md` - Relationship data model
- `docs/DYNAMIC_GENERATION_FOUNDATION.md` - Generation pipeline
- `docs/INTIMACY_SCENE_COMPOSER.md` - This document

---

## Future Enhancements

1. ~~**Live Preview**~~ - ✓ Implemented in Phase 2
2. **Smart Templates** - AI-powered suggestions for common progression patterns
3. **Metric Visualization** - Charts showing relationship metric changes over time
4. **Playtesting Mode** - Full simulation with player choices and branching
5. **Export/Import** - Share progression packs between projects
6. **Analytics** - Track which gates/stages players reach most often
7. **Branching Editor** - Visual editor for complex branching progressions
8. **Content Library** - Reusable intimacy scenes across different arcs

---

## Best Practices

### Content Rating Guidelines

1. **Be Conservative** - Start with lower ratings and increase only if needed
2. **Respect User Preferences** - Always check user max rating
3. **Require Consent** - For restricted content, always require explicit consent
4. **Provide Fallbacks** - Have non-intimate fallback content for all scenes

### Gate Design

1. **Progressive Requirements** - Gates should get more restrictive over time
2. **Multiple Metrics** - Use combinations of affinity, trust, chemistry
3. **Clear Names** - Use descriptive gate names for designer clarity
4. **Test Paths** - Ensure reasonable players can progress

### Progression Arcs

1. **Natural Pacing** - Don't rush intimacy progression
2. **Player Choice** - Allow branching based on player decisions
3. **Reversible Paths** - Consider how relationships can change
4. **Clear Milestones** - Each stage should feel meaningful

---

## Troubleshooting

### Content Rating Blocked

**Problem**: Scene rating exceeds world/user limits

**Solution**:
- Check world's `maxContentRating` in world settings
- Check user's content preferences
- Lower the scene's content rating
- Update world/user settings if appropriate

### Gate Never Satisfied

**Problem**: Gate requirements never met during testing

**Solution**:
- Check metric requirements are achievable
- Verify tier requirements match progression
- Check for conflicting flag requirements
- Use validation tab to see specific issues

### Validation Errors

**Problem**: Scene fails validation

**Solution**:
- Review validation tab for specific errors
- Fix required issues (errors)
- Address warnings for better UX
- Test with different world/user settings

---

## Contact & Support

For questions or issues:
- See `docs/SYSTEM_OVERVIEW.md` for high-level architecture
- Check `claude-tasks/12-intimacy-scene-composer-and-progression-editor.md` for roadmap
- Review related docs: `INTIMACY_AND_GENERATION.md`, `RELATIONSHIPS_AND_ARCS.md`
