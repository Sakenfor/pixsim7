# TypeScript Architecture Review

> **Date:** 2024-12-09
> **Scope:** `apps/main/`, `packages/*`, `chrome-extension/`
> **Goal:** Identify type safety issues, consolidation opportunities, and high-leverage refactors
>
> **Note:** Statistics in this document (counts of `any` usage, duplicate definitions, etc.) are a **snapshot as of the scan date**. These numbers will change as refactors are applied. Treat them as a baseline for prioritization, not a guaranteed current state.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Core Concepts Overview](#core-concepts-overview)
3. [Providers](#1-providers)
4. [Generation / Jobs](#2-generation--jobs)
5. [Analyzers](#3-analyzers)
6. [Panels / Workspace](#4-panels--workspace)
7. [Prompts](#5-prompts)
8. [Discriminated Unions vs String Flags](#6-discriminated-unions-vs-string-flags)
9. [Type Safety Issues](#7-type-safety-issues)
10. [API Client & Backend Alignment](#8-api-client--backend-alignment)
11. [Priority Recommendations](#priority-recommendations)
12. [Implementation Checklist](#implementation-checklist)

---

## Executive Summary

### Key Findings

| Area | Status | Primary Issue |
|------|--------|---------------|
| Providers | Good | Minor duplication in hooks |
| Generation/Jobs | Improved | ~~Heavy `any` usage~~, ~~operation type fragmentation~~ - Fixed 2024-12-09 |
| Analyzers | Good | Magic string IDs (Phase 4 pending) |
| Panels/Workspace | Improved | ~~4 different category definitions~~ - Consolidated 2024-12-09 |
| Prompts | Improved | `PromptBlock` consolidated to `types/prompts.ts` (Phase 3 done) |
| API Client | Improved | ~~38~~ ~30 `any` occurrences (reduced in generations.ts) |

### Statistics (as of initial scan)

| Metric | Initial | After Phase 1-2 |
|--------|---------|-----------------|
| `any` in API layer | 38 | ~30 (reduced in generations.ts) |
| `Record<string, any>` total | 69 | ~65 (some converted to `unknown`) |
| Duplicated `OperationType` definitions | 5+ | 1 (canonical in types/operations.ts) |
| Duplicated `PanelCategory` definitions | 4 | 1 (canonical in panelConstants.ts) |
| Duplicated `PromptBlock` definitions | 4 | 1 (canonical in types/prompts.ts) |
| Files with hardcoded operation string comparisons | 8 | ~6 (Phase 5 pending) |

### Top 5 High-Leverage Improvements

1. ~~**Consolidate `OperationType`** - Eliminate 5+ duplicate definitions~~ DONE
2. ~~**Fix `any` in `lib/api/generations.ts`** - Import existing shared types~~ DONE
3. ~~**Consolidate `PanelCategory`** - Single source of truth for 4 definitions~~ DONE
4. **Consolidate `GenerationStatus`** - Already centralized, just export properly
5. **Create canonical `PromptBlock`** - DONE: Consolidated to `types/prompts.ts`

---

## Core Concepts Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Core Concepts                            │
├─────────────────────────────────────────────────────────────────┤
│  Providers     → ProviderInfo, ProviderCapability, OperationSpec│
│  Generation    → GenerationResponse, OperationType, Status      │
│  Analyzers     → AnalyzerInfo, AnalyzerKind, AnalyzerTarget     │
│  Panels        → PanelId, PanelDefinition, PanelCategory        │
│  Prompts       → PromptBlock, PromptVersion, PromptAnalysis     │
│  Assets        → Asset, MediaType, AssetAnalysis                │
└─────────────────────────────────────────────────────────────────┘
```

---

## 1. Providers

### Type Locations

| Type | File | Line | Status |
|------|------|------|--------|
| `ProviderInfo` | `apps/main/src/lib/providers/types.ts` | 59-65 | Canonical |
| `ProviderCapability` | `apps/main/src/lib/providers/types.ts` | 43-57 | Good |
| `ProviderFeatures` | `apps/main/src/lib/providers/types.ts` | 22-25 | Good |
| `ProviderLimits` | `apps/main/src/lib/providers/types.ts` | 27-34 | Good |
| `OperationSpec` | `apps/main/src/lib/providers/types.ts` | 18-20 | Good |
| `OperationParameterSpec` | `apps/main/src/lib/providers/types.ts` | 5-16 | Good |

### Registry Pattern

**Location:** `apps/main/src/lib/providers/capabilityRegistry.ts`

```typescript
// Singleton with caching and single-flight deduplication
export class ProviderCapabilityRegistry {
  private capabilities = new Map<string, ProviderCapability>();
  private config: { cacheTTL: number; autoFetch: boolean };

  async fetchCapabilities(): Promise<void>;
  getCapability(providerId: string): ProviderCapability | null;
  getSupportedControls(providerId: string, operation: string): string[];
  getOperationSpec(providerId: string, operation: string): OperationSpec | null;
}

export const providerCapabilityRegistry = new ProviderCapabilityRegistry();
```

### React Hooks

**Location:** `apps/main/src/lib/providers/hooks.ts`

- `useProviderCapabilities()` - All capabilities
- `useProviderCapability(providerId)` - Specific provider
- `usePromptLimit(providerId)` - Prompt character limit
- `useProviderLimits(providerId)` - All limits
- `useCostHints(providerId)` - Cost estimation
- `useSupportedOperations(providerId)` - Operation list
- `useProviderFeature(providerId, feature)` - Feature check
- `useQualityPresets(providerId)` - Quality options
- `useAspectRatios(providerId)` - Aspect ratio options
- `useOperationSpec(providerId, operation)` - Operation parameters

### Issues

1. **Duplicate `ProviderInfo`** in `hooks/useProviders.ts:9` shadows canonical definition
2. **Loose typing:** `operations: string[]` should be `OperationType[]`

### Recommended Fix

```typescript
// apps/main/src/hooks/useProviders.ts
// REMOVE local ProviderInfo definition
// IMPORT from canonical location:
import type { ProviderInfo } from '@/lib/providers/types';
```

---

## 2. Generation / Jobs

### Type Locations

| Type | File | Line | Status |
|------|------|------|--------|
| `GenerationResponse` | `lib/api/generations.ts` | 21-62 | Heavy `any` usage |
| `CreateGenerationRequest` | `lib/api/generations.ts` | 72-107 | Uses `any` |
| `GenerationStatus` | `stores/generationsStore.ts` | 77 | Centralized |
| `OperationType` | `types/operations.ts` | 96-105 | `as const` pattern |
| `OperationParams` | `types/operations.ts` | 84-90 | Discriminated union |

### Critical Issue: `any` in Generation API

**File:** `apps/main/src/lib/api/generations.ts:72-107`

```typescript
// CURRENT - uses any with comments:
export interface CreateGenerationRequest {
  config: any; // GenerationNodeConfig
  from_scene?: any; // SceneRef
  to_scene?: any; // SceneRef
  player_context?: any; // PlayerContextSnapshot
  social_context?: any; // GenerationSocialContext
  template_variables?: Record<string, any>;
}

// RECOMMENDED - import actual types:
import type {
  GenerationNodeConfig,
  SceneRef,
  PlayerContextSnapshot,
  GenerationSocialContext,
} from '@pixsim7/shared.types';

export interface CreateGenerationRequest {
  config: GenerationNodeConfig;
  from_scene?: SceneRef;
  to_scene?: SceneRef;
  player_context?: PlayerContextSnapshot;
  social_context?: GenerationSocialContext;
  template_variables?: Record<string, unknown>;
}
```

### Critical Issue: Operation Type Fragmentation

**5+ different definitions found:**

| Location | Definition | Issues |
|----------|------------|--------|
| `types/operations.ts:96` | `OPERATION_TYPES` as const | Source of truth |
| `stores/controlCenterStore.ts:42` | Inline union literal | Duplicate |
| `lib/api/controlCenter.ts:9` | Inline union literal | Duplicate |
| `stores/generationQueueStore.ts:16` | Subset only | Incomplete |
| Multiple components | Hardcoded strings | Scattered |

### Recommended Consolidation

```typescript
// apps/main/src/types/operations.ts (ALREADY EXISTS - promote to canonical)
export const OPERATION_TYPES = [
  'text_to_image',
  'text_to_video',
  'image_to_video',
  'image_to_image',
  'video_extend',
  'video_transition',
  'fusion',
] as const;

export type OperationType = typeof OPERATION_TYPES[number];

// Then update all consumers:
// - stores/controlCenterStore.ts:42 → import { OperationType }
// - lib/api/controlCenter.ts:9 → import { OperationType }
// - stores/generationQueueStore.ts:16 → import { OperationType }
```

### Generation Status

**Already centralized in `stores/generationsStore.ts:77`:**

```typescript
export type GenerationStatus =
  | 'pending'
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export const ACTIVE_STATUSES: readonly GenerationStatus[] =
  ['pending', 'queued', 'processing'] as const;

export const TERMINAL_STATUSES: readonly GenerationStatus[] =
  ['completed', 'failed', 'cancelled'] as const;

export function isGenerationTerminal(status: string): boolean;
export function isGenerationActive(status: string): boolean;
```

**Issue:** `lib/api/controlCenter.ts:16` has different/incomplete status union.

---

## 3. Analyzers

### Type Locations

| Type | File | Line | Status |
|------|------|------|--------|
| `AnalyzerInfo` | `lib/api/analyzers.ts` | 11-19 | Clean |
| `AnalyzerKind` | `lib/api/analyzers.ts` | 8 | Literal union |
| `AnalyzerTarget` | `lib/api/analyzers.ts` | 9 | Literal union |
| `AnalyzersListResponse` | `lib/api/analyzers.ts` | 21-24 | Clean |

### Current Types

```typescript
// apps/main/src/lib/api/analyzers.ts
export type AnalyzerKind = 'parser' | 'llm' | 'vision';
export type AnalyzerTarget = 'prompt' | 'asset';

export interface AnalyzerInfo {
  id: string;
  name: string;
  description: string;
  kind: AnalyzerKind;
  target: AnalyzerTarget;
  enabled: boolean;
  is_default: boolean;
}
```

### Registry Pattern

- Backend source of truth: `services/prompt_parser/registry.py`
- Frontend fetches from `/api/v1/analyzers` endpoint
- Auto-inject `analyzer_id` in `createGeneration()` from settings store

### Asset Analysis Note

While `AnalyzerTarget = 'prompt' | 'asset'` supports both, the current implementation is prompt-focused. Asset analysis results should share compatible shapes with prompt analysis (ontology-backed tags, structured metadata). When expanding asset analysis:
- Reuse the same `AnalyzerInfo` interface
- Ensure result shapes are compatible for unified display/filtering
- Consider a shared `AnalysisResult` type that works for both targets

### Issue: Magic String Analyzer IDs

Found in 4+ locations:

| Location | Hardcoded Value |
|----------|-----------------|
| `stores/promptSettingsStore.ts` | `'prompt:simple'` |
| `components/settings/modules/PromptsSettings.tsx` | `'prompt:simple'` fallback |
| Backend `registry.py` | `"prompt:simple"` |
| Backend `analyzers.py` | `"prompt:simple"` |

### Recommended Fix

```typescript
// NEW FILE: apps/main/src/lib/analyzers/constants.ts
export const ANALYZER_IDS = {
  PROMPT_SIMPLE: 'prompt:simple',
  PROMPT_CLAUDE: 'prompt:claude',
  PROMPT_OPENAI: 'prompt:openai',
} as const;

export type AnalyzerId = typeof ANALYZER_IDS[keyof typeof ANALYZER_IDS];

export const LEGACY_ANALYZER_IDS = {
  PARSER_SIMPLE: 'parser:simple',
  LLM_CLAUDE: 'llm:claude',
  LLM_OPENAI: 'llm:openai',
} as const;

export const DEFAULT_ANALYZER_ID = ANALYZER_IDS.PROMPT_SIMPLE;
```

---

## 4. Panels / Workspace

### Type Locations

| Type | File | Line | Status |
|------|------|------|--------|
| `PanelId` | `stores/workspaceStore.ts` | 6-26 | Union of 21 IDs |
| `PanelDefinition` | `lib/panels/panelRegistry.ts` | 60-98 | Has `component: any` |
| `PanelCategory` | `lib/panels/panelRegistry.ts` | 33-50 | 8 categories |
| `PanelRegistry` | `lib/panels/panelRegistry.ts` | 103-208 | Extends BaseRegistry |
| `WorkspaceState` | `stores/workspaceStore.ts` | 61-71 | Good |
| `FloatingPanelState` | `stores/workspaceStore.ts` | 38-46 | Has `context: any` |

### Registry Pattern

**Location:** `apps/main/src/lib/panels/panelRegistry.ts`

```typescript
// Extends generic BaseRegistry with panel-specific features
export class PanelRegistry extends BaseRegistry<PanelDefinition> {
  getByCategory(category: string): PanelDefinition[];
  search(query: string): PanelDefinition[];
  getVisiblePanels(context: WorkspaceContext): PanelDefinition[];
  getStats(): RegistryStats;
}

export const panelRegistry = new PanelRegistry();
```

### Critical Issue: Category Type Fragmentation

**4 different definitions found:**

| Location | Categories | Issues |
|----------|------------|--------|
| `lib/panels/panelRegistry.ts:33` | workspace, scene, game, dev, tools, utilities, system, custom | Source of truth |
| `stores/panelConfigStore.ts` | core, development, game, tools, custom | Different set |
| `components/panels/shared/PanelHeader.tsx` | Adds 'world', missing 'dev' | Different set |
| `components/layout/workspace-toolbar/AddPanelDropdown.tsx` | Hardcoded arrays | Duplicate |

### Recommended Consolidation

```typescript
// NEW FILE: apps/main/src/lib/panels/panelConstants.ts

export const PANEL_CATEGORIES = [
  'workspace',
  'scene',
  'game',
  'dev',
  'tools',
  'utilities',
  'system',
  'custom',
] as const;

export type PanelCategory = typeof PANEL_CATEGORIES[number];

export const CATEGORY_LABELS: Record<PanelCategory, string> = {
  workspace: 'Workspace',
  scene: 'Scene',
  game: 'Game',
  dev: 'Development',
  tools: 'Tools',
  utilities: 'Utilities',
  system: 'System',
  custom: 'Custom',
};

export const CATEGORY_ORDER: readonly PanelCategory[] = [
  'workspace',
  'game',
  'scene',
  'tools',
  'dev',
  'utilities',
  'system',
  'custom',
];

export const CATEGORY_COLORS: Record<PanelCategory, string> = {
  workspace: 'blue',
  scene: 'purple',
  game: 'green',
  dev: 'orange',
  tools: 'cyan',
  utilities: 'gray',
  system: 'red',
  custom: 'pink',
};
```

### Panel ID Constants

```typescript
// NEW FILE: apps/main/src/lib/panels/panelIds.ts

export const PANEL_IDS = {
  GALLERY: 'gallery',
  SCENE: 'scene',
  GRAPH: 'graph',
  INSPECTOR: 'inspector',
  HEALTH: 'health',
  GAME: 'game',
  PROVIDERS: 'providers',
  SETTINGS: 'settings',
  GIZMO_LAB: 'gizmo-lab',
  NPC_BRAIN_LAB: 'npc-brain-lab',
  GAME_THEMING: 'game-theming',
  SCENE_MANAGEMENT: 'scene-management',
  DEV_TOOLS: 'dev-tools',
  HUD_DESIGNER: 'hud-designer',
  WORLD_VISUAL_ROLES: 'world-visual-roles',
  GENERATIONS: 'generations',
  GAME_TOOLS: 'game-tools',
  SURFACE_WORKBENCH: 'surface-workbench',
  WORLD_CONTEXT: 'world-context',
  EDGE_EFFECTS: 'edge-effects',
} as const;

export type PanelId = typeof PANEL_IDS[keyof typeof PANEL_IDS];
```

---

## 5. Prompts

> **Important:** `PromptBlock` is a **frontend/analysis type only**. It represents parsed prompt segments for UI display and analysis. Persisted block data lives in `ActionBlockDB` on the backend. Do not confuse this UI type with database models.

### ~~Critical Issue: PromptBlock Defined 4 Times~~ RESOLVED

**Fixed 2024-12-09:** Consolidated to `apps/main/src/types/prompts.ts`

| Location | Status |
|----------|--------|
| `types/prompts.ts` | **Canonical source** - `ParsedBlock` + `PromptBlock` UI alias |
| `types/promptGraphs.ts` | Re-exports from `types/prompts.ts` |
| `components/prompts/PromptBlocksViewer.tsx` | Imports from `types/prompts.ts` |
| `routes/PromptLabDev.tsx` | Imports from `types/prompts.ts` |
| `hooks/usePromptInspection.ts` | Imports from `types/prompts.ts` |

### Implementation

```typescript
// apps/main/src/types/prompts.ts

export const PROMPT_BLOCK_ROLES = [
  'character', 'action', 'setting', 'mood', 'romance', 'other',
] as const;

export type PromptBlockRole = typeof PROMPT_BLOCK_ROLES[number];

// Full backend shape (mirrors services/prompt_parser/simple.py)
export interface ParsedBlock {
  role: PromptBlockRole;
  text: string;
  start_pos: number;
  end_pos: number;
  sentence_index: number;
  metadata?: Record<string, unknown>;
}

// Thin UI alias
export type PromptBlock = Pick<ParsedBlock, 'role' | 'text'> & {
  component_type?: string;
};
```

### PromptVersion Type

**Recommendation:** Rather than defining a local `PromptVersion` interface, prefer adding a shared type in `packages/shared/types` that mirrors the backend `PromptVersionResponse` schema. This ensures:
- All fields from the backend response are included (`prompt_text`, `counts`, etc.)
- Single source of truth avoids drift between frontend and backend
- Import from `@pixsim7/shared.types` rather than defining app-local interfaces

```typescript
// packages/shared/types/src/prompts.ts - mirror backend PromptVersionResponse
export interface PromptVersion {
  id: string;
  family_id: string;
  version_number: number;
  prompt_text: string;
  author?: string;
  tags: string[];
  created_at: string;
  usage_count?: number;
  // ... other fields from backend schema
}
```

---

## 6. Discriminated Unions vs String Flags

### Current State

**Good: `types/operations.ts` already has discriminated unions:**

```typescript
// Already exists but underused:
export interface TextToVideoParams {
  kind: 'text_to_video';
  prompt: string;
  negative_prompt?: string;
  seed?: number;
}

export interface ImageToVideoParams {
  kind: 'image_to_video';
  prompt?: string;
  image_url: string;
  negative_prompt?: string;
  seed?: number;
}

export type OperationParams =
  | TextToVideoParams
  | ImageToVideoParams
  | ImageToImageParams
  | VideoExtendParams
  | VideoTransitionParams
  | FusionParams;
```

### Problem: Most Code Uses String Comparisons

```typescript
// quickGenerateLogic.ts - stringly typed:
if (operationType === 'text_to_video' || operationType === 'text_to_image') {
  // ...
}
if (operationType === 'image_to_image') {
  // ...
}
if (operationType === 'image_to_video') {
  // ...
}
```

### Recommended Pattern

```typescript
// Use exhaustive switch with discriminated union:
function buildParams(ctx: QuickGenerateContext): OperationParams {
  switch (ctx.operationType) {
    case 'text_to_video':
      return {
        kind: 'text_to_video',
        prompt: ctx.prompt,
        ...ctx.presetParams,
      };
    case 'image_to_video':
      return {
        kind: 'image_to_video',
        image_url: ctx.imageUrl,
        prompt: ctx.prompt,
        ...ctx.presetParams,
      };
    case 'image_to_image':
      return {
        kind: 'image_to_image',
        prompt: ctx.prompt,
        image_url: ctx.imageUrl,
        ...ctx.presetParams,
      };
    // TypeScript enforces all cases handled
    default:
      const _exhaustive: never = ctx.operationType;
      throw new Error(`Unknown operation: ${_exhaustive}`);
  }
}
```

---

## 7. Type Safety Issues

### High-Impact `any` Usage

| File | Count | Impact | Fix Difficulty |
|------|-------|--------|----------------|
| `lib/api/generations.ts` | 11 | High | Easy |
| `lib/api/controlCenter.ts` | 10 | High | Medium |
| `lib/api/userPreferences.ts` | 4 | Low | Low |
| `lib/api/client.ts` | 3 | Low | Low |
| `lib/panels/panelRegistry.ts` | 2 | Medium | Easy |

### `Record<string, any>` Hotspots

**High priority (core paths):**

| File | Line | Field | Recommendation |
|------|------|-------|----------------|
| `stores/generationSettingsStore.ts` | - | `params` | Type per operation |
| `stores/controlCenterStore.ts` | 46 | `presetParams` | Use `OperationParams` |
| `lib/panels/panelRegistry.ts` | 68 | `defaultSettings` | Create `PanelSettings` type |
| `stores/workspaceStore.ts` | 45 | `context` | Create `FloatingPanelContext` type |
| `lib/api/generations.ts` | 31-32 | `raw_params`, `canonical_params` | Create `ProviderParams` type |

### Unsafe Casts

```typescript
// lib/panels/panelPlugin.ts:76,104 - unsafe cast to any
panelRegistry.unregister(panelId as any);

// Should use proper typing:
panelRegistry.unregister(panelId as PanelId);
```

---

## 8. API Client & Backend Alignment

### Client Structure

**Location:** `apps/main/src/lib/api/`

15 domain-specific clients:
- `client.ts` - Base axios wrapper with 401 handling
- `generations.ts` - `/api/v1/generations`
- `assets.ts` - Asset operations
- `analyzers.ts` - `/api/v1/analyzers`
- `game.ts` - World/session/NPC operations
- `controlCenter.ts` - High-level generation wrapper
- `accounts.ts` - Provider account management
- `interactions.ts` - NPC interactions
- `pixverseCost.ts` - Credit estimation
- `pixverseSync.ts` - Asset synchronization
- `userPreferences.ts` - Settings
- `errorHandling.ts` - Centralized error processing

### Backend Alignment

**Good alignment:**
- Backend enums in `domain/enums.py` mirror frontend types
- Pydantic schemas in `shared/schemas/` match frontend interfaces
- Status values consistent

**Gap:** Frontend defines types locally instead of importing shared:

```typescript
// CURRENT - lib/api/generations.ts:21
export interface GenerationResponse { ... } // Duplicates backend

// RECOMMENDED - import from shared
import type { GenerationResponse } from '@pixsim7/shared.types';
```

### Shared Types Package

**Location:** `packages/shared/types/src/`

- `generation.ts` - Generation config, social context, style rules
- `game.ts` - Game world, NPC, session schemas
- `interactions.ts` - NPC interaction types
- `intimacy.ts` - Intimacy progression types
- `index.ts` - Barrel export

---

## Priority Recommendations

### High Priority (Do First)

#### 1. Consolidate OperationType

**Effort:** Low
**Impact:** High
**Files to change:** 5

```typescript
// apps/main/src/types/operations.ts - already exists, promote to canonical
export const OPERATION_TYPES = [
  'text_to_image', 'text_to_video', 'image_to_video',
  'image_to_image', 'video_extend', 'video_transition', 'fusion',
] as const;

export type OperationType = typeof OPERATION_TYPES[number];
```

**Then update:**
- `stores/controlCenterStore.ts:42`
- `lib/api/controlCenter.ts:9`
- `stores/generationQueueStore.ts:16`
- All components using inline operation strings

#### 2. Fix `any` in `lib/api/generations.ts`

**Effort:** Low
**Impact:** High
**Files to change:** 1

```typescript
// Import existing types instead of using any:
import type {
  GenerationNodeConfig,
  SceneRef,
  PlayerContextSnapshot,
  GenerationSocialContext,
} from '@pixsim7/shared.types';
```

#### 3. Consolidate PanelCategory

**Effort:** Medium
**Impact:** High
**Files to change:** 4

Create `lib/panels/panelConstants.ts` and update:
- `lib/panels/panelRegistry.ts`
- `stores/panelConfigStore.ts`
- `components/panels/shared/PanelHeader.tsx`
- `components/layout/workspace-toolbar/AddPanelDropdown.tsx`

### Medium Priority

#### 4. Export GenerationStatus from Store

**Effort:** Low
**Impact:** Medium

```typescript
// stores/generationsStore.ts - add to exports
export { GenerationStatus, ACTIVE_STATUSES, TERMINAL_STATUSES };

// lib/api/controlCenter.ts - import and use
import { GenerationStatus } from '@/stores/generationsStore';
```

#### 5. ~~Create Canonical PromptBlock~~ DONE

**Effort:** Medium
**Impact:** Medium
**Files changed:** 6

Created `types/prompts.ts` with `ParsedBlock` + `PromptBlock` UI alias. See Phase 3.

#### 6. Create Analyzer Constants

**Effort:** Low
**Impact:** Medium

Create `lib/analyzers/constants.ts` with `ANALYZER_IDS`

### Lower Priority

#### 7. Type Panel Component Props

```typescript
// Instead of:
component: ComponentType<any>;

// Use:
interface PanelComponentProps {
  panelId: PanelId;
  context?: PanelContext;
}
component: ComponentType<PanelComponentProps>;
```

#### 8. Consider Zod Validation

Add runtime validation for API responses to catch backend schema changes early.

---

## Implementation Checklist

### Phase 1: Quick Wins - COMPLETED 2024-12-09

- [x] Export `OperationType` from `types/operations.ts`
- [x] Update `controlCenterStore.ts` to import `OperationType`
- [x] Update `controlCenter.ts` API to import `OperationType`
- [x] Update `mediaCardWidgets.tsx` to import `OperationType` (removed local definition)
- [x] Update `quickGenerateLogic.ts`, `useGenerationWorkbench.ts`, `useQuickGenerateBindings.ts`
- [x] Fix imports in `lib/api/generations.ts` (replace `any` with shared types)
- [x] Added `text_to_image` to OPERATION_TYPES (was missing)
- [x] Added `TextToImageParams` to discriminated union
- [x] Added helper functions: `isValidOperationType()`, `operationRequiresImage()`, `operationRequiresVideo()`
- [ ] Export `GenerationStatus` properly from `generationsStore.ts` (already centralized, needs re-export)

### Phase 2: Panel Consolidation - COMPLETED 2024-12-09

- [x] Create `lib/panels/panelConstants.ts`
- [x] Define `PANEL_CATEGORIES`, `CATEGORY_LABELS`, `CATEGORY_ORDER`
- [x] Added `CATEGORY_COLORS`, `getCategoryColorClasses()` for styling
- [x] Added `LEGACY_CATEGORY_MAP` and `normalizeCategory()` for backwards compat
- [x] Update `panelRegistry.ts` to import from constants
- [x] Update `panelConfigStore.ts` category field
- [x] Update `PanelHeader.tsx` category type
- [x] Update `AddPanelDropdown.tsx` to use constants

### Phase 3: Prompt Types - COMPLETED 2024-12-09

- [x] Create `types/prompts.ts` with canonical `ParsedBlock` (mirrors backend)
- [x] Define `PROMPT_BLOCK_ROLES` constant and `PromptBlockRole` type
- [x] Add `PromptBlock` as thin UI alias: `Pick<ParsedBlock, 'role' | 'text'> & { component_type?: }`
- [x] Add `toPromptBlock()` / `toPromptBlocks()` conversion helpers
- [x] Update `PromptBlocksViewer.tsx` to import from types (re-exports for compat)
- [x] Update `usePromptInspection.ts` import
- [x] Remove duplicate definition from `PromptLabDev.tsx`
- [x] Update `types/promptGraphs.ts` to re-export and use `PromptBlockRole`
- [x] Update `promptGraphBuilder.ts` to use typed roles

### Phase 4: Analyzer Constants (30 min)

- [ ] Create `lib/analyzers/constants.ts`
- [ ] Define `ANALYZER_IDS` and `DEFAULT_ANALYZER_ID`
- [ ] Update `promptSettingsStore.ts` to use constant
- [ ] Update `PromptsSettings.tsx` fallback

### Phase 5: Cleanup (ongoing)

- [ ] Remove remaining hardcoded operation type strings from components
- [ ] Replace `as any` casts with proper types
- [ ] Add ESLint rule to warn on `any` in new code
- [ ] Document type conventions in contributing guide

---

## Architecture Positives

Despite the issues identified, the codebase has several strong patterns:

1. **Clean Registry Pattern** - `BaseRegistry`, `PanelRegistry`, `ProviderCapabilityRegistry`
2. **Good Hook Abstractions** - `useProviderCapability`, `usePromptLimit`, etc.
3. **Backend/Frontend Alignment** - Schemas mostly match
4. **Discriminated Unions Exist** - `types/operations.ts` has proper pattern (just underused)
5. **Centralized Status Handling** - `generationsStore.ts` has good status utilities
6. **Plugin Architecture** - Panel plugin system with dependency resolution

---

## Related Documentation

- [Registry Patterns](./REGISTRY_PATTERNS.md)
- [Plugin Developer Guide](./systems/plugins/PLUGIN_DEVELOPER_GUIDE.md)
- [App Capability Registry](./APP_CAPABILITY_REGISTRY.md)
- [Panel Architecture](./archive/old-status/PANEL_ARCHITECTURE.md)
