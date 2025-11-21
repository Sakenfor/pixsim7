&nbsp; # PixSim7 Narrative Prompt Engine – Spec for Implementation



&nbsp; ## 0. Context



&nbsp; PixSim7 is a modular monolith with:



&nbsp; - Backend: FastAPI / SQLModel (Python).

&nbsp; - Frontend: React/TS, with:

&nbsp;     - 2D game route: apps/main/src/routes/Game2D.tsx.

&nbsp;     - Scene editor graph: apps/main/src/components/GraphPanel.tsx, SceneBuilderPanel.tsx.

&nbsp; - Shared: Scene runtime types + UI:

&nbsp;     - @pixsim7/types – Scene, SceneNode, SceneEdge, etc.

&nbsp;     - @pixsim7/game-ui – ScenePlayer.



&nbsp; We’ve layered in:



&nbsp; - Worlds: GameWorld, GameWorldState (+ /api/v1/game/worlds).

&nbsp; - Sessions: GameSession (world\_time, flags, relationships).

&nbsp; - NPCs: GameNPC, NPCSchedule, NPCState, NpcExpression.

&nbsp; - 2D actions: GameHotspot.meta.action (play\_scene, change\_location, npc\_talk).

&nbsp; - Relationship/arc design: docs/RELATIONSHIPS\_AND\_ARCS.md.

&nbsp; - Graph + life‑sim editor phases: docs/GRAPH\_UI\_LIFE\_SIM\_PHASES.md.



&nbsp; We now want a Narrative Prompt Engine that drives NPC dialogue (and optionally cinematic prompts) based on NPC persona

&nbsp; + world/session/arc state.



&nbsp; ———



&nbsp; ## 1. Overall Goal



&nbsp; Design and (within this repo) implement a PixSim7‑specific narrative prompt engine that:



&nbsp; - Consumes:

&nbsp;     - NPC persona (baseline + per‑world overrides),

&nbsp;     - Session relationship state (per NPC),

&nbsp;     - World/arc state (story arcs, quests, flags),

&nbsp;     - Scene/node metadata (roles, hard npc\_id bindings, optional hints),

&nbsp;     - Player input (chosen option or free text).

&nbsp; - Produces:

&nbsp;     - A text prompt string for a chat LLM to generate the NPC’s reply.

&nbsp;     - Optional “visual prompt” text suitable for image→video generation when a branch calls for a new clip.

&nbsp;     - Structured “intent” metadata (e.g., suggested next actions / follow‑up choices).



&nbsp; It must:



&nbsp; - Be data‑driven (no hardcoded relationship levels in code).

&nbsp; - Respect existing conventions (meta, flags, relationships).

&nbsp; - Integrate with the existing backend (FastAPI / Python) without adding a new microservice.

&nbsp; - Be incremental: start with 1–2 concrete “beats” we can wire to the 2D UI, not a full authoring UI.



&nbsp; ———



&nbsp; ## 2. Current State Model (What You Can Rely On)



&nbsp; ### 2.1 Per‑session NPC relationship state



&nbsp; For each NPC in a session:



&nbsp; // GameSession.relationships\["npc:12"]

&nbsp; {

&nbsp;   "affinity": 72,          // how much they like the player

&nbsp;   "trust": 55,             // comfort / safety

&nbsp;   "chemistry": 68,         // romantic/erotic spark (neutral name)

&nbsp;   "tension": 30,           // unresolved emotional charge / awkwardness

&nbsp;   "flags": {

&nbsp;     "kissed\_once": true,

&nbsp;     "slept\_over": false,

&nbsp;     "knows\_secret\_x": true

&nbsp;   }

&nbsp; }



&nbsp; - This lives in GameSession.relationships (JSON).

&nbsp; - Values are floats/ints (0–100 is a convention, not enforced).

&nbsp; - We already document relationships in docs/RELATIONSHIPS\_AND\_ARCS.md.



&nbsp; ### 2.2 Per‑world relationship tiers (already defined)



&nbsp; GameWorld.meta.relationship\_schemas describes per‑world affinity tiers:



&nbsp; {

&nbsp;   "relationship\_schemas": {

&nbsp;     "default": \[

&nbsp;       { "id": "stranger",      "min": 0,  "max": 9 },

&nbsp;       { "id": "acquaintance",  "min": 10, "max": 29 },

&nbsp;       { "id": "friend",        "min": 30, "max": 59 },

&nbsp;       { "id": "close\_friend",  "min": 60, "max": 79 },

&nbsp;       { "id": "lover",         "min": 80, "max": 100 }

&nbsp;     ]

&nbsp;   }

&nbsp; }



&nbsp; - Authors can adjust labels and thresholds per world.

