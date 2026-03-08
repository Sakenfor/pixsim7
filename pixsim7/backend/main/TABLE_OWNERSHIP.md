# Table Ownership Manifest

> Phase 0 artifact for backend game extraction.
> Every table must be assigned to exactly one database: `game` or `main`.
> Cross-database references are soft (scalar UUID/int) — no foreign key constraints.

## Rules

1. A table belongs to **game** if it stores game runtime state, NPC data, character data, or world configuration.
2. A table belongs to **main** if it stores assets, generations, users, providers, billing, or shared infrastructure.
3. Tables currently in `domain/assets/` that have hard FKs to game tables are reclassified as **game**.
4. Soft references (plain fields storing IDs without FK constraints) are allowed across databases.

---

## Game DB (32 tables)

### Game Core (`domain/game/core/models.py`)

| Table | Model | Hard FKs | Cross-DB Soft Refs |
|-------|-------|----------|--------------------|
| `game_worlds` | `GameWorld` | — | `owner_user_id` (int, no FK) |
| `game_world_states` | `GameWorldState` | `game_worlds.id` | — |
| `game_scenes` | `GameScene` | `game_worlds.id`, `game_scene_nodes.id` | — |
| `game_scene_nodes` | `GameSceneNode` | `game_scenes.id` | `asset_id` (UUID, no FK) |
| `game_scene_edges` | `GameSceneEdge` | `game_scenes.id`, `game_scene_nodes.id` x2 | — |
| `game_sessions` | `GameSession` | `game_scenes.id`, `game_scene_nodes.id`, `game_worlds.id` | `user_id` (int, no FK) |
| `game_session_events` | `GameSessionEvent` | `game_sessions.id`, `game_scene_nodes.id`, `game_scene_edges.id` | — |
| `game_locations` | `GameLocation` | `game_worlds.id` | `asset_id` (UUID, no FK) |
| `game_npcs` | `GameNPC` | `game_worlds.id`, `game_locations.id` | — |
| `game_items` | `GameItem` | `game_worlds.id` | — |
| `game_hotspots` | `GameHotspot` | `game_worlds.id`, `game_locations.id`, `game_scenes.id` | — |
| `game_project_snapshots` | `GameProjectSnapshot` | — | `owner_user_id` (int, no FK) |
| `npc_schedules` | `NPCSchedule` | `game_npcs.id`, `game_locations.id` | — |
| `npc_state` | `NPCState` | `game_locations.id` | — |
| `npc_expressions` | `NpcExpression` | `game_npcs.id` | `asset_id` (UUID, no FK) |

### NPC Memory & Analytics (`domain/game/entities/npc_memory.py`)

| Table | Model | Hard FKs | Cross-DB Soft Refs |
|-------|-------|----------|--------------------|
| `npc_conversation_memories` | `ConversationMemory` | `game_npcs.id`, `game_sessions.id`, `game_locations.id` | `user_id` (int, no FK) |
| `npc_emotional_states` | `NPCEmotionalState` | `game_npcs.id`, `game_sessions.id` | — |
| `npc_conversation_topics` | `ConversationTopic` | `game_npcs.id` | `user_id` (int, no FK) |
| `npc_relationship_milestones` | `RelationshipMilestone` | `game_npcs.id` | `user_id` (int, no FK) |
| `npc_world_context` | `NPCWorldContext` | `game_npcs.id`, `game_worlds.id` | — |
| `npc_personality_evolution` | `PersonalityEvolutionEvent` | `game_npcs.id` | `user_id` (int, nullable, no FK) |
| `npc_dialogue_analytics` | `DialogueAnalytics` | `game_npcs.id` | `user_id` (int, no FK) |

### Character System (`domain/game/entities/`)

| Table | Model | Hard FKs | Cross-DB Soft Refs |
|-------|-------|----------|--------------------|
| `characters` | `Character` | `game_npcs.id`, `characters.id` (self-ref) | — |
| `character_relationships` | `CharacterRelationship` | `characters.id` x2 | — |
| `character_usage` | `CharacterUsage` | `characters.id` | `prompt_version_id`, `action_block_id` (soft refs, no FK) |
| `character_instances` | `CharacterInstance` | `characters.id`, `game_worlds.id` | — |
| `character_capabilities` | `CharacterCapability` | `characters.id`, `character_instances.id` | — |
| `scene_character_manifests` | `SceneCharacterManifest` | `game_scenes.id` | — |
| `character_dialogue_profiles` | `CharacterDialogueProfile` | `characters.id`, `character_instances.id` | — |

### Game Templates (`domain/game/entities/`)

| Table | Model | Hard FKs | Cross-DB Soft Refs |
|-------|-------|----------|--------------------|
| `item_templates` | `ItemTemplate` | — | — |
| `location_templates` | `LocationTemplate` | — | `default_asset_id` (UUID, no FK) |

