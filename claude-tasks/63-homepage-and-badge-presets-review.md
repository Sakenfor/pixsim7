## 63 – Homepage Refactor & Badge Presets Review

**Date:** 2025-11-24  
**Area:** Frontend – main app shell, module registry, gallery badge presets  
**Relevant merge:** `f04f1d8700b34aee2d79d9ca8764a71970fcca29`  
**Key files:**
- `apps/main/src/routes/Home.tsx`
- `apps/main/src/modules/types.ts`
- `apps/main/src/modules/index.ts`
- `apps/main/src/modules/assets/index.ts`
- `apps/main/src/modules/workspace/index.ts`
- `apps/main/src/modules/automation/index.ts`
- `apps/main/src/modules/game/index.ts`
- `apps/main/src/modules/pages.ts`
- `apps/main/src/hooks/usePageTracking.ts`
- `apps/main/src/lib/gallery/badgeConfigPresets.ts`

---

## 1. Summary

The merge introduces:

- A **dynamic homepage** powered by a `Module.page` metadata model and registry helpers (`getPages`, `getPagesByCategory`).
- A **new `usePageTracking` hook** for favorites and recent pages (localStorage-backed).
- A **page-only module set** (`apps/main/src/modules/pages.ts`) for surfaces that don’t need initialization logic.
- An expanded set of **gallery badge presets** with clearer semantics and new workflows (e.g. “Generation”, “Technical”).

Conceptually this is solid and aligns with the goal of making navigation **data-driven and registry-backed** instead of hardcoding cards in `Home.tsx`.

There are a few behavioral and UX gaps worth tracking as follow‑ups (recents tracking, per‑user persistence, dynamic module updates, and regression of the old “Available Modules” view).

---

## 2. Homepage & Module Registry

### 2.1 New module metadata

- `apps/main/src/modules/types.ts`
  - `Module` now has an optional `page` field:
    - `route: string`
    - `icon: string`
    - `description: string`
    - `category: 'creation' | 'development' | 'management' | 'game' | 'automation'`
    - `featured?: boolean`
    - `hidden?: boolean`
    - `iconColor?: string`
  - `ModuleRegistry` adds:
    - `getPages(options?: { category?: string; featured?: boolean; includeHidden?: boolean })`
    - `getPagesByCategory(options?: { includeHidden?: boolean })`

- Core modules now expose `page` metadata:
  - `apps/main/src/modules/assets/index.ts` → `Gallery` (`/assets`, category `creation`, `featured: true`)
  - `apps/main/src/modules/workspace/index.ts` → `Scene Builder` (`/workspace`, `creation`, `featured: true`)
  - `apps/main/src/modules/automation/index.ts` → `Automation` (`/automation`, `automation`, `featured: true`)
  - `apps/main/src/modules/game/index.ts` → `Game World` (`/game-world`, `game`, `featured: true`)

- New “page-only” modules (`apps/main/src/modules/pages.ts`) for screens without initialization logic:
  - Arc Graph, Graph View, NPC Portraits, 2D Game, Gizmo Lab, Interaction Studio, Interaction Demo,
    Health Monitor, Simulation Playground, NPC Brain Lab, App Map (dev), Plugin Workspace (dev).

- `apps/main/src/modules/index.ts`
  - Registers all the above, including both app-map module and its page-only dev variant (`appMapModule` + `appMapPageModule` alias).

**Assessment:**

- The `page` metadata shape is consistent and strongly typed; categories are constrained (good).
- `getPages` correctly filters by `hidden`, `category`, `featured`.
- `getPagesByCategory` groups pages by category using the same filter.
- This is aligned with the broader “registry + metadata instead of hardcoded surfaces” direction from other Claude tasks.

### 2.2 Home route behavior

- `apps/main/src/routes/Home.tsx`:
  - Uses `moduleRegistry.getPages({ includeHidden: false })` and `getPages({ featured: true })` + `getPagesByCategory()`.
  - Builds:
    - Searchable, filterable list of pages.
    - Favorites section.
    - Recent pages section.
    - Category headers and per-category grids using `CATEGORY_LABELS`.

**Notable behavior/limitations:**

