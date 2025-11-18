**Task: NPC Archetype System & Visual Relationship Editor**

**Context**
- NPCs are stored in `game_npcs` table with portraits, schedules, and state.
- Relationships exist in `GameSession.relationships` as a flat object.
- NpcPortraits route shows list view; NpcBrainLab shows brain introspection.
- Missing:
  - Reusable NPC templates/archetypes (e.g., "friendly bartender", "suspicious guard").
  - Visual relationship graph for designing/debugging NPC connections.
  - Easy way to spawn NPCs from archetypes with pre-configured traits.

**Goal**
Build an **NPC Archetype System** and **Relationship Graph Editor** that:
- Provides **NPC Archetypes** - reusable templates with default traits, interactions, portraits.
- Enables **Visual Relationship Editing** - graph-based UI for designing NPC connections.
- Adds **Quick NPC Spawning** - create NPCs from archetypes with one action.
- Integrates with existing NPC brain/portrait/schedule systems.

**Key Ideas**
- Define NPC archetype:
  ```ts
  interface NpcArchetype {
    id: string;
    name: string;                      // 'Friendly Bartender'
    description?: string;
    category?: string;                 // 'service', 'romance', 'antagonist'
    defaultTraits?: {
      personality?: string[];          // ['friendly', 'talkative']
      defaultMood?: number;            // 0.7
      goals?: string[];
    };
    defaultInteractions?: {            // Pre-configured interaction slots
      [interactionId: string]: {
        enabled: boolean;
        config: Record<string, any>;
      };
    };
    defaultSchedule?: NpcScheduleEntry[];
    portraitHints?: {                  // Generation template hints
      style?: string;
      age?: string;
      gender?: string;
    };
    tags?: string[];
  }
  ```
- Relationship graph data model:
  ```ts
  interface RelationshipGraph {
    nodes: Array<{
      npcId: number;
      name: string;
      position?: { x: number; y: number }; // For graph layout
    }>;
    edges: Array<{
      from: number;                    // NPC ID
      to: number;                      // NPC ID
      type: string;                    // 'friend', 'rival', 'romance', etc.
      value: number;                   // Relationship score (-1 to 1)
      metadata?: Record<string, any>;  // Arc references, flags, etc.
    }>;
  }
  ```

**Implementation Outline**

1. **Archetype Storage Module**
   - New module: `frontend/src/lib/npc/archetypes.ts`.
   - Implement:
     - `ArchetypeStore` with CRUD operations (localStorage initially).
     - `getArchetypes(): NpcArchetype[]`.
     - `createNpcFromArchetype(archetype, overrides): NpcCreationData`.
   - Ship with 5-10 built-in archetypes in `archetypes.json`.

2. **Archetype Editor UI**
   - New component: `frontend/src/components/npc/ArchetypeEditor.tsx`.
   - Features:
     - List archetypes (built-in + custom).
     - Create/edit archetype:
       - Configure default traits, interactions, schedule.
       - Define portrait generation hints.
     - Delete/duplicate archetypes.
   - Integrate into NpcPortraits route as a tab or separate panel.

3. **Quick NPC Spawning**
   - In NpcPortraits or GameWorld NPC management:
     - "Create NPC from Archetype" button.
     - Select archetype from list.
     - Optionally override name, portrait, specific traits.
     - Submit to `createNpc` API with archetype defaults applied.
   - Generated NPC includes:
     - Pre-configured interaction slots from archetype.
     - Default schedule if provided.
     - Portrait can be generated using archetype hints + existing generation system.

4. **Relationship Graph Editor**
   - New route: `frontend/src/routes/RelationshipGraph.tsx`.
   - Use existing graph library (same as scene editor, or simpler force-directed graph).
   - Features:
     - **Node View**:
       - Show NPCs as nodes (name, portrait thumbnail).
       - Click node to edit NPC or view brain state.
     - **Edge View**:
       - Show relationships as edges with labels (type + value).
       - Click edge to edit relationship:
         - Modify type, value, metadata.
         - Add arc references or flags.
     - **Layout Controls**:
       - Auto-layout (force-directed).
       - Manual drag-and-drop positioning.
       - Save layout positions to session meta or localStorage.
   - Data source:
     - Load `GameSession.relationships` for active session.
     - Convert to `RelationshipGraph` format.
     - Sync changes back to session via existing API.

