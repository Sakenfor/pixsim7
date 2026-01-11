# Frontend Packages Architecture Review

> **Date:** January 2026
> **Purpose:** Analyze current package structure and propose consolidation for desktop frontend reuse

---

## Executive Summary

The frontend is **well-structured** with good separation between framework-agnostic core packages and React-specific code. However, several opportunities exist to:

1. Extract more business logic from `apps/main/` into reusable packages
2. Consolidate `-core` packages under a unified `packages/core/` directory (optional, long-term)
3. Better prepare for a potential desktop frontend (Electron/Tauri)

**Recommendation:** Prefer incremental extraction + aliasing first. Full directory moves/renames are high churn and should be deferred until a second frontend actively consumes them.

---

## Current Package Inventory

### Framework-Agnostic Packages (React-Free)

| Package | Location | Purpose | Dependencies |
|---------|----------|---------|--------------|
| `@pixsim7/shared.types` | `packages/shared/types/` | Core type definitions | `@pixsim7/ref-core`, `zod` |
| `@pixsim7/ref-core` | `packages/shared/ref-core/` | Entity references, builders, parsers | None (leaf) |
| `@pixsim7/helpers-core` | `packages/shared/helpers-core/` | Small framework-agnostic helpers (e.g., shortcut parsing) | None (leaf) |
| `@pixsim7/capabilities-core` | `packages/shared/capabilities-core/` | Capability system (provider/app) | `helpers-core`, `shared.types` |
| `@pixsim7/shared.logic-core` | `packages/shared/logic-core/` | Shared runtime logic (stats, content ratings) | `shared.types` |
| `@pixsim7/assets-core` | `packages/shared/assets-core/` | Asset card actions, media types | `shared.types` |
| `@pixsim7/generation-core` | `packages/shared/generation-core/` | Generation logic, provider params | `shared.types` |
| `@pixsim7/api-client` | `packages/shared/api-client/` | Environment-neutral API (browser/Node/Electron/Tauri) | `shared.types`, `axios` (peer) |
| `@pixsim7/game.engine` | `packages/game/engine/` | Headless game logic | `helpers-core`, `ref-core`, `logic-core`, `shared.types` |
| `@pixsim7/scene.shapes` | `packages/scene/shapes/` | 3D shape definitions | `game.engine`, `shared.types` |
| `@pixsim7/scene.gizmos` | `packages/scene/gizmos/` | 3D gizmos/controls | `shared.types` |

### React-Dependent Packages

| Package | Location | Purpose |
|---------|----------|---------|
| `@pixsim7/shared.ui` | `packages/shared/ui/` | React component library (Button, Modal, Toast, etc.) |
| `@pixsim7/game.react` | `packages/game/react/` | React bindings for game.engine (hooks, providers) |
| `@pixsim7/game.components` | `packages/game/components/` | High-level game React components |
| `@pixsim7/game.runtime` | `packages/game/runtime/` | Game runtime (React peer dep) |

### Current Directory Structure

```
packages/
├── shared/              # Mixed: core + React packages
│   ├── helpers-core/
│   ├── capabilities-core/
│   ├── ref-core/
│   ├── logic-core/
│   ├── assets-core/
│   ├── generation-core/
│   ├── api-client/
│   ├── types/
│   ├── ui/              # React-dependent (doesn't belong with -core)
│   └── config/
├── game/
│   ├── engine/          # Framework-agnostic (headless)
│   ├── react/           # React bindings
│   ├── components/      # React components
│   └── runtime/
├── scene/
│   ├── shapes/          # Framework-agnostic
│   └── gizmos/          # Framework-agnostic
├── plugins/             # Plugin packages
└── pixcubes/
```

---

## Code Still in Main App (Extraction Candidates)

The following code in `apps/main/src/` is framework-agnostic and could be extracted:

### 1. Auth Service (`apps/main/src/lib/auth/`)

**Current state:** Already has `AuthStorageProvider` interface for cross-platform support.

```typescript
// Already abstracted for desktop
export interface AuthStorageProvider {
  getAccessToken(): string | null | Promise<string | null>;
  setAccessToken(token: string | null): void | Promise<void>;
  getUser(): User | null | Promise<User | null>;
  setUser(user: User | null): void | Promise<void>;
  clearAll(): void | Promise<void>;
}
```

**Extract to:** `@pixsim7/core.auth`

Files to extract:
- `authService.ts` - Pure auth logic
- `AuthStorageProvider` interface
- Auth types (`LoginRequest`, `RegisterRequest`, `AuthResponse`)

### 2. Domain Logic (`apps/main/src/domain/`)

**Current state:** Pure TypeScript, already separated from UI, but not a package.

```
apps/main/src/domain/
├── campaign/
│   ├── types.ts
│   ├── validation.ts
│   └── stores/campaignStore.ts
├── sceneBuilder/
│   ├── graphSync.ts
│   ├── portConfig.ts
│   ├── portConfigDsl.ts
│   ├── portValidation.ts
│   └── validation.ts
├── sceneCollection/
│   ├── types.ts
│   ├── validation.ts
│   └── stores/sceneCollectionStore.ts
└── validation/
    ├── types.ts
    └── index.ts
```