1. **Module registry is treated as static at mount**
   - `allPages`, `featuredPages`, and `pagesByCategory` are wrapped in `useMemo(..., [])`.
   - If new modules (especially plugin-provided modules) are registered after initial app start, the homepage will not show them until a full reload.
   - This is fine if registration is synchronous at startup, but could be an issue for:
     - Runtime plugin enabling/disabling.
     - Lazy-loaded modules that register themselves after mount.

   **Potential follow‑up:**

   - Expose an observable/event from `ModuleRegistry` (e.g. `onRegister`) or wrap `moduleRegistry.list()` in a simple store so `Home` can re-read pages when the registry changes.
   - Alternatively, for now, document that module registration must be completed before `Home` renders (or accept the need for manual reload after plugin changes).

2. **Quick actions bypass recents tracking**
   - Top “Quick Actions” buttons:
     - Workspace → `/workspace`
     - Gallery → `/assets`
     - Automation → `/automation`
     - Game World → `/game-world`
   - These all call `window.open('/route', '_self')` directly.
   - `Recent Pages` is driven by `addToRecent` in `usePageTracking`, but `addToRecent` is only invoked inside `handlePageClick` (used by `PageCard`).
   - Result: navigation via Quick Actions will **not** appear in “Recent Pages”.

   **Potential follow‑up:**

   - Change Quick Actions to use `handlePageClick` with the corresponding page metadata instead of direct `window.open`.
   - Longer-term: rely on a central route listener (e.g. wrapper around the router) that calls `addToRecent` whenever the active page changes, so recents are consistent for any navigation path.

3. **Category labels must stay in sync with module categories**
   - `CATEGORY_LABELS` is a `Record<string, { label; icon; color }>` with keys matching the union in `Module.page.category`.
   - Rendering:
     - Category buttons use `Object.keys(CATEGORY_LABELS)`.
     - When listing pages per category, `CATEGORY_LABELS[category]` is used to get icon/text; unknown keys cause the section to be skipped (`if (!categoryInfo || pages.length === 0) return null;`).
   - If someone extends the `category` union in `Module.page` without updating `CATEGORY_LABELS`, pages in the new category:
     - Still show up in search “All” results (because `filteredPages` is a flat list).
     - But will **not** have a category filter button or category section header.

   **Potential follow‑up:**

   - Either:
     - Keep categories fixed and document them clearly next to the `Module.page` JSDoc, or
     - Source allowed categories from a single constant and reference it in both `Module.page` and `CATEGORY_LABELS` to avoid drift.

4. **Regression of “Available Modules” debug/visibility**
   - Old `Home` used `moduleRegistry.list()` to render:
     - A list of all modules.
     - `isReady()` status and a small “Available Modules” debug view.
   - New `Home` is focused on **pages** (user‑facing routes), not **modules**.
   - That’s good for UX, but it removes an easy, central place to see:
     - Which modules are registered but not exposed as pages.
     - Which modules have `isReady === false`.

   **Potential follow‑up:**

   - For dev builds, add a “Modules” page (likely via a hidden dev module in `modules/pages.ts`) that:
     - Uses `moduleRegistry.list()`.
     - Shows `id`, `name`, `isReady()` status, `priority`, and `dependsOn`.
   - This would restore the observability we had on the old home screen in a more intentional, dev‑only surface.

---

## 3. usePageTracking Hook

- `apps/main/src/hooks/usePageTracking.ts`:
  - Manages:
    - `favorites: string[]` (page IDs).
    - `recentPages: PageInfo[]` with `timestamp` and basic page metadata.
  - Storage:
    - `localStorage['pixsim7:favorites']`
    - `localStorage['pixsim7:recent-pages']`
    - All wrapped in `try/catch` with warnings on failure.
  - API:
    - `toggleFavorite(pageId: string)`
    - `isFavorite(pageId: string)`
    - `addToRecent(page: Omit<PageInfo, 'timestamp'>)`
    - `clearRecent()`

**Findings:**

1. **Per‑browser, not per‑user persistence**
   - Keys are global (`pixsim7:favorites`, `pixsim7:recent-pages`) and do not include user identity.
   - On a shared machine/browser, multiple PixSim7 accounts will share favorites and recents.

   **Potential follow‑up:**

   - Use a scope key that includes the user:
     - e.g. `pixsim7:${userId}:favorites` and `pixsim7:${userId}:recent-pages`.
   - This requires making `usePageTracking` aware of `user` or having the caller pass a `storageKeyPrefix`.

