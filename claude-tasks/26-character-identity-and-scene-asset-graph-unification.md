**Task: Character Identity & Scene–Asset Graph Unification**

> **For Agents (How to use this file)**
> - This task is about unifying how characters, NPCs, scenes, and assets relate to each other.
> - The goal is a coherent **character identity graph** that:
>   - Connects character templates ⇄ character instances ⇄ game NPCs ⇄ scenes ⇄ assets ⇄ generations.  
>   - Makes it easy to answer questions like:
>     - “Where is this character used?”  
>     - “Which assets belong to this scene/arc?”  
>     - “Which generation jobs produced content for this character/scene?”
> - Read these first:
>   - `pixsim7_backend/domain/character.py` and `character_integrations.py`  
>   - `pixsim7_backend/infrastructure/database/migrations/20251118_1200_add_character_registry.py`  
>   - `pixsim7_backend/infrastructure/database/migrations/20251118_1300_add_character_integrations.py`  
>   - `docs/INTIMACY_SCENE_COMPOSER.md` and scene graph docs  
>   - Generation model docs (`docs/DYNAMIC_GENERATION_FOUNDATION.md`).

---

## Context

You already have partial pieces:

- **Character registry tables**:
  - `characters` – character templates (IDs, traits, voice profiles, tags).  
  - `character_relationships` – relationships between characters.  
  - `character_usage` – where characters are used (prompt versions, action blocks).
- **Character–world–NPC integration**:
  - `character_instances` – per-world instances of characters.  
  - `character_npc_links` – links between character instances and `GameNPC`s.
- **Scenes & assets**:
  - `GameScene` and scene graph types (roles, nodes, media).  
  - `assets` and `generations` tables with lineage and prompt versioning.

But there is no single **graph model** that:

- Binds all of this into a navigable identity graph.  
- Gives tools a unified way to show “this character, across all worlds and content.”

**Goal:** Introduce a light-weight **Character Identity Graph** abstraction and APIs, backed by existing tables, that:

- Keeps `characters` as templates and `character_instances` as world-scoped identities.  
- Clarifies how instances link to `GameNPC`s and scenes.  
- Tracks which assets/generations belong to which character/scene/arc.  
- Powers future tools (character browser, usage analytics, consistency checks).

---

## Phase Checklist

- [ ] **Phase 26.1 – Inventory Current Character/Scene/Asset Links**
- [ ] **Phase 26.2 – Character Identity Graph Model (Conceptual)**
- [ ] **Phase 26.3 – Backend Graph Access & Query APIs**
- [ ] **Phase 26.4 – Scene & Asset Linkage (Roles & Tags)**
- [ ] **Phase 26.5 – Tools & Usage Views**

---

## Phase 26.1 – Inventory Current Character/Scene/Asset Links

**Goal**  
Map all existing places where characters, NPCs, scenes, and assets reference each other.

**Scope**

- Character tables & services.  
- Game NPCs (`GameNPC` + `GameNPC.meta`).  
- Scenes (`GameScene`, scene graph nodes).  
- Assets & generations.

**Key Steps**

1. Identify:
   - Where characters are linked to NPCs (`character_npc_links`).  
   - How scenes reference NPCs or “roles” (scene role bindings, NPC IDs in nodes).  
   - How assets/generations carry character-related metadata (tags, prompt variables).  
2. Document:
   - Any conventions used today for IDs and tags (e.g. `npc:alex`, `character:gorilla_01`).  
   - Any mismatches (where scenes hardcode NPC IDs instead of roles, etc.).
3. Add an “Inventory Summary” at the bottom of this file (table: Entity → Links → Notes).

**Status:** ☐ Not started

---

## Phase 26.2 – Character Identity Graph Model (Conceptual)

**Goal**  
Define a conceptual graph model that treats characters, instances, NPCs, scenes, and assets as nodes with typed edges.

**Scope**

- Conceptual model + TypeScript type(s) for querying; no DB changes.

**Key Steps**

1. Define node types:
   - `CharacterTemplate` (from `characters`).  
   - `CharacterInstance` (from `character_instances`).  
   - `GameNPC` (from `game_npcs`).  
   - `Scene` / `SceneRole` (from GameScene + scene graph).  
   - `Asset` (from `assets`).  
   - `Generation` (from `generations`).  
   - Optional: `PromptVersion`, `ActionBlock`.