### Clip Sequences (`domain/game/entities/sequence.py`)

| Table | Model | Hard FKs | Cross-DB Soft Refs |
|-------|-------|----------|--------------------|
| `clip_sequences` | `ClipSequence` | `characters.id`, `game_npcs.id` | — |
| `clip_sequence_entries` | `ClipSequenceEntry` | `clip_sequences.id` | `asset_id`, `clip_id`, `branch_id` (soft refs) |

---

## Main DB (50 tables)

### Users & Auth (`domain/user.py`)

| Table | Model | Hard FKs |
|-------|-------|----------|
| `users` | `User` | — |
| `user_sessions` | `UserSession` | `users.id` |
| `user_quota_usage` | `UserQuotaUsage` | `users.id` |

### Assets (`domain/assets/`)

| Table | Model | Hard FKs |
|-------|-------|----------|
| `assets` | `Asset` | `users.id`, `content_blobs.id`, `provider_accounts.id` |
| `asset_variants` | `AssetVariant` | `assets.id` |
| `content_blobs` | `ContentBlob` | — |
| `asset_lineage` | `AssetLineage` | `assets.id` x2 |
| `asset_branches` | `AssetBranch` | `assets.id` |
| `asset_branch_variants` | `AssetBranchVariant` | `asset_branches.id`, `assets.id` |
| `asset_clips` | `AssetClip` | `assets.id` x2 |
| `asset_version_families` | `AssetVersionFamily` | `users.id` |
| `asset_3d_metadata` | `Asset3DMetadata` | `assets.id` |
| `asset_audio_metadata` | `AssetAudioMetadata` | `assets.id` |
| `asset_temporal_segments` | `AssetTemporalSegment` | `assets.id` |
| `asset_adult_metadata` | `AssetAdultMetadata` | `assets.id` |
| `asset_analyses` | `AssetAnalysis` | `users.id`, `assets.id` |

### Tags (`domain/assets/tag.py`)

| Table | Model | Hard FKs |
|-------|-------|----------|
| `tag` | `Tag` | `tag.id` x2 (self-refs) |
| `asset_tag` | `AssetTag` | `assets.id`, `tag.id` |

### Generation & Providers (`domain/generation/`, `domain/providers/`)

| Table | Model | Hard FKs |
|-------|-------|----------|
| `generations` | `Generation` | `users.id`, `workspaces.id`, `prompt_versions.id` |
| `provider_accounts` | `ProviderAccount` | `users.id` |
| `provider_credits` | `ProviderCredit` | `provider_accounts.id` |
| `provider_submissions` | `ProviderSubmission` | `generations.id`, `asset_analyses.id`, `provider_accounts.id` |
| `provider_instance_configs` | `ProviderInstanceConfig` | `users.id` |
| `block_image_fits` | `BlockImageFit` | `action_blocks.id`, `assets.id`, `generations.id` |

### Prompts (`domain/prompt/`)

| Table | Model | Hard FKs | Soft Refs (game) |
|-------|-------|----------|-----------------|
| `prompt_families` | `PromptFamily` | — | `game_world_id`, `npc_id`, `scene_id` (no FK) |
| `prompt_versions` | `PromptVersion` | `prompt_families.id` | — |
| `prompt_blocks` | `PromptBlock` | — | — |
| `prompt_version_blocks` | `PromptVersionBlock` | `prompt_versions.id`, `prompt_blocks.id` | — |
| `prompt_variant_feedback` | `PromptVariantFeedback` | `prompt_versions.id`, `assets.id`, `generations.id`, `users.id` | — |
| `block_templates` | `BlockTemplate` | `users.id` (`owner_user_id`) | — |

### Workspace & Scenes (`domain/workspace.py`, `domain/scene.py`)

| Table | Model | Hard FKs |
|-------|-------|----------|
| `workspaces` | `Workspace` | `users.id`, `workspaces.id` (self-ref) |
| `scenes` | `Scene` | `users.id` |
| `scene_assets` | `SceneAsset` | `scenes.id`, `assets.id` |
| `scene_connections` | `SceneConnection` | `scenes.id`, `scene_assets.id` |

### Automation (`domain/automation/`)

| Table | Model | Hard FKs |
|-------|-------|----------|
| `app_action_presets` | `AppActionPreset` | `users.id`, `app_action_presets.id` (self-ref) |
| `android_devices` | `AndroidDevice` | `android_devices.id` (self-ref), `device_agents.id`, `provider_accounts.id` |
| `execution_loops` | `ExecutionLoop` | `users.id`, `app_action_presets.id`, `android_devices.id` |
| `execution_loop_history` | `ExecutionLoopHistory` | `execution_loops.id` |
| `automation_executions` | `AutomationExecution` | `users.id`, `app_action_presets.id`, `provider_accounts.id`, `android_devices.id`, `execution_loops.id` |
| `device_agents` | `DeviceAgent` | `users.id` |
| `pairing_requests` | `PairingRequest` | `users.id` |

