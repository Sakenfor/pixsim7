**Task: Intimacy Scene Composer & Relationship Progression Editor (Multi‑Phase)**

**Context**
- You have a rich intimacy and relationship system:
  - Relationship preview APIs (Task 07) for tier/intimacy computation.
  - Social metrics (Task 08) for NPC mood and reputation.
  - Generation pipeline (Task 10) with `GenerationSocialContext` integration.
  - Intimacy-aware generation nodes (Task 09) with content rating controls.
- You have editor infrastructure:
  - Interaction presets (Task 02) with playlists, suggestions, and conflict detection.
  - Graph templates (Task 03 - planned) for reusable scene patterns.
  - Scene/quest editor with React Flow nodes.
  - World tools and simulation playground (Tasks 01, 05).
- **Missing**: A dedicated **visual editor** for designing intimate scenes and relationship progression arcs that:
  - Shows relationship thresholds visually (gates, branching).
  - Integrates with generation pipeline for content preview.
  - Validates intimacy/content rating constraints.
  - Provides designer-friendly tools for crafting progression without code.

This task creates an **Intimacy Scene Composer** and **Relationship Progression Editor** that unifies your systems into a cohesive authoring experience for adult content with proper safety rails.

> **For agents:** This task is about **editor tooling**, not core systems. Build on existing preview APIs, generation types, and interaction presets. Focus on UX for designers creating intimate content with clear gating and validation.

### Phase Checklist

- [ ] **Phase 1 – Design Progression Editor UX (Wireframes & Data Model)**
- [ ] **Phase 2 – Relationship Gate Visualizer (Tier/Intimacy Thresholds)**
- [ ] **Phase 3 – Intimacy Scene Node Type (Graph Editor Integration)**
- [ ] **Phase 4 – Live Preview with Social Context (What-If Analysis)**
- [ ] **Phase 5 – Content Rating Validation & Safety Rails**
- [ ] **Phase 6 – Progression Templates & Preset Library**
- [ ] **Phase 7 – Generation Integration (Preview Intimacy Scenes)**
- [ ] **Phase 8 – Relationship Arc Timeline Visualizer**
- [ ] **Phase 9 – Playtesting Tools (Simulation Integration)**
- [ ] **Phase 10 – Export/Import Progression Packs & Analytics**

---

### Phase 1 – Design Progression Editor UX (Wireframes & Data Model)

**Goal**
Define the visual editor experience and data structures for relationship progression design.

**Scope**
- UI/UX design and data model; no implementation yet.

**Key Steps**
1. **Wireframe Key Views**:
   - **Progression Graph View**: Visual timeline showing relationship stages with gates
   - **Scene Composer View**: Drag-and-drop interface for arranging intimate interactions
   - **Gate Inspector**: Side panel showing threshold requirements (affinity, chemistry, trust, tension)
   - **Preview Panel**: Live social context preview with content rating indicators

2. **Define Core Data Structures**:
   ```typescript
   export interface RelationshipProgression {
     id: string;
     name: string;
     npcId: number;
     worldId: number;
     stages: ProgressionStage[];
     metadata: {
       category?: string;
       tags?: string[];
       contentRating: 'sfw' | 'romantic' | 'mature_implied' | 'restricted';
     };
   }

   export interface ProgressionStage {
     id: string;
     name: string;
     gates: RelationshipGate[];
     scenes: IntimacySceneRef[];
     interactions: string[]; // Preset IDs from Task 02
     order: number;
   }

   export interface RelationshipGate {
     type: 'tier' | 'intimacy' | 'mood' | 'custom';
     operator: 'gte' | 'lte' | 'eq';
     value: string | number;
     required: boolean;
     errorMessage?: string;
   }

   export interface IntimacySceneRef {
     sceneId?: string;
     generationNodeId?: string; // Links to Task 10 generation
     socialContext: GenerationSocialContext; // From Task 09
     interactionPlaylistId?: string; // From Task 02 Phase 10
   }
   ```