5. **Graph Filtering & Views**
   - Filter by relationship type (show only 'romance', 'rival', etc.).
   - Filter by relationship threshold (>0.5, <-0.3).
   - Group nodes by location, faction, or archetype category.

**Constraints**
- No backend schema changes; archetypes stored in frontend initially.
- Use existing `GameSession.relationships` structure - no new relationship table.
- Reuse existing NPC creation API (`createNpc`, `updateNpc`).

**Success Criteria**
- Designers can create NPC archetypes and spawn NPCs from them with pre-configured traits/interactions.
- Visual relationship graph lets designers see and edit NPC connections at a glance.
- Changes to relationships in graph editor sync to game session correctly.

---

## Phase 2: Faction System, Dynamic Relationships & AI-Suggested Archetypes

Once basic archetypes and relationship editing work, add deeper systems:

**Phase 2 Goals**
- Introduce **Faction/Group System** - NPCs belong to factions with collective relationships.
- Add **Dynamic Relationship Rules** - auto-adjust relationships based on events/flags.
- Implement **AI-Suggested Archetypes** - analyze existing NPCs to suggest new archetypes.
- Add **Relationship History Timeline** - track how relationships evolved over time.

**Features**
- Faction nodes in relationship graph (NPC → Faction → NPC relationships).
- Relationship simulation - preview how relationships might evolve under different scenarios.
- Archetype analytics - which archetypes are most used, which need refinement.
- Import/export archetypes for sharing across projects.

**Success Criteria**
- Production-ready NPC management with faction-aware relationships.
- Designers can simulate relationship evolution before committing to story arcs.
- Rich archetype library enables rapid NPC creation without repetitive configuration.

---

## Phase 3: Behavioral AI & Personality Systems

Add sophisticated AI-driven personality and behavior modeling.

**Phase 3 Goals**
- Implement **personality engine** with traits affecting behavior.
- Add **emotional state machines** for NPCs.
- Create **memory systems** for NPC experiences.
- Build **social AI** for group dynamics.

**Key Features**
- Personality modeling:
  - Big Five personality traits.
  - Trait-based decision making.
  - Personality evolution.
- Emotional systems:
  - Multi-dimensional emotions.
  - Emotional contagion.
  - Mood persistence.
- Memory:
  - Short/long-term memory.
  - Emotional memory coloring.
  - Memory-based relationships.

---

## Phase 4: Procedural NPC Generation & Evolution

Create systems for automatic NPC creation and development.

**Phase 4 Goals**
- Build **procedural NPC generator** with coherent backgrounds.
- Add **life simulation** for NPC histories.
- Implement **genetic algorithms** for NPC traits.
- Create **cultural systems** affecting NPC behavior.

**Key Features**
- Procedural generation:
  - Name generation with etymology.
  - Backstory creation.
  - Appearance generation.
- Life simulation:
  - Birth to present history.
  - Major life events.
  - Relationship formation.
- Cultural modeling:
  - Cultural traits and values.
  - Language differences.
  - Cultural evolution.

---

## Phase 5: Advanced Social Simulation Platform

Create a comprehensive social simulation system.

**Phase 5 Goals**
- Implement **society-level simulation** with institutions.
- Add **political systems** and power dynamics.
- Create **economic roles** and class systems.
- Build **generational changes** and inheritance.

**Key Features**
- Social structures:
  - Institutions and organizations.
  - Social networks.
  - Power hierarchies.
- Political simulation:
  - Faction dynamics.
  - Leadership changes.
  - Policy impacts.
- Economic integration:
  - Job systems.
  - Wealth distribution.
  - Social mobility.