2. **Hydration robustness**
   - Hydration logic trusts parsed JSON:
     - If `localStorage` contains values of unexpected types (e.g. someone manually edited or an old version wrote a different shape), `setFavorites(JSON.parse(savedFavorites))` and `setRecentPages(JSON.parse(savedRecent))` may introduce invalid data.
   - In practice this will usually be fine, but defensively:
     - Check `Array.isArray` and basic field existence before calling setters.
     - Fallback to empty arrays for malformed data.

3. **Recents dedupe and max length**
   - `addToRecent`:
     - Filters out an existing entry with the same `id`.
     - Adds a new entry with fresh `timestamp` at the front.
     - Slices to `MAX_RECENT_PAGES = 5`.
   - This gives clean behavior (no duplicates, most recent first) and is safely capped.

Overall the hook is well‑behaved; the main design decision to revisit is **per‑user scoping** and whether we ultimately want route‑level tracking rather than only `Home`-initiated tracking.

---

## 4. Gallery Badge Presets

- `apps/main/src/lib/gallery/badgeConfigPresets.ts`:
  - Adds/updates `BADGE_CONFIG_PRESETS` entries to better cover:
    - Default / Minimal / Compact / Detailed.
    - New: `generation`, `technical`.
    - Re‑described: `curator`, `review`, `presentation`.
  - All configs are consistent with `MediaCardBadgeConfig` in `apps/main/src/components/media/MediaCard.tsx`.

**Checks performed:**

- Verified that:
  - `showGenerationBadge`, `showGenerationInMenu`, and `generationQuickAction` (`'auto' | 'image_to_video' | 'video_extend' | 'add_to_transition' | 'none'`) match the type definition.
  - Existing uses of `generationQuickAction` (MediaCard + configuration panel) already handle `'none'`.
- Confirmed that presets cover:
  - Workflow‑oriented views (generation, curator, review).
  - Technical/debug view (technical).
  - Presentation/clean views (minimal, presentation).

**Assessment:**

- No type or runtime issues expected from the preset changes.
- The presets are now better differentiated and map cleanly to observable UI behaviors.

---

## 5. Proposed Follow‑Up Tasks

If we want to consolidate this work and avoid subtle UX regressions, these would be good next steps:

1. **Make homepage responsive to dynamic module registration**
   - Add a simple observable or event emitter to `ModuleRegistry`:
     - e.g. `subscribe(listener)` / `unsubscribe(listener)` or `onRegister`.
   - Update `Home.tsx` to re‑compute `allPages`, `featuredPages`, and `pagesByCategory` when the registry changes.
   - Optional: use a dedicated React store (Zustand, etc.) for module/page metadata.

2. **Normalize recents tracking across navigation paths**
   - Update Quick Action buttons in `Home.tsx` to re‑use `handlePageClick` instead of direct `window.open`.
   - Longer‑term: centralize page tracking:
     - Wrap router navigation (`useNavigate` / `<Link>`) with a helper that calls `addToRecent`.
     - Or add a small route observer component that listens to path changes and calls `addToRecent` based on `Module.page` metadata.

3. **Scope favorites and recents by user**
   - Update `usePageTracking` to accept a `storageKeyPrefix` or `userId`.
   - Compose the localStorage keys as `pixsim7:${prefix}:favorites` and `pixsim7:${prefix}:recent-pages`.
   - Wire `Home.tsx` to pass `user.id` or `user.username` when available.

4. **Reintroduce a dev “Modules” overview page**
   - Add a dev‑only page module in `apps/main/src/modules/pages.ts` (e.g. `modules-dev` with `hidden: true`).
   - Implement a `ModulesDevPage` route that shows:
     - All modules from `moduleRegistry.list()`.
     - Their `id`, `name`, `priority`, `dependsOn`, and `isReady()` state.
   - This replaces the old “Available Modules” debug section with a more intentional dev surface.

5. **Document category usage**
   - Extend `Module.page` JSDoc to explicitly list:
     - Allowed categories and their semantic meaning.
     - Which categories drive sections on the homepage.
   - Optionally, create a small `PAGE_CATEGORIES` constant to ensure `Module.page.category` and `CATEGORY_LABELS` stay in sync.

---

## 6. Status

- **Current merge:** Safe to keep; behavior is coherent and type‑sound.
- **Risk level:** Low–moderate, mainly UX consistency rather than hard failures.
- **Recommended action:** Schedule the follow‑ups above (especially per‑user tracking and recents normalization) as small incremental tasks rather than blocking this merge.

