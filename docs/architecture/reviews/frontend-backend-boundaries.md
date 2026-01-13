# Frontend vs Backend Boundaries

**Last Updated:** 2025-12-12
**Status:** Current architecture reference
**Related Docs:** [Repository Map](../repo-map.md), [Import Hygiene Pass](../plans/import-hygiene-pass.md)

---

## Executive Summary

PixSim7 maintains **clear separation** between frontend (React/TypeScript) and backend (FastAPI/Python) through well-defined public API surfaces and import boundaries. This document serves as a reference for understanding where backend ends and frontend begins, ensuring future contributors can maintain this architecture.

**Key Boundaries:**
- **Frontend:** Barrel-exported modules (`@lib/*`, `@features/*`) with enforced import hygiene
- **Backend:** Domain modules and API routes with Python barrel exports (`__init__.py`)
- **Contract:** Shared TypeScript types in `@shared/types` define the data exchange format
- **Communication:** RESTful API (`/api/v1/*`) + WebSocket (`/ws/*`) for real-time updates

**Status Post-Cleanup:**
- âœ… `mockCore` removed (commit `09b066e`)
- âœ… All game data flows through production API endpoints
- âœ… Import hygiene enforced via ESLint rules
- âœ… Development tools clearly separated with `/dev/*` prefix

---

## 1. Current Boundaries and Import Surfaces

### 1.1 Frontend Public Entrypoints

The frontend exposes controlled public APIs through **barrel exports** (`index.ts` files) organized into two categories:

#### **Lib Modules** (`@lib/*`) - Infrastructure & Shared Systems

| Module | Barrel Path | Purpose | Key Exports |
|--------|-------------|---------|-------------|
| **Core** | `@lib/core` | Game engine types, BrainState helpers | `PixSim7Core`, `BrainState`, `GameSession`, `getMood()`, `getAxisValue()` |
| **API** | `@lib/api` | Backend API client | `apiClient`, domain endpoints (game, assets, generations, etc.) |
| **Panels** | `@lib/panels` | Panel registry system | `panelRegistry`, `PanelDefinition`, `PANEL_CATEGORIES` |
| **Shapes** | `@lib/shapes` | Shape rendering | `shapeRegistry`, `BrainShapeRenderer` |
| **Widgets** | `@lib/widgets` | Widget composition | `widgetRegistry`, `PanelComposer`, `ComposedPanel` |
| **Utils** | `@lib/utils` | Shared utilities | `logger`, `uuid`, `debugFlags`, `storage`, `polling` |
| **Auth** | `@lib/auth` | Authentication | `authService`, `AuthProvider` |
| **Hooks** | `@/hooks` | React hooks | Shared React hooks |
| **Game** | `@lib/game` | Game runtime | `coreAdapter`, `usePixSim7Core` |
| **Devtools** | `@lib/devtools` | Developer tools | `devToolRegistry`, `registerDevTools()` |

**Total:** 29 lib modules with barrel exports

#### **Feature Modules** (`@features/*`) - Domain-Specific Functionality

| Feature | Barrel Path | Purpose | Key Components |
|---------|-------------|---------|----------------|
| **Graph** | `@features/graph` | Scene/arc graph editing | `GraphEditorHost`, `ArcGraphPanel` |
| **Generation** | `@features/generation` | Content generation | `GenerationWorkbench`, `useGenerationWebSocket` |
| **Interactions** | `@features/interactions` | NPC interactions | `InteractionMenu`, `MoodIndicator` |
| **Prompts** | `@features/prompts` | Prompt workbench | `PromptSegmentsViewer`, `usePromptInspection` |
| **Gallery** | `@features/gallery` | Media gallery | `GallerySurfaceHost` |
| **Scene** | `@features/scene` | Scene management | `SceneManagementPanel`, `ScenePlaybackPanel` |
| **HUD** | `@features/hud` | HUD builder | `HudLayoutBuilder`, `HudRenderer` |
| **World Tools** | `@features/worldTools` | World debugging | `WorldToolsPanel`, world tool plugins |
| **Brain Tools** | `@features/brainTools` | NPC brain lab | `NpcBrainLab`, brain tool plugins |
| **Simulation** | `@features/simulation` | Simulation playground | `SimulationPlayground` |
| **Automation** | `@features/automation` | Browser automation | Device/preset/loop UIs |
| **Intimacy** | `@features/intimacy` | Intimacy composer | Intimacy gating/playtesting |
| **Gizmos** | `@features/gizmos` | Gizmo lib | Gizmo surface registry |

**Total:** 13 feature modules with barrel exports

**Import Rules (Enforced by ESLint):**
```typescript
// âœ… CORRECT - Import from barrels
import { BrainState, getMood } from '@lib/core';
import { GraphEditorHost } from '@features/graph';

// âŒ FORBIDDEN - Deep imports blocked by ESLint
import { BrainState } from '@/lib/core/types';
import { GraphEditorHost } from '@features/graph/components/graph/GraphEditorHost';

// âœ… EXCEPTION - Feature plugins/lib (intentional exposure)
import { createPreset } from '@features/worldTools/lib/hudPresets';
import { inventoryPlugin } from '@features/worldTools/plugins/inventory';
```

