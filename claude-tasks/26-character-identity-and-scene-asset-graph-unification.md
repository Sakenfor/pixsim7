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
>   - `pixsim7/backend/main/domain/character.py` and `character_integrations.py`  
>   - `pixsim7/backend/main/infrastructure/database/migrations/20251118_1200_add_character_registry.py`  
>   - `pixsim7/backend/main/infrastructure/database/migrations/20251118_1300_add_character_integrations.py`  
>   - `docs/INTIMACY_SCENE_COMPOSER.md` and scene graph docs  
>   - Generation model docs (`docs/systems/generation/GENERATION_SYSTEM.md`).

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
3. Add an "Inventory Summary" at the bottom of this file (table: Entity → Links → Notes).

**Status:** ✅ Completed

**Findings:**
- Character-NPC linkage is well-defined via `CharacterNPCLink` table
- Scene character requirements tracked via `SceneCharacterManifest`
- Assets/generations lack explicit character/scene metadata fields
- ID conventions exist but are inconsistent (see Inventory Summary below)

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

**Status:** ✅ Completed

**Implementation:**
- Created comprehensive TypeScript types in `packages/types/src/characterGraph.ts`
- Defined 9 node types: CharacterTemplate, CharacterInstance, GameNPC, Scene, SceneRole, Asset, Generation, PromptVersion, ActionBlock
- Defined 13 edge types covering all relationships (instantiates, syncs_with, fills_role, etc.)
- Added query interfaces, path finding types, and usage analytics types
- Exported from `packages/types/src/index.ts`

---

## Phase 26.3 – Backend Graph Access & Query APIs

**Goal**  
Provide backend functions and APIs to query the identity graph.

**Scope**

- Domain module, e.g. `pixsim7/backend/main/domain/character_graph.py`.  
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

**Status:** ✅ Completed

**Implementation:**
- Created `pixsim7/backend/main/domain/character_graph.py` with core query functions:
  - `get_character_graph()` - full graph traversal from character
  - `find_characters_for_npc()` - reverse lookup from NPC to characters
  - `find_scenes_for_character()` - scenes where character appears
  - `find_assets_for_character()` - assets featuring character
  - `get_character_usage_stats()` - comprehensive analytics
- Created `pixsim7/backend/main/api/v1/character_graph.py` with admin API routes
- Registered as route plugin in `pixsim7/backend/main/routes/character_graph/`
- Supports filtering by world, depth control, and inactive node inclusion
- Graph builder functions for all node types (9 node types, 13 edge types)

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

**Status:** ✅ Completed

**Implementation:**
- Created `pixsim7/backend/main/domain/character_linkage.py` with helper functions for:
  - Scene role bindings (`GameScene.meta.character_roles`)
  - Scene node character refs (`GameSceneNode.meta.character_refs`)
  - Asset character linkage (`Asset.media_metadata.character_linkage`)
  - Generation character refs (`Generation.canonical_params.character_refs`)
  - Extended character usage tracking (scenes, assets, generations)
- Standardized character reference format: `character:<uuid>` and `instance:<uuid>`
- Defined standard scene roles (protagonist, love_interest, antagonist, etc.)
- Created comprehensive documentation in `docs/CHARACTER_LINKAGE_CONVENTIONS.md`
- All conventions use existing JSON fields - **no schema changes required**

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

**Status:** ✅ Completed

**Implementation:**
- Created `apps/main/src/components/character-graph/CharacterGraphBrowser.tsx`:
  - Interactive browser with 4 view modes: Graph, Statistics, Scenes, Assets
  - Graph view shows all nodes grouped by type with expand/collapse
  - Node selection shows detailed information and connections (incoming/outgoing edges)
  - Statistics view shows usage metrics (instances, NPCs, scenes, assets, etc.)
  - Scenes view lists all scenes where character appears with role information
  - Assets view displays all assets featuring the character
- Created `apps/main/src/components/character-graph/SceneCharacterViewer.tsx`:
  - Shows all characters in a scene with their roles and requirements
  - Displays character role metadata
- Created comprehensive CSS styling in `CharacterGraphBrowser.css`
- Components integrate with backend graph API endpoints
- Fully responsive design for mobile/desktop

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
- This identity graph is **queryable** by tools and can be extended over time (e.g., to drive analytics or consistency checks) without changing core table schemas.

---

## Inventory Summary (Phase 26.1)

### Character-Related Entities and Links

