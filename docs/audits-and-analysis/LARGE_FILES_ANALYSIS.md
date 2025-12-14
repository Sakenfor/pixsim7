# Large Files Analysis

**Date:** 2025-11-20
**Purpose:** Identify large files that may benefit from refactoring/splitting

---

## ✅ Completed Refactorings

### game_dialogue.py → 6 Focused Modules (2025-11-20)

**Before:** Single 2179-line file mixing dialogue, actions, generation, NPC state, LLM cache, and analytics

**After:** Split into 6 focused modules:
```
api/v1/
├── dialogue.py        819 lines  (Dialogue execution: next-line, execute, debug)
├── actions.py         329 lines  (Action selection & playback)
├── generation.py      386 lines  (Action block generation & testing)
├── npc_state.py       ~470 lines (NPC memories, emotions, milestones, personality)
├── llm_cache.py       95 lines   (LLM cache management)
└── analytics.py       123 lines  (Dialogue analytics & metrics)
```

**Benefits:**
- Each module has a single, clear responsibility
- Easier to find and modify specific functionality
- Better code organization (narrative vs NPC state vs ops)
- Average file size reduced from 2179 → ~370 lines per module

**Updated:** `api/v1/__init__.py` to import all new routers

---

### context.py → 7 Capability Modules (2025-11-20)

**Before:** Single 1324-line file with all plugin capability APIs

**After:** Split into capability modules + orchestrator:
```
infrastructure/plugins/
├── context.py              109 lines  (PluginContext orchestrator)
├── context_base.py          61 lines  (BaseCapabilityAPI)
├── capabilities/
│   ├── __init__.py          20 lines  (Re-exports)
│   ├── world.py            180 lines  (WorldReadAPI)
│   ├── session.py          256 lines  (SessionReadAPI + SessionMutationsAPI)
│   ├── components.py       378 lines  (ComponentAPI - ECS operations)
│   ├── behaviors.py        300 lines  (BehaviorExtensionAPI - registration)
│   └── logging.py           67 lines  (LoggingAPI)
```

**Benefits:**
- Each capability API has a dedicated module
- PluginContext is now a clean orchestrator (~100 lines)
- Easier to find and maintain specific capabilities
- Better separation of concerns (world vs session vs components)
- Average file size: ~200 lines per capability module

**Updated:** No external imports needed updating (PluginContext still exported from context.py)

---

### schemas.py → 5 Domain Schema Modules (2025-11-20)

**Before:** Single 1453-line file with all game configuration schemas

**After:** Split into domain-specific schema modules:
```
domain/game/schemas/
├── __init__.py           150 lines  (Re-exports)
├── relationship.py       464 lines  (Relationship tiers, intimacy, mood, reputation)
├── behavior.py           486 lines  (Activities, routines, conditions, effects, scoring)
├── components.py         182 lines  (ECS component schemas)
├── metrics.py             60 lines  (Metric definitions)
└── simulation.py         298 lines  (Game state, scheduler, turn config, profiles)
```

**Benefits:**
- Domain-focused modules (relationship vs behavior vs components)
- Easier to find specific schema types
- Better organization for configuration schemas
- Average file size: ~290 lines per module
- Backward compatibility maintained via schemas.py re-exports

**Updated:** schemas.py now a compatibility layer re-exporting from schemas/ package

---

### prompts.py → 5 Focused Modules (2025-11-20)

**Before:** Single 1058-line file with 26 routes across multiple prompt management phases

**After:** Split into focused modules:
```
api/v1/prompts/
├── __init__.py           26 lines  (Router aggregation)
├── schemas.py           100 lines  (Request/Response models)
├── families.py          316 lines  (Family & Version CRUD endpoints)
├── variants.py          129 lines  (Variant feedback & ratings)
├── analytics.py         152 lines  (Diff, compare, analytics)
└── operations.py        410 lines  (Batch, import/export, search, templates, validation)
```

**Benefits:**
- AI agents can read entire focused modules without context truncation
- Clear intent from filenames (analytics.py vs scrolling through 1058 lines)
- Multiple agents can work on different modules simultaneously
- Average file size: ~190 lines per module vs 1058 lines
- Better navigation for autonomous AI exploration
- Backward compatibility maintained via prompts.py re-export

**Updated:** prompts.py now a compatibility layer re-exporting from prompts/ package

---

### prompt_version_service.py → 4 Focused Services (2025-11-20)

**Before:** Single 1212-line "God Object" service mixing 12 different responsibilities

**After:** Split into focused services:
```
services/prompts/
├── family_service.py        207 lines (Families & versions CRUD)
├── variant_service.py        212 lines (Variant feedback & metrics)
├── analytics_service.py      318 lines (Diff, compare, analytics)
└── operations_service.py     547 lines (Batch, import/export, inference, search, templates, validation)
```

**Benefits:**
- Single responsibility per service (no more God Object)
- AI agents load ~250 lines vs 1200+ lines
- Clear dependencies and boundaries
- Better testability and maintainability
- Backward compatibility via PromptVersionService composition

**Updated:** prompt_version_service.py now composes all 4 services for backward compatibility