### 1.2 Backend Public Entrypoints

The backend exposes APIs through two layers:

#### **API Routes Layer** (`/api/v1/*`)

**Production Endpoints (57+ route files):**

| Category | Example Endpoints | Purpose |
|----------|------------------|---------|
| **Auth & Users** | `/auth/login`, `/users/me` | Authentication, user management |
| **Game** | `/game/worlds`, `/game/npcs`, `/game/sessions` | Game world/NPC/session CRUD |
| **Generations** | `/generations`, `/generations/{id}` | Content generation lifecycle |
| **Assets** | `/assets`, `/assets/{id}/analyze` | Asset upload/management/analysis |
| **Interactions** | `/game/interactions` | NPC interaction execution |
| **Prompts** | `/prompts/families`, `/prompts/versions` | Prompt versioning |
| **Accounts** | `/accounts`, `/accounts/{id}` | Provider account management |
| **Automation** | `/automation/devices` | Android device automation (22 endpoints) |
| **Admin** | `/admin/plugins` | Plugin management |

**Development Endpoints (`/dev/*` prefix):**

| Endpoint | Purpose | Frontend Consumer |
|----------|---------|-------------------|
| `/dev/architecture/map` | Backend introspection | `BackendArchitecturePanel` |
| `/dev/info` | Service metadata | Dev tools |
| `/dev/prompt-inspector` | Prompt analysis | `PromptLabDev` route |
| `/dev/prompt-library` | Prompt browsing | `PromptLabDev` route |
| `/dev/ontology/usage` | Ontology stats | Dev panels |
| `/dev/pixverse-sync` | Provider sync diagnostics | `dryRunPixverseSync()` in `@lib/api/accounts` |

**WebSocket Endpoints:**
- `/ws/generations` - Real-time generation status updates

#### **Domain Layer** (`pixsim7.backend.main.domain.*`)

**Core Domain Barrel Exports (`domain/__init__.py`):**
```python
# Core models (exported for app-wide use)
from .user import User, UserSession, UserQuotaUsage
from .asset import Asset, AssetVariant
from .generation import Generation
from .provider_submission import ProviderSubmission
from .account import ProviderAccount
from .scene import Scene, SceneAsset, SceneConnection
from .enums import MediaType, SyncStatus, GenerationStatus

# Subsystems (import from submodules, NOT from domain.__init__)
# âŒ from pixsim7.backend.main.domain import GameWorld  # WRONG
# âœ… from pixsim7.backend.main.domain.game import GameWorld  # CORRECT
```

**Domain Subsystems (use submodule imports):**
- `domain.game.*` - Game worlds, NPCs, quests, locations
- `domain.stats.*` - Statistics engine
- `domain.stats.migration.*` - Legacy migration helpers (sub-barrel)
- `domain.narrative.*` - Narrative/action blocks
- `domain.automation.*` - Device automation
- `domain.behavior.*` - Behavior system

**Services Layer** (`pixsim7.backend.main.services.*`)

Services are organized into focused modules with barrel exports:

| Service Module | Public API | Pattern |
|----------------|-----------|---------|
| **generation/** | `GenerationService` (facade), `CreationService`, `LifecycleService` | Composition pattern - facade delegates to focused services |
| **game/** | `GameSessionService`, `GameWorldService`, `GameLocationService` | Domain services |
| **llm/** | `LLMService`, `AIHubService`, `LLMCache` | Provider abstraction |
| **npc/** | `MemoryService`, `EmotionalStateService`, `WorldAwarenessService` | NPC behavior services |
| **asset/** | `AssetService`, `SyncService`, `LineageService` | Asset lifecycle |

**Import Pattern:**
```python
# âœ… CORRECT - Import from service barrels
from pixsim7.backend.main.services.generation import GenerationService
from pixsim7.backend.main.domain.stats import StatEngine
from pixsim7.backend.main.domain.stats.migration import migrate_world_meta_to_stats_config

# âŒ WRONG - Direct file imports discouraged
from pixsim7.backend.main.services.generation.creation_service import GenerationCreationService
from pixsim7.backend.main.domain.stats.engine import StatEngine
```

### 1.3 Shared Contract Layer

**Package:** `@shared/types` (`packages/shared/types/src/`)

Defines the **TypeScript contract** for data exchange between frontend and backend:

| Type Category | Key Types | Used By |
|--------------|-----------|---------|
| **Game Session** | `GameSession`, `GameNPC`, `NpcRelationshipState` | Frontend stores, backend API responses |
| **Scene Graph** | `SceneNode`, `SceneEdge`, `SceneNodeType` | Graph editor, narrative engine |
| **Brain/Stats** | `BrainState`, `BrainMemory`, `BrainStatSnapshot` | NPC display, brain tools |
| **Character Graph** | Character relationship types | Character graph feature |
| **Job Status** | `JobSummary`, `JobStatus` | Generation tracking |
| **Provider** | `ProviderCapabilitySummary` | Provider management |

**Usage Pattern:**
```typescript
// Frontend
import type { GameSession, BrainState } from '@shared/types';

// Game engine (shared package)
import type { SceneNode } from '@shared/types';
```

**Backend Equivalent:** Backend defines similar models in Python (e.g., `domain/session.py`), but the TypeScript types in `@shared/types` are the **source of truth** for the API contract.

#### **Namespace Import Patterns**

**Package:** `@shared/types` provides namespace exports for major type groups:

**Available Namespaces:**
- `IDs` - ID types and constructors (ref helpers live in ref-core/logic-core)
- `Scene` - Scene graph types (nodes, edges, runtime state)
- `Game` - Game DTOs (locations, NPCs, sessions, etc.)

**When to Use Namespaces:**
- **Use namespace** - For files that use multiple types from the same group (3+ types)
- **Use direct imports** - For files that only use 1-2 specific types

**Namespace Patterns:**

##### IDs Namespace (ID Types)

```typescript
// âœ… RECOMMENDED - Clean namespace imports
import { IDs } from '@shared/types';
import { Ref } from '@pixsim7/shared.ref-core';

export async function getGameLocation(locationId: IDs.LocationId): Promise<GameLocationDetail> {
  // ...
}

export async function createGameSession(
  sceneId: IDs.SceneId,
  flags?: Record<string, unknown>
): Promise<GameSessionDTO> {
  // Create IDs using namespace
  const sessionId = IDs.SessionId(response.id);
  const npcRef = Ref.npc(npcId);
  // ...
}
```

##### Scene Namespace (Scene Graph Types)
```typescript
// âœ… RECOMMENDED - Namespace for scene graph code
import { Scene } from '@shared/types';

function buildScene(): Scene.Scene {
  const startNode: Scene.ContentNode = {
    nodeType: 'scene_content',
    id: 'start',
    type: 'video',
    media: [{ id: 'intro', url: '/video.mp4' }],
    selection: { kind: 'ordered' }
  };

  const edge: Scene.Edge = {
    id: 'edge1',
    from: 'start',
    to: 'next'
  };

  return {
    id: 'my_scene',
    nodes: [startNode],
    edges: [edge],
    startNodeId: 'start'
  };
}
```

##### Game Namespace (Game DTOs)
```typescript
// âœ… RECOMMENDED - Namespace for game API code
import { Game, IDs } from '@shared/types';

async function createLocation(
  worldId: IDs.WorldId,
  data: Partial<Game.LocationDetail>
): Promise<Game.LocationDetail> {
  const npc: Game.NpcDetail = await fetchNpc(data.npcId);
  // ...
}
```

**Direct Import Pattern (Alternative for focused files):**
```typescript
// âœ… ALSO VALID - Direct imports for specific types
import { LocationId, SessionId, SceneContentNode } from '@shared/types';

export async function updateLocation(locationId: LocationId) {
  // ...
}
```

**What's Available Under `IDs`:**

| Category | Examples | Usage |
|----------|----------|-------|
| **ID Types** | `IDs.NpcId`, `IDs.LocationId`, `IDs.SessionId`, `IDs.CharacterId` | Type annotations for function parameters |
| **ID Constructors** | `IDs.NpcId(123)`, `IDs.SessionId(456)` | Create branded IDs from primitives |
| **Ref Builders** | `Ref.npc(id)`, `Ref.location(id)` | Build canonical string refs (`"npc:123"`) |
| **Type Guards** | `isNpcRef(str)`, `isLocationRef(str)` | Runtime validation of ref strings |
| **Parsers** | `parseRef(str)`, `extractNpcId(str)` | Parse ref strings into typed IDs |

**Examples:**

```typescript
// Using namespace for multiple ID types
import { IDs } from '@shared/types';
import { Ref, isNpcRef } from '@pixsim7/shared.ref-core';
import { parseRef } from '@pixsim7/shared.logic-core/ids';

function processInteraction(
  worldId: IDs.WorldId,
  sessionId: IDs.SessionId,
  npcId: IDs.NpcId,
  locationId?: IDs.LocationId
) {
  // Build refs for session storage
  const npcRef = Ref.npc(npcId);
  const locationRef = locationId ? Ref.location(locationId) : null;

  // Use type guards
  if (isNpcRef(someString)) {
    const parsed = parseRef(someString);
    // ...
  }
}
```

**Benefits:**
- **Discoverability** - ID types and constructors visible via `IDs.` autocomplete
- **Reduces line noise** - One import instead of listing many types
- **Clear intent** - `IDs.LocationId` explicitly shows it's an ID type
- **Backward compatible** - Direct imports still work for existing code

**Migration Guide:**
Existing code using direct imports continues to work unchanged. Gradually migrate files to the namespace pattern when they're modified for other reasons.

---

## 2. Backend â†’ Frontend Data Flow

### 2.1 Architecture Diagram

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                           FRONTEND (React/TS)                        â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚                                                                       â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”   â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”   â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”‚
â”‚  â”‚  Components &    â”‚   â”‚   Zustand Stores â”‚   â”‚  React Hooks    â”‚ â”‚
â”‚  â”‚  Routes          â”‚   â”‚                  â”‚   â”‚                 â”‚ â”‚
â”‚  â”‚                  â”‚   â”‚  â€¢ authStore     â”‚   â”‚  â€¢ usePixSim7Coreâ”‚
â”‚  â”‚  â€¢ GameWorld     â”‚   â”‚  â€¢ generations   â”‚   â”‚  â€¢ useGenerationâ”‚
â”‚  â”‚  â€¢ NpcBrainLab   â”‚   â”‚    Store         â”‚   â”‚    WebSocket    â”‚
â”‚  â”‚  â€¢ Gallery       â”‚   â”‚  â€¢ worldContext  â”‚   â”‚  â€¢ useRecent    â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜   â””â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜   â”‚    Generations  â”‚
â”‚           â”‚                      â”‚              â””â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”˜
â”‚           â”‚                      â”‚                       â”‚          â”‚
â”‚           â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜          â”‚
â”‚                                  â”‚                                  â”‚
â”‚                       â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”                       â”‚
â”‚                       â”‚   @lib/api/client   â”‚                       â”‚
â”‚                       â”‚                     â”‚                       â”‚
â”‚                       â”‚  â€¢ apiClient (Axios)â”‚                       â”‚
â”‚                       â”‚  â€¢ Auth interceptor â”‚                       â”‚
â”‚                       â”‚  â€¢ Error handling   â”‚                       â”‚
â”‚                       â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜                       â”‚
â”‚                                  â”‚                                  â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                                   â”‚
                    â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
                    â”‚              â”‚              â”‚
            â”Œâ”€â”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”   â”Œâ”€â”€â–¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”   â”‚
            â”‚  HTTP/REST   â”‚   â”‚  WebSocket  â”‚   â”‚
            â”‚  /api/v1/*   â”‚   â”‚  /ws/*      â”‚   â”‚
            â””â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”˜   â””â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜   â”‚
                    â”‚              â”‚              â”‚
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                   â”‚   BACKEND (FastAPI/Python)  â”‚                  â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚                   â”‚              â”‚              â”‚                  â”‚
â”‚       â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”    â”‚    â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”       â”‚
â”‚       â”‚   API Routes        â”‚    â”‚    â”‚  WebSocket Handlerâ”‚       â”‚
â”‚       â”‚   (api/v1/*.py)     â”‚â—„â”€â”€â”€â”¼â”€â”€â”€â”€â”¤  (websocket.py)   â”‚       â”‚
â”‚       â”‚                     â”‚    â”‚    â”‚                   â”‚       â”‚
â”‚       â”‚  â€¢ auth.py          â”‚    â”‚    â”‚  Real-time events:â”‚       â”‚
â”‚       â”‚  â€¢ game_*.py        â”‚    â”‚    â”‚  â€¢ Generation     â”‚       â”‚
â”‚       â”‚  â€¢ generations.py   â”‚    â”‚    â”‚    status updates â”‚       â”‚
â”‚       â”‚  â€¢ assets.py        â”‚    â”‚    â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜       â”‚
â”‚       â”‚  â€¢ /dev/* (dev)     â”‚    â”‚                                â”‚
â”‚       â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜    â”‚                                â”‚
â”‚                  â”‚                â”‚                                â”‚
â”‚       â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”    â”‚                                â”‚
â”‚       â”‚   Services Layer    â”‚    â”‚                                â”‚
â”‚       â”‚                     â”‚    â”‚                                â”‚
â”‚       â”‚  â€¢ GenerationServiceâ”‚â”€â”€â”€â”€â”˜                                â”‚
â”‚       â”‚  â€¢ GameSessionService                                     â”‚
â”‚       â”‚  â€¢ AssetService     â”‚                                     â”‚
â”‚       â”‚  â€¢ LLMService       â”‚                                     â”‚
â”‚       â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜                                     â”‚
â”‚                  â”‚                                                 â”‚
â”‚       â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”                                     â”‚
â”‚       â”‚   Domain Models     â”‚                                     â”‚
â”‚       â”‚   (domain/*.py)     â”‚                                     â”‚
â”‚       â”‚                     â”‚                                     â”‚
â”‚       â”‚  â€¢ User, Asset      â”‚                                     â”‚
â”‚       â”‚  â€¢ Generation       â”‚                                     â”‚
â”‚       â”‚  â€¢ GameSession      â”‚                                     â”‚
â”‚       â”‚  â€¢ domain.game.*    â”‚                                     â”‚
â”‚       â”‚  â€¢ domain.stats.*   â”‚                                     â”‚
â”‚       â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜                                     â”‚
â”‚                                                                    â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜

           â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
           â”‚   Shared Contract (@shared/types)  â”‚
           â”‚                                    â”‚
           â”‚  TypeScript DTOs define API shape  â”‚
           â”‚  â€¢ GameSession, BrainState         â”‚
           â”‚  â€¢ SceneNode, SceneEdge            â”‚
           â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

### 2.2 Data Flow Details

#### **Flow 1: REST API (Primary Data Flow)**

**Pattern:** Component/Hook â†’ API Client â†’ Backend Endpoint â†’ Service â†’ Domain â†’ Response

**Example: Fetching Game Worlds**

```typescript
// 1. Component initiates request
function GameWorld() {
  useEffect(() => {
    async function loadWorlds() {
      const worlds = await listGameWorlds();  // @lib/api/game
      // ... update state
    }
    loadWorlds();
  }, []);
}

// 2. API client makes HTTP request
// File: apps/main/src/lib/api/game.ts
export async function listGameWorlds(): Promise<GameWorldDTO[]> {
  const response = await apiClient.get('/game/worlds');
  return response.data;
}

// 3. Backend route handler
// File: pixsim7/backend/main/api/v1/game_worlds.py
@router.get("/game/worlds")
async def list_game_worlds(ctx: PluginContext):
    worlds = await ctx.game_worlds.list_worlds()
    return [world.to_dict() for world in worlds]

// 4. Service layer
// File: pixsim7/backend/main/services/game/game_world_service.py
class GameWorldService:
    async def list_worlds(self, user_id: int) -> list[GameWorld]:
        return await self.repo.list_by_user(user_id)

// 5. Domain model returned
// File: pixsim7/backend/main/domain/game/world.py
class GameWorld:
    id: int
    name: str
    time_current: int
    # ... (serialized to JSON)
```

**Key Endpoints by Domain:**

| Domain | API Calls | Hook/Component | Response Type |
|--------|-----------|----------------|---------------|
| **Auth** | `authService.login()` | `authStore.initialize()` | `User`, `Token` |
| **Game Data** | `listGameWorlds()`, `getNpcDetail()` | `WorldContextSelector` | `GameWorld[]`, `GameNPC` |
| **Generations** | `createGeneration()`, `getGeneration()` | `useGenerationStatus` | `GenerationResponse` |
| **Assets** | `uploadAsset()`, `extractFrame()` | Asset management components | `Asset` |
| **Interactions** | `executeNpcInteraction()` | Interaction menu | `InteractionResult` |

#### **Flow 2: WebSocket (Real-Time Updates)**

**Pattern:** Component subscribes â†’ WebSocket emits event â†’ Hook fetches full data â†’ Store updates

**Example: Generation Status Updates**

```typescript
// 1. Hook establishes WebSocket connection
// File: apps/main/src/features/generation/hooks/useGenerationWebSocket.ts
export function useGenerationWebSocket() {
  useEffect(() => {
    const ws = new WebSocket(`${WS_URL}/ws/generations`);

    ws.onmessage = async (event) => {
      const message = JSON.parse(event.data);

      if (message.type.startsWith('job:')) {
        const generationId = message.data.generation_id;

        // Fetch full generation data from REST API
        try {
          const fullData = await getGeneration(generationId);
          useGenerationsStore.getState().addOrUpdate(fullData);
        } catch {
          // Fallback: use partial data from WebSocket
          useGenerationsStore.getState().addOrUpdate(message.data);
        }
      }
    };

    return () => ws.close();
  }, []);
}

// 2. Backend emits WebSocket event
// File: pixsim7/backend/main/api/v1/websocket.py
async def broadcast_generation_update(generation: Generation):
    await manager.broadcast({
        "type": "job:status_changed",
        "data": {
            "generation_id": generation.id,
            "status": generation.status,
            # ... minimal data
        }
    })

// 3. Store updates trigger React re-renders
// File: apps/main/src/features/generation/stores/generationsStore.ts
export const useGenerationsStore = create<GenerationsStore>((set) => ({
  generations: new Map(),
  addOrUpdate: (gen) => set((state) => {
    const updated = new Map(state.generations);
    updated.set(gen.id, gen);
    return { generations: updated };
  }),
}));
```

**Why Hybrid Approach?**
- WebSocket sends **lightweight notifications** (low bandwidth)
- REST API provides **full data** (consistent with polling)
- Fallback to WebSocket partial data if API fails

#### **Flow 3: Polling (Fallback/Legacy)**

**Pattern:** Hook polls API on interval â†’ Updates store

**Example: Generation Status Polling**

```typescript
// File: apps/main/src/features/generation/hooks/useGenerationStatus.ts
export function useGenerationStatus(generationId: number) {
  useEffect(() => {
    const poll = async () => {
      const gen = await getGeneration(generationId);
      useGenerationsStore.getState().addOrUpdate(gen);

      if (!isTerminalStatus(gen.status)) {
        // Continue polling with backoff
        setTimeout(poll, calculateBackoff(attempts));
      }
    };

    poll();
  }, [generationId]);
}
```

**Usage:** Used alongside WebSocket as redundancy for critical operations.

#### **Flow 4: Game Engine Adapter**

**Pattern:** Game engine â†’ Adapter â†’ Frontend API Client

**Bridge:** `@lib/game/coreAdapter.ts`

```typescript
// Frontend provides implementation of backend-agnostic interfaces
const frontendApiClient: ApiClient = {
  async fetchSession(sessionId: string) {
    return await getGameSession(parseInt(sessionId));  // @lib/api/game
  },
  async saveSession(session: GameSession) {
    return await updateGameSession(session);
  },
};

const localStorageProvider: StorageProvider = {
  async loadLocalSession(sessionId: string) {
    return localStorage.getItem(`session_${sessionId}`);
  },
  async saveLocalSession(sessionId: string, data: string) {
    localStorage.setItem(`session_${sessionId}`, data);
  },
};

// Game engine uses these adapters (backend-agnostic)
const core = new PixSim7Core({
  apiClient: frontendApiClient,
  storage: localStorageProvider,
});
```

**Why Adapter?**
- Game engine (`packages/game/`) is **backend-agnostic**
- Can run in Node.js, browser, or headless tests
- Frontend "plugs in" API/storage implementations

---

## 3. Areas That Blur the Line

### 3.1 Development Tools (Intentional Overlap)

**Status:** âœ… **Well-Separated** with clear naming conventions

| Component | Location | Backend Endpoint | Purpose |
|-----------|----------|------------------|---------|
| `BackendArchitecturePanel` | `apps/main/src/components/panels/dev/` | `/dev/architecture/map` | Backend introspection for debugging |
| `PromptLabDev` | `apps/main/src/routes/PromptLabDev.tsx` | `/dev/prompt-inspector`, `/dev/prompt-library` | Prompt development tools |
| `BlockFitDev` | `apps/main/src/routes/BlockFitDev.tsx` | `/dev/block-fit/*` | Action block testing |
| `dryRunPixverseSync()` | `@lib/api/accounts.ts` | `/dev/pixverse-sync/dry-run` | Provider sync diagnostics |

**Design Decisions:**
- **Naming:** All dev tools use `/dev/*` prefix in routes and API endpoints
- **Visibility:** Dev routes marked `hidden: true` in module registry
- **Purpose:** These tools **intentionally** expose backend internals for developer productivity
- **Not a Concern:** Clearly documented and separated from production features

### 3.2 Shared Types (`@shared/types`)

**Status:** âœ… **Clear Contract Layer**

**Potential Confusion:**
- TypeScript types in `@shared/types` define **frontend expectations**
- Backend has separate Python models (e.g., `domain.session.GameSession`)
- Types must stay in sync manually

**Mitigation:**
- Backend serializes domain models to match `@shared/types` contract
- API validation ensures responses match TypeScript types
- Consider: Auto-generate TypeScript types from Python models (future improvement)

### 3.3 Game Engine (`packages/game/`)

**Status:** âœ… **Backend-Agnostic by Design**

**Potential Confusion:**
- Game engine lives in frontend monorepo but is not "frontend code"
- It's a **shared library** that can run in browser or Node.js

**Mitigation:**
- Engine uses **adapters** (`ApiClient`, `StorageProvider`) to avoid direct dependencies
- Frontend provides implementations in `@lib/game/coreAdapter.ts`
- Clear separation: engine = logic, frontend = presentation

### 3.4 Historical: `mockCore` (Removed)

**Status:** âœ… **Fully Removed** (commit `09b066e`)

**What Was It?**
- Local in-memory mock of backend API for offline development
- Caused confusion: "Is this using real data or mock data?"

**Current State:**
- All references deleted
- All data flows through production backend API
- No mock/fake data layers remain in frontend

---

## 4. Recommendations

### 4.1 Documentation Updates

#### **Update `docs/repo-map.md`** âœ… Already Complete

Current `repo-map.md` includes:
- Import hygiene section with examples
- Barrel export patterns
- ESLint rules reference

**Additional Recommendation:**
Add a new section **"Frontend â†” Backend Communication"** with link to this document.

```markdown
## Frontend â†” Backend Communication

See [Frontend vs Backend Boundaries](./architecture/frontend-backend-boundaries.md) for:
- How backend data flows to frontend
- API client patterns and WebSocket usage
- Shared types contract
- Development tool boundaries
```

#### **Create Developer Onboarding Checklist**

**New File:** `docs/onboarding/architecture-overview.md`

```markdown
# Architecture Overview for New Contributors

## Key Concepts

1. **Frontend uses barrel exports** - Always import from `@lib/*` or `@features/*`, never deep paths
2. **Backend is FastAPI/Python** - Domain models â†’ Services â†’ API routes
3. **Communication is REST + WebSocket** - All data flows through `/api/v1/*` endpoints
4. **Shared types in `@shared/types`** - TypeScript contract for API responses
5. **Dev tools use `/dev/*`** - Development endpoints clearly separated

## Quick Start

- **Add a new API endpoint?** â†’ Edit `pixsim7/backend/main/api/v1/*.py`
- **Add a new frontend feature?** â†’ Create module in `apps/main/src/features/*` with barrel export
- **Share data between frontend/backend?** â†’ Define types in `packages/shared/types/src/`
- **Need backend data in frontend?** â†’ Add API call in `@lib/api/*`, consume via hook

## Red Flags ðŸš©

- âŒ Importing from `@lib/core/types` (use `@lib/core` barrel)
- âŒ Hardcoded backend URLs (use `@lib/api/client.ts`)
- âŒ Frontend calling backend services directly (use API client)
- âŒ Backend importing frontend code (layers must be separate)
```

### 4.2 Structural Improvements

#### **4.2.1 Add Barrel Export Comments**

Update all barrel `index.ts` files with warnings:

**Example: `apps/main/src/lib/core/index.ts`**

```typescript
/**
 * @lib/core - Core game engine types and interfaces
 *
 * PUBLIC API - Use barrel imports only:
 *   âœ… import { BrainState } from '@lib/core';
 *   âŒ import { BrainState } from '@lib/core/types';
 *
 * This module re-exports:
 *   - Core types from @shared/types
 *   - BrainState helper functions
 *   - BaseRegistry class
 *
 * For internal core implementation details, see source files directly.
 * Do not add new exports without updating this barrel file.
 */