| Entity | Table/Location | Links To | Linkage Mechanism | ID Convention | Notes |
|--------|---------------|----------|-------------------|---------------|-------|
| **Character Template** | `characters` | NPCs (indirect via instances) | Via `CharacterInstance` + `CharacterNPCLink` | `character_id` (e.g. "gorilla_01") | Has `game_npc_id` (legacy direct link, deprecated) |
| **Character Template** | `characters` | Prompts/Actions | `character_usage` table | `character_id` FK | Template reference: `{{character:character_id}}` |
| **Character Template** | `characters` | Other Characters | `character_relationships` table | `character_a_id`, `character_b_id` FKs | Directional relationships |
| **Character Template** | `characters` | Capabilities/Actions | `character_capabilities` table | `character_id` FK | Links to `action_blocks` list |
| **Character Template** | `characters` | Dialogue Trees | `character_dialogue_profiles` table | `character_id` FK | Voice/speech integration |
| **Character Instance** | `character_instances` | Character Template | Direct FK | `character_id` FK to `characters.id` | World-scoped version |
| **Character Instance** | `character_instances` | World | Direct FK | `world_id` FK to `game_worlds.id` | Optional, can be null |
| **Character Instance** | `character_instances` | NPCs | `character_npc_links` table | `character_instance_id` FK | Many-to-many with sync config |
| **Character Instance** | `character_instances` | Capabilities/Actions | `character_capabilities` table | `character_instance_id` FK | Instance-specific capabilities |
| **Character Instance** | `character_instances` | Dialogue Trees | `character_dialogue_profiles` table | `character_instance_id` FK | Instance-specific dialogue |

### Scene-Related Entities and Links

| Entity | Table/Location | Links To | Linkage Mechanism | ID Convention | Notes |
|--------|---------------|----------|-------------------|---------------|-------|
| **GameScene** | `game_scenes` | Nodes | `entry_node_id` FK | Integer ID | Has `meta` JSON for extensibility |
| **GameSceneNode** | `game_scene_nodes` | Scene | `scene_id` FK | Integer ID | Core scene graph structure |
| **GameSceneNode** | `game_scene_nodes` | Asset | `asset_id` FK | Integer ID (content service) | Direct asset reference |
| **GameSceneNode** | `game_scene_nodes` | Metadata | `meta` JSON field | N/A | Can store character-related data |
| **GameSceneEdge** | `game_scene_edges` | Nodes | `from_node_id`, `to_node_id` FKs | Integer IDs | Connections/choices |
| **Scene (Content)** | `scenes` | Assets | Via `scene_assets` table | Integer ID | Separate content service scenes |
| **SceneAsset** | `scene_assets` | Scene & Asset | `scene_id`, `asset_id` FKs | Integer IDs | Scene composition |
| **SceneConnection** | `scene_connections` | Scene Assets | `from_scene_asset_id`, `to_scene_asset_id` | Integer IDs | Scene graph edges |
| **SceneCharacterManifest** | `scene_character_manifests` | GameScene | `scene_id` FK | Integer ID | Character requirements for scene |
| **SceneCharacterManifest** | `scene_character_manifests` | Characters | Via JSON arrays | `required_characters`, `optional_characters` (character_id strings) | Lists of character_ids needed |
| **SceneCharacterManifest** | `scene_character_manifests` | Character Roles | `character_roles` JSONB | Key = character_id | Role metadata per character |

### NPC-Related Entities and Links

| Entity | Table/Location | Links To | Linkage Mechanism | ID Convention | Notes |
|--------|---------------|----------|-------------------|---------------|-------|
| **GameNPC** | `game_npcs` | Location | `home_location_id` FK | Integer ID | Basic NPC data |
| **GameNPC** | `game_npcs` | Character Instances | `character_npc_links` table | `npc_id` FK | Many-to-many |
| **GameNPC** | `game_npcs` | Expressions/Assets | `npc_expressions` table | `npc_id` FK | Portrait/expression assets |
| **GameNPC** | `game_npcs` | Metadata | `personality` JSON field | N/A | Can store character data |
| **GameNPC (in sessions)** | `GameSession.flags` | Session state | JSON key pattern | `npc:<id>` (e.g. "npc:5") | Convention for session flags |
| **NpcExpression** | `npc_expressions` | NPC & Asset | `npc_id`, `asset_id` FKs | Integer IDs | Links NPCs to portrait assets |
| **NPC Interaction** | Runtime/API | Scene Launch | `role_bindings` field | Dict[str, str] mapping roles | Maps scene roles to NPCs/characters |

### Asset-Related Entities and Links

| Entity | Table/Location | Links To | Linkage Mechanism | ID Convention | Notes |
|--------|---------------|----------|-------------------|---------------|-------|
| **Asset** | `assets` | Generation | `source_generation_id` FK | Integer ID | Provenance tracking |
| **Asset** | `assets` | User | `user_id` FK | Integer ID | Owner |
| **Asset** | `assets` | Provider Account | `provider_account_id` FK | Integer ID | Original provider |
| **Asset** | `assets` | Metadata/Tags | `tags`, `style_tags` JSON arrays | N/A | **No character linkage currently** |
| **Asset** | `assets` | Content Classification | `content_domain`, `content_category`, `content_taxonomy` | String/JSONB | Domain-specific metadata |
| **Asset** | `assets` | Extended Metadata | `media_metadata` JSONB | N/A | **Could store character/scene refs** |
| **AssetVariant** | `asset_variants` | Asset | `asset_id` FK | Integer ID | Quality variants |

