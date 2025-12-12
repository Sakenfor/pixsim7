# Clean Coupling Strategy

> **⚠️ STATUS: PROPOSED (Not Yet Implemented)**
>
> This document describes a **future architecture** for cleaner coupling between game and generation layers.
> None of the code examples, interfaces, or endpoints described here exist yet.
>
> **What Exists Today:**
> - Game components directly import from `features/generation/`
> - Backend endpoints: `POST /api/v1/generations`, `GET /api/v1/jobs/:id`
> - No `IAssetProvider` abstraction (though `packages/shared/types/` exists for other shared types)
>
> **Implementation Status:** See [Migration Plan](#-migration-plan) for phases.

---

**Goal:** Maintain necessary game ↔ generation coupling while improving architectural clarity, testability, and maintainability.

---

## 📸 Current State vs. Proposed

### What Exists Today

**Frontend Structure:**
```
apps/main/src/
├── features/
│   ├── game/              # Game components (ScenePlayer, etc.)
│   │   └── components/    # Directly import from features/generation/
│   └── generation/        # Generation UI and logic
│       ├── components/    # Generation control panel
│       └── services/      # Direct API calls to /generations
└── lib/
    └── api/               # API client (generic)
```

**Backend Endpoints:**
```
POST /api/v1/generations   # Create generation job
GET  /api/v1/jobs/:id      # Poll job status
GET  /api/v1/assets/:id    # Get asset metadata
```

**How Game Requests Assets Today:**
```typescript
// Direct import from generation features
import { generateVideo } from '@/features/generation/services/generationService'

// Game knows about providers, jobs, polling
const job = await generateVideo({
  prompt: "...",
  provider: "pixverse",
  // ... many generation-specific params
})
const asset = await pollJobUntilComplete(job.id)
```

### What This Proposal Adds

**New Frontend Structure:**
```
apps/main/src/
├── lib/
│   └── assets/                    # 🆕 Asset abstraction layer
│       ├── AssetService.ts        # Facade
│       ├── AssetProviderContext.tsx
│       └── providers/
│           ├── GeneratedAssetProvider.ts  # Wraps /generations API
│           ├── PreMadeAssetProvider.ts    # Wraps /assets API
│           └── CachedAssetProvider.ts

packages/shared/types/src/         # ✅ Already exists
└── assetProvider.ts               # 🆕 Add IAssetProvider interface

(features/game/ and features/generation/ stay unchanged)
```

**New Backend Endpoint (Phase 3):**
```
POST /api/v1/game/assets/request   # 🆕 Game-specific, higher-level
```

**How Game Requests Assets (After Migration):**
```typescript
// Import abstraction
import { useAssetProvider } from '@/lib/assets/AssetProviderContext'

// Game agnostic to source (pre-made vs generated)
const assetProvider = useAssetProvider()
const asset = await assetProvider.requestAsset({
  sceneId: "romance_5",
  choiceId: "confess"
  // Service decides: cache, pre-made, or generate
})
```

**Key Difference:** Game code doesn't change when we add caching, switch providers, or change generation strategy.

---

## 🏗️ Building on Existing Patterns

**Good News:** This proposal isn't starting from zero. PixSim7 already has several architectural patterns we can leverage:

### 1. Backend Provider Abstraction (Template for Frontend)

**What Exists:** `pixsim7/backend/main/services/provider/base.py`

The backend already has a clean provider abstraction pattern:

```python
class Provider(ABC):
    @abstractmethod
    async def execute(operation_type, account, params) -> GenerationResult:
        """Execute generation operation"""
        pass

    @abstractmethod
    async def check_status(account, provider_job_id) -> VideoStatusResult:
        """Check generation job status"""
        pass

    async def upload_asset(account, file_path) -> str:
        """Optional: Upload asset to provider"""
        pass

    def get_operation_parameter_spec() -> dict:
        """Get operation parameters schema"""
        pass
```

**Registry Pattern:** `pixsim7/backend/main/services/provider/registry.py`
- Singleton `ProviderRegistry` with `register()`, `get()`, `list()` methods
- Auto-discovery of provider plugins
- Clean separation between interface and implementation

**How This Helps:** The proposed `IAssetProvider` interface mirrors this proven pattern. We can use the same registry approach for `AssetService`.

### 2. Game Engine Already Uses Abstraction

**What Exists:** `packages/game/engine/src/generation/requestBuilder.ts`

The game engine already defines a `GenerationService` interface (lines 297-336):

```typescript
interface GenerationService {
  generate(request: GenerateContentRequest): Promise<GenerationJob>;
  getJobStatus(jobId: string): Promise<JobStatus>;
  cancelJob(jobId: string): Promise<void>;
}
```

**Integration:** `packages/game/engine/src/narrative/generationIntegration.ts`
- `GenerationBridge` class coordinates pool vs. generation
- Narrative executor depends on the interface, not implementation
- Hook-based integration with game systems

**How This Helps:** This proves the abstraction pattern works! The proposal extends this to the frontend app layer, where components currently bypass the abstraction and directly import from `features/generation/`.

### 3. Shared Types Infrastructure

**What Exists:** `packages/shared/types/src/`
- `generation.ts` - Generation types (GenerationNodeConfig, GenerateContentRequest, etc.)
- `game.ts`, `interactions.ts`, `brain.ts` - Core game types
- `index.ts` - Central export barrel

**How This Helps:** We can add `IAssetProvider` interface alongside existing shared types. No need to create a separate `packages/shared/contracts/` - just extend the existing `packages/shared/types/`.

### 4. Context Provider Pattern

**What Exists:** `apps/main/src/lib/devtools/devToolContext.tsx`

```typescript
export function DevToolProvider({ children }) {
  return <DevToolContext.Provider value={value}>{children}</DevToolContext.Provider>;
}

export function useDevToolContext(): DevToolContextValue {
  // ...
}
```

**How This Helps:** The proposed `AssetProviderContext` follows the exact same pattern. We know this works well in the codebase.

### 5. Backend Service Facade Pattern

**What Exists:** `pixsim7/backend/main/services/generation/generation_service.py`

```python
class GenerationService:
    def __init__(self, db, user_service):
        self._creation = GenerationCreationService(db, user_service)
        self._lifecycle = GenerationLifecycleService(db)
        self._query = GenerationQueryService(db)
        self._retry = GenerationRetryService(db, self._creation)
```

Clean facade that delegates to focused services (creation, lifecycle, query, retry).

**How This Helps:** The proposed `AssetService` facade follows this proven pattern - coordinating `GeneratedAssetProvider`, `PreMadeAssetProvider`, and `CachedAssetProvider`.

---

## 🎯 Principles for Clean Coupling

1. **Depend on Abstractions, Not Implementations**
2. **Use Events for Cross-Cutting Concerns**
3. **Make Coupling Explicit and Documented**
4. **Single Responsibility per Module**
5. **Dependency Injection Throughout**

---

## 📐 Proposed Layer Architecture

### Current State (Implicit Coupling)

```
Game Components
    ↓ (direct imports)
Generation Services
    ↓
Providers (Pixverse, Sora)
```

Problems:
- Game knows about generation implementation details
- Hard to test game without providers
- Can't swap generation strategies
- Tight coupling makes changes risky

### Proposed State (Clean Coupling via Abstraction)

```
┌─────────────────────────────────────────────────┐
│            GAME LAYER (Frontend)                 │
│  - Scene Player                                  │
│  - Choice Handler                                │
│  - Asset Display                                 │
└─────────────────────────────────────────────────┘
                    ↓ depends on
         ┌──────────────────────┐
         │  IAssetProvider      │  ← Interface/Contract
         └──────────────────────┘
                    ↑ implements
┌─────────────────────────────────────────────────┐
│         ASSET ORCHESTRATION LAYER                │
│  - AssetService (main facade)                   │
│    - PreMadeAssetProvider                       │
│    - GeneratedAssetProvider                     │
│    - CachedAssetProvider                        │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│         GENERATION LAYER (Backend)               │
│  - GenerationService                             │
│  - Provider Adapters (Pixverse, Sora)           │
└─────────────────────────────────────────────────┘
```

**Benefits:**
- Game depends on interface, not concrete generation
- Can test with mock providers
- Can swap implementations (local, cloud, cached)
- Clear boundaries with explicit contracts

---

## 🔧 Concrete Refactoring Steps

### Step 1: Define Core Interfaces

**Create: `packages/shared/src/contracts/IAssetProvider.ts`**

```typescript
/**
 * Core abstraction for asset provisioning.
 * Game code depends on this interface, not specific implementations.
 */
export interface IAssetProvider {
  /**
   * Get an asset by ID.
   * Source (pre-made, generated, cached) is transparent to caller.
   */
  getAsset(assetId: string): Promise<Asset>

  /**
   * Request an asset with specific requirements.
   * Provider decides: return existing, generate new, or use cached.
   */
  requestAsset(request: AssetRequest): Promise<Asset>

  /**
   * Check if asset is available (for predictive loading)
   */
  isAssetAvailable(assetId: string): Promise<boolean>
}

export interface AssetRequest {
  // Context from game
  sceneId?: string
  choiceId?: string
  characterId?: string

  // Requirements
  prompt?: string
  style?: AssetStyle
  duration?: number

  // Strategy hints (provider decides if to honor)
  preferCached?: boolean
  allowGeneration?: boolean
  maxWaitTime?: number // ms
}

export interface Asset {
  id: string
  url: string
  type: 'video' | 'image' | 'audio'
  metadata: AssetMetadata
  source: 'pre-made' | 'generated' | 'cached'
}
```

### Step 2: Implement Asset Service Facade

**Create: `apps/main/src/lib/assets/AssetService.ts`**

```typescript
import type { IAssetProvider, AssetRequest, Asset } from '@shared/contracts'

/**
 * Main facade for asset provisioning.
 * Coordinates between pre-made, generated, and cached assets.
 */
export class AssetService implements IAssetProvider {
  constructor(
    private preMadeProvider: PreMadeAssetProvider,
    private generatedProvider: GeneratedAssetProvider,
    private cacheProvider: CachedAssetProvider,
    private config: AssetServiceConfig
  ) {}

  async getAsset(assetId: string): Promise<Asset> {
    // 1. Check cache first
    const cached = await this.cacheProvider.getAsset(assetId)
    if (cached) return cached

    // 2. Try pre-made assets
    const preMade = await this.preMadeProvider.getAsset(assetId)
    if (preMade) return preMade

    // 3. Not found
    throw new AssetNotFoundError(assetId)
  }

  async requestAsset(request: AssetRequest): Promise<Asset> {
    // 1. Check cache first (based on request fingerprint)
    if (request.preferCached !== false) {
      const cached = await this.cacheProvider.findMatchingAsset(request)
      if (cached) return cached
    }

    // 2. Check pre-made assets (e.g., for this scene + choice combo)
    const preMade = await this.preMadeProvider.findMatchingAsset(request)
    if (preMade) return preMade

    // 3. Generate if allowed and configured
    if (request.allowGeneration !== false && this.config.generationEnabled) {
      return await this.generatedProvider.generateAsset(request)
    }

    // 4. Fallback to placeholder if nothing available
    return this.getPlaceholderAsset(request)
  }

  async isAssetAvailable(assetId: string): Promise<boolean> {
    return (
      (await this.cacheProvider.has(assetId)) ||
      (await this.preMadeProvider.has(assetId))
    )
  }
}
```

**Key Points:**
- Game code only sees `IAssetProvider` interface
- AssetService coordinates multiple strategies (cache, pre-made, generated)
- Generation is implementation detail, not exposed to game
- Easy to test (inject mock providers)

### Step 3: Implement Providers

**Create: `apps/main/src/lib/assets/providers/GeneratedAssetProvider.ts`**

```typescript
import type { IAssetProvider, AssetRequest, Asset } from '@shared/contracts'
import { apiClient } from '@/lib/api/client'

/**
 * Asset provider that generates assets via backend API.
 * Handles generation requests, polling, and asset creation.
 */
export class GeneratedAssetProvider {
  constructor(
    private apiClient: typeof apiClient,
    private config: GenerationProviderConfig
  ) {}

  async generateAsset(request: AssetRequest): Promise<Asset> {
    // 1. Submit generation job to backend
    // NOTE: This endpoint doesn't exist yet - proposed in Phase 3
    // Current: POST /api/v1/generations (more generic, no game context)
    const job = await this.apiClient.post('/api/v1/game/generate-asset', {
      scene_id: request.sceneId,
      choice_id: request.choiceId,
      prompt: request.prompt,
      // ... other params
    })

    // 2. Poll for completion (or use websocket)
    // Current: GET /api/v1/jobs/:id
    const result = await this.pollForCompletion(job.id, request.maxWaitTime)

    // 3. Return asset
    return {
      id: result.asset_id,
      url: result.asset_url,
      type: 'video',
      source: 'generated',
      metadata: result.metadata,
    }
  }

  private async pollForCompletion(
    jobId: string,
    maxWaitTime?: number
  ): Promise<GenerationResult> {
    // Implementation: poll /api/v1/jobs/:id with exponential backoff
    // Throw TimeoutError if exceeds maxWaitTime
  }
}
```

**Create: `apps/main/src/lib/assets/providers/PreMadeAssetProvider.ts`**

```typescript
/**
 * Asset provider for pre-made/uploaded assets.
 * Queries backend asset database.
 */
export class PreMadeAssetProvider {
  async getAsset(assetId: string): Promise<Asset | null> {
    const response = await apiClient.get(`/api/v1/assets/${assetId}`)
    if (!response) return null
    return this.mapToAsset(response)
  }

  async findMatchingAsset(request: AssetRequest): Promise<Asset | null> {
    // Query assets by scene_id, choice_id, tags, etc.
    const response = await apiClient.get('/api/v1/assets', {
      params: {
        scene_id: request.sceneId,
        choice_id: request.choiceId,
        // ... other filters
      },
    })
    return response.data[0] ? this.mapToAsset(response.data[0]) : null
  }
}
```

### Step 4: Game Components Use Interface

**Before (Tight Coupling):**

```typescript
// ❌ Game directly imports generation logic
import { generateVideo } from '@/features/generation/services/generationService'

function ScenePlayer({ sceneId }) {
  const handleChoice = async (choiceId: string) => {
    // Directly coupled to generation implementation
    const asset = await generateVideo({
      prompt: getPromptForChoice(choiceId),
      provider: 'pixverse',
      // ... lots of generation-specific details
    })
    playVideo(asset.url)
  }
}
```

**After (Clean Coupling):**

```typescript
// ✅ Game depends on abstraction
import { useAssetProvider } from '@/lib/assets/AssetProviderContext'

function ScenePlayer({ sceneId }) {
  const assetProvider = useAssetProvider()

  const handleChoice = async (choiceId: string) => {
    // Request asset - don't care if pre-made or generated
    const asset = await assetProvider.requestAsset({
      sceneId,
      choiceId,
      allowGeneration: true,
      maxWaitTime: 30000, // 30 sec max wait
    })
    playVideo(asset.url)
  }
}
```

**Key Improvements:**
- Game doesn't know about providers, generation details, etc.
- Easy to test (inject mock `assetProvider`)
- Can swap strategies (cached, pre-made, generated) without changing game code
- Configuration-driven behavior

### Step 5: Dependency Injection Setup

**Create: `apps/main/src/lib/assets/AssetProviderContext.tsx`**

```typescript
import React, { createContext, useContext } from 'react'
import type { IAssetProvider } from '@shared/contracts'
import { AssetService } from './AssetService'
import { GeneratedAssetProvider } from './providers/GeneratedAssetProvider'
import { PreMadeAssetProvider } from './providers/PreMadeAssetProvider'
import { CachedAssetProvider } from './providers/CachedAssetProvider'

const AssetProviderContext = createContext<IAssetProvider | null>(null)

export function AssetProviderProvider({ children, config }: Props) {
  // Create providers (dependency injection)
  const preMadeProvider = new PreMadeAssetProvider(apiClient)
  const generatedProvider = new GeneratedAssetProvider(apiClient, config.generation)
  const cacheProvider = new CachedAssetProvider(config.cache)

  // Assemble service
  const assetService = new AssetService(
    preMadeProvider,
    generatedProvider,
    cacheProvider,
    config.service
  )

  return (
    <AssetProviderContext.Provider value={assetService}>
      {children}
    </AssetProviderContext.Provider>
  )
}

export function useAssetProvider(): IAssetProvider {
  const provider = useContext(AssetProviderContext)
  if (!provider) throw new Error('AssetProvider not configured')
  return provider
}
```

**Usage in App Root:**

```typescript
// apps/main/src/main.tsx
import { AssetProviderProvider } from '@/lib/assets/AssetProviderContext'

const config = {
  generation: {
    enabled: true,
    defaultProvider: 'pixverse',
    timeout: 60000,
  },
  cache: {
    enabled: true,
    maxSize: 100,
  },
  service: {
    generationEnabled: true,
    preferCached: true,
  },
}

ReactDOM.render(
  <AssetProviderProvider config={config}>
    <App />
  </AssetProviderProvider>,
  root
)
```

---

## 🧪 Improved Testability

### Before (Hard to Test)

```typescript
// Can't test without mocking entire generation backend
test('scene player handles choice', async () => {
  // Need to mock: API client, provider adapters, job polling, etc.
  render(<ScenePlayer sceneId="1" />)
  // ... test is complex and brittle
})
```

### After (Easy to Test)

```typescript
// Inject mock provider
test('scene player handles choice', async () => {
  const mockProvider: IAssetProvider = {
    requestAsset: jest.fn().mockResolvedValue({
      id: 'test-asset',
      url: 'https://example.com/video.mp4',
      type: 'video',
      source: 'pre-made',
    }),
  }

  render(
    <AssetProviderContext.Provider value={mockProvider}>
      <ScenePlayer sceneId="1" />
    </AssetProviderContext.Provider>
  )

  // Test game logic without touching generation
  fireEvent.click(screen.getByText('Make Choice'))
  await waitFor(() => {
    expect(mockProvider.requestAsset).toHaveBeenCalledWith({
      sceneId: '1',
      choiceId: 'choice-1',
      allowGeneration: true,
    })
  })
})
```

---

## 🎨 Module Boundaries

### Proposed Frontend Structure

```
apps/main/src/
├── lib/
│   ├── assets/                    # 🆕 Asset abstraction layer
│   │   ├── AssetService.ts        # Main facade
│   │   ├── AssetProviderContext.tsx
│   │   ├── providers/             # Implementation strategies
│   │   │   ├── GeneratedAssetProvider.ts
│   │   │   ├── PreMadeAssetProvider.ts
│   │   │   └── CachedAssetProvider.ts
│   │   └── types.ts               # Local types (not exported)
│   │
│   └── api/                       # API client (used by providers)
│
├── features/
│   ├── game/                      # Game features
│   │   ├── components/            # Scene player, choice UI
│   │   ├── hooks/                 # useScene, useChoice
│   │   └── stores/                # Game state (Zustand)
│   │
│   └── generation/                # Generation UI (for designers)
│       ├── components/            # Control panel, settings
│       └── stores/                # Generation settings
│
└── packages/
    └── shared/
        └── contracts/             # 🆕 Shared interfaces
            ├── IAssetProvider.ts
            └── types.ts
```

**Import Rules:**

```typescript
// ✅ ALLOWED
features/game/ → lib/assets/AssetProviderContext (abstraction)
features/game/ → packages/shared/types (interfaces)

// ❌ NOT ALLOWED
features/game/ → features/generation/ (direct coupling)
features/game/ → lib/api/ (should use AssetProvider)
```

**Enforce with ESLint:**

```javascript
// .eslintrc.js
module.exports = {
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['**/features/generation/**'],
            message: 'Game code should use IAssetProvider, not generation directly',
          },
        ],
      },
    ],
  },
}
```

---

## 📊 Backend: Clean Generation API

### Current State (What Exists Today)

```
POST /api/v1/generations   # Create generation job
GET  /api/v1/jobs/:id      # Poll for job status
GET  /api/v1/assets/:id    # Get asset by ID
```

Problems:
- Game has to know about jobs, polling, status codes
- Generic job API leaks implementation details
- No game-specific context (scene_id, choice_id)

### Proposed: Game-Specific Endpoints (Phase 3)

> **⚠️ These endpoints don't exist yet - proposed for Phase 3**

```
POST /api/v1/game/assets/request
{
  "scene_id": "romance_5",
  "choice_id": "confess",
  "context": {
    "character_id": "char_1",
    "location_id": "park"
  },
  "strategy": "generate_if_needed", // or "pre_made_only", "generate_always"
  "max_wait_ms": 30000
}

Response:
{
  "asset_id": "asset_123",
  "url": "https://cdn.example.com/video.mp4",
  "source": "generated",  // or "pre_made", "cached"
  "generation_time_ms": 15000
}
```

**Benefits:**
- Higher-level abstraction (game doesn't know about jobs)
- Backend decides strategy (use cache, generate, fallback)
- Simpler for game developers

### Backend Implementation

```python
# pixsim7/backend/main/api/v1/game_assets.py

@router.post("/game/assets/request")
async def request_game_asset(
    request: GameAssetRequest,
    user: CurrentUser,
    db: AsyncSession,
) -> GameAssetResponse:
    """
    High-level asset request for game runtime.
    Handles strategy selection, caching, generation, and fallbacks.
    """
    # 1. Check cache
    cached = await asset_cache.get(request.cache_key())
    if cached:
        return GameAssetResponse(
            asset_id=cached.id,
            url=cached.url,
            source="cached"
        )

    # 2. Check pre-made assets
    pre_made = await asset_service.find_matching(
        scene_id=request.scene_id,
        choice_id=request.choice_id,
        user_id=user.id
    )
    if pre_made:
        return GameAssetResponse(
            asset_id=pre_made.id,
            url=pre_made.url,
            source="pre_made"
        )

    # 3. Generate if strategy allows
    if request.strategy in ["generate_if_needed", "generate_always"]:
        asset = await generation_service.generate_and_wait(
            prompt=build_prompt(request.context),
            max_wait_ms=request.max_wait_ms,
            user_id=user.id
        )
        return GameAssetResponse(
            asset_id=asset.id,
            url=asset.url,
            source="generated"
        )

    # 4. Fallback
    raise AssetNotAvailableError()
```

---

## 🔄 Event-Driven Enhancements

For cross-cutting concerns (analytics, caching, pre-generation), use events:

### Event Bus Pattern

```typescript
// lib/assets/events.ts

export enum AssetEvent {
  REQUESTED = 'asset:requested',
  FETCHED = 'asset:fetched',
  GENERATED = 'asset:generated',
  PLAYED = 'asset:played',
}

export class AssetEventBus {
  private listeners = new Map<AssetEvent, Set<Function>>()

  on(event: AssetEvent, handler: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(handler)
  }

  emit(event: AssetEvent, data: any) {
    this.listeners.get(event)?.forEach((handler) => handler(data))
  }
}
```

### Usage: Analytics Listener

```typescript
// lib/analytics/assetAnalytics.ts

export function setupAssetAnalytics(eventBus: AssetEventBus) {
  // Track which assets are requested (for predictive generation)
  eventBus.on(AssetEvent.REQUESTED, (data) => {
    analytics.track('asset_requested', {
      sceneId: data.sceneId,
      choiceId: data.choiceId,
    })
  })

  // Track generation latency
  eventBus.on(AssetEvent.GENERATED, (data) => {
    analytics.track('asset_generated', {
      duration_ms: data.generationTime,
      provider: data.provider,
    })
  })
}
```

### Usage: Predictive Pre-Generation

```typescript
// lib/assets/predictiveGenerator.ts

export function setupPredictiveGeneration(
  eventBus: AssetEventBus,
  assetProvider: IAssetProvider
) {
  eventBus.on(AssetEvent.PLAYED, async (data) => {
    // When asset plays, predict next likely choices
    const nextChoices = predictNextChoices(data.sceneId, data.choiceId)

    // Pre-generate in background
    for (const choice of nextChoices) {
      assetProvider.requestAsset({
        sceneId: data.sceneId,
        choiceId: choice.id,
        preferCached: true,
        allowGeneration: true,
        // Low priority, background generation
      })
    }
  })
}
```

**Benefits:**
- Decoupled analytics, caching, pre-generation
- Easy to add/remove listeners
- Game code doesn't know about these concerns

---

## 📋 Migration Plan

> **Note:** This plan creates new code structures. Existing code continues to work during migration.

### Phase 1: Create Abstractions (1-2 days)

**New directories to create:**
```
apps/main/src/lib/assets/     # 🆕 Asset abstraction layer
```

**Extend existing:**
```
packages/shared/types/src/    # ✅ Already exists - add IAssetProvider.ts here
```

**Tasks:**
- [ ] Define `IAssetProvider` interface in `packages/shared/types/src/assetProvider.ts`
- [ ] Create `apps/main/src/lib/assets/` directory
- [ ] Create `AssetService` facade in `lib/assets/AssetService.ts`
- [ ] Implement `PreMadeAssetProvider` (wraps existing `GET /api/v1/assets/:id`)
- [ ] Implement `GeneratedAssetProvider` (wraps existing `POST /api/v1/generations` + polling)
- [ ] Set up `AssetProviderContext` for dependency injection

**Outcome:** New abstractions exist alongside current code

### Phase 2: Migrate Game Components (2-3 days)
- [ ] Update `ScenePlayer` to use `useAssetProvider()`
- [ ] Update `ChoiceHandler` to use `assetProvider.requestAsset()`
- [ ] Update other game components one by one
- [ ] Remove direct imports from `features/generation/`

### Phase 3: Add Backend Game API (1 day)

**New backend code:**
```
pixsim7/backend/main/api/v1/game_assets.py    # 🆕 Game-specific endpoints
```

**Tasks:**
- [ ] Create `pixsim7/backend/main/api/v1/game_assets.py`
- [ ] Implement `POST /api/v1/game/assets/request` endpoint
- [ ] Add strategy selection logic (cache → pre-made → generate)
- [ ] Implement caching layer
- [ ] Update `GeneratedAssetProvider` to use new endpoint
- [ ] Keep old endpoints (`/generations`, `/jobs`) for backward compatibility

**Outcome:** Game-specific API available, old API still works

### Phase 4: Enhanced Features (Ongoing)
- [ ] Add `CachedAssetProvider` with smart caching
- [ ] Implement predictive pre-generation
- [ ] Add event bus for analytics
- [ ] Add ESLint rules to enforce boundaries

---

## ✅ Expected Outcomes

**Before:**
```typescript
// Game directly coupled to generation
import { generateVideo } from '@/features/generation/...'
const asset = await generateVideo({ provider: 'pixverse', ... })
```

**After:**
```typescript
// Game depends on abstraction
const assetProvider = useAssetProvider()
const asset = await assetProvider.requestAsset({ sceneId, choiceId })
```

**Benefits:**
1. ✅ **Testability**: Mock `IAssetProvider` in tests
2. ✅ **Flexibility**: Swap providers, strategies without changing game
3. ✅ **Clarity**: Clear contracts, explicit dependencies
4. ✅ **Decoupling**: Game doesn't know about providers, jobs, polling
5. ✅ **Configuration**: Game maker controls generation strategy
6. ✅ **Performance**: Easy to add caching, pre-generation

**Coupling is still there** (game needs assets, some generated) but it's:
- **Clean** (through interfaces)
- **Explicit** (via dependency injection)
- **Testable** (mockable abstractions)
- **Flexible** (swappable implementations)

---

## 🚀 Next Steps

1. Review this proposal with team
2. Prototype `IAssetProvider` + `AssetService`
3. Migrate one game component as proof-of-concept
4. Measure impact (code clarity, test coverage, performance)
5. Roll out to remaining components

**Goal:** Maintain the vision (runtime generation) while improving code quality and developer experience.
