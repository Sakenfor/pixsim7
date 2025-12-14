# Documentation Reorganization Plan

**Goal:** Consolidate, delete deprecated docs, and organize remaining 118 root-level docs into logical subfolders

---

## Proposed Folder Structure

```
docs/
├── README.md                          # Main entry point
├── DOCUMENTATION_AUDIT_REPORT*.md     # Keep at root
├── APP_MAP.md                         # Keep at root (canonical)
├── repo-map.md                        # Keep at root (reference)
│
├── architecture/                      # ✅ Already organized
│
├── narrative/                         # 🆕 NEW - Dialogue & story systems
│   ├── README.md
│   ├── ENGINE_SPECIFICATION.md        # CONSOLIDATED from SPEC+SCHEMA+USAGE
│   ├── ENGINE_USAGE.md                # Quick-start guide
│   ├── RUNTIME.md                     # Narrative runtime (moved from root)
│   ├── RUNTIME_MIGRATION.md           # Migration guide
│   └── PROMPTS/
│       ├── PROMPT_ENGINE_SPEC.md      # OLD - mark deprecated, to archive
│       ├── PROMPT_SCHEMA.md           # OLD - mark deprecated, to archive
│       └── ACTION_PROMPT_ENGINE_SPEC.md
│
├── actions/                           # 🆕 NEW - Action blocks & sequences
│   ├── README.md
│   ├── ACTION_BLOCKS_UNIFIED_SYSTEM.md
│   ├── ACTION_BLOCKS_I2I_EXTENSION.md
│   ├── ACTION_ENGINE_USAGE.md
│   └── ACTION_PROMPT_ENGINE_SPEC.md
│
├── game/                              # 🆕 NEW - Game systems & NPCs
│   ├── README.md
│   ├── NPC_INTERACTIVE_ZONES_DESIGN.md
│   ├── NPC_ZONE_TRACKING_SYSTEM.md
│   ├── NPC_RESPONSE_GRAPH_DESIGN.md
│   ├── NPC_RESPONSE_USAGE.md
│   ├── NPC_RESPONSE_VIDEO_INTEGRATION.md
│   ├── INTERACTION_AUTHORING_GUIDE.md
│   ├── INTERACTION_SYSTEM_MIGRATION.md
│   ├── INTERACTION_SYSTEM_REFACTOR.md
│   ├── INTERACTION_PLUGIN_MANIFEST.md
│   └── RELATIONSHIPS_AND_ARCS.md
│
├── stats-and-systems/                 # 🆕 NEW - Game mechanics
│   ├── README.md
│   ├── ABSTRACT_STAT_SYSTEM.md
│   ├── STAT_SYSTEM_INTEGRATION_PLAN.md
│   ├── ENTITY_STATS_EXAMPLES.md
│   ├── SOCIAL_METRICS.md
│   ├── RELATIONSHIP_MIGRATION_GUIDE.md
│   └── TURN_BASED_WORLD_MODE.md
│
├── ui/                                # 🆕 NEW - UI & presentation
│   ├── README.md
│   ├── HUD_LAYOUT_DESIGNER.md
│   ├── HUD_LAYOUT_PHASES_6-10_IMPLEMENTATION_GUIDE.md
│   ├── OVERLAY_POSITIONING_SYSTEM.md
│   ├── OVERLAY_DATA_BINDING.md
│   ├── OVERLAY_STRING_PATHS.md
│   ├── GIZMO_SURFACES_AND_DEBUG_DASHBOARDS.md
│   └── GAME_WORLD_DISPLAY_MODES.md
│
├── controls/                          # 🆕 NEW - Control systems
│   ├── README.md
│   ├── CONTROL_CUBES.md               # User-facing features only
│   ├── CUBE_SYSTEM_V2_PLUGIN.md       # Plugin internals
│   ├── CUBE_SYSTEM_DYNAMIC_REGISTRATION.md
│   ├── CONTROL_CENTER_PLUGIN_MIGRATION.md
│   └── CONTROL_CENTER_PLUGIN_ARCHITECTURE.md (if exists)
│
├── prompts/                           # 🆕 NEW - Prompt system
│   ├── README.md
│   ├── PROMPT_SYSTEM_REVIEW.md
│   ├── PROMPT_VERSIONING_SYSTEM.md
│   ├── PROMPTS_GIT_FEATURES.md
│   └── SONNET_PROMPT_INJECTION_GUIDE.md
│
├── comedy-panels/                     # 🆕 NEW - Scene display
│   ├── README.md
│   ├── COMIC_PANELS.md
│   └── reviews/
│       └── COMIC_PANELS_ARCHITECTURE_REVIEW.md
│
├── generation/                        # ✅ Already organized
│
├── systems/                           # ✅ Already organized
│
├── backend/                           # ✅ Already organized
│
├── guides/                            # ✅ Already organized
│
├── archive/                           # Move deprecated files here
│   ├── deprecated-narrative/
│   │   ├── NARRATIVE_PROMPT_ENGINE_SPEC.md
│   │   └── NARRATIVE_PROMPT_SCHEMA.md
│   ├── deprecated-sessions/
│   │   └── ACTION_ENGINE_SESSION_RESUME.md
│   └── old-implementations/
│       └── ... (existing archive content)
│
└── reference/                         # ✅ Planned, add content
    ├── SESSION_HELPER_REFERENCE.md
    ├── CHARACTER_REGISTRY.md
    ├── CHARACTER_LINKAGE_CONVENTIONS.md
    ├── DYNAMIC_NODE_TYPES.md
    ├── DYNAMIC_NODE_INSPECTOR.md
    ├── NODE_PLUGIN_AUTO_LOADING.md
    └── CAPABILITY_HOOKS.md
```

