# Generation Node Plugin

## Overview

The Generation node is a plugin node type that enables AI-powered content generation within PixSim7 scenes. It allows dynamic creation of transitions, variations, dialogue, and environmental content based on configurable rules and constraints.

## Features

- **Multiple Generation Types**: Supports transition, variation, dialogue, and environment content generation
- **Flexible Strategy**: Configure when content is regenerated (once, per-playthrough, per-player, or always)
- **Rich Configuration**: Control style, duration, constraints, and fallback behavior
- **Client-side Validation**: Real-time validation of configuration rules
- **Test Generation**: Preview generated content directly in the editor
- **Cache Key Utilities**: Compute stable cache keys based on configuration and context

## Architecture

### Frontend Components

#### GenerationNodeEditor
Located at: `frontend/src/components/inspector/GenerationNodeEditor.tsx`

The editor provides a comprehensive UI for configuring generation nodes:

- **Basic Configuration**: Type, purpose, strategy, seed source, template ID
- **Style Rules**: Mood transitions, pacing, transition type
- **Duration Rules**: Min, max, and target duration constraints
- **Constraints**: Content rating, required/avoided elements, content rules
- **Fallback Configuration**: Handling generation failures
- **Test Generation**: Button to test the configuration with the backend API

#### Node Registration
Located at: `packages/types/src/builtinNodeTypes.ts`

The generation node is registered with:
- Icon: 🤖
- Category: custom
- Scope: scene
- Default configuration with sensible defaults

### Backend API

#### Jobs Endpoint Integration
The Generation node integrates with the existing jobs system at `pixsim7_backend/api/v1/jobs.py`

**Endpoint**: `POST /api/v1/jobs`

The generation configuration is stored in the job's `params` field and processed by the generation service.

**Request Schema**:
```typescript
{
  operation_type: 'video_transition', // Used for content generation
  provider_id: 'pixverse',
  params: {
    generation_type: 'transition' | 'variation' | 'dialogue' | 'environment',
    from_scene?: SceneRef,
    style?: StyleRules,
    duration?: DurationRule,
    constraints?: ConstraintSet,
    strategy: 'once' | 'per_playthrough' | 'per_player' | 'always',
    fallback?: FallbackConfig,
    template_id?: string
  },
  workspace_id?: number,
  priority?: number, // 0-10, default 5 for test generations
  scheduled_at?: string // ISO datetime
}
```

**Response Schema** (JobResponse):
```typescript
{
  id: number,
  user_id: number,
  workspace_id: number | null,
  operation_type: string,
  provider_id: string,
  params: object,
  status: 'pending' | 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled',
  error_message: string | null,
  retry_count: number,
  priority: number,
  parent_job_id: number | null,
  scheduled_at: string | null,
  created_at: string,
  started_at: string | null,
  completed_at: string | null
}
```

**Additional Endpoints**:
- `GET /api/v1/jobs` - List all jobs with filters
- `GET /api/v1/jobs/{job_id}` - Get job details
- `DELETE /api/v1/jobs/{job_id}` - Cancel a job
- `WebSocket /api/v1/ws/jobs` - Real-time job updates

### Cache Key Utilities

#### computeGenerationCacheKey
Located at: `packages/game-core/src/generation/cacheKey.ts`

Computes stable cache keys for generation nodes based on:
1. Node ID
2. Configuration hash (deterministic)
3. Version
4. Strategy-specific context (playthrough/player IDs)
5. Seed source
6. Template ID

**Usage**:
```typescript
import { computeGenerationCacheKey } from '@pixsim7/game-core';

const cacheKey = computeGenerationCacheKey(generationNode, {
  playthroughId: 'pt-123',
  playerId: 'player-456'
});
```

**Additional Utilities**:
- `isCacheKeyValid(cacheKey, strategy)` - Validates cache key for a strategy
- `extractCacheKeyRequirements(cacheKey)` - Extracts context requirements

## Configuration

### GenerationNodeConfig

```typescript
interface GenerationNodeConfig {
  generationType: 'transition' | 'variation' | 'dialogue' | 'environment'
  purpose: 'gap_fill' | 'variation' | 'adaptive' | 'ambient'
  style: StyleRules
  duration: DurationRule
  constraints: ConstraintSet
  strategy: GenerationStrategy
  seedSource?: 'playthrough' | 'player' | 'timestamp' | 'fixed'
  fallback: FallbackConfig
  templateId?: string
  enabled: boolean
  version: number
}
```