---

### asset_service.py → 4 Focused Services (2025-11-20)

**Before:** Single 1164-line "God Object" service mixing 10 different responsibilities

**After:** Split into focused services:
```
services/asset/
├── core_service.py           404 lines (CRUD, search, listing, deletion)
├── sync_service.py           441 lines (Download mgmt, sync, provider ops)
├── enrichment_service.py     280 lines (Recognition, embedded extraction, paused frames)
└── quota_service.py           99 lines (User quotas, storage tracking, deduplication)
```

**Benefits:**
- Clear separation of concerns (CRUD vs sync vs enrichment vs quotas)
- AI agents can work on specific aspects without loading entire service
- Easier to understand and modify focused services
- Better for parallel development
- Backward compatibility via AssetService composition

**Updated:** asset_service.py now composes all 4 services for backward compatibility

---

### services/generation/generation_service.py → 4 Focused Services (2025-11-20)

**Before:** Single 1097-line "God Object" service mixing 10+ different responsibilities

**After:** Split into focused services:
```
services/generation/
├── creation_service.py      545 lines (Creation, validation, canonicalization)
├── lifecycle_service.py     252 lines (Status transitions & event publishing)
├── query_service.py         197 lines (Retrieval & listing operations)
└── retry_service.py         192 lines (Retry logic & auto-retry detection)
```

**Benefits:**
- Single responsibility per service (no more God Object)
- AI agents load ~245 lines vs 1097 lines (77% reduction)
- Clear dependencies and boundaries
- Better testability and maintainability
- Backward compatibility via GenerationService composition layer

**Updated:** generation_service.py now composes all 4 services (197 lines) for backward compatibility

---

## Top 10 Largest Files

| File | Lines | Type | Status |
|------|-------|------|--------|
| `api/v1/game_dialogue.py` | 2179 | API Routes | ✅ **SPLIT** - Done into 6 modules |
| `domain/game/schemas.py` | 1453 | Pydantic Schemas | ✅ **SPLIT** - Done into 5 domain modules |
| `infrastructure/plugins/context.py` | 1324 | Plugin APIs | ✅ **SPLIT** - Done into 7 capability modules |
| `services/prompts/prompt_version_service.py` | 1212 | Service | ✅ **SPLIT** - Done into 4 services |
| `services/asset/asset_service.py` | 1164 | Service | ✅ **SPLIT** - Done into 4 services |
| `plugins/game_dialogue/manifest.py` | 1139 | Plugin Manifest | 🟢 **OK** - Plugin-specific, self-contained |
| `services/generation/generation_service.py` | 1097 | Service | ✅ **SPLIT** - Done into 4 services (2025-11-20) |
| `api/v1/prompts.py` | 1058 | API Routes | ✅ **SPLIT** - Done into 5 focused modules |
| `services/provider/adapters/pixverse.py` | 1023 | Provider Adapter | 🟢 **OK** - External API adapter |
| `domain/game/ecs.py` | 922 | Domain Logic | 🟢 **OK** - Already cleaned up |

**Summary:** All major God Objects have been refactored! Average module size reduced to ~200-400 lines, perfect for AI agent context windows. 🎉

---

## Detailed Analysis

### 🔴 Priority 1: api/v1/game_dialogue.py (2179 lines)

**Problem:** Mixes multiple concerns in one file:
- Dialogue system routes (next-line, execute, debug)
- Action selection routes
- Action generation routes
- Creature interaction routes
- Test endpoints
- ~20+ Pydantic request/response schemas

**Recommendation:** Split into multiple files:

```
api/v1/game_dialogue/
├── __init__.py           # Re-export all routers
├── dialogue.py           # Dialogue routes (next-line, execute, debug)
├── actions.py            # Action selection & next routes
├── generation.py         # Generation routes (generate, test)
├── schemas/
│   ├── __init__.py
│   ├── dialogue.py       # DialogueNextLineRequest, etc.
│   ├── actions.py        # ActionSelectionRequest, etc.
│   └── generation.py     # GenerateActionBlockRequest, etc.
```

**Benefit:**
- Each file ~300-500 lines
- Clear separation of concerns
- Easier to find specific routes
- Easier to test individual modules

**Effort:** Medium (half day)

---

### 🟡 Priority 2: infrastructure/plugins/context.py (1324 lines)

**Current Structure:**
```
Class                    Lines   Purpose
ComponentAPI              378    ECS component operations
BehaviorExtensionAPI      301    Register conditions, effects, scoring
WorldReadAPI              169    Read world data
SessionMutationsAPI       158    Modify session state
SessionReadAPI            101    Read session data
PluginContext              78    Main context orchestrator
LoggingAPI                 53    Plugin logging
BaseCapabilityAPI          53    Base class
```

**Problem:** Multiple plugin capability APIs in one file

**Recommendation:** Split by capability domain:

```
infrastructure/plugins/
├── context.py            # Keep PluginContext + BaseCapabilityAPI (~130 lines)
├── capabilities/
│   ├── __init__.py
│   ├── world.py          # WorldReadAPI
│   ├── session.py        # SessionReadAPI + SessionMutationsAPI
│   ├── components.py     # ComponentAPI
│   ├── behaviors.py      # BehaviorExtensionAPI
│   └── logging.py        # LoggingAPI
```

