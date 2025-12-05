# Generation Pipeline - App Map Entry

## Overview
The unified generation pipeline provides dynamic content generation for scene transitions, NPC responses, and adaptive content.

## Key Components

### Backend Services

**Generation Services** (`pixsim7/backend/main/services/generation/`)
- `creation_service.py` - Generation creation with validation and caching
- `lifecycle_service.py` - Status transitions and telemetry recording
- `cache_service.py` - Redis-based caching with seed strategies
- `telemetry_service.py` - Metrics tracking (cost, latency, provider health)
- `social_context_builder.py` - Relationship/intimacy context integration

**API Endpoints** (`pixsim7/backend/main/api/v1/generations.py`)
- `POST /api/v1/generations` - Create generation from GenerationNodeConfig
- `POST /api/v1/generations/simple-image-to-video` - Convenience endpoint for thin clients (Chrome extension)
- `GET /api/v1/generations` - List generations with filters
- `GET /api/v1/generations/{id}` - Get generation details
- `POST /api/v1/generations/{id}/cancel` - Cancel generation
- `GET /api/v1/generations/telemetry/providers` - Provider health metrics
- `GET /api/v1/generations/telemetry/providers/{id}` - Specific provider metrics
- `GET /api/v1/generations/cache/stats` - Cache statistics

> **Note (Task 128):** Structured `generation_config` payloads are required. Legacy flat payloads
> (top-level prompt, quality, duration) are rejected with a 400 error. Use the `/simple-image-to-video`
> endpoint for minimal requests from thin clients - it converts flat params to structured internally.

### Frontend Components

**Editor Integration** (`apps/main/src/components/`)
- `inspector/GenerationNodeEditor.tsx` - Graph editor node configuration UI
- `dev/GenerationHealthView.tsx` - Validation health dashboard
- `dev/GenerationDevPanel.tsx` - Developer tools panel (Phase 10)

**Types** (`packages/types/src/generation.ts`)
- `GenerationNodeConfig` - Node configuration schema
- `GenerateContentRequest/Response` - API contracts
- `GenerationSocialContext` - Relationship context

## Data Flow

```
Graph Editor (GenerationNode)
  ↓ GenerationNodeConfig
Frontend RequestBuilder
  ↓ GenerateContentRequest
Backend Generation API
  ↓
CreationService
  ├─ Validation (content rating, constraints)
  ├─ Canonicalization (params → canonical format)
  ├─ Hash Computation (deduplication)
  ├─ Cache Lookup (Redis, based on strategy)
  ├─ Prompt Resolution (version/family/variables)
  └─ Generation Creation
       ↓
Database (generations table)
       ↓
ARQ Queue (process_generation)
       ↓
LifecycleService (status transitions)
  ├─ Telemetry Recording
  └─ Cache Update
```

## Caching Strategy (Phase 6)

**Seed Strategies:**
- `once` - Generate once, cache forever (no seed component)
- `per_playthrough` - Deterministic within playthrough (playthrough_id seed)
- `per_player` - Personalized per player (player_id seed)
- `always` - Fresh generation each time (no caching)

**Cache Key Format:**
```
generation:[type]|[purpose]|[fromSceneId]|[toSceneId]|[strategy]|[seed]|v[version]
```

**TTLs:**
- `once`: 365 days
- `per_playthrough`: 90 days
- `per_player`: 180 days
- `always`: No cache

## Telemetry (Phase 7)

**Tracked Metrics:**
- Latency (p50, p95, p99)
- Cost (tokens, estimated USD)
- Success/failure rates
- Provider-specific health
- Operation-type performance

**Redis Keys:**
- `generation:agg:provider:{id}:counters` - Aggregated counts
- `generation:agg:provider:{id}:latencies` - Latency samples (sorted set)
- `generation:agg:operation:{type}:counters` - Operation counts
- `generation:errors:provider:{id}:{type}` - Error tracking

## Developer Tools (Phase 10)

### Generation Dev Panel
**Route:** `/dev/generations` (or integrated in dev sidebar)

**Features:**
- Filter by status, operation type, workspace
- View generation details (params, timings, social context)
- Provider health dashboard
- Cache statistics
- Drill-down to related resources

**Usage:**
```tsx
import { GenerationDevPanel } from '@/components/dev/GenerationDevPanel';

<GenerationDevPanel
  workspaceId={currentWorkspace.id}
  highlightGenerationId={selectedNodeGenerationId}
/>
```

### Integration Points

**From Graph Editor:**
```tsx
// Link from generation node to dev panel
const handleDebugGeneration = (nodeId: string) => {
  const generationId = nodeData.lastGenerationId;
  navigate(`/dev/generations?highlight=${generationId}`);
};
```

**From App Map:**
```
Generation Pipeline
  ├─ Recent Generations → GenerationDevPanel
  ├─ Provider Health → Telemetry Dashboard
  ├─ Cache Stats → Cache Monitor
  └─ Validation Health → GenerationHealthView
```

## Testing (Phase 9)

**Regression Tests** (`pixsim7/backend/tests/test_generation_pipeline.py`)
- Canonical parameter determinism
- Hash computation stability
- Social context preservation
- Cache key format verification
- Prompt variable substitution
- Legacy flat payload rejection (Task 128)

**Run Tests:**
```bash
pytest pixsim7/backend/tests/test_generation_pipeline.py -v
```

## Related Documentation
- `docs/DYNAMIC_GENERATION_FOUNDATION.md` - System design
- `docs/INTIMACY_AND_GENERATION.md` - Social context integration
- `docs/GENERATION_PIPELINE_REFACTOR_PLAN.md` - Migration plan
- `claude-tasks/10-unified-generation-pipeline-and-dev-tools.md` - Task overview
- `claude-tasks/10-unified-generation-pipeline-progress.md` - Implementation status

## Monitoring & Debugging

### Check Provider Health
```bash
curl http://localhost:8000/api/v1/generations/telemetry/providers
```

### Check Cache Stats
```bash
curl http://localhost:8000/api/v1/generations/cache/stats
```

### List Recent Generations
```bash
curl "http://localhost:8000/api/v1/generations?limit=10&status=failed"
```

### Invalidate Cache
Use cache service methods or flush Redis keys matching `generation:*`

## Future Enhancements
- Real-time generation status via WebSocket
- Cost budgeting and alerts
- A/B testing for prompt variants
- Automatic retry on provider failures
- Generation quality feedback loop