### Generation Types

1. **Transition**: Generate content that transitions between two scenes
2. **Variation**: Generate variations of existing content
3. **Dialogue**: Generate dialogue lines
4. **Environment**: Generate environmental/ambient content

### Generation Strategies

1. **once**: Generate content once and cache it permanently
2. **per_playthrough**: Generate different content per playthrough
3. **per_player**: Generate different content per player
4. **always**: Always regenerate (no caching)

### Style Rules

Control the aesthetic and pacing of generated content:
- `moodFrom`: Starting mood
- `moodTo`: Ending mood
- `pacing`: slow | medium | fast
- `transitionType`: gradual | abrupt

### Duration Rules

Specify timing constraints (in seconds):
- `min`: Minimum duration
- `max`: Maximum duration
- `target`: Target duration

### Constraints

Content constraints and requirements:
- `rating`: Content rating (G, PG, PG-13, R)
- `requiredElements`: Elements that must be present
- `avoidElements`: Elements to avoid
- `contentRules`: Descriptive rules for generation

### Fallback Configuration

Handle generation failures:
- `default_content`: Use a default content ID
- `skip`: Skip the node entirely
- `retry`: Retry with exponential backoff
- `placeholder`: Show a placeholder

## Validation Rules

The editor enforces these validation rules:

1. **Duration Ranges**:
   - Min cannot be greater than max
   - Target must be between min and max
   - All values must be positive

2. **Element Constraints**:
   - Required and avoided elements cannot overlap

3. **Fallback Completeness**:
   - `default_content` mode requires `defaultContentId`
   - `retry` mode requires `maxRetries >= 1`
   - Timeout must be at least 1000ms

## Testing

### Manual Testing

1. Open the Scene Builder
2. Add a Generation node to a scene
3. Configure the node in the Inspector panel
4. Click "Test Generation" to preview the output
5. Check the response in the preview panel

### Unit Testing

Cache key utilities include comprehensive tests:

```typescript
import { computeGenerationCacheKey, isCacheKeyValid } from '@pixsim7/game-core';

// Test cache key computation
const node: GenerationNode = { ... };
const key = computeGenerationCacheKey(node, { playthroughId: 'pt-123' });

// Test validation
expect(isCacheKeyValid(key, 'per_playthrough')).toBe(true);
```

## Testing

### Test Generation Flow

1. Configure the generation node in the Inspector
2. Click "Test Generation" button
3. A job is created via `POST /api/v1/jobs`
4. Job ID is returned and displayed
5. Monitor job status via:
   - Jobs list page
   - WebSocket connection for real-time updates
   - Polling `GET /api/v1/jobs/{job_id}`

### Integration Testing

The generation node integrates with the existing jobs/generation system:
- Jobs are queued and processed by background workers
- Generation service handles the actual content generation
- Results are stored and can be retrieved via job ID

## Future Enhancements

### Phase 2: Enhanced Integration
- Add WebSocket listener in GenerationNodeEditor for real-time job updates
- Show progress indicator during generation
- Display generated content preview when job completes
- Implement caching layer using cache keys

### Phase 3: Advanced Features
- Template management UI
- Generation history and analytics
- A/B testing support
- Cost estimation and budgeting
- Quality scoring and feedback loop
- Batch generation support

## File Locations

**Frontend**:
- `frontend/src/components/inspector/GenerationNodeEditor.tsx`
- `frontend/src/components/inspector/InspectorPanel.tsx`

**Types**:
- `packages/types/src/generation.ts`
- `packages/types/src/builtinNodeTypes.ts`

**Core Utilities**:
- `packages/game-core/src/generation/cacheKey.ts`

**Backend** (existing jobs system):
- `pixsim7_backend/api/v1/jobs.py`
- `pixsim7_backend/services/generation/generation_service.py`
- `pixsim7_backend/domain/generation.py`
- `pixsim7_backend/shared/schemas/job_schemas.py`

## Related Documentation

- [Dynamic Generation Foundation](./DYNAMIC_GENERATION_FOUNDATION.md)
- [Node Type System](./NODE_TYPE_SYSTEM.md)
- [Plugin System](./PLUGIN_SYSTEM.md)
