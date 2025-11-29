# Task 102 – Panel Organization Hybrid Migration (Option C)

## Goal

Reduce panel scattering by adopting the **Hybrid (Option C)** structure from
`docs/PANEL_ORGANIZATION_AUDIT.md`: centralize shared/dev/tools panels under
`components/panels/` while keeping domain-specific panels with their features
under `components/{domain}/panels/`.

This is a **gradual, non-breaking** reorganization focused on developer
experience and discoverability.

---

## Context

From `docs/PANEL_ORGANIZATION_AUDIT.md`:

- 56+ panels across 30+ directories.
- Only 3 panels in `components/panels/` (intended “home”).
- Dev/tool/shared panels are scattered (e.g. `components/dev/`, `components/devtools/`, `components/layout/`, etc.).
- Legacy panels and `.bak` files exist.

Recommended approach: **Option C – Hybrid**:

- Centralize shared/dev/tools panels:
  - `components/panels/shared/`
  - `components/panels/dev/`
  - `components/panels/tools/`
- Keep domain-specific panels with their domain:
  - `components/game/panels/`
  - `components/scene/panels/`
  - `components/gallery/panels/`
  - etc.

---

## Deliverables

### 1. Clean up legacy and obvious leftovers

**Files/dirs to review:**
- `apps/main/src/components/legacy/`
- Any `.bak` files (e.g. `components/health/HealthPanel.tsx.bak`)

**Tasks:**
- For each panel in `components/legacy/`:
  - Determine if it is still referenced (via `rg` or TS imports).
  - If unused:
    - Either delete it, or move it to an explicit `components/legacy/_archive/` folder.
    - Note the decision in a short comment at the top of the file or in a small `README.md` in that folder.
  - If still used:
    - Decide whether it should move into a proper `components/{domain}/panels/` or `components/panels/{dev|shared|tools}/` folder in later steps.
- Remove or archive `.bak` panel files, with a note in `PANEL_ORGANIZATION_AUDIT.md` if needed.

**Acceptance criteria:**
- No stray `.bak` panel files.
- `components/legacy/` is either empty, clearly marked as archive, or its remaining panels are explicitly documented as legacy-but-still-used.

---

### 2. Centralize dev panels under components/panels/dev

**Current locations (from audit):**
- `apps/main/src/components/dev/*.tsx` (dev tools panels)
- `apps/main/src/components/devtools/GizmoSurfacesPanel.tsx` (and similar)

**Target structure:**
```text
components/panels/dev/
  AppMapPanel.tsx
  DevToolsPanel.tsx
  DependencyGraphPanel.tsx
  GizmoSurfacesPanel.tsx
  ...
```

**Tasks:**
- Create `apps/main/src/components/panels/dev/` if it does not exist.
- Move dev-panel components into this folder:
  - `AppMapPanel`, `DevToolsPanel`, `DependencyGraphPanel`, `GizmoSurfacesPanel`, etc.
- Update all imports to point to the new paths (prefer `@/components/panels/dev/...`).
- Update any references in `lib/panels/corePanelsPlugin.tsx` / `panelRegistry.ts` to the new locations.

**Acceptance criteria:**
- All dev/debug panels live under `components/panels/dev/`.
- No broken imports or registry entries; dev panels still appear in the UI.

---

### 3. Centralize tool/utility/shared panels under components/panels

**Current locations (from audit):**
- Utility panels:
  - `components/simulation/ExportImportPanel.tsx`
  - `components/validation/ValidationPanel.tsx`
  - Any settings-like panels that are generic.
- Shared panel infrastructure:
  - `components/panels/ComposedPanel.tsx`
  - `components/builder/SimplePanelBuilder.tsx`
  - `components/layout/FloatingPanelsManager.tsx`

**Target structure:**
```text
components/panels/shared/
  ComposedPanel.tsx
  SimplePanelBuilder.tsx
  FloatingPanelsManager.tsx

components/panels/tools/
  ExportImportPanel.tsx
  ValidationPanel.tsx
  SettingsPanel.tsx        # if/when one exists
```

**Tasks:**
- Create `components/panels/shared/` and `components/panels/tools/`.
- Move shared/utility panels into these folders and update imports/registry.
- Add a short `README.md` in each of these folders describing what belongs there.

**Acceptance criteria:**
- Shared/generic panel building blocks live under `components/panels/shared/`.
- Tool/utility panels live under `components/panels/tools/`.
- Imports and `panelRegistry`/`corePanelsPlugin` updated and tested.

---

### 4. Establish domain panel subfolders (scene, game, gallery, etc.)

**Current locations (examples from audit):**
- Scene-related panels:
  - `components/scene/SceneManagementPanel.tsx`
  - `components/scene-collection/SceneCollectionPanel.tsx`
  - `components/scene-player/ScenePlaybackPanel.tsx`
  - `components/panels/SceneLibraryPanel.tsx`
- Game-related panels:
  - `components/game/InventoryPanel.tsx`
  - `components/game/NpcInteractionPanel.tsx`
  - `components/game/WorldToolsPanel.tsx`
  - `components/game/GameThemingPanel.tsx`

**Target pattern:**
```text
components/scene/panels/
  SceneManagementPanel.tsx
  SceneCollectionPanel.tsx
  SceneLibraryPanel.tsx
  ScenePlaybackPanel.tsx

components/game/panels/
  InventoryPanel.tsx
  NpcInteractionPanel.tsx
  WorldToolsPanel.tsx
  GameThemingPanel.tsx
```

**Tasks:**
- For each domain (scene, game, gallery, etc.):
  - Create a `panels/` subfolder under the domain folder.
  - Move the matching panel files into that folder.
  - Update imports and `panelRegistry`/panel plugins to match.

**Acceptance criteria:**
- Domain panels live in `components/{domain}/panels/` where possible.
- No broken imports or panel registrations.

---

### 5. Conventions + documentation

**Files:**
- `docs/PANEL_ORGANIZATION_AUDIT.md`
- New/updated `README.md` files under relevant `components/**/panels/` folders

**Tasks:**
- In `PANEL_ORGANIZATION_AUDIT.md`, add a short “Conventions” section:
  - Domain panels → `components/{domain}/panels/`
  - Shared/generic → `components/panels/shared/`
  - Dev/debug → `components/panels/dev/`
  - Tools/utilities → `components/panels/tools/`
- Add brief READMEs in:
  - `components/panels/`
  - `components/panels/dev/`
  - `components/panels/tools/`
  - Any `components/{domain}/panels/` created in this task

**Acceptance criteria:**
- Developers have clear guidance on where new panels should live.
- Panel audit doc matches the actual structure after this migration.

---

## Out of Scope

- Creating new panels or changing panel behavior.
- Changing panel ID naming or workspace layout behavior.
- Large redesign of the workspace UI; this is file/folder organization only.

---

## Notes / Tips

- Move panels incrementally and keep tests / workspace manual checks running as you go.
- Prefer using `@/components/...` aliases when updating imports to reduce future churn.
- When in doubt about where a panel belongs, document the decision in the panel's README or in `PANEL_ORGANIZATION_AUDIT.md` so future work can refine it.

