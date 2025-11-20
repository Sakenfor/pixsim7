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

## Top 10 Largest Files

| File | Lines | Type | Recommendation |
|------|-------|------|----------------|
| `api/v1/game_dialogue.py` | 2179 | API Routes | 🔴 **Split** - Multiple domains mixed |
| `domain/game/schemas.py` | 1453 | Pydantic Schemas | 🟡 **Maybe Split** - Schema file, but very large |
| `infrastructure/plugins/context.py` | 1324 | Plugin APIs | 🟡 **Maybe Split** - Multiple API classes |
| `services/prompts/prompt_version_service.py` | 1212 | Service | 🟡 **Review** - Single service, may be cohesive |
| `services/asset/asset_service.py` | 1164 | Service | 🟡 **Review** - Single service, may be cohesive |
| `plugins/game_dialogue/manifest.py` | 1139 | Plugin Manifest | 🟢 **OK** - Plugin-specific, self-contained |
| `services/generation/generation_service.py` | 1097 | Service | 🟢 **OK** - Already well-structured |
| `api/v1/prompts.py` | 1058 | API Routes | 🟡 **Maybe Split** - Lots of routes |
| `services/provider/adapters/pixverse.py` | 1023 | Provider Adapter | 🟢 **OK** - External API adapter |
| `domain/game/ecs.py` | 922 | Domain Logic | 🟢 **OK** - Already cleaned up |

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

### 🟢 OK Files (Don't Need Splitting)

**generation_service.py (1097 lines)**
- Single cohesive service
- Already well-structured with helper methods
- Clear separation of phases (Phase 1-10 comments)
- No mixed concerns

**ecs.py (922 lines)**
- Already cleaned up COMPONENT_SCHEMAS
- Single domain (ECS operations)
- Helper functions well-organized
- Good comments

**pixverse.py (1023 lines)**
- External API adapter
- Lots of response parsing logic
- Single responsibility (Pixverse API)
- Would be hard to split meaningfully

---

## Recommendations Summary

### Do Now (High Value, Medium Effort)

1. **Split `api/v1/game_dialogue.py`** (2179 → ~400 lines/file)
   - Clear domain separation already exists
   - Will make debugging much easier
   - Effort: Half day

### Do Soon (Medium Value, Medium Effort)

2. **Split `infrastructure/plugins/context.py`** (1324 → ~200 lines/file)
   - Improves plugin capability organization
   - Makes testing easier
   - Effort: Half day

### Consider Later (Lower Priority)

3. **Split `domain/game/schemas.py`** (1453 → ~150 lines/file)
   - Need to carefully handle cross-references
   - Current organization isn't blocking development
   - Effort: 1 day

### Don't Split

- `generation_service.py` - Already well-structured
- `ecs.py` - Just cleaned up, cohesive
- Provider adapters - Single external API per file
- Plugin manifests - Self-contained per plugin

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
