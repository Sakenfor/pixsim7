# Game Extraction — Plain English Summary

## The Big Picture

We have one backend doing two jobs:
1. **Asset pipeline** — uploading media, AI generation, providers, tagging, analysis
2. **Game runtime** — worlds, sessions, NPCs, behavior, dialogue, quests, inventory

We're splitting job #2 into its own service with its own database.

---

## What Goes Where

### Game DB (new)

Everything about the game world and what happens inside it:

- **Worlds** — game_worlds, game_world_states
- **Sessions** — game_sessions, game_session_events
- **Locations** — game_locations, game_hotspots
- **NPCs** — game_npcs, npc_state, npc_schedules, npc_expressions
- **NPC Memory** — conversation_memories, emotional_states, relationship_milestones, world_context, personality_evolution, dialogue_analytics, conversation_topics
- **Scenes** — game_scenes, game_scene_nodes, game_scene_edges
- **Characters** — characters, character_instances, character_capabilities, character_relationships, character_usage, scene_character_manifests, character_dialogue_profiles
- **Items** — game_items, item_templates
- **Location templates** — location_templates
- **Projects** — game_project_snapshots
- **Clip sequences** — clip_sequences, clip_sequence_entries (currently unused but game-owned)

**~30 tables total.**

### Main DB (stays)

Everything about media files, AI generation, users, and billing:

- **Users** — users, user_sessions, auth tables
- **Assets** — assets, asset_variants, content_blobs, asset_clips, asset_branches, etc.
- **Generations** — generations, provider_submissions
- **Providers** — provider_accounts, provider_credits
- **Prompts** — prompt_families, prompt_versions, action_blocks
- **Tags, analysis, workspaces, logs, etc.**

---

## How Assets Work After the Split

This is the key question. Today, game code does things like:

- "Show me the portrait for this NPC" → needs an asset
- "What asset was used in this scene node?" → needs asset metadata
- "Build a character graph with linked assets" → needs to query assets

After the split, game tables **store asset IDs as plain UUIDs** — just numbers, no foreign keys. The game DB doesn't know or care what an asset looks like. When the game service needs actual asset data (thumbnail URL, tags, media type), it asks the main backend via an API call.

```
Before:  game code → SELECT * FROM assets WHERE id = '...'  (same DB)
After:   game code → GET /api/assets/{id}                   (HTTP to main backend)
```

In practice, only a few places actually need to fetch asset details:
- **Scene rendering** — needs asset media URLs
- **Character graph** — needs asset metadata for graph nodes
- **NPC expressions** — needs portrait/clip URLs
- **Tag enrichment** — needs asset tags

Everything else just stores and passes around the UUID without needing the actual asset.

---

## How Auth Works After the Split

Today: game routes call `get_current_user()` which queries the `users` table → returns full User object. Game routes only use `user.id` from it.

After: game service validates the JWT token directly (checks signature + expiry). It trusts the token because main backend issued it. No need to hit the users table. Just reads `user_id` from the token claims.

```
Before:  JWT → query users table → full User object → use user.id
After:   JWT → read claims → user_id                  (no DB query)
```

---

## How We Get There (Simplified Phases)

| Phase | What happens | Result |
|-------|-------------|--------|
| **0** | Write down which tables belong where. Add lint rules so nobody adds new cross-domain imports. | Clear ownership list, CI guards |
| **1** | Make game routes work with just JWT claims instead of DB user lookups. | Game auth is DB-independent |
| **2** | Remove the 5 hard foreign keys from NPC tables to `users.id`. Split Alembic into two chains. Fix the Character FK bug. | Game schema stands alone |
| **3** | Add `GAME_DATABASE_URL`. Game services use game DB, main services use main DB. Still one process. | Dual-DB monolith (proving ground) |
| **4** | Copy game data from main DB to game DB. Since it's just you + AI agents, this is a one-time migration script + sanity checks, not a production CDC pipeline. | Game DB has all the data |
| **5** | Move game code into its own FastAPI app. Main backend calls stay as HTTP. | Two separate services |
| **6** | Clean up: drop game tables from main DB, remove compatibility shims. | Done |

---

## What's NOT Changing

- Assets stay exactly where they are — same DB, same service, same API
- Users/auth stay in main backend
- Generations, providers, billing — all stay in main backend
- The game just becomes a **consumer** of assets instead of a **roommate** in the same DB