export type { BrainState, GameSession, ... } from './types';
export { getMood, getAxisValue, ... } from './types';
export { BaseRegistry } from './BaseRegistry';
```

**Apply to all 29 lib barrels and 13 feature barrels.**

#### **4.2.2 Add Backend Barrel Docstrings**

Update Python `__init__.py` files with similar warnings:

**Example: `pixsim7/backend/main/domain/__init__.py`**

```python
"""
Domain Models - Public API

PUBLIC EXPORTS:
  - Core models: User, Asset, Generation, ProviderAccount
  - Enums: MediaType, SyncStatus, GenerationStatus

SUBSYSTEM IMPORTS (not exported from here):
  - domain.game.* - Import directly: from pixsim7.backend.main.domain.game import GameWorld
  - domain.stats.* - Import directly: from pixsim7.backend.main.domain.stats import StatEngine

PATTERN:
  âœ… from pixsim7.backend.main.domain import User, Asset
  âœ… from pixsim7.backend.main.domain.game import GameWorld
  âŒ from pixsim7.backend.main.domain.user import User  # Use barrel instead
"""

from .user import User, UserSession
# ...
```

#### **4.2.3 API Client Registry Pattern**

**Current Issue:** API calls scattered across `@lib/api/*.ts` files without central registry.

**Proposed Improvement:** Create API endpoint registry for documentation/testing.

**New File:** `apps/main/src/lib/api/registry.ts`

```typescript
/**
 * API Endpoint Registry
 *
 * Central reference for all backend API calls.
 * Useful for:
 *   - Generating API documentation
 *   - Testing endpoint coverage
 *   - Finding which frontend code calls which backend endpoints
 */