3. **Document User Flows**:
   - Designer creates new progression arc for an NPC
   - Adds stages with relationship gates (e.g., "Friend Tier", "50+ Chemistry")
   - Associates scenes/interactions with each stage
   - Validates content rating compliance
   - Tests progression in Simulation Playground

4. **Integration Points**:
   - Use relationship preview APIs (Task 07) for gate validation
   - Use interaction presets/playlists (Task 02) for scene content
   - Use social metrics (Task 08) for mood-based gates
   - Use generation pipeline (Task 10) for content preview

---

### Phase 2 – Relationship Gate Visualizer (Tier/Intimacy Thresholds)

**Goal**
Create visual components that show relationship requirements as interactive gates.

**Scope**
- Frontend components for displaying and editing gates; no backend changes.

**Key Steps**
1. **Implement Gate Components**:
   - `RelationshipGateCard`: Visual card showing gate type, threshold, current value
   - `GateStatusIndicator`: Traffic light (🔴 blocked / 🟡 warning / 🟢 unlocked)
   - `GateEditor`: Form for creating/editing gates with preview

2. **Gate Visualization Patterns**:
   ```typescript
   // Example: Show gates as horizontal bars with threshold markers
   <GateVisualizer gates={stage.gates}>
     <AffinityGate threshold={60} current={session.affinity} />
     <ChemistryGate threshold={40} current={session.chemistry} />
     <TierGate required="close_friend" current={session.tierId} />
   </GateVisualizer>
   ```

3. **Live Preview Integration**:
   - Call `previewRelationshipTier()` and `previewIntimacyLevel()` with slider values
   - Show what tier/intimacy would result from hypothetical changes
   - Debounce preview calls (300ms) to avoid API spam

4. **Gate Validation Logic**:
   ```typescript
   export function evaluateGates(
     gates: RelationshipGate[],
     session: GameSessionDTO,
     worldId: number
   ): GateEvaluationResult {
     // Check each gate against current session state
     // Use preview APIs for tier/intimacy checks
     // Return pass/fail with helpful error messages
   }
   ```

5. **UI Features**:
   - Drag gates to reorder priority
   - Toggle gates as "required" vs "optional"
   - Copy gate configurations between stages
   - Preset gate patterns (e.g., "Friend → Lover progression")

---

### Phase 3 – Intimacy Scene Node Type (Graph Editor Integration)

**Goal**
Add a dedicated "Intimacy Scene" node type to the scene/quest graph editor.

**Scope**
- Extend node editor (Task 03 integration); reuse existing graph infrastructure.

**Key Steps**
1. **Define IntimacySceneNode**:
   ```typescript
   export interface IntimacySceneNode extends DraftSceneNode {
     type: 'intimacy_scene';
     config: {
       progressionStageId?: string;
       socialContext: GenerationSocialContext;
       contentRating: 'sfw' | 'romantic' | 'mature_implied' | 'restricted';
       interactionPlaylistId?: string;
       generationNodeId?: string;
       gates: RelationshipGate[];
       fallbackSceneId?: string; // If gates fail
     };
   }
   ```

2. **Register Node Type**:
   - Add to `nodeTypeRegistry` in graph editor
   - Custom node appearance (purple/pink theme, heart icon)
   - Show gate status badges on node (🔒 locked / 🔓 unlocked)

3. **Inspector Panel Integration**:
   - Show social context summary (tier, intimacy, mood)
   - List gates with current evaluation status
   - Content rating controls with world/user constraint display
   - Link to interaction playlist selector
   - Link to generation node configuration

4. **Edge Conditions**:
   - Edges FROM intimacy nodes can check gate success/failure
   - Support branching based on intimacy level reached
   - Example: "If intimacy reaches 'deep_flirt', go to Scene A, else Scene B"

5. **Visual Indicators**:
   - Node border color indicates content rating
   - Badge shows gate pass/fail count
   - Glow effect when gates would unlock with minor changes

---