**Benefit:**
- Each capability file ~150-400 lines
- Easier to find specific capability
- Can test capabilities independently
- PluginContext becomes clean orchestrator

**Effort:** Medium (half day)

---

### 🟡 Priority 3: domain/game/schemas.py (1453 lines)

**Problem:** All Pydantic schemas for game domain in one file

**Current Contents:**
- World schemas (World, WorldMeta, WorldSimulationConfig)
- Session schemas (GameSession, SessionFlags)
- NPC schemas (NPC, NPCInstance, NPCSessionState)
- Relationship schemas (Relationship, RelationshipDelta)
- Interaction schemas (Interaction, InteractionOutcome)
- Activity schemas (Activity, ActivityEffects)
- Generation schemas (Generation, GenerationRequest)
- Dialogue schemas (DialogueSegment, ActionBlock)
- ECS component schemas (7+ component types)

**Recommendation:** Split by domain entity:

```
domain/game/schemas/
├── __init__.py           # Re-export all schemas
├── world.py              # World, WorldMeta, WorldSimulationConfig
├── session.py            # GameSession, SessionFlags
├── npc.py                # NPC, NPCInstance, NPCSessionState
├── relationships.py      # Relationship, RelationshipDelta
├── interactions.py       # Interaction, InteractionOutcome
├── activities.py         # Activity, ActivityEffects
├── generation.py         # Generation, GenerationRequest
├── dialogue.py           # DialogueSegment, ActionBlock
└── components.py         # All ECS component schemas
```

**Benefit:**
- Each file ~100-200 lines
- Import only what you need
- Easier to find specific schema
- Clearer domain boundaries

**Downside:**
- Might complicate imports if schemas reference each other
- Need to be careful about circular dependencies

**Effort:** Medium-Large (1 day) - Need to handle cross-references carefully

---

### 🟢 Remaining Large Files (Acceptable)

**pixverse.py (1023 lines)**
- External API adapter
- Lots of response parsing logic
- Single responsibility (Pixverse API)
- Would be hard to split meaningfully

**plugins/game_dialogue/manifest.py (1139 lines)**
- Plugin-specific, self-contained
- Includes dialogue generation, action blocks, NPC state
- Cohesive plugin implementation
- No need to split

**ecs.py (922 lines)**
- Already cleaned up COMPONENT_SCHEMAS
- Single domain (ECS operations)
- Helper functions well-organized
- Good comments

---

## Refactoring Complete! 🎉

### What Was Achieved

✅ **All God Objects Eliminated:**
- 7 major services/files split into focused modules
- Average file size reduced from 1000+ to ~200-400 lines
- 77% reduction in average module size

✅ **Benefits Realized:**
- AI agents can now load entire modules without truncation
- Better code organization and navigation
- Improved testability and maintainability
- Zero breaking changes (backward compatibility via composition)
- Clearer separation of concerns
- Easier parallel development

✅ **Architectural Improvements:**
- Single responsibility principle enforced
- Clean dependency boundaries
- Composition over inheritance
- Focused, testable units

---

## General Guidelines

**When to split:**
- File > 800 lines AND multiple clear domains
- File > 1200 lines regardless
- Many unrelated routes/classes in one file
- Hard to find specific functionality

**When NOT to split:**
- Single cohesive service (even if large)
- External API adapter
- Well-organized with clear structure
- Splitting would create circular dependencies

**Split strategies:**
1. **By domain** - game_dialogue → dialogue, actions, generation
2. **By capability** - context → world, session, components
3. **By entity** - schemas → world, npc, relationships
4. **By route group** - prompts → versions, templates, management

---

## Implementation Plan

If proceeding with splits, recommended order:

**Phase 1: game_dialogue.py** (Highest impact)
1. Create `api/v1/game_dialogue/` directory
2. Split routes into dialogue.py, actions.py, generation.py
3. Split schemas into schemas/ subdirectory
4. Update imports in other files
5. Test all routes still work

**Phase 2: context.py** (Better plugin organization)
1. Create `infrastructure/plugins/capabilities/` directory
2. Move each API class to separate file
3. Update PluginContext to import from capabilities
4. Test plugin loading still works

**Phase 3: schemas.py** (Optional, if needed)
1. Create `domain/game/schemas/` directory
2. Move related schemas to separate files
3. Carefully handle forward references
4. Update __init__.py to re-export
5. Update all imports throughout codebase

---

## Metrics

**Before Refactoring:**
- Largest file: 2179 lines
- Files > 1000 lines: 8 files
- Files > 800 lines: 15 files

**Target After Phase 1-2:**
- Largest file: ~1200 lines (schemas.py)
- Files > 1000 lines: 2-3 files
- Average file size: ~300-500 lines for split modules

---

## Notes

- All recommendations maintain backward compatibility via __init__.py re-exports
- No breaking API changes required
- Can be done incrementally
- Test coverage will help ensure nothing breaks during splits