interface ApiEndpointMeta {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  category: 'auth' | 'game' | 'generation' | 'asset' | 'dev';
  description: string;
  frontendCaller: string;  // File that calls this endpoint
}

export const API_ENDPOINTS: ApiEndpointMeta[] = [
  {
    method: 'GET',
    path: '/game/worlds',
    category: 'game',
    description: 'List all game worlds for current user',
    frontendCaller: '@lib/api/game.ts:listGameWorlds()',
  },
  // ... register all endpoints
];
```

**Benefits:**
- Self-documenting
- Can generate OpenAPI spec from this registry
- Easy to find "which endpoints are unused?"

### 4.3 Automated Enforcement

#### **4.3.1 ESLint Rules (Already Implemented)** âœ…

Current rules in `apps/main/eslint.config.js`:
- `import/no-internal-modules` - Prevents deep imports
- `import/no-cycle` - Detects circular dependencies
- `import/order` - Enforces consistent import ordering

**Status:** Working well post-import hygiene pass.

#### **4.3.2 Pre-commit Hooks (Already Implemented)** âœ…

Current setup:
- Husky + lint-staged
- Runs ESLint on staged TypeScript files
- Auto-fixes import violations

**Status:** Enforces import hygiene automatically.

#### **4.3.3 API Contract Validation (Proposed)**

**Problem:** TypeScript types in `@shared/types` can drift from backend responses.

**Solution:** Add runtime validation in `@lib/api/client.ts`:

```typescript
import { z } from 'zod';

