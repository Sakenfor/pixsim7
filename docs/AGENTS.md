# Agent Guidelines for PixSim7

This document provides guidance for AI agents and automated tools working on the PixSim7 codebase.

---

## Game / World / Scene Editor Work

If you're working on game systems, world/location editing, scene graphs, 2D gameplay, or NPC behavior, **start here**.

### Core Design Principles

Follow these rules when working on game features:

1. **Don't change database schemas**
   - Core models (`GameWorld`, `GameLocation`, `GameHotspot`, `GameScene`, `GameSession`, `GameNPC`) are generic
   - Extend behavior via JSON fields: `meta`, `flags`, `relationships`
   - New features should use conventions in these fields, not new columns

2. **Scenes are world-agnostic**
   - `GameScene` and `Scene` (from `@pixsim7/types`) should not hard-depend on specific worlds or NPCs
   - Use **roles** (`Scene.meta.cast`) for character references, not hard NPC IDs
   - Worlds bind roles to NPCs at runtime via `meta.npc_bindings`
   - Only use `npc_id` on scene nodes for identity-specific content (e.g., "Anete walking" clip)

3. **NPC expressions are for UI surfaces**
   - `NpcExpression` is scoped to small UI elements: portraits, dialog boxes, reaction clips
   - Full-screen or cinematic video content goes in `SceneNode.media` or `GameNPC.meta.identity.clips`
   - Don't use `NpcExpression` for large-scale or full-body content

4. **Frontend-driven schemas**
   - Backend stores generic JSON; frontend validates and interprets via TypeScript types
   - Hotspot actions live in `action` and are validated by `parseHotspotAction`
   - Scene playback phases are derived from runtime state, not stored
   - Relationship tiers/scales are defined per-world in `GameWorld.meta`, not hard-coded

5. **Session state conventions**
   - Use `GameSession.flags` for quest/arc progress, inventory, events
     - Example: `flags.arcs.main_romance_alex.stage = 2`
     - Example: `flags.inventory.items = [{ id: "flower", qty: 1 }]`
   - Use `GameSession.relationships` for NPC affinity/trust
     - Example: `relationships["npc:12"].affinity = 72`
   - Namespace keys to avoid clashes (e.g., `npc:${id}`, `arc:${id}`)

### Required Reading by Task Type

**If you're editing 2D gameplay (hotspots, actions, playback):**
- Read: `docs/game-systems/HOTSPOT_ACTIONS_2D.md`
- Read: `docs/game/RELATIONSHIPS_AND_ARCS.md`
- Reference: `docs/game-systems/SYSTEM_OVERVIEW.md`

**If you're editing the scene graph / node editor:**
- Read: `docs/game-systems/NODE_EDITOR_DEVELOPMENT.md`
- Read: `docs/game-systems/GRAPH_UI_LIFE_SIM_PHASES.md`
- Reference: `docs/game-systems/SYSTEM_OVERVIEW.md`

**If you're editing NPC behavior / world systems:**
- Read: `docs/game/RELATIONSHIPS_AND_ARCS.md`
- Read: `docs/game-systems/GRAPH_UI_LIFE_SIM_PHASES.md`
- Reference: `docs/game-systems/SYSTEM_OVERVIEW.md`

**If you're editing 3D display modes:**
- Read: `docs/ui/GAME_WORLD_DISPLAY_MODES.md`
- Reference: `docs/game-systems/SYSTEM_OVERVIEW.md`

### Key Files by System

**Scene Editor:**
- `apps/main/src/features/graph/components/arc-graph/ArcGraphPanel.tsx` - Graph canvas (primary)
- `apps/main/src/components/legacy/GraphPanel.tsx` - Graph canvas (legacy)
- `apps/main/src/features/scene/components/panels/SceneBuilderPanel.tsx` - Property inspector
- `apps/main/src/modules/scene-builder/index.ts` - Draft model
- `packages/types/src/index.ts` - Shared Scene types

**2D Game Preview:**
- `apps/main/src/routes/Game2D.tsx` - Playtest environment
- `apps/main/src/lib/game/interactionSchema.ts` - Action parsing
- `apps/main/src/lib/game/session.ts` - Session helpers

**Backend APIs:**
- `pixsim7/backend/main/api/v1/game_worlds.py` - Worlds and state
- `pixsim7/backend/main/api/v1/game_sessions.py` - Session CRUD
- `pixsim7/backend/main/api/v1/game_npcs.py` - NPCs, schedules, presence

**Shared Packages:**
- `packages/types/` – Shared TypeScript types
- `packages/ui/` – Reusable UI components
- `packages/game-ui/` – ScenePlayer component

### Quick Reference Links

**Documentation:**
- `docs/game-systems/SYSTEM_OVERVIEW.md` - **Start here** for high-level map of all game systems
- `docs/game-systems/HOTSPOT_ACTIONS_2D.md` - Hotspot actions and scene playback
- `docs/game/RELATIONSHIPS_AND_ARCS.md` - Relationships, arcs, quests, session state
- `docs/game-systems/GRAPH_UI_LIFE_SIM_PHASES.md` - World/life-sim integration with graph editor
- `docs/game-systems/NODE_EDITOR_DEVELOPMENT.md` - Scene editor architecture and roadmap
- `docs/ui/GAME_WORLD_DISPLAY_MODES.md` - 2D/3D display modes

**Component READMEs:**
- `apps/main/src/components/README.md` - GraphPanel, SceneBuilderPanel, WorldContextSelector
- `apps/main/src/lib/game/README.md` - interactionSchema.ts, session.ts

---

## General Development Guidelines

### Code Style

- Follow existing TypeScript/Python conventions in the codebase
- Use existing `@pixsim7/ui` components for consistent styling
- Maintain type safety; avoid `any` types where possible
- Add JSDoc comments for exported functions and complex logic

### Testing

- Add unit tests for new helper functions and validation logic
- Test edge cases (empty arrays, null values, malformed JSON)
- Manual testing required for UI changes (scene editor, 2D preview)

### Documentation

- Update relevant docs when adding features or changing behavior
- Keep docs concise; prefer bullet lists and explicit "If you're doing X, read Y" guidance
- Cross-link docs where helpful; avoid duplicating content
- Update `docs/game-systems/SYSTEM_OVERVIEW.md` if you add new major concepts

### Git Workflow

- Create feature branches for new work
- Write clear, descriptive commit messages
- Reference issue numbers in commits where applicable
- Keep commits focused and atomic

---

## When in Doubt

1. Check `docs/game-systems/SYSTEM_OVERVIEW.md` for high-level guidance
2. Read the specific doc for the system you're working on
3. Look at existing code patterns for similar features
4. Ask the user for clarification on ambiguous requirements

**Remember:** The game systems are designed to be flexible and data-driven. Prefer configuration over code changes, and extend via JSON fields rather than new database columns.
