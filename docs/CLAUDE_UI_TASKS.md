# Claude UI Tasks: Scene Player and Editor

This brief assigns UI polish tasks to Claude focusing on the ScenePlayer and the upcoming Scene Editor sandbox. Keep changes incremental and PR-sized.

## Goals
- Improve ScenePlayer visual hierarchy and interactions
- Add real `<video>` playback with loop segment support
- Style and layout the Reflex mini-game
- Prepare basic editor sandbox panels (assets picker, node config) for testing scenes before adding to the game

## Current Components
- `game-frontend/src/components/ScenePlayer.tsx`
- `game-frontend/src/components/minigames/ReflexMiniGame.tsx`
- Types: `packages/types/src/index.ts` (Scene, SceneNode, MediaSegment, PlaybackMode, SelectionStrategy)

## Tasks
1. ScenePlayer video element
   - Replace placeholder with `<video>` tag
   - Add source selection from `selectedSegment.url` fallback to `mediaUrl`
   - Implement loopSegment: on `timeupdate`, if `currentTime > end`, set `currentTime = start`
   - Add basic loading state + error fallback
   - Controls: minimal overlay (Play/Pause button)

2. Segment indicator UI
   - Display selected segment name/id with a small pill
   - If selection.kind = 'pool', show tag chips from the segment
   - If progression step defines `segmentIds`, highlight which one is active

3. Mini-game polish
   - Style `ReflexMiniGame` with centered layout and clearer success/fail state
   - Expose `onResult` callback with detailed score; show a toast-like banner inside the Panel

4. Editor sandbox skeleton (main frontend)
   - Add a `Workspace` preset that shows three panels: Gallery, Scene Builder, Game
   - Scene Builder (placeholder now) should have a simple form:
     - Node ID, Label, Selection strategy (ordered/random/pool)
     - For pool: filter tags input (comma-separated)
     - Progression steps: editable list of step labels and optional segmentIds
     - A Save-to-Draft button updating the `sceneBuilderModule` draft
   - A "Preview in Game" button triggers `sceneBuilderModule.toRuntimeScene()` and shows it in the Game iframe via a postMessage stub (to be wired later)

## Acceptance Criteria
- ScenePlayer shows actual video and loops correctly for loopSegment
- Segment info is visible and matches the active selection
- Mini-game looks polished and communicates state
- Workspace route offers a basic editable form for a node and updates draft in the scene-builder module

## Notes
- Keep Tailwind utility classes for styling; use `@pixsim7/ui` primitives where helpful
- No backend changes required for now
- PR in small increments; wire tests for helper functions where feasible
