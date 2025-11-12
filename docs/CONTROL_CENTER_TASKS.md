# Control Center Dock — Tasks for Claude

Goal: Finish a modular bottom control center that auto-retracts, can be pinned, and provides a fast path to generate videos (prompt + provider + preset), with room for future shortcuts and modules.

Current state (bare-bones implemented):
- Global bottom dock rendered across routes via `ControlCenterDock`.
- Auto-reveal when cursor nears bottom; auto-hide on mouse leave (unless pinned).
- Pin toggle and draggable resize handle; persisted state via `zustand/persist`.
- Quick Generate section:
  - Prompt textarea
  - Provider select (populated from `useProviders`)
  - Preset select (temporary stub list)
  - Generate button (stub: logs and clears prompt)

Key files:
- `frontend/src/stores/controlCenterStore.ts` — state: open, pinned, height, activeModule, selections, recent prompts
- `frontend/src/components/control/ControlCenterDock.tsx` — UI and behaviors

What to build/improve:
1) UX polish
   - Transitions (ease, duration) and glassy background; dark mode fine-tuning
   - Hover reveal strip affordance (subtle handle) and better focus/keyboard controls
   - Accessibility: semantics, ARIA roles/labels, tab order

2) Architecture & modularity
   - Introduce a small registry to host multiple modules (e.g., quickGenerate, shortcuts, presets). Keep `quickGenerate` as default active module.
   - Add a simple tabbed or segmented control to switch modules. Persist `activeModule` in store.

3) Shortcuts module
   - Provide a grid of configurable shortcut buttons (e.g., "Open Gallery Filters", "Toggle Workspace", "New Scene", "Open Graph").
   - Define a type and schema for a shortcut (id, label, icon, action). Wire basic actions by calling router or dispatching store actions.

4) Presets module
   - Read provider operation_specs (from backend via an existing endpoint) and list suggested presets; allow selecting a preset to populate the quick generate form.
   - If operation_specs not ready, start with a local stub and add TODO hooks.

5) Quick generate integration
   - Replace the stub with real API:
     - Create a client call `generateAsset({ prompt, providerId, presetId })` in `frontend/src/lib/api/*`.
     - On success, either navigate to the new asset or show a toast with a link.
     - Show loading state; disable inputs while generating.
   - Add basic validation and error handling (toast or inline message).

6) Provider-specific prompt limits
   - The dock now uses `resolvePromptLimit(providerId)` with a hardcoded map (Pixverse=2048) and default from `config/prompt.ts`.
   - TODO: Replace with dynamic values derived from provider `operation_specs` once exposed on the backend.

7) Resizing & layout
   - Improve resize handle hit area and add keyboard resizing (e.g., alt+arrow).
   - Ensure min/max heights feel good and don’t interfere with route content on small screens.

8) Persistence & recent prompts
   - Render a compact recent prompts history with click-to-restore. Keep last 20.

9) Testing & docs

10) Dynamic presets (wired)
   - Implemented a basic dynamic preset derivation using provider `operation_specs` enums (quality, aspect_ratio, motion_mode).
   - Selecting a preset stores `presetId` and `presetParams` in the control center store.
   - Fallback presets used if specs are unavailable.

11) Multi-operation scaffolding (Pixverse)
   - Operation selector added to Quick Generate (text_to_video, image_to_video, video_extend, video_transition, fusion).
   - Minimal additional fields:
     - image_to_video: image_url
     - video_extend: video_url and/or original_video_id
     - video_transition: image_urls and prompts (one per line)
   - These fields are passed to /jobs params; Claude should polish the UI, validation, and alignment with operation_specs param groups.
   - Add Storybook stories for ControlCenterDock with different states (open/pinned/loading).
   - Update README or a short usage guide if needed.

Design constraints & acceptance criteria
- Dock should not obstruct critical UI when retracted; keep reveal strip <= 8px.
- Pinning keeps it open until user unpins or navigates away (state is persisted).
- No hard-coded theme values; rely on Tailwind classes already used across the app.
- All strings easy to localize later.
- Works with mouse and keyboard; basic screen reader support.

Nice-to-haves (optional)
- Add a micro progress bar or status indicator when generating.
- Allow dropping a text file onto the prompt area to load content.
- Provide a small prompt token counter and length guidance.

Notes
- Provider list comes from `useProviders()`; add a `useOperationSpecs()` hook if needed for presets.
- Keep APIs contained: dedicate a small file for control-center related API helpers.
