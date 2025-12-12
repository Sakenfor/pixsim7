# Clean Coupling Strategy

> **STATUS: PROPOSED (Not Yet Implemented)**
>
> This document describes a **proposed frontend abstraction layer** for cleaner coupling between game and generation.
> The backend already has robust caching and asset services; the proposal focuses on surfacing these via a unified frontend interface.
>
> **What Exists Today:**
> - Backend: Full Redis caching (`GenerationCacheService`), asset facade (`AssetService`), deduplication, lineage tracking
> - Frontend: Zustand stores with caching, queue-based generation workflow, WebSocket + polling for status
> - Game components currently import from `features/generation/` and use stores directly
>
> **What This Proposal Adds:**
> - `IAssetProvider` abstraction interface for game components
> - `AssetService` frontend facade coordinating pre-made/generated/cached sources
> - Dependency injection via React Context
>
> **Implementation Status:** See [Migration Plan](#-migration-plan) for phases.

---

**Goal:** Surface existing backend caching/asset infrastructure through a clean frontend abstraction, improving architectural clarity, testability, and maintainability.

---

## What Exists Today (Detailed)

### Backend Infrastructure (Already Implemented)

#### Generation Caching (`GenerationCacheService`)

**File:** `pixsim7/backend/main/services/generation/cache_service.py`

The backend already implements sophisticated Redis-based caching:

```python
# Cache key format
"generation:[type]|[purpose]|[fromScene]|[toScene]|[strategy]|[seed]|v[version]"

# TTL by strategy (already implemented)
"once": 365 days          # Permanent cache
"per_playthrough": 90 days
"per_player": 180 days
"always": No cache (bypass)
```

**Existing cache methods:**
- `compute_cache_key()` - Deterministic key from params
- `get_cached_generation()` - Check Redis for existing generation_id
- `cache_generation()` - Store with TTL by strategy
- `acquire_lock()` - Distributed lock for cache stampede prevention
- `find_by_hash()` - Deduplication via SHA256 `reproducible_hash`
- `get_cache_stats()` - Hit rate tracking

**Redis keys in use:**
```
generation:{cache_key}         - Cached generation ID
generation:hash:{sha256}       - Hash-based deduplication
generation:stats:cache_hits_24h
generation:stats:cache_misses_24h
{cache_key}:lock               - Distributed lock (30s TTL)
```

#### Asset Services (`AssetService` Facade)

**File:** `pixsim7/backend/main/services/asset/asset_service.py`

Backend already uses the facade pattern:

```python
class AssetService:
    def __init__(self, db):
        self._core = AssetCoreService(db)      # CRUD, search, listing
        self._sync = AssetSyncService(db)      # Downloads, cross-provider sync
        self._enrichment = AssetEnrichmentService(db)  # Recognition, metadata
        self._quota = AssetQuotaService(db)    # User quotas, dedup by hash
```

**Existing capabilities:**
- **Deduplication**: By SHA256, provider tuple `(provider_id, provider_asset_id, user_id)`, or remote_url
- **Lineage tracking**: `AssetLineageService` tracks parent/child relationships (`asset_lineage` table)
- **Sync status**: `REMOTE → DOWNLOADING → DOWNLOADED → ERROR` state machine
- **Cross-provider uploads**: Cached in `asset.provider_uploads` dict

#### Generation Services (`GenerationService` Facade)

**File:** `pixsim7/backend/main/services/generation/generation_service.py`

```python
class GenerationService:
    def __init__(self, db, user_service):
        self._creation = GenerationCreationService(db, user_service)
        self._lifecycle = GenerationLifecycleService(db)
        self._query = GenerationQueryService(db)
        self._retry = GenerationRetryService(db, self._creation)
        self._cache = GenerationCacheService()  # Redis caching
        self._billing = GenerationBillingService(db)
```

**Generation flow:**
1. Request arrives at API
2. Check quota (`UserService.check_can_create_job()`)
3. Canonicalize params, compute `reproducible_hash`
4. **Check cache** for duplicate (returns existing if found)
5. Create generation record (PENDING)
6. Queue ARQ job
7. Worker polls provider → COMPLETED/FAILED
8. On completion: Create asset, link `asset_id`, cache result, publish events

#### Backend API Endpoints (Current)

```
POST /api/v1/generations              # Create generation (with cache check)
GET  /api/v1/generations/{id}         # Get single generation
GET  /api/v1/generations              # List with filters (status, operation_type, workspace_id)
POST /api/v1/generations/{id}/retry   # Retry failed generation
DELETE /api/v1/generations/{id}       # Delete (terminal only)

GET  /api/v1/assets                   # List with cursor pagination, filters (q, tag, provider_id, media_type)
GET  /api/v1/assets/{id}              # Get single asset metadata
GET  /api/v1/assets/{id}/file         # Binary file download (authenticated)
POST /api/v1/assets/{id}/tags         # Update tags
DELETE /api/v1/assets/{id}            # Delete asset
```

#### Event Bus (Backend)

**File:** `pixsim7/backend/main/infrastructure/events/bus.py`

```python
# Events published on status changes
JOB_CREATED, JOB_STARTED, JOB_COMPLETED, JOB_FAILED, JOB_CANCELLED
ASSET_CREATED
```

---

### Frontend Infrastructure (Already Implemented)

#### Generation Stores (Zustand)

**`useGenerationsStore`** - In-memory generation cache
```typescript
// File: apps/main/src/features/generation/stores/generationsStore.ts
{
  generations: Map<number, GenerationResponse>,  // All fetched generations
  watchingGenerationId: number | null,
  // Methods: addOrUpdate(), remove(), byId(), all(), byStatus()
}
```

**`useGenerationQueueStore`** - Persisted queue (localStorage: `generation_queue_v1`)
```typescript
// File: apps/main/src/features/generation/stores/generationQueueStore.ts
{
  mainQueue: QueuedAsset[],       // General generation queue
  transitionQueue: QueuedAsset[], // Video transition queue
  // Methods: addToQueue(), consumeFromQueue(), getNextInQueue()
}
```

**`useGenerationSettingsStore`** - Persisted params (backend storage)
```typescript
// File: apps/main/src/features/generation/stores/generationSettingsStore.ts
// Uses createBackendStorage('generationSettings') for server-side persistence
{
  params: Record<string, any>,  // Model, quality, duration, etc.
  showSettings: boolean,
}
```

#### Asset Stores (Zustand)

**`useAssetSelectionStore`** - Persisted selection (localStorage: `asset_selection_v1`)
```typescript
{
  selectedAssets: SelectedAsset[],
  lastSelectedAsset: SelectedAsset | null,
  // Methods: selectAsset(), toggleAsset(), clearSelection()
}
```

**`useAssetViewerStore`** - Persisted viewer settings (localStorage: `asset_viewer_v1`)
```typescript
{
  currentAsset: ViewerAsset,
  mode: 'side' | 'fullscreen' | 'closed',
  settings: { defaultMode, autoPlayVideos, loopVideos, ... }
}
```

#### Asset/Generation API Layer

**`lib/api/generations.ts`** - Canonical API client
```typescript
// File: apps/main/src/lib/api/generations.ts
export async function createGeneration(request: CreateGenerationRequest): Promise<GenerationResponse>
export async function getGeneration(id: number): Promise<GenerationResponse>
export async function listGenerations(params): Promise<GenerationListResponse>
export async function cancelGeneration(id: number): Promise<void>
export async function retryGeneration(id: number): Promise<GenerationResponse>
```

**`features/assets/lib/api.ts`** - Asset API
```typescript
// File: apps/main/src/features/assets/lib/api.ts
export async function getAsset(assetId: number): Promise<AssetResponse>
export async function deleteAsset(assetId: number): Promise<void>
export async function extractFrame(request): Promise<AssetResponse>
```

#### Status Tracking (Polling + WebSocket)

**`useGenerationStatus(id)`** - Adaptive polling
```typescript
// File: apps/main/src/features/generation/hooks/useGenerationStatus.ts
// Strategy: 3s base → 30s max (exponential backoff after 60s)
// Updates useGenerationsStore on each poll
```

**`useGenerationWebSocket()`** - Real-time updates
```typescript
// File: apps/main/src/features/generation/hooks/useGenerationWebSocket.ts
// URL: VITE_WS_URL or ws://localhost:8000/api/v1/ws/generations
// Keep-alive: 30s ping, 5s reconnect backoff
```

#### Asset Request Workflow (Current Flow)

```
Gallery (MediaCard)
    ↓ Click "Generate" action
useMediaGenerationActions() hook
    ↓ Adds to queue
useGenerationQueueStore.addToQueue()
    ↓ Opens panel
Control Center (QuickGenerateModule)
    ↓ User configures & submits
buildGenerationConfig() + normalizeProviderParams()
    ↓
generateAsset() → createGeneration() (lib/api/generations.ts)
    ↓
Backend checks cache → creates generation (PENDING/QUEUED)
    ↓
useGenerationStatus() polling OR useGenerationWebSocket()
    ↓
useGenerationsStore updated
    ↓
useMediaCardGenerationStatus() subscribed
    ↓
MediaCard badge updates (pending → processing → completed/failed)
```

#### Game Engine Abstractions

**`GenerationService` interface** - Already defined
```typescript
// File: packages/game/engine/src/generation/requestBuilder.ts (lines 297-336)
interface GenerationService {
  generate(request: GenerateContentRequest): Promise<GenerationJob>;
  getJobStatus(jobId: string): Promise<JobStatus>;
  cancelJob(jobId: string): Promise<void>;
}
```

**`GenerationBridge` class** - Coordinates pool vs generation
```typescript
// File: packages/game/engine/src/narrative/generationIntegration.ts
// Narrative executor depends on interface, not implementation
```

**`assetResolver.ts`** - Asset resolution for ActionBlocks/DSL
```typescript
// File: apps/main/src/features/generation/lib/assetResolver.ts
// Scoring: Identity matches (100pts) > role matches (10pts)
// Methods: resolveAssetsForAction(), resolveSingleAsset()
```

**`assetRoles.ts`** - Tag-based asset classification
```typescript
// File: apps/main/src/features/gallery/lib/core/assetRoles.ts
// Roles: 'bg', 'pov:player', 'char:hero', 'char:npc', 'char:monster', 'comic_frame'
// Identity tags: 'npc:*', 'player', 'loc:*', 'cam:*'
// Methods: filterAssetsByRole(), filterAssetsByCharacter(), filterAssetsByLocation()
```

---

## Gap Analysis: What's Missing vs. What Exists

| Area | Backend Status | Frontend Status | Gap |
|------|---------------|-----------------|-----|
| **Caching** | Redis caching with TTL by strategy | Zustand stores (session-level) | Frontend doesn't leverage backend cache semantics |
| **Deduplication** | SHA256 hash, cache stampede prevention | `force_new` flag only | Frontend lacks explicit dedup controls |
| **Asset Facade** | `AssetService` with 5 sub-services | Direct API calls from hooks | **Missing unified frontend facade** |
| **Provider Abstraction** | `Provider` ABC + registry pattern | None | **Missing frontend `IAssetProvider` interface** |
| **Game Integration** | `GenerationService` interface exists | Game components bypass interface | **Game uses stores directly, not abstraction** |
| **Lineage** | `AssetLineageService` + `asset_lineage` table | Not surfaced in UI | Could enhance asset browser |
| **Events** | Backend event bus (JOB_*, ASSET_*) | None | **Missing frontend event bus** |

### Key Gaps to Address

1. **No `IAssetProvider` interface** - Game components import from `features/generation/` and use stores directly
2. **No frontend `AssetService` facade** - Unlike backend, frontend has no coordinating layer
3. **Cache semantics not surfaced** - Backend has TTL by strategy, but frontend doesn't leverage this
4. **Direct store coupling** - Game components know about `useGenerationsStore`, `useGenerationQueueStore`

---

## What This Proposal Adds (Proposed Architecture)

### New Frontend Abstraction Layer

```
apps/main/src/
├── lib/
│   └── assets/                    # NEW: Asset abstraction layer
│       ├── AssetService.ts        # Facade (coordinates providers)
│       ├── AssetProviderContext.tsx  # DI via React Context
│       └── providers/
│           ├── GeneratedAssetProvider.ts  # Wraps /generations API + polling
│           ├── PreMadeAssetProvider.ts    # Wraps /assets API
│           └── CachedAssetProvider.ts     # Leverages backend cache semantics

packages/shared/types/src/         # EXISTING - add interface here
└── assetProvider.ts               # NEW: IAssetProvider interface
```

### IAssetProvider Interface (Proposed)

```typescript
// packages/shared/types/src/assetProvider.ts

export interface IAssetProvider {
  /** Get asset by ID (source-agnostic) */
  getAsset(assetId: string): Promise<Asset>

  /** Request asset matching requirements (cache → pre-made → generate) */
  requestAsset(request: AssetRequest): Promise<Asset>

  /** Check availability (for predictive loading) */
  isAssetAvailable(assetId: string): Promise<boolean>
}

export interface AssetRequest {
  // Game context (maps to backend cache key)
  sceneId?: string
  choiceId?: string
  characterId?: string

  // Generation params
  prompt?: string
  style?: AssetStyle
  duration?: number

  // Strategy hints (maps to backend caching strategy)
  strategy?: 'once' | 'per_playthrough' | 'per_player' | 'always'
  preferCached?: boolean    // Leverage backend cache
  allowGeneration?: boolean
  maxWaitTime?: number      // Timeout for generation polling
}
```

### Frontend AssetService Facade (Proposed)

```typescript
// apps/main/src/lib/assets/AssetService.ts

export class AssetService implements IAssetProvider {
  constructor(
    private preMadeProvider: PreMadeAssetProvider,    // Wraps GET /assets
    private generatedProvider: GeneratedAssetProvider, // Wraps POST /generations
    private config: AssetServiceConfig
  ) {}

  async requestAsset(request: AssetRequest): Promise<Asset> {
    // 1. Check pre-made assets (tag/scene/role match)
    const preMade = await this.preMadeProvider.findMatchingAsset(request)
    if (preMade) return { ...preMade, source: 'pre-made' }

    // 2. Generate if allowed (backend handles caching via strategy)
    if (request.allowGeneration !== false && this.config.generationEnabled) {
      // Backend will check cache, return existing or create new
      return await this.generatedProvider.generateAsset(request)
    }

    // 3. Fallback
    return this.getPlaceholderAsset(request)
  }
}
```

### How Providers Wrap Existing APIs

**GeneratedAssetProvider** (wraps existing infrastructure):
```typescript
export class GeneratedAssetProvider {
  async generateAsset(request: AssetRequest): Promise<Asset> {
    // Uses existing createGeneration() from lib/api/generations.ts
    const generation = await createGeneration({
      config: buildConfigFromRequest(request),
      provider_id: this.config.defaultProvider,
      force_new: !request.preferCached,  // Backend handles cache logic
    })

    // Uses existing polling infrastructure
    const completed = await this.pollForCompletion(generation.id, request.maxWaitTime)

    return {
      id: String(completed.asset_id),
      url: completed.asset_url,
      type: 'video',
      source: 'generated',
      metadata: completed.metadata,
    }
  }

  private async pollForCompletion(id: number, timeout?: number): Promise<GenerationResponse> {
    // Leverages existing pollUntil() from lib/utils/pollUntil.ts
    // Or existing useGenerationStatus() pattern
  }
}
```

**PreMadeAssetProvider** (wraps existing asset API):
```typescript
export class PreMadeAssetProvider {
  async findMatchingAsset(request: AssetRequest): Promise<Asset | null> {
    // Uses existing asset API with tag-based filtering
    const response = await apiClient.get('/api/v1/assets', {
      params: {
        tag: request.sceneId ? `loc:${request.sceneId}` : undefined,
        // Leverage existing assetRoles.ts tag patterns
      },
    })

    // Uses existing assetResolver.ts scoring if multiple matches
    return response.data[0] ? this.mapToAsset(response.data[0]) : null
  }
}
```

---

## Game Component Migration

### Before (Current - Direct Store Coupling)

```typescript
// Game component directly imports generation features
import { useGenerationQueueStore } from '@/features/generation/stores/generationQueueStore'
import { useGenerationsStore } from '@/features/generation/stores/generationsStore'
import { useMediaGenerationActions } from '@/features/generation/hooks/useMediaGenerationActions'
import { createGeneration } from '@/lib/api/generations'

function ScenePlayer({ sceneId }) {
  const { addToQueue } = useGenerationQueueStore()
  const generations = useGenerationsStore((s) => s.generations)
  const { queueImageToVideo } = useMediaGenerationActions()

  const handleChoice = async (choiceId: string) => {
    // Directly knows about queue, stores, API shape
    const job = await createGeneration({
      config: { generation_type: 'text_to_video', ... },
      provider_id: 'pixverse',
    })
    // Poll via store, update UI manually...
  }
}
```

### After (Proposed - Abstraction)

```typescript
// Game component depends only on IAssetProvider interface
import { useAssetProvider } from '@/lib/assets/AssetProviderContext'

function ScenePlayer({ sceneId }) {
  const assetProvider = useAssetProvider()

  const handleChoice = async (choiceId: string) => {
    // Doesn't know about queues, stores, providers, polling
    const asset = await assetProvider.requestAsset({
      sceneId,
      choiceId,
      strategy: 'per_playthrough',  // Maps to backend TTL
      allowGeneration: true,
      maxWaitTime: 30000,
    })
    playVideo(asset.url)
  }
}
```

---

## Backend: No New Endpoints Required (Phase 1-2)

The existing endpoints are sufficient for the proposed frontend abstraction:

```
POST /api/v1/generations     # GeneratedAssetProvider uses this
  - Backend already handles caching via strategy param
  - force_new=false leverages reproducible_hash deduplication

GET /api/v1/assets           # PreMadeAssetProvider uses this
  - Already supports tag, q, media_type filters
  - Cursor pagination for large result sets

GET /api/v1/generations/{id} # Polling uses this
  - Returns status, asset_id when complete
```

### Optional: Game-Specific Endpoint (Phase 3)

If we want to reduce round-trips, we could add a higher-level endpoint:

```
POST /api/v1/game/assets/request   # OPTIONAL - combines cache check + generate
{
  "scene_id": "romance_5",
  "choice_id": "confess",
  "strategy": "per_playthrough",
  "max_wait_ms": 30000
}

Response:
{
  "asset_id": "asset_123",
  "url": "https://cdn.example.com/video.mp4",
  "source": "cached" | "pre_made" | "generated",
  "from_cache": true,
  "generation_time_ms": null  // or 15000 if generated
}
```

This would let the backend decide strategy atomically, but the frontend abstraction works without it.

---

## Migration Plan

### Phase 1: Create Frontend Abstractions (1-2 days)

**New files to create:**
```
apps/main/src/lib/assets/
├── AssetService.ts              # Facade
├── AssetProviderContext.tsx     # React Context DI
├── providers/
│   ├── GeneratedAssetProvider.ts
│   └── PreMadeAssetProvider.ts
└── types.ts                     # Local types

packages/shared/types/src/
└── assetProvider.ts             # IAssetProvider interface
```

**Tasks:**
- [ ] Define `IAssetProvider` interface in `packages/shared/types/src/assetProvider.ts`
- [ ] Create `AssetService` facade wrapping existing API calls
- [ ] Create `GeneratedAssetProvider` wrapping `createGeneration()` + polling
- [ ] Create `PreMadeAssetProvider` wrapping asset listing API
- [ ] Set up `AssetProviderContext` for dependency injection
- [ ] Add to `packages/shared/types/src/index.ts` exports

**Outcome:** New abstraction layer exists alongside current code. No breaking changes.

### Phase 2: Migrate Game Components (2-3 days)

- [ ] Identify game components that directly import from `features/generation/`
- [ ] Update `ScenePlayer` (or equivalent) to use `useAssetProvider()`
- [ ] Update other game components incrementally
- [ ] Add ESLint rule to warn on direct imports in game features
- [ ] Keep stores available for non-game UI (Control Center, Gallery)

**Outcome:** Game components decoupled from generation implementation.

### Phase 3: Enhanced Features (Optional, Ongoing)

- [ ] Add frontend event bus for analytics (`asset:requested`, `asset:played`)
- [ ] Implement predictive pre-generation based on game state
- [ ] Consider `POST /api/v1/game/assets/request` endpoint
- [ ] Surface lineage info in asset browser
- [ ] Add test mocks for `IAssetProvider`

---

## Testability Improvements

### Before (Hard to Test)

```typescript
// Must mock stores, API client, polling, WebSocket...
test('scene player handles choice', async () => {
  jest.mock('@/features/generation/stores/generationsStore')
  jest.mock('@/lib/api/generations')
  // Complex setup...
})
```

### After (Easy to Test)

```typescript
test('scene player handles choice', async () => {
  const mockProvider: IAssetProvider = {
    requestAsset: jest.fn().mockResolvedValue({
      id: 'test-asset',
      url: 'https://example.com/video.mp4',
      type: 'video',
      source: 'pre-made',
    }),
    getAsset: jest.fn(),
    isAssetAvailable: jest.fn(),
  }

  render(
    <AssetProviderContext.Provider value={mockProvider}>
      <ScenePlayer sceneId="1" />
    </AssetProviderContext.Provider>
  )

  fireEvent.click(screen.getByText('Make Choice'))
  expect(mockProvider.requestAsset).toHaveBeenCalledWith({
    sceneId: '1',
    choiceId: 'choice-1',
    allowGeneration: true,
  })
})
```

---

## Summary: Existing vs. Proposed

| Component | Status | Notes |
|-----------|--------|-------|
| Backend Redis caching | **EXISTS** | `GenerationCacheService` with TTL by strategy |
| Backend asset facade | **EXISTS** | `AssetService` with 5 sub-services |
| Backend deduplication | **EXISTS** | SHA256 hash, cache stampede locks |
| Backend lineage | **EXISTS** | `asset_lineage` table, `AssetLineageService` |
| Backend events | **EXISTS** | `JOB_*`, `ASSET_CREATED` events |
| Frontend generation stores | **EXISTS** | `useGenerationsStore`, `useGenerationQueueStore` |
| Frontend asset stores | **EXISTS** | `useAssetSelectionStore`, `useAssetViewerStore` |
| Frontend polling/WebSocket | **EXISTS** | `useGenerationStatus`, `useGenerationWebSocket` |
| Game engine interface | **EXISTS** | `GenerationService` interface in game engine |
| Asset resolution/roles | **EXISTS** | `assetResolver.ts`, `assetRoles.ts` |
| **Frontend `IAssetProvider`** | **PROPOSED** | Interface for game components |
| **Frontend `AssetService` facade** | **PROPOSED** | Coordinates providers |
| **Frontend DI context** | **PROPOSED** | `AssetProviderContext` |
| Game-specific endpoint | **OPTIONAL** | `POST /api/v1/game/assets/request` |

The proposal leverages existing backend infrastructure through a new frontend abstraction layer, without requiring backend changes for Phase 1-2.