**Extract to:** `@pixsim7/core.domain`

### 3. Data Binding (`apps/main/src/lib/dataBinding/`)

**Current state:** Framework-agnostic resolver and registry patterns.

Files to extract:
- `dataResolver.ts` - Pure data resolution logic
- `dataSourceRegistry.ts` - Registry pattern
- `coreDataSources.ts` - Source definitions

Keep in app:
- `useDataBindings.ts` - React hook

**Extract to:** `@pixsim7/core.databinding`

### 4. Asset Provider (`apps/main/src/lib/assetProvider/`)

**Current state:** Service abstraction for asset loading.

Files to extract:
- `AssetService.ts` - Pure service logic
- Provider interfaces and base implementations

**Extract to:** `@pixsim7/core.asset-provider`

### 5. Core Registries (`apps/main/src/lib/core/`)

**Current state:** Generic registry patterns.

Files to extract:
- `BaseRegistry.ts` - Generic registry base class
- `ToolRegistryBase.ts` - Tool-specific registry
- `types.ts` - Registry types

**Extract to:** `@pixsim7/core.registry`

### 6. Global Stores (`apps/main/src/stores/`)

**Current state:** Zustand stores with business logic mixed in.

| Store | Framework-Agnostic Parts |
|-------|-------------------------|
| `authStore.ts` | State shape, initialization logic |
| `worldConfigStore.ts` | Config validation, defaults |
| `compositionPackageStore.ts` | Package management logic |
| `conceptStore.ts` | Concept data structures |
| `pluginCatalogStore.ts` | Catalog management |
| `pluginConfigStore.ts` | Config validation |
| `serverManagerStore.ts` | Server selection logic |
| `gameStateStore.ts` | State shapes (core is in game.engine) |

**Recommendation:** Create `@pixsim7/core.state` only for shared state *shapes* and transformations that are used across multiple clients. Avoid extracting stores that are tightly coupled to React/Zustand or UI flows until there is a clear second consumer.

React apps use Zustand, desktop apps use their preferred state management.

---

## Proposed Consolidation: `packages/core/` (Optional / Long-Term)

### Recommended Structure

```
packages/
├── core/                        # All framework-agnostic packages
│   ├── types/                   # @pixsim7/core.types (was shared.types)
│   ├── ref/                     # @pixsim7/core.ref (was ref-core)
│   ├── helpers/                 # @pixsim7/core.helpers (was helpers-core)
│   ├── capabilities/            # @pixsim7/core.capabilities (was capabilities-core)
│   ├── api-client/              # @pixsim7/core.api-client (was api-client)
│   ├── auth/                    # @pixsim7/core.auth (NEW - from apps/main)
│   ├── state/                   # @pixsim7/core.state (NEW - pure state logic)
│   ├── domain/                  # @pixsim7/core.domain (NEW - from apps/main)
│   ├── databinding/             # @pixsim7/core.databinding (NEW - from apps/main)
│   └── registry/                # @pixsim7/core.registry (NEW - from apps/main)
│
├── assets/                      # Asset domain packages
│   ├── core/                    # @pixsim7/assets.core (was assets-core + provider)
│   ├── stats/                   # @pixsim7/assets.stats (was logic-core)
│   └── generation/              # @pixsim7/assets.generation (was generation-core)
│
├── game/                        # Game domain packages
│   ├── engine/                  # @pixsim7/game.engine (unchanged)
│   ├── react/                   # @pixsim7/game.react (unchanged)
│   └── components/              # @pixsim7/game.components (unchanged)
│
├── scene/                       # Scene domain packages
│   ├── shapes/                  # @pixsim7/scene.shapes (unchanged)
│   └── gizmos/                  # @pixsim7/scene.gizmos (unchanged)
│
├── ui/                          # React UI (top-level)
│   └── src/                     # @pixsim7/ui (was shared.ui)
│
└── plugins/                     # Plugin packages (unchanged)
```

### Naming Convention After Consolidation

```typescript
// Core packages (framework-agnostic foundation)
import { ... } from '@pixsim7/core.types';
import { ... } from '@pixsim7/core.helpers';
import { ... } from '@pixsim7/core.capabilities';
import { ... } from '@pixsim7/core.api-client';
import { ... } from '@pixsim7/core.auth';
import { ... } from '@pixsim7/core.state';
import { ... } from '@pixsim7/core.domain';

// Asset domain (framework-agnostic)
import { ... } from '@pixsim7/assets.core';
import { ... } from '@pixsim7/assets.stats';
import { ... } from '@pixsim7/assets.generation';

// Game domain
import { ... } from '@pixsim7/game.engine';    // Framework-agnostic
import { ... } from '@pixsim7/game.react';     // React bindings

// Scene domain (framework-agnostic)
import { ... } from '@pixsim7/scene.shapes';
import { ... } from '@pixsim7/scene.gizmos';

// React UI
import { ... } from '@pixsim7/ui';
```