&nbsp; - These tiers are used by arcs/conditions (see RELATIONSHIPS\_AND\_ARCS.md).



&nbsp; ### 2.3 Optional per‑world intimacy schema (design target)



&nbsp; We’d like to support an intimacy schema (world‑authored) that combines axes:



&nbsp; {

&nbsp;   "intimacy\_schema": {

&nbsp;     "axes": \["affinity", "trust", "chemistry", "tension"],

&nbsp;     "levels": \[

&nbsp;       { "id": "light\_flirt",   "minAffinity": 20, "minChemistry": 20, "minTrust": 10 },

&nbsp;       { "id": "deep\_flirt",    "minAffinity": 40, "minChemistry": 40, "minTrust": 20 },

&nbsp;       { "id": "intimate",      "minAffinity": 60, "minChemistry": 60, "minTrust": 40 },

&nbsp;       { "id": "very\_intimate", "minAffinity": 80, "minChemistry": 80, "minTrust": 60 }

&nbsp;     ]

&nbsp;   }

&nbsp; }



&nbsp; - This is not implemented yet in code; you should:

&nbsp;     - Formalize the JSON shape (as above, lightly validated in backend).

&nbsp;     - Add a small helper to resolve (affinity, trust, chemistry, tension) → levelId using this schema.



&nbsp; ### 2.4 NPC persona \& world overrides



&nbsp; - GameNPC.personality: baseline persona (traits, style, etc.) – arbitrary JSON.

&nbsp; - GameWorld.meta.npc\_overrides\[npc\_id]: per‑world persona overrides:

&nbsp;     - e.g., { "personality": { ... }, "nameOverride": "...", "tags": \[...] }.



&nbsp; Your engine should define how to merge these into an effective persona for a given (world, npc).



&nbsp; ### 2.5 Scenes, roles, and NPC binding



&nbsp; At scene level:



&nbsp; - Roles (soft binding):

&nbsp;     - We intend to use Scene.meta.cast:



&nbsp;       // conceptual

&nbsp;       cast: Array<{ role: string; label?: string; defaultNpcId?: number }>

&nbsp;     - Nodes can refer to roles via SceneNode.meta.speakerRole.

&nbsp; - Hard binding (identity):

&nbsp;     - Nodes may have SceneNode.meta.npc\_id (reserved convention) for “this node is specifically NPC X”.

&nbsp; - NPC expression hints:

&nbsp;     - Nodes may have SceneNode.meta.npc\_state (e.g. idle, talking, waiting\_for\_player), used to pick NpcExpression

&nbsp;       in UI.



&nbsp; These are already partially wired in SceneBuilderPanel and passed through via SceneNode.meta.



&nbsp; ———



&nbsp; ## 3. What We Want You To Design \& Implement



&nbsp; ### 3.1 Data model for prompt programs (JSON/AST)



&nbsp; Design a language-agnostic JSON/AST shape for “prompt programs” that the narrative engine will execute. This should:



&nbsp; - Allow defining dialogue beats:

&nbsp;     - Inputs: npc, world, session, relationship axes, tiers, intimacy level, arc state, last player input.

&nbsp;     - Output:

&nbsp;         - A text prompt for the chat LLM (single string).

&nbsp;         - Optional visual prompt string for video generation.

&nbsp;         - Optional metadata about suggested next intents/choices.

&nbsp; - Be easy to author in TypeScript (later) and easy to interpret in Python (now).



&nbsp; You don’t need to build a full DSL parser; a structured JSON spec is fine.



&nbsp; ### 3.2 Python runtime engine



&nbsp; Implement a small Python narrative engine inside PixSim7’s backend that:



&nbsp; - Has a clear entrypoint (e.g. NarrativeEngine.build\_dialogue\_request(context)) where context includes:

&nbsp;     - world\_id, session\_id, npc\_id, location\_id (optional),

&nbsp;     - relationship axes (affinity, trust, chemistry, tension),

&nbsp;     - tier / intimacy level (computed from world meta),

&nbsp;     - current arc/quest state (flags.arcs\[...]),

&nbsp;     - scene/node metadata (speakerRole, npc\_id, npc\_state, etc.),

&nbsp;     - last player input (text or choice id).

&nbsp; - Loads the appropriate prompt program (for now, hardcode 1–2 examples in code or as JSON files).

&nbsp; - Produces:

&nbsp;     - llm\_prompt: str – final prompt to send to the chat model.

&nbsp;     - visual\_prompt: Optional\[str] – optional image/video prompt.

&nbsp;     - metadata: dict – e.g. suggested intents \["increase\_intimacy", "change\_topic"].



&nbsp; The engine should:



&nbsp; - Contain helper functions like:

&nbsp;     - compute\_intimacy\_level(relationship, world\_meta)