// Define Zod schemas matching @shared/types
const GameSessionSchema = z.object({
  id: z.number(),
  worldId: z.number(),
  currentTime: z.number(),
  // ... match GameSession type
});

// Wrap apiClient with validation in dev mode
if (import.meta.env.DEV) {
  apiClient.interceptors.response.use((response) => {
    const endpoint = response.config.url;

    // Validate known endpoints
    if (endpoint?.includes('/game/sessions')) {
      const result = GameSessionSchema.safeParse(response.data);
      if (!result.success) {
        console.error('API Contract Violation:', endpoint, result.error);
      }
    }

    return response;
  });
}
```

**Benefits:**
- Catches backend breaking changes immediately
- Only runs in development (zero production overhead)
- Alerts developers when types drift

### 4.4 Visual Documentation

#### **4.4.1 Mermaid Diagrams in Code**

Add diagrams to key files for quick reference:

**Example: `apps/main/src/lib/api/README.md`**

````markdown
# API Client

Central HTTP client for all backend communication.

## Architecture

```mermaid
graph TD
    A[React Component] --> B[@lib/api/game]
    B --> C[apiClient Axios instance]
    C --> D[Backend /api/v1/game/*]
    D --> E[GameService]
    E --> F[Domain Models]
    F --> D
    D --> C
    C --> G[Response Interceptor]
    G --> H[Error Handling]
    H --> I[Redirect to /login on 401]
```

## Usage

See individual API modules:
- `game.ts` - Game worlds, NPCs, sessions
- `generations.ts` - Content generation
- `assets.ts` - Asset management
````

#### **4.4.2 Interactive Backend Architecture Panel** âœ… Already Exists

The `BackendArchitecturePanel` component already provides:
- Live backend introspection via `/dev/architecture/map`
- Service composition tree
- Route/plugin mapping
- Permission matrix

**Recommendation:** Promote this tool in onboarding docs.

---

## 5. Quick Reference for Common Tasks

### Adding a New API Endpoint

**Backend:**
```python
# 1. Add route in pixsim7/backend/main/api/v1/game_worlds.py
@router.post("/game/worlds")
async def create_world(ctx: PluginContext, data: CreateWorldRequest):
    world = await ctx.game_worlds.create_world(data)
    return world.to_dict()

# 2. Implement service method in services/game/game_world_service.py
class GameWorldService:
    async def create_world(self, data: CreateWorldRequest) -> GameWorld:
        # ... business logic
```

**Frontend:**
```typescript
// 3. Add API call in apps/main/src/lib/api/game.ts
export async function createGameWorld(data: CreateWorldRequest): Promise<GameWorld> {
  const response = await apiClient.post('/game/worlds', data);
  return response.data;
}

// 4. Add type to @shared/types if needed
export interface CreateWorldRequest {
  name: string;
  initialTime: number;
}

// 5. Use in component
function WorldCreator() {
  const handleCreate = async (data) => {
    const world = await createGameWorld(data);
    // ... update UI
  };
}
```

### Adding a New Frontend Feature Module

```bash
# 1. Create feature directory
mkdir -p apps/main/src/features/myFeature/{components,hooks,lib,stores}

# 2. Create barrel export
cat > apps/main/src/features/myFeature/index.ts << 'EOF'
/**
 * @features/myFeature - My feature description
 *
 * PUBLIC API - Use barrel imports only:
 *   âœ… import { MyComponent } from '@features/myFeature';
 *   âŒ import { MyComponent } from '@features/myFeature/components/MyComponent';
 */

export { MyComponent } from './components/MyComponent';
export { useMyFeature } from './hooks/useMyFeature';
EOF

# 3. Add path alias in tsconfig.app.json
# "@features/myFeature": ["./src/features/myFeature/index.ts"]

# 4. Update vite.config.ts with alias

# 5. Register feature in modules/pages.ts if it has a route
```

### Fetching Backend Data in Frontend

```typescript
// 1. Add API call to @lib/api/*.ts
export async function getMyData(id: number) {
  const response = await apiClient.get(`/my-endpoint/${id}`);
  return response.data;
}

// 2. Create React hook
export function useMyData(id: number) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const result = await getMyData(id);
        setData(result);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  return { data, loading };
}