### Generation-Related Entities and Links

| Entity | Table/Location | Links To | Linkage Mechanism | ID Convention | Notes |
|--------|---------------|----------|-------------------|---------------|-------|
| **Generation** | `generations` | User/Workspace | `user_id`, `workspace_id` FKs | Integer IDs | Owner |
| **Generation** | `generations` | Asset | `asset_id` FK | Integer ID | Result asset |
| **Generation** | `generations` | Prompt Version | `prompt_version_id` FK | UUID | Legacy prompt reference |
| **Generation** | `generations` | Prompt Config | `prompt_config` JSONB | Structured config with `versionId`, `familyId`, `variables` | **Variables could include character refs** |
| **Generation** | `generations` | Parent | `parent_generation_id` FK | Integer ID | Generation lineage |
| **Generation** | `generations` | Canonical Params | `canonical_params` JSONB | N/A | **Could include character/scene IDs** |

### Character Usage Tracking

| Entity | Table/Location | Links To | Linkage Mechanism | ID Convention | Notes |
|--------|---------------|----------|-------------------|---------------|-------|
| **CharacterUsage** | `character_usage` | Character | `character_id` FK | UUID FK to `characters.id` | Usage tracking |
| **CharacterUsage** | `character_usage` | Prompt Version | `prompt_version_id` FK | UUID (optional) | Where character appears |
| **CharacterUsage** | `character_usage` | Action Block | `action_block_id` FK | UUID (optional) | Where character appears |
| **CharacterUsage** | `character_usage` | Template Ref | `template_reference` string | Pattern: `{{character:character_id}}` | Template syntax |

### ID and Tag Conventions

| Convention Type | Pattern | Used By | Location | Consistency |
|----------------|---------|---------|----------|-------------|
| **NPC Session Keys** | `npc:<id>` | Session flags, interactions | `GameSession.flags.npcs` | ✅ Consistent |
| **Character Template Refs** | `{{character:character_id}}` | Prompt templates | Character usage tracking | ✅ Consistent |
| **Character IDs** | String (e.g. "gorilla_01") | Characters table | `characters.character_id` | ✅ Consistent |
| **Scene Role Bindings** | `role_bindings: Dict[str, str]` | NPC interactions, scene launches | API/Runtime | ✅ Consistent |
| **Asset Character Tags** | None currently | Assets | N/A | ❌ **Missing** |
| **Generation Character Refs** | Inconsistent | Generations | `prompt_config.variables` or `canonical_params` | ⚠️ **Inconsistent** |
| **Scene Character Tags** | None currently | GameScene.meta or SceneNode.meta | JSONB fields (optional) | ⚠️ **Ad-hoc** |

### Key Gaps and Mismatches

1. **Assets lack character linkage**: No explicit `character_template_id` or `character_instance_id` fields. Must rely on:
   - Tracing back via `source_generation_id` → `generation.prompt_config.variables`
   - Custom tags in `Asset.tags` (ad-hoc, not enforced)

2. **Generations lack scene linkage**: No explicit `scene_id` field. Must rely on:
   - `prompt_config.variables` or `canonical_params` containing scene references (ad-hoc)
   - External tracking systems

3. **Scene nodes reference NPCs vs Roles inconsistency**:
   - `SceneCharacterManifest` uses roles properly (protagonist, love_interest, etc.)
   - `GameSceneNode.meta` could hardcode NPC IDs instead of roles
   - Need to validate and enforce role-based references

4. **Character → Scene linkage is one-way**:
   - Can find scenes for a character via `SceneCharacterManifest`
   - Cannot easily find all characters in a scene without loading manifest

5. **World-scoped character instances not consistently used**:
   - Some systems may reference character templates directly instead of instances
   - Need to clarify when to use template vs instance

### Recommendations for Phase 26.2+

1. **Extend Asset metadata**: Add optional `character_template_id`, `character_instance_id`, `scene_id` fields or enforce structured metadata
2. **Extend Generation metadata**: Add `scene_id`, `character_refs` to link generations to scenes/characters
3. **Standardize role bindings**: Ensure scenes always use roles, not hardcoded NPC/character IDs
4. **Create graph query layer**: Abstract away these linkages via unified API
5. **Enforce tagging conventions**: When assets/generations are character-specific, require proper metadata