&nbsp;     - effective\_persona(world, npc)

&nbsp; - NOT call the LLM or video API itself; just build the prompts.



&nbsp; ### 3.3 Minimal backend API integration



&nbsp; Add small, focused endpoints that frontends can call, e.g.:



&nbsp; - POST /game/dialogue/next-line

&nbsp;     - Input: { npc\_id, scene\_id?, node\_id?, player\_input } (plus world/session ID derived from auth/session).

&nbsp;     - Backend:

&nbsp;         - Loads world/session/NPC state.

&nbsp;         - Calls the narrative engine to build the LLM prompt (+ optional visual prompt).

&nbsp;         - For now, just returns the built prompts and metadata (we’ll wire the actual LLM call separately).

&nbsp;     - Output:



&nbsp;       {

&nbsp;         "llm\_prompt": "...",

&nbsp;         "visual\_prompt": null,

&nbsp;         "meta": {

&nbsp;           "intimacy\_level": "deep\_flirt",

&nbsp;           "axes": { "affinity": 72, "trust": 55, "chemistry": 68, "tension": 30 }

&nbsp;         }

&nbsp;       }



&nbsp; Optional (nice to have, not required in first iteration):



&nbsp; - POST /game/dialogue/generate-clip that returns a video prompt and a place to attach a new asset later.



&nbsp; ### 3.4 No schema changes, only JSON conventions



&nbsp; Important constraints:



&nbsp; - Don’t add new DB tables or columns.

&nbsp; - Use:

&nbsp;     - GameSession.relationships for per‑NPC numeric state.

&nbsp;     - GameSession.flags and GameSession.relationships.flags for boolean flags.

&nbsp;     - GameWorld.meta.relationship\_schemas and GameWorld.meta.intimacy\_schema for world‑defined tiers.

&nbsp;     - GameNPC.personality + GameWorld.meta.npc\_overrides for persona.

&nbsp;     - SceneNode.meta and Scene.meta.cast for scene/node hints.

&nbsp; - If you need to store anything new, do it in JSON meta or under new keys in flags/relationships, following the naming

&nbsp;   conventions in RELATIONSHIPS\_AND\_ARCS.md.



&nbsp; ———



&nbsp; ## 4. Non-Goals (For This Pass)



&nbsp; - No UI/editor work yet:

&nbsp;     - Don’t change React components; just design the backend + engine and maybe add comments/docs about how UIs should

&nbsp;       call it.

&nbsp; - No actual LLM or video generation calls:

&nbsp;     - Just build prompts; we’ll plug in the actual models later.

&nbsp; - No giant generic DSL:

&nbsp;     - Keep the prompt program spec minimal and focused on PixSim7’s use case.

&nbsp; - No multi‑world or multiplayer complexity beyond what’s already in docs:

&nbsp;     - Assume single player, one world/session context at a time.



&nbsp; ———



&nbsp; ## 5. References (You Should Read / Respect)



&nbsp; Before designing, please skim:



&nbsp; - docs/RELATIONSHIPS\_AND\_ARCS.md

&nbsp;     - For relationship storage, arcs, and the new section on relationship tiers.

&nbsp; - docs/GRAPH\_UI\_LIFE\_SIM\_PHASES.md

&nbsp;     - Especially Character Binding Model and Phase 7 (World Story / Arc Graph).

&nbsp; - docs/HOTSPOT\_ACTIONS\_2D.md

&nbsp;     - For how hotspot actions and scenes are triggered in 2D.

&nbsp; - Backend game models:

&nbsp;     - pixsim7\_backend/domain/game/models.py

&nbsp; - Relevant APIs:

&nbsp;     - pixsim7\_backend/api/v1/game\_sessions.py

&nbsp;     - pixsim7\_backend/api/v1/game\_worlds.py

&nbsp;     - pixsim7\_backend/api/v1/game\_npcs.py



&nbsp; ———



&nbsp; ## 6. Deliverables



&nbsp; In this first implementation pass, I’d like:



&nbsp; 1. A clear JSON/AST schema for prompt programs (documented in a small doc under docs/).

&nbsp; 2. A narrative\_engine module in the backend that:

&nbsp;     - Computes relationship tiers/intimacy levels from world meta.

&nbsp;     - Merges persona from GameNPC.personality + world overrides.

&nbsp;     - Builds structured dialogue (and optional video) prompts from state + a small example program.

&nbsp; 3. Minimal FastAPI endpoints to expose:

&nbsp;     - build\_next\_line\_prompt for an NPC in a world/session context.

&nbsp; 4. A short “How to call the narrative engine” doc for frontend/agent authors.



&nbsp; Keep the code small, focused, and wired to the actual PixSim7 types and JSON conventions, not generic placeholders.