---

## Files to Delete / Move to Archive

**Files with deprecation headers (4):**
1. `ACTION_ENGINE_SESSION_RESUME.md` → archive/deprecated-sessions/
2. `NARRATIVE_PROMPT_ENGINE_SPEC.md` → archive/deprecated-narrative/
3. `NARRATIVE_PROMPT_SCHEMA.md` → archive/deprecated-narrative/
4. `docs/INDEX.md` → Don't need to keep (superseded by README.md)

**Files with old navigation headers (8 from Phase 1):**
1. `docs/architecture/INDEX.md` → archive/deprecated-navigation/
2. `docs/RECENT_CHANGES_2025_01.md` → archive/deprecated-status/
3. `docs/APP_MAP.md.bak` → archive/backups/
4. `docs/systems/plugins/README.md` → archive/deprecated-navigation/
5. `docs/systems/plugins/INDEX.md` → archive/deprecated-navigation/
6. `docs/systems/generation/README.md` → archive/deprecated-navigation/
7. `docs/systems/generation/INDEX.md` → archive/deprecated-navigation/

**Total files to move to archive: 12**

---

## Files to Consolidate/Merge

### Priority 1: Narrative System (HIGH)

**Currently separate:**
- `NARRATIVE_PROMPT_ENGINE_SPEC.md` (89 KB, design goals)
- `NARRATIVE_PROMPT_SCHEMA.md` (45 KB, JSON schema)
- `NARRATIVE_ENGINE_USAGE.md` (34 KB, API usage)

**Action:**
1. Create `docs/narrative/ENGINE_SPECIFICATION.md` consolidating all three
2. Reduce `docs/narrative/ENGINE_USAGE.md` to quick-start guide only
3. Move `NARRATIVE_RUNTIME.md` → `docs/narrative/RUNTIME.md`
4. Move `NARRATIVE_RUNTIME_MIGRATION.md` → `docs/narrative/RUNTIME_MIGRATION.md`

### Priority 2: Action System (MEDIUM)

**Currently separate:**
- `ACTION_ENGINE_USAGE.md`
- `ACTION_BLOCKS_UNIFIED_SYSTEM.md`
- `ACTION_BLOCKS_I2I_EXTENSION.md`
- `ACTION_PROMPT_ENGINE_SPEC.md`

**Action:**
1. Keep all separate but organize under `docs/actions/`
2. Create `docs/actions/README.md` with navigation
3. Move all four files into folder
4. Add cross-references between them

---

## Estimated Effort

| Task | Time | Risk |
|------|------|------|
| Create folder structure | 5 min | Low |
| Consolidate narrative docs (3→2) | 30 min | Medium |
| Move 12 files to archive | 10 min | Low |
| Move docs into new subfolders (20+ files) | 20 min | Low |
| Create README.md for each new folder | 15 min | Low |
| Update cross-references | 20 min | Medium |
| Update main README.md | 5 min | Low |
| **TOTAL** | **~105 min** | **Low** |

---

## Benefits of Reorganization

✅ **Better navigation:** Related docs grouped logically
✅ **Easier onboarding:** New developers see what's related
✅ **Cleaner root:** 118 → ~30 root-level files
✅ **Less duplication:** Consolidation eliminates redundancy
✅ **Future-proof:** Subfolders ready for expansion
✅ **Archive strategy:** Old docs preserved, not deleted
✅ **Clear structure:** Mirrors game systems organization

---

## Safety Measures

- ✅ Never delete files, only move to archive/
- ✅ Update all cross-references before committing
- ✅ Test that links still work after moves
- ✅ Single large commit with clear message
- ✅ Can be reverted if needed

---

## Recommended Execution Order

1. **Create archive subfolders** → Move deprecated files
2. **Create new doc subfolders** → Move related files
3. **Consolidate narrative docs** → Create ENGINE_SPECIFICATION.md
4. **Update all links and references** → Test navigation
5. **Create README.md for each new folder** → Provide navigation
6. **Update main docs/README.md** → Point to new structure
7. **Commit all changes** → Single comprehensive commit

---

*Reorganization Plan - Ready to execute*