### Plugins & Analysis (`domain/`)

| Table | Model | Hard FKs |
|-------|-------|----------|
| `plugin_catalog` | `PluginCatalogEntry` | — |
| `user_plugin_states` | `UserPluginState` | `users.id`, `plugin_catalog.id` |
| `analyzer_definitions` | `AnalyzerDefinition` | `users.id` |
| `analyzer_presets` | `AnalyzerPreset` | `users.id` x2 |

### Utility (`domain/`)

| Table | Model | Hard FKs |
|-------|-------|----------|
| `ai_interactions` | `AiInteraction` | `users.id`, `generations.id` |
| `log_entries` | `LogEntry` | — |
| `object_links` | `ObjectLink` | — |
| `semantic_packs` | `SemanticPackDB` | — |
| `generated_action_blocks` | `GeneratedActionBlockRecord` | — |
| `user_ai_settings` | `UserAISettings` | `users.id` |

---

## Cross-DB FK Violations — Resolved in Phase 2

All 10 cross-domain FK constraints were removed in migration `20260219_0002`.
Fields are preserved as soft references (plain columns with no FK enforcement).

| Table | Field | Was | Now |
|-------|-------|-----|-----|
| `npc_conversation_memories` | `user_id` | `users.id` (hard FK) | Soft ref (indexed) |
| `npc_conversation_topics` | `user_id` | `users.id` (hard FK) | Soft ref (indexed) |
| `npc_relationship_milestones` | `user_id` | `users.id` (hard FK) | Soft ref (indexed) |
| `npc_personality_evolution` | `user_id` | `users.id` (hard FK, nullable) | Soft ref |
| `npc_dialogue_analytics` | `user_id` | `users.id` (hard FK) | Soft ref (indexed) |
| `character_usage` | `prompt_version_id` | `prompt_versions.id` (hard FK) | Soft ref (indexed) |
| `character_usage` | `action_block_id` | `action_blocks.id` (hard FK) | Soft ref (indexed) |
| `clip_sequence_entries` | `clip_id` | `asset_clips.id` (hard FK) | Soft ref |
| `clip_sequence_entries` | `asset_id` | `assets.id` (hard FK) | Soft ref |
| `clip_sequence_entries` | `branch_id` | `asset_branches.id` (hard FK) | Soft ref |

---

## Totals

| Database | Tables | Percentage |
|----------|--------|------------|
| Game DB | 32 | 39% |
| Main DB | 50 | 61% |
| **Total** | **82** | 100% |

---

## Game-Coupled API Routes

### Named `game_*.py` (13 files — obviously game-owned)

| File | Primary Imports |
|------|----------------|
| `game_worlds.py` | `GameWorldService`, `GameProjectBundleService`, `GameProjectStorageService` |
| `game_sessions.py` | `GameSessionService` |
| `game_scenes.py` | `GameScene`, `GameSceneNode`, `AssetService` (bridge) |
| `game_locations.py` | `GameLocationService` |
| `game_hotspots.py` | Internal DTO models |
| `game_actions.py` | `GameActionRegistry` (static) |
| `game_triggers.py` | `GameTriggerService` |
| `game_quests.py` | `GameSessionService`, `QuestService` |
| `game_inventory.py` | `GameSessionService`, `InventoryService` |
| `game_behavior.py` | `GameWorldService`, behavior schemas |
| `game_links.py` | `template_resolver`, `LinkIntegrityService` |
| `game_npc_mood_preview.py` | `mood_evaluators`, `DatabaseSession` |
| `game_reputation_preview.py` | `reputation_evaluators`, `DatabaseSession` |

### NOT named `game_*.py` but game-coupled (6 files — must be regrouped in Phase 3)

| File | Primary Imports | Why It's Game |
|------|----------------|---------------|
| `characters.py` | `CharacterService`, `Character` | Character CRUD — game entity |
| `character_graph.py` | `get_character_graph`, `find_assets_for_character` | Graph builders + asset ORM queries (bridge) |
| `npc_state.py` | `MemoryService`, `EmotionalStateService`, NPC memory models | NPC runtime state management |
| `stat_preview.py` | `GameWorld`, `StatEngine`, `WorldStatsConfig` | Game stat computation preview |
| `analytics.py` | `DialogueAnalyticsService` | NPC dialogue analytics |
| `interactions.py` | Interaction models, availability, target adapters | Game interaction execution |

### Total: 19 game-coupled route files
