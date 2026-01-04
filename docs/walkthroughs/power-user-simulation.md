# PixSim7 Power User Simulation: Building "The Harbor District"

A comprehensive step-by-step walkthrough of creating an interactive game world with NPCs, generation, and runtime interaction.

**Date:** 2025-12-14
**Purpose:** Stress-test the PixSim7 experience and architecture by simulating a realistic creative workflow

---

## Table of Contents

1. [World Creation](#1-world-creation)
2. [World Structure](#2-world-structure-locations-scenes-interactions)
3. [NPC Setup](#3-npc-setup-personalities-schedules-expressions)
4. [Generation](#4-generation-creating-intro-video--npc-clips)
5. [Hosting/Running the World](#5-hostingrunning-the-world-session--gameplay)
6. [Iteration](#6-iteration-tweaking--testing)
7. [Friction Points & Improvements Summary](#7-friction-points--improvements-summary)
8. [Final Observations](#final-observations)

---

## 1. WORLD CREATION

### User View: Creating "The Harbor District" World

**Navigation:**
1. User opens `http://localhost:5173/game-world` (main app)
2. Clicks **"New World"** button in the world selection panel
3. Fills in creation form:
   - **Name:** "The Harbor District"
   - **Theme:** Maritime trade hub
   - **Tone:** Gritty realism with intrigue
   - **Time Settings:** Start at Day 1, 8:00 AM (world_time = 0)

**Core Capabilities Configuration:**

4. Opens **"Providers"** tab:
   - Enables Pixverse for video generation
   - Enables OpenAI GPT-4 for dialogue
   - Sets budget limits (100 credits/day)

5. Opens **"Stat Packages"** tab:
   - Enables **Personality Package** (OCEAN traits)
   - Enables **Mood Package** (emotional states)
   - Enables **Relationships Package** (affinity, trust, chemistry, tension, intimacy levels)
   - Enables **Drives Package** (hunger, fatigue, social needs)

6. Opens **"World Manifest"** tab (advanced JSON):
   ```json
   {
     "enabled_features": ["dialogue", "romance", "trading", "rumors"],
     "turn_presets": {
       "conversation": { "avg_turns": 5, "max_turns": 10 },
       "intimate": { "avg_turns": 8, "max_turns": 15 }
     },
     "interactions": {
       "talk": {
         "gating": { "min_affinity": 0 },
         "type": "inline_dialogue"
       },
       "ask_rumors": {
         "gating": { "min_affinity": 20, "location": ["tavern", "market"] },
         "type": "scene_triggered",
         "cooldown_sec": 3600
       },
       "flirt": {
         "gating": { "min_affinity": 40, "min_chemistry": 30, "mood": ["happy", "curious"] },
         "type": "scene_triggered",
         "branching_intent": "escalate"
       }
     },
     "npc_roles": {
       "merchant": { "default_personality": { "conscientiousness": 0.7, "agreeableness": 0.5 } },
       "thief": { "default_personality": { "openness": 0.6, "neuroticism": 0.8 } },
       "guard": { "default_personality": { "conscientiousness": 0.9, "extraversion": 0.3 } }
     }
   }
   ```

7. Clicks **"Create World"**

### System View

**API Call:**
```http
POST /api/v1/game-worlds/
{
  "name": "The Harbor District",
  "meta": {
    "manifest": { ... },  # Shown above
    "theme": "Maritime trade hub",
    "tone": "Gritty realism with intrigue"
  }
}
```

**Backend Flow:**

1. **GameWorldService.create_world()**
   - Creates `GameWorld` record (owner_user_id = current user)
   - Initializes `GameWorldState` (world_time = 0, last_advanced_at = now)
   - Stores manifest in `GameWorld.meta`

2. **Database:**
   - `game_worlds` table: New row with id=42
   - `game_world_states` table: New row linked to world_id=42

3. **Response:**
   ```json
   {
     "id": 42,
     "name": "The Harbor District",
     "meta": { ... },
     "world_time": 0,
     "owner_user_id": 123
   }
   ```

**Modules Involved:**
- `domain/game/models.py` - GameWorld, GameWorldState
- `services/game/world_service.py` - World CRUD
- `apps/main/src/routes/game-world.tsx` - React UI

### Friction Point #1: Manifest Editing

**Issue:** User has to edit raw JSON for world manifest. No validation, no autocomplete, easy to break.

**Improvement:**
Add **World Manifest Builder** UI:
- Visual form for common fields (enabled_features, turn_presets)
- Interaction definition wizard with dropdowns for gating conditions
- Role templates with personality sliders
- Real-time JSON preview
- Validation against JSON schema with error highlighting

**Implementation Tie-In:**
- Create `apps/main/src/components/game-world/ManifestBuilder.tsx`
- Use existing `@pixsim7/ui` form components
- Backend provides schema via `GET /api/v1/game-worlds/manifest-schema`
- Store schema in `pixsim7/backend/main/schemas/world_manifest.json`

---

## 2. WORLD STRUCTURE: Locations, Scenes, Interactions

### User View: Designing the District

**Creating Locations:**

1. User navigates to **World Builder** > **"Locations"** tab
2. Clicks **"Add Location"** 3 times, configuring each:

   **Harbor (location_id = 1):**
   - Name: "Harbor Docks"
   - 3D Asset: Selects glTF from asset library (ships, crates, fog)
   - Default Spawn: `{x: 0, y: 0, z: 5}`
   - Meta: `{ "ambient_sound": "waves", "time_of_day_lighting": true }`

   **Market (location_id = 2):**
   - Name: "Central Market"
   - 3D Asset: Marketplace scene with stalls
   - Default Spawn: `{x: 10, y: 0, z: 0}`
   - Meta: `{ "ambient_sound": "crowd", "interactive_stalls": ["fish", "cloth", "tools"] }`

   **Tavern (location_id = 3):**
   - Name: "The Rusty Anchor Tavern"
   - 3D Asset: Interior tavern scene
   - Default Spawn: `{x: 5, y: 0, z: -5}`
   - Meta: `{ "ambient_sound": "tavern_chatter", "lighting": "dim" }`

**Adding Hotspots:**

3. User selects **Harbor** location
4. Opens **"Hotspots"** panel (shows 3D viewer with glTF loaded)
5. Clicks on the "tavern_door" object in the 3D model
6. Creates hotspot:
   - Object Name: "tavern_door"
   - Hotspot ID: "enter_tavern"
   - Linked Scene: (will create next)
   - Meta: `{ "prompt_text": "Enter the tavern?" }`

**Creating Scene Graph:**

7. User navigates to `/graph/new` (scene graph editor)
8. Creates **"Harbor Intro"** scene:

   **Node Structure:**

   - **Node 1** (entry): Video node
     - Asset: Existing video of harbor overview (asset_id = 500)
     - Label: "Arrive at Harbor"
     - Meta: `{ "videoConfig": { "loopable": false, "skippable": true } }`

   - **Node 2**: Choice node
     - Label: "Where to go?"
     - Meta: `{ "choiceConfig": { "reveal_at_sec": 5 } }`

   - **Edge 1→2:** Auto-transition (no choice label)

   - **Edge 2→3a:** "Visit the Market"
     - Effects: `{ "flags": ["visited_market"], "stats": {} }`
     - Leads to: Market scene (scene_id = 2)

   - **Edge 2→3b:** "Head to the Tavern"
     - Effects: `{ "flags": ["visited_tavern"] }`
     - Leads to: Tavern scene (scene_id = 3)

   - **Edge 2→3c:** "Explore the Docks"
     - Conditions: `{ "flags": ["!visited_harbor"] }` (only first time)
     - Leads to: Node 4

   - **Node 4**: Video node (generated content)
     - Asset: Not yet generated (placeholder)
     - Label: "Dock Exploration"
     - Meta: `{ "generationConfig": { "strategy": "once", "type": "environment" } }`

9. User saves scene (scene_id = 1 created)

10. User creates **"Tavern NPC Encounter"** scene (scene_id = 3):
    - **Node 1**: Video intro (NPC appears)
    - **Node 2**: Dialogue node
      - Meta: `{ "dialogueConfig": { "npc_id": null, "npc_role": "merchant" } }`
      - Uses LLM for generation
    - **Node 3**: Choice node (Talk / Flirt / Leave)
    - Edges with different affinity effects

**Configuring Interactions:**

11. User opens **Interaction Studio** (new feature area)
12. World-level interactions already exist from manifest
13. User creates NPC-level override for "Merchant" role:
    ```json
    {
      "npc_role": "merchant",
      "interaction_overrides": {
        "trade": {
          "gating": { "min_affinity": 10, "location": ["market"] },
          "type": "scene_triggered",
          "action": { "type": "play_scene", "scene_id": 5 },
          "prompt_template": "The merchant eyes you warily. 'Looking to trade?'"
        }
      }
    }
    ```

### System View

**Location Creation:**
```http
POST /api/v1/game-locations/
{
  "world_id": 42,
  "name": "Harbor Docks",
  "x": 0, "y": 0,
  "asset_id": 200,
  "default_spawn": {"x": 0, "y": 0, "z": 5},
  "meta": { "ambient_sound": "waves" }
}
```

**Backend:**
- `domain/game/models.py` - GameLocation (inherits HasStats mixin)
- `services/game/location_service.py` - CRUD operations
- Stores in `game_locations` table

**Hotspot Creation:**
```http
POST /api/v1/game/triggers
{
  "scope": "location",
  "location_id": 1,
  "hotspot_id": "enter_tavern",
  "target": { "mesh": { "object_name": "tavern_door" } },
  "action": { "type": "play_scene", "scene_id": 3 },
  "meta": { "prompt_text": "Enter the tavern?" }
}
```

**Scene Graph Creation:**
```http
POST /api/v1/game-scenes/
{
  "title": "Harbor Intro",
  "description": "Player arrives at the harbor",
  "entry_node_id": null,  # Will be set after nodes created
  "meta": {}
}

# Returns scene_id = 1

# Then create nodes:
POST /api/v1/game-scenes/1/nodes
[
  {
    "id": "node1",
    "asset_id": 500,
    "label": "Arrive at Harbor",
    "loopable": false,
    "skippable": true,
    "meta": { "videoConfig": {...} }
  },
  ...
]

# Then create edges:
POST /api/v1/game-scenes/1/edges
[
  {
    "from_node_id": "node1",
    "to_node_id": "node2",
    "choice_label": null,
    "weight": 1.0,
    "conditions": null,
    "effects": null
  },
  ...
]
```

**Backend:**
- `domain/game/models.py` - GameScene, GameSceneNode, GameSceneEdge
- `packages/scene/` - TypeScript scene graph library
- Graph editor in `apps/main/src/routes/graph/[id].tsx`

**Modules Involved:**
- **Frontend:** `apps/main/src/components/scene-graph/` - Node/edge editor, canvas
- **Backend:** `services/game/scene_service.py` - Graph CRUD
- **Shared:** `@pixsim7/types` - SceneNodeConfig, SceneEdgeConfig

### Friction Point #2: Scene-Location Integration

**Issue:** Creating hotspots requires manually linking to scenes. User has to:
1. Create scene first
2. Remember scene ID
3. Go back to location
4. Add hotspot with scene ID

No visual preview of what clicking the hotspot will trigger.

**Improvement:**
Add **Hotspot Scene Previewer** in 3D viewer:
- Dropdown to select scenes (with thumbnail previews)
- "Create New Scene" button that auto-links after creation
- Hover over hotspot → shows linked scene's first video frame
- Click hotspot in editor → opens scene in split-pane view

**Implementation Tie-In:**
- Extend `apps/main/src/components/game-world/LocationEditor.tsx`
- Use existing `MediaCard` component for scene previews
- Backend provides `GET /api/v1/game-scenes/{id}/thumbnail`

### Friction Point #3: Interaction Definition vs. Execution

**Issue:** Interactions are defined in world manifest (JSON) but tested via separate interaction execution flow. No way to preview interaction availability or test gating logic without running a full session.

**Improvement:**
Add **Interaction Tester** panel:
- Mock session state editor (flags, relationship values, time, location)
- Live preview of available interactions with disabled reasons
- "Simulate Execute" button that shows:
  - Generated dialogue prompt
  - Relationship/flag changes
  - Next scene transition
- Compare before/after NPC state

**Implementation Tie-In:**
- Create `apps/main/src/routes/interaction-studio.tsx`
- Use existing `POST /api/v1/npc-interactions/list` with mock state
- Add new endpoint `POST /api/v1/npc-interactions/simulate` (dry-run)

---

## 3. NPC SETUP: Personalities, Schedules, Expressions

### User View: Creating Key NPCs

**Creating NPC #1: "Captain Mara" (Merchant)**

1. User navigates to **NPC Management** panel
2. Clicks **"Create NPC"**
3. Fills in form:
   - **Name:** "Captain Mara"
   - **Role:** merchant
   - **Home Location:** Harbor Docks

4. Opens **"Personality"** tab (NPC Brain Lab):

   **OCEAN Sliders:**
   - Openness: 0.6 (moderate curiosity)
   - Conscientiousness: 0.8 (very organized)
   - Extraversion: 0.7 (social)
   - Agreeableness: 0.5 (neutral, business-focused)
   - Neuroticism: 0.3 (calm under pressure)

   **Custom Traits:** (free-form JSON)
   ```json
   {
     "occupation": "ship captain",
     "background": "Former navy officer turned trader",
     "quirks": ["always checks the weather", "distrusts landlubbers"],
     "voice_style": "gruff but fair",
     "interests": ["sailing", "profit", "local politics"]
   }
   ```

5. Opens **"Base Stats"** tab:
   - Sets combat skills: `{ "melee": 60, "ranged": 40 }`
   - Sets attributes: `{ "strength": 70, "intelligence": 65 }`

6. Opens **"Schedule"** tab:

   **Monday-Friday:**
   - 6:00-12:00: Harbor Docks
   - 12:00-14:00: Market
   - 14:00-22:00: Harbor Docks

   **Saturday-Sunday:**
   - All day: Tavern

7. Opens **"Expressions"** tab (NPC portrait manager):

   Uploads/selects 5 portrait assets:
   - State: "neutral" → asset_id: 700
   - State: "happy" → asset_id: 701
   - State: "angry" → asset_id: 702
   - State: "curious" → asset_id: 703
   - State: "sad" → asset_id: 704

   For each, sets crop region: `{ "x": 100, "y": 50, "width": 400, "height": 400 }`

8. Clicks **"Save NPC"** (npc_id = 10 created)

**Creating NPC #2: "Ren the Thief"**

9. Repeats process:
   - Name: "Ren"
   - Role: thief
   - Home: Market
   - Personality:
     - Openness: 0.8 (creative problem-solver)
     - Conscientiousness: 0.3 (disorganized, impulsive)
     - Extraversion: 0.5 (selectively social)
     - Agreeableness: 0.4 (self-interested)
     - Neuroticism: 0.7 (anxious, paranoid)
   - Custom traits:
     ```json
     {
       "occupation": "pickpocket",
       "background": "Orphan who learned to survive on the streets",
       "quirks": ["fidgets when nervous", "excellent liar"],
       "voice_style": "quick, witty, sarcastic"
     }
     ```
   - Schedule: Market during busy hours, hides at night
   - Expressions: 5 different portrait states

**Creating NPC #3: "Guard Jorin"**

10. Name: "Jorin"
    - Role: guard
    - Home: Harbor Docks
    - Personality: High conscientiousness, low openness
    - Schedule: Patrols harbor, market, tavern on rotation

**Setting Initial Relationships:**

11. User opens **Relationship Editor** (new feature)

    For Captain Mara:
    - Initial affinity with player: 30 (neutral acquaintance)
    - Initial trust: 20 (cautious)
    - Chemistry: 40 (some attraction)
    - Tension: 10 (low)

    For Ren:
    - All relationships start at 0 (stranger)

    For Jorin:
    - Affinity: -10 (suspicious of outsiders)
    - Trust: 50 (trusts authority)

### System View

**NPC Creation:**
```http
POST /api/v1/game-npcs/
{
  "world_id": 42,
  "name": "Captain Mara",
  "personality": {
    "openness": 0.6,
    "conscientiousness": 0.8,
    "extraversion": 0.7,
    "agreeableness": 0.5,
    "neuroticism": 0.3,
    "occupation": "ship captain",
    "background": "Former navy officer turned trader",
    "quirks": [...],
    "voice_style": "gruff but fair",
    "interests": [...]
  },
  "home_location_id": 1,
  "stats": {
    "melee": 60,
    "ranged": 40,
    "strength": 70,
    "intelligence": 65
  }
}

# Returns npc_id = 10
```

**Backend:**
- Creates `GameNPC` record
- Initializes `NPCState` (current_location_id = null, relies on schedule)
- Stores personality in `GameNPC.personality` (JSONB)
- Stores stats in `GameNPC.stats` via `HasStats` mixin

**Schedule Creation:**
```http
POST /api/v1/game-npcs/10/schedules
[
  {
    "day_of_week": 1,  # Monday
    "start_time": "06:00",
    "end_time": "12:00",
    "location_id": 1,
    "rule": "default"
  },
  ...
]
```

**Expression Mapping:**
```http
POST /api/v1/game-npcs/10/expressions
[
  {
    "state": "neutral",
    "asset_id": 700,
    "crop": {"x": 100, "y": 50, "width": 400, "height": 400},
    "meta": {}
  },
  ...
]
```

**Backend:**
- `domain/game/models.py` - GameNPC, NPCState, NPCSchedule, NpcExpression
- `services/npc/npc_service.py` - NPC CRUD and state management
- `domain/stats/` - Personality, mood, relationship packages

**Initial Relationship:**
```http
POST /api/v1/game-npcs/10/stats
{
  "stat_updates": [
    {"axis": "affinity", "value": 30, "source": "relationship"},
    {"axis": "trust", "value": 20, "source": "relationship"},
    {"axis": "chemistry", "value": 40, "source": "relationship"},
    {"axis": "tension", "value": 10, "source": "relationship"}
  ]
}
```

**Backend:**
- Uses `StatEngine` to update `NPCState.stats`
- Stores in `npc_states` table with version bump

**Modules Involved:**
- **Frontend:** `apps/main/src/routes/npc-brain-lab.tsx` - Personality editor
- **Frontend:** `apps/main/src/routes/npc-portraits.tsx` - Expression manager
- **Backend:** `services/npc/` - NPC service layer
- **Stats:** `domain/stats/engine.py` - Stat resolution and derivation

### Friction Point #4: Personality-to-Prompt Opacity

**Issue:** User sets personality traits but has no idea how they'll affect dialogue or video generation. The mapping from personality → mood → prompt context is completely hidden.

**Improvement:**
Add **Prompt Preview** in NPC Brain Lab:
- Shows example prompts for different scenarios:
  - "Talk" interaction at affinity 30
  - "Flirt" interaction at affinity 60
  - "Argument" at tension 80
- Highlights which personality traits contribute to each prompt section
- Live updates as user adjusts sliders
- Shows derived mood from current relationship state

**Implementation Tie-In:**
- Use existing `PromptContextService.resolve_npc_snapshot()`
- Add endpoint `POST /api/v1/npc-prompts/preview` with mock session state
- Display in split-pane view in `npc-brain-lab.tsx`

---

## 4. GENERATION: Creating Intro Video & NPC Clips

### User View: Generating World Content

**Generating Harbor Intro Video:**

1. User navigates to **Generation** panel (or `/control-center`)
2. Selects **"Create Environment Video"**
3. Fills in generation form:
   - **Type:** transition
   - **From Scene:** None (standalone)
   - **To Scene:** Harbor Intro (scene_id = 1)
   - **Style Rules:**
     ```json
     {
       "time_of_day": "dawn",
       "weather": "foggy",
       "mood": "mysterious",
       "camera_movement": "slow pan",
       "duration_sec": 8
     }
     ```
   - **Prompt:** "A foggy harbor at dawn. Ships bob gently in the water. Seagulls cry overhead. Mysterious atmosphere."
   - **Provider:** Pixverse
   - **Strategy:** once (generate once, reuse forever)

4. Clicks **"Generate"**

**Monitoring Generation:**

5. User sees generation job card appear in **Control Center**:
   - Status: "Submitting..."
   - Provider: Pixverse
   - Estimated cost: 5 credits

6. After 2 seconds:
   - Status: "Queued"
   - Provider Job ID: `pxv_abc123`
   - Position in queue: 3

7. After 60 seconds:
   - Status: "Generating"
   - Progress: 45%

8. After 120 seconds:
   - Status: "Completed"
   - Preview thumbnail appears
   - Asset ID: 800

**Generating NPC Portrait Vignette:**

9. User selects **"Create Character Video"**
10. Fills in form:
    - **NPC:** Captain Mara (npc_id = 10)
    - **Scene Context:** Tavern scene (scene_id = 3)
    - **Type:** dialogue
    - **Action Block:**
      ```json
      {
        "pose": "leaning_on_bar",
        "intensity": 0.6,
        "mood": "curious",
        "camera_angle": "medium_closeup"
      }
      ```
    - **Relationship Context:** (auto-loaded from mock session)
      - Affinity: 50
      - Chemistry: 40
    - **Visual Prompt:** (auto-generated from NPC personality + action block)
      "A gruff ship captain leans casually on the bar, eyeing you with curiosity. She's weathered but strong, wearing a naval coat. Tavern interior, dim lighting."

11. Clicks **"Generate"**
12. Generation completes → asset_id = 801

**Attaching Generated Content:**

13. User returns to **Scene Graph Editor**
14. Selects Node 1 ("Arrive at Harbor")
15. Sets asset_id = 800 (the harbor intro video)
16. Saves scene

17. Selects Tavern scene, Node 1
18. Sets asset_id = 801 (Captain Mara vignette)
19. Saves scene

### System View

**Generation Request:**
```http
POST /api/v1/generation/
{
  "operation_type": "video_transition",
  "provider_id": "pixverse",
  "workspace_id": 1,
  "inputs": {
    "prompt": "A foggy harbor at dawn...",
    "style": {
      "time_of_day": "dawn",
      "weather": "foggy",
      "mood": "mysterious",
      "camera_movement": "slow pan"
    },
    "duration_sec": 8
  },
  "canonical_params": {
    "seed": 42,
    "aspect_ratio": "16:9",
    "quality": "high"
  },
  "strategy": "once",
  "scene_context": {
    "scene_id": 1,
    "node_id": "node1"
  }
}
```

**Backend Flow:**

1. **GenerationService.create_generation()**
   - Computes `reproducible_hash` from canonical_params + inputs
   - Checks cache: `SELECT * FROM generations WHERE reproducible_hash = ...`
   - If cache hit → Returns existing asset_id immediately
   - If cache miss → Continue

2. **ProviderAdapter.submit()**
   - Gets provider account: `SELECT * FROM provider_accounts WHERE user_id = ... AND provider_id = 'pixverse'`
   - Loads session cookies from `account.session_data`
   - Submits to Pixverse API:
     ```python
     response = pixverse_client.create_video(
       prompt="A foggy harbor at dawn...",
       duration=8,
       aspect_ratio="16:9",
       seed=42
     )
     ```
   - Creates `ProviderSubmission` with `provider_job_id = response.job_id`
   - Returns generation_id = 100

3. **Background Worker (Job Processor):**
   - Every 10 seconds, polls Pixverse:
     ```python
     status = pixverse_client.get_job_status(job_id="pxv_abc123")
     ```
   - Updates `ProviderSubmission.status` (queued → generating → completed)
   - When completed:
     - Downloads video from `status.result_url`
     - Uploads to local storage `/assets/videos/generation_100.mp4`
     - Creates `Asset` record:
       ```python
       asset = Asset(
         user_id=...,
         provider_id="pixverse",
         provider_asset_id="pxv_abc123",
         remote_url="https://pixverse.com/...",
         local_path="/assets/videos/generation_100.mp4",
         width=1920, height=1080,
         duration_sec=8.0,
         media_type="video",
         sync_status="synced"
       )
       ```
     - Links to generation: `generation.asset_id = asset.id`
     - Creates `AssetLineage` linking to any source assets

4. **Frontend Polling:**
   - UI polls `GET /api/v1/generation/100` every 2 seconds
   - When status = "completed", displays asset thumbnail
   - User can preview via `MediaCard` component (hover scrubbing)

**NPC-Specific Generation:**

For character videos, system uses `PromptContextService`:

```python
npc_snapshot = prompt_context.resolve_npc_snapshot(
  npc_id=10,
  session_flags={},
  world_time=0
)

visual_prompt = block_generator.generate(
  npc_snapshot=npc_snapshot,
  action_block={"pose": "leaning_on_bar", ...},
  style_rules={"mood": "curious", ...}
)

# Result:
# "A gruff ship captain (OCEAN: C=0.8, E=0.7, A=0.5)
#  leans casually on the bar, eyeing you with curiosity.
#  Affinity: 50 (friendly acquaintance). Chemistry: 40 (mild attraction).
#  Mood: Curious, approachable. Tavern interior, dim lighting."
```

**Modules Involved:**
- **Frontend:** `apps/main/src/components/control-center/` - Generation UI
- **Backend:** `services/generation/` - Generation lifecycle
- **Backend:** `services/provider/` - Provider adapters (Pixverse, Runway, etc.)
- **Backend:** `services/prompt_context/` - NPC snapshot resolution
- **Backend:** `workers/job_processor.py` - Background polling
- **Database:** `generations`, `provider_submissions`, `assets` tables

### Friction Point #5: Generation-to-Scene Linking

**Issue:** User has to:
1. Generate content
2. Wait for completion
3. Remember generation ID or asset ID
4. Navigate back to scene graph
5. Manually set asset_id on node

This breaks flow and is error-prone.

**Improvement:**
Add **"Generate and Attach"** button in Scene Graph Editor:
- Right-click on video node → "Generate Content"
- Opens inline generation panel (doesn't leave graph view)
- After generation completes, auto-attaches asset to node
- Shows preview thumbnail in node card

**Implementation Tie-In:**
- Extend `apps/main/src/routes/graph/[id].tsx` with context menu
- Use existing generation API with `scene_context` param
- Add WebSocket event when generation completes to update node in real-time

---

## 5. HOSTING/RUNNING THE WORLD: Session & Gameplay

### User View: Starting a Session

**Creating Session:**

1. User navigates to `/game-2d` (game player)
2. Selects world: "The Harbor District"
3. Clicks **"New Session"**
4. System creates session and loads entry scene

**Entering the World:**

5. UI displays:
   - **Main viewport:** Video playing (harbor intro, asset_id = 800)
   - **HUD overlays:**
     - World time: "Day 1, 8:00 AM"
     - Location: "Harbor Docks"
     - Session flags: `[]` (empty initially)
   - **Control panel:**
     - Skip button (if video.skippable = true)
     - Choice panel (hidden until reveal_choices_at_sec)

6. After 5 seconds, video reaches `reveal_choices_at_sec`
7. **Choice panel** slides in with 3 options:
   - "Visit the Market"
   - "Head to the Tavern"
   - "Explore the Docks"

**Triggering Interactions:**

8. User clicks **"Head to the Tavern"**
9. System:
   - Applies edge effects: `flags: ["visited_tavern"]`
   - Navigates to scene_id = 3
   - Loads video (Captain Mara vignette, asset_id = 801)
   - Shows NPC name overlay: "Captain Mara"

10. Video plays. User sees Captain Mara leaning on bar.
11. After video ends, **NPC Interaction Panel** appears with options:
    - "Talk"
    - "Ask about rumors" (grayed out: "Need affinity 20")
    - "Flirt" (grayed out: "Need affinity 40")

12. User clicks **"Talk"**

**Dialogue Generation:**

13. System:
    - Loads NPC personality + current relationship state
    - Generates dialogue via LLM
    - Response appears in chat-style UI:
      > **Captain Mara:** "You're new around here. Looking for work, or just passing through?"
    - User sees 3 dialogue choices:
      - "I'm looking for adventure." (neutral)
      - "I heard there's good coin to be made." (business-focused, +5 affinity)
      - "Just admiring the view." (flirty, requires chemistry 30)

14. User selects: "I heard there's good coin to be made."
15. System:
    - Applies effect: `affinity += 5` (now 35)
    - Generates Mara's response:
      > **Captain Mara:** "Smart. The sea provides for those who respect it. You seem like you've got a good head on your shoulders."
    - Shows new interaction menu (now "Ask about rumors" is enabled!)

**Monitoring Simulation:**

16. User opens **Session Override Panel** (debug mode):
    - Shows live session state:
      ```json
      {
        "session_id": 200,
        "world_id": 42,
        "current_node_id": "node2",
        "flags": ["visited_tavern"],
        "stats": {},
        "world_time": 0,
        "relationships": {
          "npc_10": {
            "affinity": 35,
            "trust": 20,
            "chemistry": 40,
            "tension": 10,
            "intimacy_level": 0
          }
        }
      }
      ```

17. User opens **World Context Panel**:
    - Shows all active NPCs and their locations:
      - Captain Mara: Tavern (from schedule override during interaction)
      - Ren: Market (schedule: Monday 8:00 AM)
      - Guard Jorin: Harbor Docks (patrolling)

**Advancing Time:**

18. User clicks **"Leave tavern and rest"** (custom scene edge with time effect)
19. System:
    - Advances world_time by 8 hours (8:00 AM → 4:00 PM)
    - Updates NPC locations based on schedules:
      - Captain Mara: Now at Harbor Docks (schedule: 14:00-22:00)
      - Ren: Still at Market
      - Guard Jorin: Now at Market (rotation)

**Observing NPC Reactions Over Time:**

20. User returns to harbor
21. Approaches Captain Mara again
22. **Talk** interaction now shows different dialogue:
    - NPC remembers previous conversation (from `ConversationMemory`)
    - Affinity 35 unlocks different dialogue options
    - Mara's mood is now "friendly" instead of "neutral" (derived from affinity)

### System View

**Session Creation:**
```http
POST /api/v1/game-sessions/
{
  "world_id": 42,
  "user_id": 123,
  "scene_id": 1,
  "current_node_id": "node1",
  "flags": [],
  "stats": {},
  "world_time": 0
}

# Returns session_id = 200
```

**Backend:**
- Creates `GameSession` record
- Initializes `GameSessionEvent` table for event log
- Loads scene graph from `GameScene`

**Scene Navigation:**
```http
PATCH /api/v1/game-sessions/200
{
  "current_node_id": "node2",
  "flags": ["visited_tavern"],
  "relationships": {
    "npc_10": {
      "affinity": 35
    }
  }
}

POST /api/v1/game-sessions/200/event
{
  "node_id": "node2",
  "edge_id": "edge2b",
  "action": "choice_selected",
  "diff": {
    "flags": ["visited_tavern"]
  }
}
```

**Backend:**
- `GameSessionService.update_session()`
- Optimistic locking: checks `session.version`, increments
- If version mismatch → Returns 409 Conflict (concurrent update detected)
- Updates `GameSession` row
- Creates `GameSessionEvent` for audit log

**Interaction Execution:**
```http
POST /api/v1/npc-interactions/execute
{
  "session_id": 200,
  "npc_id": 10,
  "interaction_id": "talk",
  "user_choice_text": "I heard there's good coin to be made."
}
```

**Backend Flow:**

1. **Load Context:**
   ```python
   session = session_service.get_session(200)
   npc = npc_service.get_npc(10)
   npc_state = npc_service.get_npc_state(10)
   world = world_service.get_world(42)
   relationships = session.stats.get("relationships", {}).get("npc_10", {})
   ```

2. **Resolve Prompt Context:**
   ```python
   npc_snapshot = prompt_context.resolve_npc_snapshot(
     npc=npc,
     npc_state=npc_state,
     session_flags=session.flags,
     relationships=relationships,
     world_time=session.world_time
   )

   # Result:
   {
     "personality": {
       "openness": 0.6,
       "conscientiousness": 0.8,
       "extraversion": 0.7,
       "agreeableness": 0.5,
       "neuroticism": 0.3,
       "occupation": "ship captain",
       ...
     },
     "mood": {
       "current_emotion": "friendly",  # Derived from affinity
       "intensity": 0.6,
       "tags": ["approachable", "business-minded"]
     },
     "relationship": {
       "affinity": 35,
       "trust": 20,
       "chemistry": 40,
       "tension": 10,
       "intimacy_level": 0,
       "tier": "acquaintance"  # Computed from affinity
     },
     "memory": [
       # Recent conversation memories
     ],
     "voice_style": "gruff but fair"
   }
   ```

3. **Generate Dialogue:**
   ```python
   dialogue_prompt = f"""
   You are {npc_snapshot["personality"]["occupation"]}.

   Personality: {npc_snapshot["personality"]}
   Current mood: {npc_snapshot["mood"]["current_emotion"]}
   Relationship with player: Affinity {npc_snapshot["relationship"]["affinity"]} (tier: {npc_snapshot["relationship"]["tier"]})

   Recent conversation:
   Player: "I heard there's good coin to be made."

   Respond in character. Voice style: {npc_snapshot["voice_style"]}
   """

   response = llm_service.generate(
     prompt=dialogue_prompt,
     temperature=0.7,
     max_tokens=100
   )

   # Result: "Smart. The sea provides for those who respect it..."
   ```

4. **Apply Effects:**
   ```python
   interaction_effects = {
     "relationships": {
       "npc_10": {
         "affinity": "+5"
       }
     }
   }

   new_affinity = relationships["affinity"] + 5  # 30 + 5 = 35

   session.stats["relationships"]["npc_10"]["affinity"] = new_affinity
   session_service.update_session(session)
   ```

5. **Store Memory:**
   ```python
   memory = ConversationMemory(
     npc_id=10,
     session_id=200,
     user_id=123,
     memory_type="SHORT_TERM",
     importance=5,
     topic="work_opportunity",
     summary="Player expressed interest in making money. I responded positively.",
     mood="friendly",
     created_at=now(),
     decays_at=now() + timedelta(hours=24)
   )
   db.add(memory)
   ```

**Time Advancement:**
```http
POST /api/v1/game-worlds/42/time
{
  "advance_by_sec": 28800  # 8 hours
}
```

**Backend:**
- Updates `GameWorldState.world_time`
- Computes new day/time: `(world_time // 86400, (world_time % 86400) // 3600)`
- Queries `NPCSchedule` for all NPCs, updates `NPCState.current_location_id`

**NPC Presence Query:**
```http
GET /api/v1/game-npcs/presence?world_id=42&world_time=57600
```

**Backend:**
```python
# world_time = 57600 sec = 16:00 (4 PM)
day_of_week = 1  # Monday
time_of_day = 16

for npc in world.npcs:
    schedule = db.query(NPCSchedule).filter(
        NPCSchedule.npc_id == npc.id,
        NPCSchedule.day_of_week == day_of_week,
        NPCSchedule.start_time <= time_of_day,
        NPCSchedule.end_time > time_of_day
    ).first()

    npc_state = get_npc_state(npc.id)
    location_id = npc_state.current_location_id or schedule.location_id

    yield NpcPresenceDTO(
        npc_id=npc.id,
        location_id=location_id,
        state=npc_state.state
    )
```

**Modules Involved:**
- **Frontend:** `apps/game/` - Game player React app
- **Frontend:** `apps/main/src/routes/game-2d.tsx` - 2D game UI
- **Frontend:** `packages/game-ui/` - HUD, panels, overlays
- **Backend:** `services/game/session_service.py` - Session lifecycle
- **Backend:** `services/npc/npc_interaction_service.py` - Interaction execution
- **Backend:** `services/llm/llm_service.py` - Dialogue generation
- **Backend:** `services/prompt_context/` - Context resolution
- **Backend:** `domain/npc_memory.py` - Conversation memory storage

### Friction Point #6: Session State Visibility

**Issue:** User has no intuitive way to see how their choices affected the world. Relationship changes, flag additions, and mood shifts happen invisibly. Only visible in debug panel (JSON dump).

**Improvement:**
Add **Live Feedback Overlays**:
- When affinity changes, show floating "+5 Affinity" badge above NPC portrait
- When flag is added, show brief notification: "Discovered: Tavern Regular"
- When mood shifts, show NPC expression change (fade from neutral to happy)
- Add **Relationship Meter** in NPC interaction panel (visual bar for affinity/trust/chemistry)

**Implementation Tie-In:**
- Add event stream via WebSocket: `ws://localhost:8001/ws/session/200`
- Emit `SessionMutation` events when session updates
- Frontend subscribes and shows toast notifications
- Use existing `@pixsim7/ui` notification system

### Friction Point #7: NPC Schedule Awareness

**Issue:** User has no idea where NPCs are at any given time unless they check the debug panel. Can't plan interactions based on NPC locations.

**Improvement:**
Add **World Map Overlay** (minimap):
- Shows locations as nodes
- Shows NPC avatars at their current locations
- Click NPC avatar → Shows schedule + current activity
- Click location → Fast-travel (if unlocked)
- Time slider to preview "where will NPC X be at 6 PM?"

**Implementation Tie-In:**
- Create `apps/main/src/components/game/WorldMapPanel.tsx`
- Use existing `GET /api/v1/game-npcs/presence` endpoint
- Add `GET /api/v1/game-npcs/{id}/schedule-preview?time={world_time}` endpoint

---

## 6. ITERATION: Tweaking & Testing

### User View: Adjusting NPC Behavior

**Scenario:** User finds Captain Mara's dialogue too formal. Wants her to be more playful.

**Iteration Steps:**

1. User pauses session (or uses dev mode)
2. Opens **NPC Brain Lab** for Captain Mara
3. Adjusts personality:
   - Increase **Extraversion** from 0.7 → 0.9 (more outgoing)
   - Decrease **Neuroticism** from 0.3 → 0.1 (more relaxed)
   - Updates custom trait:
     ```json
     {
       "voice_style": "playful and teasing"  // Changed from "gruff but fair"
     }
     ```

4. Clicks **"Save & Test"**
5. System shows **Prompt Preview** with new personality:
   - Old dialogue: "Smart. The sea provides for those who respect it."
   - New dialogue: "Oh, I like you already! Got that entrepreneurial spirit, eh? Stick around, might have something for you."

6. User confirms change
7. Returns to session
8. Re-triggers **Talk** interaction
9. Sees new dialogue style immediately

**Scenario 2:** User wants to change a scene graph to add a new branch.

**Iteration Steps:**

1. User opens **Scene Graph Editor** for "Tavern NPC Encounter" (scene_id = 3)
2. Adds new choice node after dialogue:
   - **New Node 5:** "Offer to help"
   - **Edge:** From choice node → Node 5
   - **Edge effects:**
     ```json
     {
       "flags": ["mara_quest_started"],
       "relationships": {
         "npc_10": {
           "affinity": "+10",
           "trust": "+15"
         }
       }
     }
     ```
   - **Node 5 config:**
     ```json
     {
       "generationConfig": {
         "type": "dialogue",
         "strategy": "per_playthrough"  # Generate once per playthrough
       }
     }
     ```

3. Saves scene
4. Returns to session
5. Reloads scene (or continues from checkpoint)
6. New choice appears in dialogue menu
7. Selects "Offer to help"
8. System:
   - Generates new dialogue on-the-fly (because strategy = per_playthrough)
   - Applies relationship changes
   - Sets flag "mara_quest_started"
   - Unlocks new interaction: "Ask about the job"

**Scenario 3:** User wants to test a specific relationship state without playing through the whole game.

**Iteration Steps:**

1. User opens **Session Override Panel** (dev mode)
2. Clicks **"Override NPC State"**
3. Selects Captain Mara
4. Sets relationship values:
   - Affinity: 80
   - Trust: 70
   - Chemistry: 90
   - Tension: 20
   - Intimacy level: 3

5. Clicks **"Apply Override"**
6. System:
   - Updates `NPCState` with temporary overrides
   - Marks state as "dev_override" (won't persist to main session)

7. User triggers **Flirt** interaction (now available because chemistry > 30)
8. Sees romance-specific dialogue generated with high chemistry context
9. Tests back-and-forth banter
10. When satisfied, clicks **"Reset Overrides"** to return to actual session state

### System View

**NPC Personality Update:**
```http
PATCH /api/v1/game-npcs/10
{
  "personality": {
    "openness": 0.6,
    "conscientiousness": 0.8,
    "extraversion": 0.9,  # Changed
    "agreeableness": 0.5,
    "neuroticism": 0.1,   # Changed
    "voice_style": "playful and teasing"  # Changed
  }
}
```

**Backend:**
- Updates `GameNPC.personality`
- Invalidates any cached prompt contexts for this NPC
- Next dialogue generation uses new personality

**Scene Graph Update:**
```http
POST /api/v1/game-scenes/3/nodes
{
  "id": "node5",
  "label": "Offer to help",
  "meta": {
    "generationConfig": {
      "type": "dialogue",
      "strategy": "per_playthrough"
    }
  }
}

POST /api/v1/game-scenes/3/edges
{
  "from_node_id": "node3",
  "to_node_id": "node5",
  "choice_label": "Offer to help",
  "effects": {
    "flags": ["mara_quest_started"],
    "relationships": {
      "npc_10": {
        "affinity": "+10",
        "trust": "+15"
      }
    }
  }
}
```

**Backend:**
- Updates `GameSceneNode` and `GameSceneEdge` tables
- Scene version increments (for cache invalidation)
- Next session load gets updated graph

**Dev Override:**
```http
POST /api/v1/dev/override-npc-state
{
  "session_id": 200,
  "npc_id": 10,
  "overrides": {
    "relationships": {
      "affinity": 80,
      "trust": 70,
      "chemistry": 90,
      "tension": 20,
      "intimacy_level": 3
    }
  },
  "temporary": true  # Don't persist to main session
}
```

**Backend:**
- Creates temporary `NPCState` override in session context
- Marks in `session.meta.dev_overrides`
- `PromptContextService` uses overrides when resolving context
- On "Reset", removes from meta and uses actual NPCState

**Modules Involved:**
- **Frontend:** `apps/main/src/components/game/SessionOverridePanel.tsx` - Dev tools
- **Backend:** `services/npc/npc_service.py` - NPC updates
- **Backend:** `services/game/scene_service.py` - Scene graph updates
- **Backend:** `services/dev/override_service.py` (new) - Dev state overrides

### Friction Point #8: Test-in-Context Difficulty

**Issue:** User has to:
1. Make changes to NPC or scene
2. Exit editor
3. Load session
4. Navigate to specific scenario
5. Test change
6. Repeat

This loop is slow for rapid iteration.

**Improvement:**
Add **In-Editor Playtest Mode**:
- In Scene Graph Editor, add **"Playtest from Here"** button on any node
- Opens modal with mini game player
- Loads scene starting from selected node
- Pre-populates session state with configurable overrides
- After playtest, shows diff of what changed (flags, relationships)
- Can export playtest results as "test case" for regression testing

**Implementation Tie-In:**
- Create `apps/main/src/components/scene-graph/PlaytestModal.tsx`
- Use existing session APIs but with `temporary=true` flag
- Add `POST /api/v1/game-sessions/playtest` endpoint (doesn't persist to DB)

---

## 7. FRICTION POINTS & IMPROVEMENTS SUMMARY

### Friction #1: Manifest Editing (World Creation)

**Problem:** Raw JSON editing for world manifest is error-prone, no validation.

**Solution:** Visual World Manifest Builder
- Form-based UI for common fields
- Interaction wizard with dropdown gating conditions
- Role templates with personality sliders
- Real-time JSON preview + schema validation

**Architecture:**
- Frontend: `ManifestBuilder.tsx` component
- Backend: `GET /api/v1/game-worlds/manifest-schema` endpoint
- Store schema: `schemas/world_manifest.json`

---

### Friction #2: Scene-Location Integration (World Structure)

**Problem:** Creating hotspots requires manual scene ID linking, no preview.

**Solution:** Hotspot Scene Previewer
- Dropdown scene selector with thumbnails
- "Create New Scene" auto-linking
- Hover preview (shows first frame of linked scene)
- Split-pane scene editor when clicking hotspot

**Architecture:**
- Extend `LocationEditor.tsx`
- Use existing `MediaCard` for previews
- Backend: `GET /api/v1/game-scenes/{id}/thumbnail`

---

### Friction #3: Interaction Definition vs. Execution (World Structure)

**Problem:** No way to test interaction gating logic without full session.

**Solution:** Interaction Tester Panel
- Mock session state editor (flags, relationships, time, location)
- Live preview of available interactions + disabled reasons
- "Simulate Execute" button (dry-run)
- Before/after NPC state comparison

**Architecture:**
- New route: `/interaction-studio`
- Use existing `POST /api/v1/npc-interactions/list` with mock state
- New endpoint: `POST /api/v1/npc-interactions/simulate` (dry-run, doesn't mutate)

---

### Friction #4: Personality-to-Prompt Opacity (NPC Setup)

**Problem:** User sets personality traits but can't see how they affect prompts.

**Solution:** Prompt Preview in NPC Brain Lab
- Shows example prompts for different scenarios
- Highlights which traits contribute to each prompt section
- Live updates as user adjusts sliders
- Shows derived mood from relationship state

**Architecture:**
- Split-pane view in `npc-brain-lab.tsx`
- Use `PromptContextService.resolve_npc_snapshot()`
- New endpoint: `POST /api/v1/npc-prompts/preview` with mock state

---

### Friction #5: Generation-to-Scene Linking (Generation)

**Problem:** User has to generate content, wait, navigate back, manually attach asset.

**Solution:** "Generate and Attach" in Scene Graph Editor
- Right-click node → "Generate Content"
- Inline generation panel (doesn't leave graph view)
- Auto-attach asset when complete
- Preview thumbnail in node card

**Architecture:**
- Extend `graph/[id].tsx` with context menu
- Use existing generation API with `scene_context` param
- WebSocket event for real-time node update

---

### Friction #6: Session State Visibility (Hosting/Session)

**Problem:** No intuitive way to see how choices affected the world.

**Solution:** Live Feedback Overlays
- Floating "+5 Affinity" badges above NPC portraits
- Brief notifications for flag additions
- NPC expression changes (fade animations)
- Visual relationship meter in interaction panel

**Architecture:**
- WebSocket event stream: `ws://localhost:8001/ws/session/{id}`
- Emit `SessionMutation` events
- Use existing `@pixsim7/ui` notification system

---

### Friction #7: NPC Schedule Awareness (Hosting/Session)

**Problem:** User can't see where NPCs are without debug panel.

**Solution:** World Map Overlay (Minimap)
- Shows locations as nodes
- NPC avatars at current locations
- Click NPC → Schedule + current activity
- Time slider to preview future locations
- Fast-travel option

**Architecture:**
- New component: `WorldMapPanel.tsx`
- Use existing `GET /api/v1/game-npcs/presence`
- New endpoint: `GET /api/v1/game-npcs/{id}/schedule-preview?time={world_time}`

---

### Friction #8: Test-in-Context Difficulty (Iteration)

**Problem:** Slow feedback loop for testing changes (edit → exit → load → navigate → test).

**Solution:** In-Editor Playtest Mode
- "Playtest from Here" button on any graph node
- Modal with mini game player
- Pre-populate with configurable session state
- Shows diff of changes (flags, relationships)
- Export as test case for regression testing

**Architecture:**
- New component: `PlaytestModal.tsx`
- New endpoint: `POST /api/v1/game-sessions/playtest` (temporary, no persist)
- Returns session state diff for review

---

## FINAL OBSERVATIONS

### What Works Well

1. **Clear domain separation** - Game, narrative, stats, generation are cleanly separated
2. **Plugin system** - Allows extending both backend and frontend without core changes
3. **Stat engine** - Flexible stat packages with derivations
4. **Reproducible generation** - Hash-based caching prevents duplicate work
5. **Session versioning** - Optimistic locking prevents race conditions
6. **Asset lineage** - Full tracking of generation history

### What Needs Refinement

1. **UI/UX gaps** - Many features exist in backend but lack intuitive UI
2. **Feedback visibility** - State changes happen invisibly
3. **Editor integration** - Too much context-switching between panels
4. **Testing workflow** - No in-editor playtesting
5. **Documentation** - Manifest schema not exposed to UI

### Architecture Strengths

- **Monorepo** allows sharing types across frontend/backend
- **Service layer** provides clean abstraction over domain models
- **Prompt context system** is flexible and extensible
- **Background workers** handle async generation well

### Architecture Gaps

- **No event bus** - Session mutations don't propagate to UI in real-time
- **No schema validation** - Manifest/meta fields are free-form JSON
- **Limited rollback** - Session updates are destructive (no undo/redo)
- **No A/B testing** - Can't compare different NPC personalities or scene branches

---

## Conclusion

This simulation demonstrates that **PixSim7 has a solid technical foundation** but needs **UX polish** to make the creative workflow smooth. Most friction points can be addressed with:

1. Better visual editors for JSON-heavy features
2. Real-time feedback overlays
3. In-context testing/playtesting tools
4. Tighter integration between related panels (scenes ↔ generation ↔ NPCs)

**The architecture supports all these improvements without major refactoring.**

All identified improvements are concrete, tied to existing architecture, and prioritize user experience over adding new features. The focus should be on making existing capabilities more discoverable and easier to use.