### Phase 4 – Live Preview with Social Context (What-If Analysis)

**Goal**
Let designers see how intimate scenes would appear at different relationship states.

**Scope**
- Preview panel with interactive controls; no actual generation yet.

**Key Steps**
1. **Social Context Scrubber**:
   ```tsx
   <SocialContextScrubber
     worldId={world.id}
     npcId={npc.id}
     onChange={(context) => {
       // Update preview with new context
       // Show which gates would unlock
       // Update content rating constraints
     }}
   >
     <Slider label="Affinity" min={0} max={100} />
     <Slider label="Chemistry" min={0} max={100} />
     <Slider label="Trust" min={0} max={100} />
     <Slider label="Tension" min={0} max={100} />
   </SocialContextScrubber>
   ```

2. **Preview Panel Features**:
   - Real-time tier/intimacy preview using APIs from Task 07
   - Mood quadrant visualization (excited/content/anxious/calm)
   - Content rating indicator with world/user max constraints
   - Gate evaluation results (which gates pass/fail at current values)
   - Suggested preset interactions for current context

3. **What-If Scenarios**:
   ```typescript
   export interface WhatIfScenario {
     name: string;
     relationshipChanges: {
       affinity?: number;
       chemistry?: number;
       trust?: number;
       tension?: number;
     };
     expectedOutcome: {
       tierWouldBe?: string;
       intimacyWouldBe?: string;
       gatesUnlocked: string[];
     };
   }
   ```

4. **Comparison Mode**:
   - Side-by-side view of "Current State" vs "What-If State"
   - Highlight deltas (tier upgrades, gates unlocking)
   - Save scenarios for regression testing

5. **Validation Warnings**:
   - Show if content rating would exceed world max
   - Show if intimacy level requires higher tier than current
   - Show if mood conflicts with scene expectations

---

### Phase 5 – Content Rating Validation & Safety Rails

**Goal**
Enforce content rating constraints at design time and runtime to prevent inappropriate content.

**Scope**
- Validation logic and UI indicators; extends Task 09 validation.

**Key Steps**
1. **Multi-Layer Validation**:
   ```typescript
   export interface ContentRatingValidation {
     sceneRating: 'sfw' | 'romantic' | 'mature_implied' | 'restricted';
     worldMaxRating: 'sfw' | 'romantic' | 'mature_implied' | 'restricted';
     userMaxRating?: 'sfw' | 'romantic' | 'mature_implied' | 'restricted';
     intimacyRequiredRating: 'sfw' | 'romantic' | 'mature_implied' | 'restricted';

     canDisplay: boolean;
     warnings: string[];
     errors: string[];
   }

   export function validateContentRating(
     scene: IntimacySceneNode,
     world: GameWorldDetail,
     user?: UserContentPreferences
   ): ContentRatingValidation {
     // Check scene rating <= world max
     // Check scene rating <= user max (if set)
     // Check intimacy level's natural rating
     // Return validation result with actionable errors
   }
   ```

2. **Rating Hierarchy** (strictest first):
   - `sfw` → `romantic` → `mature_implied` → `restricted`
   - Scene can't exceed world max
   - World can't exceed user max (if user preference set)
   - Intimacy level automatically determines minimum rating

3. **Auto-Downgrade Options**:
   - If scene rating too high, offer to reduce intimacy level
   - If intimacy level too high, offer to adjust relationship gates
   - Show preview of downgraded content

4. **Consent & Confirmation**:
   - For `restricted` content, require explicit designer checkbox
   - Show clear warnings about content rating implications
   - Require confirmation before publishing high-rated progressions

5. **Visual Indicators**:
   ```tsx
   <ContentRatingBadge rating="mature_implied">
     <Icon.ShieldAlert /> Mature (Implied)
   </ContentRatingBadge>

   {validation.canDisplay ? (
     <Badge variant="success">✓ Rating OK</Badge>
   ) : (
     <Alert variant="error">
       ⚠ Exceeds world max rating: {validation.worldMaxRating}
     </Alert>
   )}
   ```

