**Task: Quest Tracker & Story Variables Manager**

**Context**
- Quest log exists as a world tool showing active quests from `GameSession.flags.quests`.
- Story progression tracked via `GameSession.flags` (flat key-value).
- Scene graphs can reference flags, but there's no centralized quest design/tracking system.
- Missing:
  - Visual quest graph/flowchart for designing quest structures.
  - Story variable manager to see all flags/state at a glance.
  - Quest template system for reusable quest patterns.

**Goal**
Build a **Quest Tracker & Story Variables Manager** that:
- Provides **Quest Graph Builder** - visual design tool for quest structures (states, triggers, outcomes).
- Adds **Story Variables Dashboard** - centralized view/edit of all session flags and state.
- Enables **Quest Templates** - reusable quest patterns (e.g., "fetch quest", "romance arc").
- Integrates with existing scene graphs and game session systems.

**Key Ideas**
- Quest data model:
  ```ts
  interface QuestDefinition {
    id: string;
    name: string;
    description?: string;
    states: QuestState[];         // States the quest can be in
    transitions: QuestTransition[]; // How to move between states
    rewards?: QuestReward[];
    requirements?: {               // Prerequisites
      level?: number;
      flags?: string[];
      relationships?: Record<string, number>;
    };
  }

  interface QuestState {
    id: string;
    name: string;                  // 'not_started', 'in_progress', 'completed'
    description?: string;
    objectiveText?: string;        // What player sees
    sceneReferences?: string[];    // Link to scene nodes
  }

  interface QuestTransition {
    from: string;                  // State ID
    to: string;                    // State ID
    trigger: {
      type: 'flag' | 'scene-complete' | 'interaction' | 'time';
      condition: string | number;  // Flag name, scene ID, etc.
    };
    actions?: Array<{              // What happens on transition
      type: 'set-flag' | 'give-item' | 'change-relationship';
      target: string;
      value: any;
    }>;
  }
  ```
- Story variables stored in existing `GameSession.flags` but with metadata:
  ```ts
  interface StoryVariable {
    key: string;                   // Flag key
    value: any;                    // Current value
    type: 'boolean' | 'number' | 'string' | 'enum';
    category?: string;             // 'quest', 'relationship', 'world-state'
    description?: string;          // What this flag controls
    defaultValue?: any;
  }
  ```

**Implementation Outline**

1. **Quest Definition Module**
   - New module: `frontend/src/lib/quests/definitions.ts`.
   - Implement:
     - `QuestStore` with CRUD operations (localStorage initially).
     - `getActiveQuests(session: GameSession): QuestDefinition[]`.
     - `updateQuestState(session, questId, newState): GameSession`.
   - Ship with 3-5 example quest definitions.

2. **Quest Graph Builder UI**
   - New route: `frontend/src/routes/QuestBuilder.tsx`.
   - Use node-based graph editor (similar to scene editor):
     - Nodes = quest states.
     - Edges = transitions with trigger conditions.
   - Features:
     - Add/edit quest states (name, description, objectives).
     - Define transitions:
       - Drag edge from state to state.
       - Configure trigger (flag check, scene completion, etc.).
       - Define actions (set flags, give rewards).
     - Link states to scene nodes (reference scene IDs).
     - Save quest definition to QuestStore.

3. **Story Variables Dashboard**
   - New route or panel: `frontend/src/routes/StoryVariables.tsx`.
   - Features:
     - **Table View**:
       - List all flags from current `GameSession.flags`.
       - Columns: Key, Value, Type, Category, Description.
       - Inline editing (change values, useful for debugging).
     - **Categorization**:
       - Group by category (quests, relationships, world-state, custom).
       - Filter by category, search by key name.
     - **Metadata Management**:
       - Store flag metadata in `localStorage` or session meta:
         - Map of flag key → {type, category, description}.
       - Designers can annotate flags for team clarity.

