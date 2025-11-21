# Intimacy-Aware Generation System

> Relationship-aware content generation with explicit rating controls and user consent

> **For Agents**
> - Use this together with `RELATIONSHIPS_AND_ARCS.md` and `DYNAMIC_GENERATION_FOUNDATION.md` when working on intimacy‑aware generation.
> - `GenerationSocialContext` (in `packages/types/src/generation.ts`) and `buildGenerationSocialContext` (in `packages/game/engine/src/relationships/socialContext.ts`) define how relationship state flows into generation.
> - Backend generation services should treat `social_context` as input for prompts and safety; do not hard‑code rating/relationship logic in random places.
> - Related tasks (roadmap/status):  
>   - `claude-tasks/09-intimacy-and-scene-generation-prompts.md`  
>   - `claude-tasks/10-unified-generation-pipeline-and-dev-tools.md`  
>   - `claude-tasks/12-intimacy-scene-composer-and-progression-editor.md`

---

## Overview

The intimacy-aware generation system integrates relationship/intimacy state from the session into dynamic content generation requests. This ensures generated content (transitions, dialogue, NPC responses) respects relationship progression and stays within world/user rating constraints.

**Key principles:**
- **Explicit ratings**: Clear content rating levels (sfw, romantic, mature_implied, restricted)
- **Multi-layer clamping**: World AND user preferences constrain content
- **Relationship-driven**: Intimacy context derived from affinity, chemistry, trust metrics
- **No hardcoded prompts**: Core code handles structure/controls, backend handles actual prompt text

---

## Architecture

```
GameSession.relationships["npc:X"]
  ├─ affinity, trust, chemistry, tension (numeric metrics)
  ├─ tierId (backend-computed: stranger, friend, close_friend, lover)
  └─ intimacyLevelId (backend-computed: light_flirt, intimate, very_intimate)

buildGenerationSocialContext()
  ├─ Maps intimacyLevelId → intimacyBand (none, light, deep, intense)
  ├─ Maps intimacyLevelId → contentRating (sfw, romantic, mature_implied, restricted)
  ├─ Clamps by GameWorld.meta.generation.maxContentRating
  └─ Clamps by UserContentPreferences.maxContentRating

GenerationNodeConfig.socialContext ──────┐
                                          ├─→ GenerateContentRequest.social_context
GenerateContentRequest.player_context ───┘    (sent to backend generation service)
```

---

## Data Types

### GenerationSocialContext

Defined in `packages/types/src/generation.ts`:

```typescript
interface GenerationSocialContext {
  intimacyLevelId?: string;        // 'light_flirt', 'intimate', 'very_intimate'
  relationshipTierId?: string;     // 'stranger', 'friend', 'close_friend', 'lover'
  intimacyBand?: 'none' | 'light' | 'deep' | 'intense';
  contentRating?: 'sfw' | 'romantic' | 'mature_implied' | 'restricted';
  npcIds?: number[];               // NPCs involved in this generation
}
```

### WorldGenerationConfig

Defined in `packages/types/src/game.ts`:

```typescript
interface WorldGenerationConfig {
  stylePresetId?: string;
  maxContentRating?: 'sfw' | 'romantic' | 'mature_implied' | 'restricted';
  defaultStrategy?: 'once' | 'per_playthrough' | 'per_player' | 'always';
}
```

Stored in `GameWorld.meta.generation`:

```json
{
  "meta": {
    "generation": {
      "stylePresetId": "soft_romance",
      "maxContentRating": "romantic"
    }
  }
}
```

### UserContentPreferences

Defined in `packages/types/src/userPreferences.ts`:

```typescript
interface UserContentPreferences {
  maxContentRating?: 'sfw' | 'romantic' | 'mature_implied' | 'restricted';
  reduceRomanticIntensity?: boolean;
  requireMatureContentConfirmation?: boolean;
}
```

---

## Intimacy Mapping

### Intimacy Bands

Defined in `packages/game/engine/src/relationships/socialContext.ts`:

| Intimacy Level ID | Band      | Content Rating   | Description                       |
|-------------------|-----------|------------------|-----------------------------------|
| (none)            | none      | sfw              | No romantic context               |
| light_flirt       | light     | romantic         | Light flirting, romantic interest |
| deep_flirt        | deep      | romantic         | Deeper connection, romance        |
| intimate          | deep      | mature_implied   | Established intimate relationship |
| very_intimate     | intense   | mature_implied   | Very deep intimacy                |

### Relationship Tiers

Default mapping (from `packages/game/engine/src/relationships/computation.ts`):

| Tier ID       | Affinity Range |
|---------------|----------------|
| stranger      | < 10           |
| acquaintance  | 10-29          |
| friend        | 30-59          |
| close_friend  | 60-79          |
| lover         | ≥ 80           |

**Note**: Backend is authoritative. Frontends should use `tierId` and `intimacyLevelId` from `GameSession.relationships["npc:X"]` when available.

---

## Content Rating Hierarchy

From least to most permissive:

```
sfw < romantic < mature_implied < restricted
```

### Rating Definitions

- **sfw**: Safe for work, no romantic content
- **romantic**: Light romance (hand-holding, kissing, romantic dialogue)
- **mature_implied**: Mature themes implied but not explicit
- **restricted**: Requires explicit user consent

### Clamping Logic

Content rating is clamped by the **most restrictive** of:
1. World `maxContentRating` (in `GameWorld.meta.generation.maxContentRating`)
2. User `maxContentRating` (in `UserContentPreferences.maxContentRating`)

Example:
```
Relationship intimacy → mature_implied
World maxContentRating → romantic
User maxContentRating → (not set)
───────────────────────────────────
Final contentRating → romantic (clamped by world)
```

---

## Usage Examples

### Building Social Context

```typescript
import { buildGenerationSocialContext } from '@pixsim7/game.engine';

// Get social context for NPC interaction
const socialContext = buildGenerationSocialContext(
  session,           // GameSessionDTO
  world,             // GameWorldDetail (optional)
  [12],              // NPC IDs
  {                  // SocialContextConfig (optional)
    maxContentRating: 'romantic',
    reduceIntensity: false
  }
);

console.log(socialContext);
// {
//   intimacyLevelId: 'intimate',
//   relationshipTierId: 'close_friend',
//   intimacyBand: 'deep',
//   contentRating: 'mature_implied',
//   npcIds: [12]
// }
```

### Building Generation Request

```typescript
import { buildGenerateContentRequest } from '@pixsim7/game.engine';

const request = buildGenerateContentRequest(generationNodeConfig, {
  session: currentSession,
  world: currentWorld,
  npcIds: [12],
  seed: 'playthrough-123-node-456',
});

// Request includes social_context automatically
console.log(request.social_context);
// { intimacyBand: 'deep', contentRating: 'mature_implied', ... }
```

### Validating Generation Node

```typescript
import { validateGenerationNode } from '@pixsim7/game.engine';

const result = validateGenerationNode(nodeConfig, {
  world: currentWorld,
  userPrefs: userContentPreferences
});

if (result.errors.length > 0) {
  console.error('Validation failed:', result.errors);
}

if (result.warnings.length > 0) {
  console.warn('Warnings:', result.warnings);
}
```

### World Generation Config

```typescript
import {
  getWorldGenerationConfig,
  setWorldMaxContentRating
} from '@pixsim7/game.engine';

// Get current config
const config = getWorldGenerationConfig(world);

// Set max rating
const newWorld = setWorldMaxContentRating(world, 'romantic');
```

### User Content Preferences

```typescript
import {
  loadUserContentPreferences,
  setUserMaxContentRating,
  setReduceRomanticIntensity
} from '@pixsim7/game.engine';

// Load preferences
const prefs = loadUserContentPreferences();

// Update settings
setUserMaxContentRating('romantic');
setReduceRomanticIntensity(true);
```