2. Define edge types:
   - `template -> instance` (character instantiation per world).  
   - `instance -> npc` (synchronization link).  
   - `instance/template -> sceneRole` (this character fills role X in scenes).  
   - `scene -> asset` / `scene -> generation` (content created for that scene).  
   - `character -> usage` (via `character_usage`, prompt_versions, action_blocks).
3. Create a TS interface, e.g. `CharacterGraphNode` / `CharacterGraphEdge`, in `packages/types/src/characterGraph.ts`, for tooling to consume.

**Status:** ☐ Not started

---

## Phase 26.3 – Backend Graph Access & Query APIs

**Goal**  
Provide backend functions and APIs to query the identity graph.

**Scope**

- Domain module, e.g. `pixsim7_backend/domain/character_graph.py`.  
- Optional route plugin (admin-only) to query/inspect graph.

**Key Steps**

1. Implement core queries:
   - `get_character_graph(character_id)` – returns all instances, NPCs, scenes, and assets linked to a character.  
   - `find_characters_for_npc(npc_id)` – returns linked template/instances.  
   - `find_scenes_for_character(character_template_id | character_instance_id)` – scenes where character appears (via roles or direct IDs).  
   - `find_assets_for_character(character_template_id | character_instance_id)` – assets/generations tagged or linked to the character.  
2. Implement filtering:
   - By world, arc/quest tag, or content rating.  
3. Consider an admin-only route plugin:

```python
@router.get("/character-graph/{character_id}")
async def get_character_graph_route(character_id: str): ...
```

for tooling use.

**Status:** ☐ Not started

---

## Phase 26.4 – Scene & Asset Linkage (Roles & Tags)

**Goal**  
Ensure scenes and assets/generations link to characters via clear, consistent mechanisms.

**Scope**

- Scene graph role bindings, scene metadata.  
- Asset/generation metadata & tags.

**Key Steps**

1. Scenes:
   - Reinforce existing convention: scenes refer to **roles** (e.g. `protagonist`, `love_interest`), not hard-coded NPC IDs.  
   - World/meta binds roles to `CharacterInstance` or `GameNPC`.  
   - Optionally enrich `GameScene.meta` with character role information.
2. Assets/generations:
   - Encourage tagging assets/generations with:
     - `character_template_id` and/or `character_instance_id`.  
     - `scene_id` and `scene_node_id`, when applicable.  
   - This can be in structured `metadata` JSON, not new columns, as long as it’s consistent.
3. Update `character_usage` logic:
   - Expand beyond prompt versions/action blocks to also track usage in:
     - Scenes.  
     - Generations/assets (via metadata).

**Status:** ☐ Not started

---

## Phase 26.5 – Tools & Usage Views

**Goal**  
Expose the identity graph in tools so designers and engineers can see character usage and consistency.

**Scope**

- Frontend/editor tools; optional admin UIs.

**Key Steps**

1. Character Browser:
   - A UI (or extension of existing tools) that, given a character:
     - Shows all instances by world.  
     - Lists linked NPCs and scenes.  
     - Shows associated assets/generations.  
2. Scene/Arc views:
   - For a given scene or arc, show:
     - Which characters and instances appear.  
     - Their relationships (from `character_relationships`).  
3. Consistency checks:
   - Optional: add validations/scanner that can flag:
     - Scenes that refer to NPCs not linked to characters where expected.  
     - Assets that lack character tags for scenes that should be character-specific.

**Status:** ☐ Not started

---

## Success Criteria

By the end of this task:

- You can pick a character template and see:
  - All world instances.  
  - All linked NPCs.  
  - All scenes, assets, and generations associated with that character.  
  - Any registered character–character relationships that matter for arcs.
- Scenes refer to characters via roles and world bindings, not hard-coded NPC IDs, and those bindings feed into the graph.  
- Assets and generations related to characters/scenes are discoverable via consistent metadata and graph queries.  
- This identity graph is **queryable** by tools and can be extended over time (e.g., to drive analytics or consistency checks) without changing core table schemas.***