4. **Quest Template System**
   - Define quest templates (similar to interaction presets):
     - Template = pre-built QuestDefinition with placeholder states/transitions.
   - New component: `frontend/src/components/quests/QuestTemplateLibrary.tsx`.
   - Features:
     - List built-in templates ("Fetch Quest", "Romance Arc Stage", "Investigation Chain").
     - Apply template to create new quest definition.
     - Customize states/transitions after applying.

5. **Integration with Game Session**
   - Quest graph builder generates flag-based logic:
     - Transitions set/check flags via existing `GameSession.flags`.
   - Story variables dashboard reads/writes directly to active session.
   - Quest log world tool updated to:
     - Read from QuestStore for quest definitions.
     - Display current state, objectives, progress based on session flags.

**Constraints**
- No backend schema changes; quests stored as JSON in frontend or `GameWorld.meta`.
- Use existing `GameSession.flags` for runtime quest state.
- Quest definitions are design-time artifacts; session only tracks state transitions.

**Success Criteria**
- Designers can visually design quest flows in graph builder and link to scenes.
- Story variables dashboard provides clear overview of all session state for debugging.
- Quest templates speed up creation of common quest patterns.
- Active quests show correct state/objectives in quest log world tool.

---

## Phase 2: Branching Narrative Debugger, Quest Analytics & Cross-Quest Dependencies

Once basic quest tracker works, add advanced features:

**Phase 2 Goals**
- Add **Branching Narrative Debugger** - visualize all possible story paths from current state.
- Implement **Quest Analytics** - track completion rates, bottlenecks, popular paths.
- Support **Cross-Quest Dependencies** - quests that require other quests to be completed.
- Add **Quest Versioning** - track changes to quest definitions over time.

**Features**
- Narrative debugger:
  - Show all reachable states from current position.
  - Highlight unreachable states (dead ends, impossible transitions).
  - "What-if" simulation - preview outcomes of flag changes.
- Quest analytics dashboard:
  - Which quests are most completed/abandoned.
  - Average time to complete.
  - Flag value distributions.
- Quest dependencies:
  - Define prerequisite quests.
  - Auto-unlock quests when dependencies met.
- Export/import quest definitions for sharing.

**Success Criteria**
- Production-ready quest system with comprehensive tooling.
- Designers can debug complex branching narratives visually.
- Analytics inform quest balance and pacing decisions.

---

## Phase 3: Dynamic Quest Generation & Adaptation

Create quests that adapt to player choices and world state.

**Phase 3 Goals**
- Build **procedural quest generator** based on world context.
- Add **quest branching** that responds to player actions.
- Implement **quest chaining** for epic storylines.
- Create **personal quests** based on character history.

**Key Features**
- Procedural generation:
  - Context-aware quest creation.
  - Template combination.
  - Objective generation.
- Dynamic adaptation:
  - Alternative solutions.
  - Failure recovery paths.
  - Emergent objectives.
- Quest relationships:
  - Prerequisite chains.
  - Parallel storylines.
  - Convergent narratives.

---

## Phase 4: Narrative AI & Story Generation

Use AI to create and manage complex narratives.

**Phase 4 Goals**
- Implement **narrative AI** for story generation.
- Add **plot hole detection** and resolution.
- Create **dramatic arc** management.
- Build **character arc** tracking.

**Key Features**
- Story generation:
  - Plot point creation.
  - Conflict generation.
  - Resolution planning.
- Narrative analysis:
  - Pacing evaluation.
  - Tension curves.
  - Satisfaction metrics.
- Character development:
  - Arc progression.
  - Growth tracking.
  - Relationship evolution.

---

## Phase 5: Transmedia Story Platform

Extend stories across multiple media and platforms.

**Phase 5 Goals**
- Build **cross-media story** synchronization.
- Add **community-driven** story extensions.
- Create **canonical story** management.
- Implement **story franchise** tools.

**Key Features**
- Multi-platform:
  - Mobile companion apps.
  - Web story portals.
  - Social media integration.
- Community features:
  - Fan fiction integration.
  - Community quests.
  - Shared world stories.
- Franchise management:
  - Canon tracking.
  - Timeline management.
  - Crossover tools.