### Benefits of This Structure

1. **Clear boundary:** `packages/core/` = pure TypeScript, no React
2. **Domain cohesion:** Game, assets, scene remain grouped
3. **Desktop-ready:** All `core/` packages work in Electron/Tauri
4. **Consistent naming:** Drop `-core` suffix when inside `core/` directory
5. **Import clarity:** `@pixsim7/core.*` immediately signals framework-agnostic

---

## Dependency Graph

```
Leaf packages (no internal deps):
└── @pixsim7/core.ref
└── @pixsim7/core.helpers

Type foundation:
└── @pixsim7/core.types
    └── depends on: core.ref, zod

Infrastructure layer:
├── @pixsim7/core.capabilities  → helpers, types
├── @pixsim7/core.api-client    → types, axios
├── @pixsim7/core.registry      → (none)
├── @pixsim7/core.databinding   → types
└── @pixsim7/core.auth          → api-client, types

Asset domain:
├── @pixsim7/assets.stats       → types
├── @pixsim7/assets.core        → types
└── @pixsim7/assets.generation  → types

Game domain:
├── @pixsim7/game.engine        → helpers, ref, stats, types
├── @pixsim7/game.react         → game.engine, types (+ React)
└── @pixsim7/game.components    → game.react, scene.gizmos, ui (+ React)

Scene domain:
├── @pixsim7/scene.shapes       → game.engine, types
└── @pixsim7/scene.gizmos       → types

React layer:
└── @pixsim7/ui                 → (+ React, framer-motion, zustand)
```

---

## Desktop Frontend Considerations

### Code Reuse by Desktop Approach

| Approach | Effort | Reuse Level | Notes |
|----------|--------|-------------|-------|
| **Electron + React** | Low | ~95% | Same React code, add Electron APIs |
| **Tauri + React** | Low-Medium | ~90% | Same React, Tauri-specific storage/IPC |
| **Tauri + Solid/Svelte** | High | ~65% | Only `core/` + `game.engine` reusable |
| **Native (Qt/GTK)** | Very High | ~40% | Only pure TS logic, need FFI |

### Recommended Path

Given the architecture, **Tauri + React** maximizes reuse:
- All `packages/core/*` packages work as-is
- `game.engine` works as-is (headless)
- `game.react` + `game.components` work as-is
- `@pixsim7/ui` works as-is
- Only need: Tauri-specific `AuthStorageProvider`, IPC bridges

---

## Migration Strategy (Revised)

### Phase 0: Low-churn alignment (recommended first)
1. Add alias exports (if desired) to make `@pixsim7/core.*` available without moving folders.
2. Add lint rules / constraints to prevent React/DOM imports in core packages.
3. Extract only code with a second consumer or strong reuse evidence.

### Phase 1: Create `packages/core/` structure (defer until Phase 0 proves value)
1. Create `packages/core/` directory
2. Move `shared/types/` → `core/types/`
3. Move `shared/ref-core/` → `core/ref/`
4. Move `shared/helpers-core/` → `core/helpers/`
5. Move `shared/capabilities-core/` → `core/capabilities/`
6. Move `shared/api-client/` → `core/api-client/`
7. Update all import paths
8. Update `pnpm-workspace.yaml`

### Phase 2: Create `packages/assets/` domain (evaluate first)
1. Move `shared/logic-core/` → `assets/stats/`
2. Move `shared/assets-core/` → `assets/core/`
3. Move `shared/generation-core/` → `assets/generation/`
4. Update all import paths

### Phase 3: Move React packages (lowest priority)
1. Move `shared/ui/` → `ui/`
2. Delete empty `shared/` directory
3. Update all import paths

### Phase 4: Extract new packages from `apps/main/` (only if multi-client reuse)
1. Extract `core/auth/` from `apps/main/src/lib/auth/`
2. Extract `core/domain/` from `apps/main/src/domain/`
3. Extract `core/state/` (pure state interfaces)
4. Extract `core/databinding/` from `apps/main/src/lib/dataBinding/`
5. Extract `core/registry/` from `apps/main/src/lib/core/`

---

## Summary

### Current Strengths
- `game.engine` is already headless and reusable
- `api-client` supports multiple environments
- `authService` has storage provider abstraction
- Domain logic in `src/domain/` is already separated
- Core packages have zero React dependencies

### Areas for Improvement
- Zustand stores couple state management to React
- `src/lib/` contains 100+ files, mixed concerns
- `-core` packages scattered across `shared/`
- No clear visual distinction between React/non-React packages

### Recommended Actions
1. Add optional alias exports for core packages (no renames yet)
2. Extract only high-reuse modules with clear second consumers
3. Delay folder moves/renames until there is a confirmed second frontend

This positions the codebase well for a desktop frontend while improving organization for the existing React app.
