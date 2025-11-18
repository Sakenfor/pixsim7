**Task: Content Validation Linter & Playtest Recording Tools**

**Context**
- Designers build complex content: scenes, quests, NPCs, interactions, hotspots.
- No automated validation to catch errors (broken scene links, missing assets, impossible quest paths).
- No playtest recording/replay system to capture and analyze player behavior.
- QA is manual and time-consuming.

**Goal**
Build **Content Validation** and **Playtest Tools** that:
- Provide **Content Linter** - automated checks for common errors and best practices.
- Add **Validation Dashboard** - centralized view of all validation issues.
- Enable **Playtest Recording** - capture player actions, decisions, and outcomes.
- Support **Playtest Replay** - review recorded playtests to identify issues.

**Key Ideas**
- Validation rules:
  ```ts
  interface ValidationRule {
    id: string;
    name: string;
    category: 'scenes' | 'quests' | 'npcs' | 'hotspots' | 'assets' | 'general';
    severity: 'error' | 'warning' | 'info';
    check: (content: any) => ValidationIssue[];
  }

  interface ValidationIssue {
    ruleId: string;
    severity: 'error' | 'warning' | 'info';
    message: string;
    location?: {              // Where the issue is
      type: 'scene' | 'npc' | 'location' | 'quest' | 'asset';
      id: string | number;
      field?: string;         // Specific field with issue
    };
    quickFix?: {              // Auto-fix action
      label: string;
      action: () => void;
    };
  }
  ```
- Playtest recording:
  ```ts
  interface PlaytestRecording {
    id: string;
    sessionId: number;
    worldId: number;
    startTime: number;
    endTime?: number;
    events: PlaytestEvent[];
    metadata: {
      version: string;        // Game/content version
      tester?: string;        // Tester ID or name
      notes?: string;
    };
  }

  interface PlaytestEvent {
    timestamp: number;
    type: 'scene-start' | 'scene-end' | 'interaction' | 'hotspot-click' |
          'flag-change' | 'relationship-change' | 'quest-update';
    data: Record<string, any>;
    sessionState?: {          // Snapshot of relevant state
      currentScene?: string;
      activeQuests?: string[];
      flagChanges?: Record<string, any>;
    };
  }
  ```

**Implementation Outline**

1. **Validation Rules Engine**
   - New module: `frontend/src/lib/validation/rules.ts`.
   - Implement core rules:
     - **Scene Rules**:
       - "Orphan scene" - scene not linked from any other scene.
       - "Dead-end scene" - no exit edges.
       - "Missing asset" - scene references asset that doesn't exist.
       - "Broken scene link" - edge points to non-existent scene.
     - **Quest Rules**:
       - "Unreachable state" - quest state with no incoming transitions.
       - "Missing objective text" - state has no player-facing description.
       - "Circular dependency" - quest requires itself.
     - **NPC Rules**:
       - "No portrait" - NPC has no portrait asset.
       - "Empty schedule" - NPC has no schedule entries.
       - "Duplicate interaction" - same interaction enabled multiple times.
     - **Hotspot Rules**:
       - "Overlapping hotspots" - two hotspots at same location.
       - "Hotspot outside bounds" - position outside location image.
       - "No linked scene" - hotspot has no action/scene.
     - **Asset Rules**:
       - "Unused asset" - asset not referenced by any content.
       - "Missing file" - asset record exists but file is unavailable.
   - Each rule is a function: `(content) => ValidationIssue[]`.

2. **Validation Dashboard**
   - New route: `frontend/src/routes/ValidationDashboard.tsx`.
   - Features:
     - **Run Validation**:
       - Button to run all validation rules.
       - Progress indicator during scan.
     - **Issue List**:
       - Group by severity (errors, warnings, info).
       - Filter by category (scenes, quests, NPCs, etc.).
       - Click issue to navigate to problematic content.
     - **Quick Fixes**:
       - For simple issues, show "Fix" button.
       - Execute quick fix action (e.g., "Remove orphan scene").
     - **Export Report**:
       - Download validation report as JSON/CSV.

3. **Playtest Recording System**
   - New module: `frontend/src/lib/playtest/recorder.ts`.
   - Implement:
     - `startRecording(sessionId): PlaytestRecording`.
     - `recordEvent(type, data): void` - log event to current recording.
     - `stopRecording(): PlaytestRecording` - finalize and save.
   - Store recordings in `localStorage` or `indexedDB` (can be large).
   - Integrate into Game2D:
     - Add recording controls (start/stop/pause) in dev panel.
     - Auto-capture events:
       - Scene transitions (via useSceneState).
       - Hotspot clicks.
       - Interactions triggered.
       - Flag/relationship changes.

4. **Playtest Replay Viewer**
   - New route: `frontend/src/routes/PlaytestReplay.tsx`.
   - Features:
     - **Recording List**:
       - Show all saved recordings with metadata.
       - Filter by world, session, date.
     - **Playback Controls**:
       - Play/pause/step through events.
       - Speed control (1x, 2x, 4x).
       - Jump to specific event.
     - **Visualization**:
       - Timeline showing all events.
       - Overlay on Game2D view showing player path.
       - Inspector showing session state at each event.
     - **Analysis**:
       - Heatmap of hotspot clicks.
       - Quest completion paths.
       - Average session time, common drop-off points.

5. **CI/CD Integration (Optional)**
   - Add validation as pre-commit hook or CI check:
     - Export validation rules as Node script.
     - Run on content JSON files.
     - Fail build if critical errors found.

**Constraints**
- Validation is frontend-only initially (can move to backend later).
- Playtest recordings stored locally (not synced to backend in Phase 1).
- No game logic changes - validation is read-only analysis.

**Success Criteria**
- Content linter catches common errors before playtesting (broken links, missing assets).
- Validation dashboard gives clear overview of content health.
- Playtest recording captures full player session for review.
- Replay viewer enables designers to analyze player behavior and identify UX issues.

---

## Phase 2: Advanced Analytics, A/B Testing & Automated Regression Tests

Once basic validation and recording work, add production-grade QA tools:

**Phase 2 Goals**
- Add **Advanced Analytics** - engagement metrics, conversion funnels, retention tracking.
- Implement **A/B Testing Framework** - test different content variations with players.
- Enable **Automated Regression Tests** - verify content changes don't break existing flows.
- Support **Cross-Session Analysis** - compare multiple playtests to find patterns.

**Features**
- Analytics dashboard:
  - Scene completion rates, average time per scene.
  - Quest acceptance/completion rates.
  - Interaction usage frequency.
  - Relationship progression rates.
- A/B testing:
  - Define content variants (different scene orders, interaction configs).
  - Randomly assign players to variants.
  - Compare metrics between variants.
- Regression tests:
  - Define test scenarios (expected quest paths, flag sequences).
  - Auto-run after content changes.
  - Alert if behavior deviates from expected.
- Heatmaps and flow diagrams:
  - Visual representation of player paths through content.
  - Identify popular routes and dead zones.

**Success Criteria**
- Production-ready QA system with comprehensive tooling.
- Designers can validate content quality before release.
- Data-driven decisions on content balance and pacing.
- Reduced manual QA time through automation.