---

## Editor Integration

### Generation Node Side Panel

See `apps/main/src/components/generation/SocialContextPanel.tsx`:

```tsx
import { SocialContextPanel } from '@/components/generation/SocialContextPanel';

// In generation node side panel
<SocialContextPanel
  socialContext={node.config.socialContext}
  readOnly={false}
  onConfigure={() => openSocialContextConfig()}
/>
```

### Compact Badge

```tsx
import { SocialContextBadge } from '@/components/generation/SocialContextPanel';

// On generation node itself
<SocialContextBadge socialContext={node.config.socialContext} />
```

---

## Backend Integration

### Generation Service

The backend generation service should:

1. Accept `social_context` in `GenerateContentRequest`
2. Use `intimacyBand` and `contentRating` to inform prompt templating
3. Respect `maxContentRating` constraints
4. Return generated content that matches the rating

**Important**: Core code does NOT contain explicit prompt strings. Social context provides structured metadata for the backend to use in its prompt templating layer.

### Prompt Templating (Backend)

Example pseudo-code:

```python
def build_prompt(request: GenerateContentRequest) -> str:
    social = request.social_context

    if not social or social.intimacy_band == 'none':
        return build_sfw_prompt(request)

    if social.intimacy_band == 'light':
        return build_romantic_prompt(request, intensity='light')

    if social.intimacy_band == 'deep':
        return build_romantic_prompt(request, intensity='deep')

    if social.intimacy_band == 'intense':
        # Verify user consent and rating
        if social.content_rating != 'restricted':
            raise ValueError("Intense band requires restricted rating")
        return build_romantic_prompt(request, intensity='intense')
```

---

## Testing

See `packages/game/engine/src/__tests__/generation-social-context.test.ts` for:

- Social context mapping tests
- Validation tests
- Regression anchors

Run tests:
```bash
npm test packages/game/engine
```

---

## File Reference

### Types
- `packages/types/src/generation.ts` - GenerationSocialContext, GenerationNodeConfig, GenerateContentRequest
- `packages/types/src/game.ts` - WorldGenerationConfig
- `packages/types/src/userPreferences.ts` - UserContentPreferences

### Game Core
- `packages/game/engine/src/relationships/socialContext.ts` - buildGenerationSocialContext()
- `packages/game/engine/src/generation/requestBuilder.ts` - buildGenerateContentRequest()
- `packages/game/engine/src/generation/validator.ts` - validateGenerationNode()
- `packages/game/engine/src/world/generationConfig.ts` - World config helpers
- `packages/game/engine/src/user/contentPreferences.ts` - User preference helpers

### Frontend
- `apps/main/src/components/generation/SocialContextPanel.tsx` - UI components

### Docs
- `docs/DYNAMIC_GENERATION_FOUNDATION.md` - Generation system foundation
- `docs/RELATIONSHIPS_AND_ARCS.md` - Relationship data model

---

## Future Extensions

1. **Dynamic threshold configuration**: Allow worlds to customize intimacy band thresholds
2. **Multi-NPC context**: Better handling of group scenes with multiple relationship contexts
3. **Temporal context**: Factor in relationship history/progression speed
4. **Cultural/world variations**: Different intimacy mappings per world culture
5. **A/B testing**: Compare generation quality across different social context configurations

---

## Migration Notes

### Existing Generation Nodes

Existing generation nodes without `socialContext` will:
- Default to `intimacyBand: 'none'` and `contentRating: 'sfw'`
- Continue to work without changes
- Can be gradually upgraded with social context

### Backward Compatibility

All new fields are optional:
- `GenerationNodeConfig.socialContext?`
- `GenerateContentRequest.social_context?`
- `GameWorld.meta.generation?`

Existing code works unchanged. Social context is additive only.

---

## Contact

For questions or issues, see:
- `docs/SYSTEM_OVERVIEW.md` - High-level system map
- `claude-tasks/09-intimacy-and-scene-generation-prompts.md` - Implementation task