6. **Runtime Enforcement**:
   - Before scene playback, re-validate rating constraints
   - Block scenes that exceed runtime user preferences
   - Log rating violations for analytics

---

### Phase 6 – Progression Templates & Preset Library

**Goal**
Provide starter templates for common relationship progression patterns.

**Scope**
- Template library (local storage or world-scoped); builds on Task 02 pattern.

**Key Steps**
1. **Define Progression Template**:
   ```typescript
   export interface ProgressionTemplate {
     id: string;
     name: string;
     description: string;
     category: 'romantic' | 'friendship' | 'rivalry' | 'mixed';
     stages: ProgressionStageTemplate[];
     estimatedDuration?: string; // "Short (2-3 scenes)", "Epic (20+ scenes)"
     contentRating: 'sfw' | 'romantic' | 'mature_implied' | 'restricted';
   }

   export interface ProgressionStageTemplate {
     name: string;
     gatePresets: string[]; // e.g., ["tier_friend", "chemistry_40"]
     suggestedInteractions: string[]; // Preset IDs
     duration: string; // "Early game", "Mid game", "Late game"
   }
   ```

2. **Built-In Templates**:
   - **Friends to Lovers** (SFW → Romantic):
     - Stage 1: Stranger → Acquaintance (affinity 0→20)
     - Stage 2: Acquaintance → Friend (affinity 20→40)
     - Stage 3: Friend → Close Friend (affinity 40→70, chemistry 30+)
     - Stage 4: Close Friend → Lover (affinity 70+, chemistry 60+, trust 50+)

   - **Slow Burn Romance** (Romantic → Mature):
     - 8+ stages with gradual chemistry increases
     - Trust gates at each level
     - Optional intimacy escalation

   - **Rivals to Lovers** (SFW → Romantic):
     - High tension early stages
     - Tension → chemistry transformation arc
     - Trust building after conflict resolution

   - **Friends with Benefits** (Romantic → Restricted):
     - High chemistry, moderate affinity
     - Lower trust requirements
     - Explicit intimacy level gates

3. **Template Application**:
   - Wizard UI: "Create progression from template"
   - Customize gates/interactions after instantiation
   - Merge multiple templates for hybrid arcs

4. **Community Templates** (Future):
   - Export/import progression templates as JSON
   - Share template packs across worlds/projects
   - Template marketplace/gallery

5. **Template Validation**:
   - Check template compatibility with world schemas
   - Warn about missing interaction presets
   - Preview template outcome before applying

---

### Phase 7 – Generation Integration (Preview Intimacy Scenes)

**Goal**
Connect intimacy scenes to the generation pipeline for content preview.

**Scope**
- Integration with Task 10 generation system; no full generation pipeline needed yet.

**Key Steps**
1. **Link IntimacySceneNode to GenerationNode**:
   ```typescript
   export interface IntimacySceneWithGeneration extends IntimacySceneNode {
     config: {
       // ... existing config
       generationConfig?: {
         generationNodeId: string;
         generationType: 'transition' | 'variation' | 'dialogue' | 'npc_response';
         socialContextOverrides?: Partial<GenerationSocialContext>;
       };
     };
   }
   ```

2. **Preview Request Builder**:
   ```typescript
   export async function previewIntimacySceneGeneration(
     scene: IntimacySceneNode,
     session: GameSessionDTO,
     world: GameWorldDetail
   ): Promise<GenerationPreview> {
     // Build social context from scene + session
     const socialContext = buildGenerationSocialContext({
       worldId: world.id,
       npcId: scene.config.npcId,
       session,
       worldConfig: getWorldGenerationConfig(world),
       userPreferences: loadUserContentPreferences()
     });

     // Build generation request
     const request: GenerateContentRequest = {
       type: scene.config.generationConfig.generationType,
       social_context: socialContext,
       // ... other params
     };

     // Return preview (don't actually generate yet)
     return {
       request,
       socialContext,
       estimatedCost: calculateCost(request),
       warnings: validateGenerationNode(request)
     };
   }
   ```