// 3. Use in component
function MyComponent({ id }: { id: number }) {
  const { data, loading } = useMyData(id);

  if (loading) return <div>Loading...</div>;
  return <div>{data.name}</div>;
}
```

---

## 6. Summary Table

### Frontend Boundaries

| Layer | Location | Import Pattern | Enforced By |
|-------|----------|----------------|-------------|
| Lib Modules | `apps/main/src/lib/*` | `@lib/*` barrel exports | ESLint `import/no-internal-modules` |
| Feature Modules | `apps/main/src/features/*` | `@features/*` barrel exports | ESLint `import/no-internal-modules` |
| Shared Types | `packages/shared/types/src` | `@shared/types` | TypeScript compiler |
| API Client | `apps/main/src/lib/api` | `@lib/api` | Centralized in `client.ts` |

### Backend Boundaries

| Layer | Location | Import Pattern | Enforced By |
|-------|----------|----------------|-------------|
| API Routes | `pixsim7/backend/main/api/v1/*.py` | HTTP endpoints `/api/v1/*` | FastAPI router registration |
| Services | `pixsim7/backend/main/services/*` | Python barrel exports `__init__.py` | Convention |
| Domain Models | `pixsim7/backend/main/domain/*` | Python barrel exports (core only) | Documentation |
| Dev Endpoints | `pixsim7/backend/main/api/v1/dev_*.py` | `/dev/*` prefix | Naming convention |

### Communication Channels

| Channel | Direction | Protocol | Use Case |
|---------|-----------|----------|----------|
| REST API | Frontend â†’ Backend | HTTP/JSON | All CRUD operations, primary data flow |
| WebSocket | Backend â†’ Frontend | WS/JSON | Real-time generation updates |
| Polling | Frontend â†’ Backend | HTTP/JSON | Fallback for generation status |
| localStorage | Frontend only | Browser API | Session persistence, offline cache |

---

## 7. Conclusion

PixSim7 maintains **clean separation** between frontend and backend with:

âœ… **Clear boundaries** - Barrel exports, enforced by ESLint
âœ… **Documented patterns** - Import rules, API client usage
âœ… **No mock/test bleed** - `mockCore` removed, dev tools clearly marked
âœ… **Shared contract** - `@shared/types` defines API shape
âœ… **Intentional overlap** - Dev tools (`/dev/*`) are well-separated

**For new contributors:**
1. Read this document first
2. Follow import rules (barrels only)
3. Use `@lib/api` for backend calls
4. Keep dev tools in `/dev/*` namespace

**For maintainers:**
1. Update barrel exports when adding public APIs
2. Keep `@shared/types` in sync with backend responses
3. Mark dev-only code with `/dev/*` prefix
4. Document intentional boundary crossings

This architecture ensures the team always knows "where backend ends and frontend begins."