3. **Preview UI Features**:
   - "Preview Generation" button in inspector panel
   - Shows generation request JSON (for debugging)
   - Shows social context used (tier, intimacy, rating)
   - Shows estimated cost/latency
   - Shows validation warnings (from Task 09 validator)

4. **Mock Generation** (for testing):
   - Generate placeholder content based on social context
   - Use template strings with context variables
   - Example: "A {intimacyLevel} scene between {playerName} and {npcName} (Tier: {tier})"

5. **Actual Generation** (when pipeline ready):
   - Button to trigger actual generation
   - Queue generation job
   - Poll for completion
   - Display generated asset in preview panel

---

### Phase 8 – Relationship Arc Timeline Visualizer

**Goal**
Provide a timeline view showing relationship progression across scenes.

**Scope**
- Visualization component; read-only for MVP.

**Key Steps**
1. **Timeline Component**:
   ```tsx
   <RelationshipTimeline
     progression={progression}
     sessions={playtestSessions}
     highlightStage={currentStage}
   >
     {progression.stages.map(stage => (
       <TimelineStage
         key={stage.id}
         stage={stage}
         gates={stage.gates}
         scenes={stage.scenes}
         current={isCurrentStage(stage)}
       />
     ))}
   </RelationshipTimeline>
   ```

2. **Visualization Features**:
   - Horizontal timeline with stages as nodes
   - Gates shown as vertical barriers between stages
   - Affinity/chemistry/trust tracks above timeline
   - Intimacy level progression below timeline
   - Current session position indicator

3. **Interactive Elements**:
   - Click stage to jump to inspector
   - Hover gate to see requirements
   - Scrub timeline to see "what if at this point"
   - Zoom in/out for long progressions

4. **Analytics Overlay** (if playtest data available):
   - Show how many players reached each stage
   - Show average relationship values at each stage
   - Show common drop-off points
   - Heatmap of gate failure rates

5. **Export Timeline**:
   - Save timeline as image (PNG/SVG)
   - Export progression data for documentation
   - Generate flowchart for design docs

---

### Phase 9 – Playtesting Tools (Simulation Integration)

**Goal**
Integrate progression editor with Simulation Playground (Task 05) for testing.

**Scope**
- Simulation integration; no new simulation features needed.

**Key Steps**
1. **Load Progression into Simulation**:
   ```typescript
   export function createProgressionScenario(
     progression: RelationshipProgression,
     world: GameWorldDetail,
     startingStage?: string
   ): SimulationScenario {
     return {
       id: `progression_${progression.id}`,
       name: `Test: ${progression.name}`,
       worldId: world.id,
       initialWorldTime: 0,
       initialSessionFlags: {},
       initialRelationships: getStageStartValues(progression, startingStage),
       npcIds: [progression.npcId]
     };
   }
   ```

2. **Simulation Controls**:
   - "Test in Simulator" button in progression editor
   - Loads scenario with progression gates configured
   - Auto-advance relationship values to test gates
   - Record which stages unlock at which values

3. **Gate Testing Mode**:
   - Incrementally increase affinity/chemistry/trust
   - Highlight when gates unlock/fail
   - Log gate evaluation results to timeline
   - Export test results for regression

4. **Playthrough Recording**:
   - Record designer playthrough of progression
   - Save relationship values at each scene
   - Generate "golden path" for QA testing
   - Compare multiple playthroughs

5. **Regression Harness**:
   - Run progression scenarios automatically
   - Assert gates unlock at expected values
   - Detect if schema changes break progressions
   - CI integration (future)

---

### Phase 10 – Export/Import Progression Packs & Analytics

**Goal**
Enable sharing progression arcs and gather usage analytics.

**Scope**
- Pack export/import + basic analytics; dev-only for MVP.

**Key Steps**
1. **Progression Pack Format**:
   ```typescript
   export interface ProgressionPack {
     version: string; // e.g., "1.0"
     exportDate: string;
     metadata: {
       author?: string;
       description?: string;
       tags?: string[];
       contentRating: 'sfw' | 'romantic' | 'mature_implied' | 'restricted';
     };
     progressions: RelationshipProgression[];
     templates: ProgressionTemplate[];
     interactionPresets?: string[]; // IDs of required presets
   }
   ```

2. **Export Functions**:
   - Export single progression or batch
   - Include interaction preset dependencies
   - Include template definitions
   - JSON file download with metadata

3. **Import Functions**:
   - Validate pack format and version
   - Check for ID conflicts (rename or skip)
   - Verify interaction preset availability
   - Import into world or global scope

4. **Usage Analytics** (dev-only):
   ```typescript
   export interface ProgressionAnalytics {
     progressionId: string;
     totalUses: number;
     stageReachRates: Map<string, number>; // % of players reaching each stage
     averageTimePerStage: Map<string, number>; // minutes
     commonDropOffPoints: string[]; // stage IDs
     gateFailureRates: Map<string, number>; // % failure per gate
   }
   ```

5. **Analytics Panel**:
   - Show progression usage stats
   - Identify underperforming stages (low reach rate)
   - Identify overtuned gates (high failure rate)
   - Suggest balance adjustments

6. **Pack Gallery** (future):
   - Browse community progression packs
   - Filter by rating, category, length
   - One-click import
   - Rating/review system

---

## Implementation Notes

### Key Integration Points

1. **Task 02 (Interaction Presets)**: Use playlists for scene interactions
2. **Task 07 (Relationship Preview)**: Use preview APIs for gate validation
3. **Task 08 (Social Metrics)**: Use mood/reputation for gate conditions
4. **Task 09 (Intimacy Context)**: Use `GenerationSocialContext` for scenes
5. **Task 10 (Generation)**: Use generation pipeline for content preview
6. **Task 05 (Simulation)**: Use playground for progression testing

### Technical Stack

- **Frontend**: React, React Flow for graph editor, Tailwind for styling
- **State Management**: Zustand or context for editor state
- **Validation**: Zod schemas for type-safe validation
- **Storage**: LocalStorage for templates, world meta for progressions

### File Structure

```
frontend/src/
  components/
    progression/
      ProgressionEditor.tsx          # Main editor component
      GateVisualizer.tsx              # Gate display and editing
      IntimacySceneNodeInspector.tsx  # Inspector panel
      SocialContextScrubber.tsx       # Preview controls
      RelationshipTimeline.tsx        # Timeline visualization
  lib/
    progression/
      types.ts                        # All progression types
      validation.ts                   # Content rating validation
      templates.ts                    # Built-in templates
      import-export.ts                # Pack import/export
      analytics.ts                    # Usage analytics

packages/game-core/src/
  progression/
    progressionHelpers.ts             # Core logic
    gateEvaluation.ts                 # Gate checking

packages/types/src/
  progression.ts                      # Shared types
```

---

## Success Criteria

By the end of Phase 10, designers should be able to:

1. ✅ Create relationship progressions visually without code
2. ✅ Define gates based on tiers, intimacy, mood, or custom conditions
3. ✅ Preview how scenes would appear at different relationship states
4. ✅ Validate content rating compliance at design time
5. ✅ Test progressions in the simulation playground
6. ✅ Share progression packs across worlds/projects
7. ✅ Analyze which stages players reach and where they drop off

---

## Future Extensions (Beyond Phase 10)

- **AI-Assisted Progression Design**: Suggest gates based on scene content
- **Dynamic Progression Adaptation**: Adjust gates based on player behavior
- **Multi-NPC Progressions**: Polyamory, love triangles, group dynamics
- **Branching Progressions**: Multiple paths through relationship arc
- **Progression Achievements**: Track player progress through arcs
- **Localization Support**: Multi-language progression descriptions

---

**All phases greenfield - ready to begin implementation!**
