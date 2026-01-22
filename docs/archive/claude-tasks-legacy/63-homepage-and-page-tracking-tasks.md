## 63 – Homepage Navigation & Page Tracking Tasks

**Area:** Frontend – main app shell, module registry, gallery  
**Scope:** `Home.tsx`, `ModuleRegistry`, page metadata, favorites/recents, dev visibility

---

## 1. Goals

- Make the homepage fully data‑driven from the module registry while staying reactive to changes.
- Ensure favorites and recent pages behave consistently across all navigation paths.
- Scope persisted page state to individual users, not just browsers.
- Preserve a dev‑friendly view of module registration and readiness.
- Clarify and codify how page categories are used across the app.

---

## 2. Tasks

### Task A – Reactivity to Module Registration

**Objective:** When modules are registered after app startup (e.g. plugins, lazy modules), the homepage should automatically pick them up without a hard reload.

- Add a lightweight change notification mechanism to `ModuleRegistry`:
  - e.g. `subscribe(listener) / unsubscribe(listener)` or a simple event emitter called whenever a module is registered.
  - The API should be framework‑agnostic (no direct React imports in the registry).
- Update the homepage (`apps/main/src/routes/Home.tsx`) to:
  - Subscribe to registry changes on mount.
  - Recompute `allPages`, `featuredPages`, and any category‑grouped structures when modules change.
  - Unsubscribe on unmount.
- Make sure this doesn’t introduce render loops or heavy recomputation on every render (updates should only fire on registry changes).

**Acceptance criteria:**
- Enabling a plugin or registering a module after initial load causes its page to appear on the homepage within the same session.
- No console warnings about duplicate registrations; existing registry logging continues to work.

---

### Task B – Normalize “Recent Pages” Tracking

**Objective:** Any user navigation to a registered page should consistently update “Recent Pages”, regardless of how the user got there.

- Audit all navigation entry points for registered pages:
  - Quick actions at the top of `Home.tsx` (Workspace, Gallery, Automation, Game World).
  - Page cards rendered from registry metadata.
  - Any other shortcuts that directly open known routes.
- Choose and implement a single source of truth for recents:
  - Option 1: Route‑based tracking
    - Add a small wrapper around the router (or a route observer component) that listens for route changes.
    - When the route matches a known `Module.page.route`, call `addToRecent` from `usePageTracking` with the corresponding metadata.
  - Option 2: Centralized navigation helper
    - Introduce a helper (e.g. `openPage(pageId)` or `navigateToPage(page)`).
    - Update `Home.tsx` buttons and cards to use this helper so recents are updated before navigation.
- Ensure Quick Action buttons are wired through this mechanism, not raw `window.open`.

**Acceptance criteria:**
- Visiting a page via Quick Actions, page cards, or other app links all results in:
  - The page appearing at the top of the “Recent Pages” list.
  - No duplicate entries for the same page; only the timestamp is refreshed.

---

### Task C – Per‑User Favorites and Recents

**Objective:** Favorites and recent pages should be scoped to the signed‑in user instead of the shared browser.

- Update `usePageTracking` (`apps/main/src/hooks/usePageTracking.ts`) to support a key prefix:
  - Accept a `storageKeyPrefix` or `userId` parameter.
  - Compute localStorage keys as `pixsim7:${prefix}:favorites` and `pixsim7:${prefix}:recent-pages`.
- Wire `Home.tsx` (or the caller) to pass the current user identifier:
  - Prefer a stable `user.id` or canonical username over display name.
  - Handle the unauthenticated case gracefully (either skip tracking or use a default prefix).
- Add basic validation when loading from localStorage:
  - Ensure values are arrays before using them.
  - Fallback to empty arrays if parsing fails or the shape is unexpected.

**Acceptance criteria:**
- Two different user accounts on the same browser see **different** favorites/recents.
- Corrupted or legacy localStorage values do not break rendering; the hook recovers by resetting to empty state and logs a warning at most once per mount.

---

### Task D – Dev “Modules Overview” Page

**Objective:** Restore and improve the old “Available Modules” visibility in a dev‑only, registry‑backed page.

- Add a dev‑only page module in `apps/main/src/modules/pages.ts`:
  - e.g. `modulesDevModule` with `id: 'modules-dev'`, `route: '/dev/modules'`, `category: 'development'`, `hidden: true`.
- Implement the corresponding page component (e.g. `ModulesDevPage`):
  - Uses `moduleRegistry.list()` to show:
    - `id`, `name`, `priority`, `dependsOn`.
    - `isReady()` status, if present.
  - Optionally group by priority or dependency for easier debugging.
- Ensure the page is discoverable in dev:
  - At minimum, document the route in developer docs or link it from an existing dev/debug surface.

**Acceptance criteria:**
- Visiting `/dev/modules` in a dev build shows a complete, up‑to‑date list of registered modules and their readiness.
- The page is powered by the registry and doesn’t require manual updates when modules change.

---

### Task E – Document Page Categories and Semantics

**Objective:** Make category usage explicit and prevent drift between `Module.page.category` and homepage category labels.

- Introduce a single source of truth for page categories:
  - Either a `PAGE_CATEGORIES` constant or a shared type/constant pair exported from the modules/types layer.
  - Ensure both:
    - `Module.page.category`.
    - `CATEGORY_LABELS` in `Home.tsx`.
    reference the same set.
- Expand JSDoc on `Module.page`:
  - For each category (`creation`, `development`, `management`, `game`, `automation`), add a one‑line definition and example use cases.
- Update existing docs where navigation/pages are discussed to:
  - Reference the category system.
  - Note that homepage sections and filters are driven by these categories.

**Acceptance criteria:**
- Adding a new category requires updating the central definition, not multiple scattered enums.
- `Module.page.category` and homepage category buttons/labels cannot silently diverge.

---

## 3. Coordination Notes

- These tasks touch:
  - The shared module registry (`apps/main/src/modules/types.ts`).
  - The main app shell (`Home.tsx`).
  - The navigation/UX around favorites and recents.
- Changes should be validated by:
  - Manual smoke testing of homepage navigation, favorites, and recents.
  - Verifying dev paths (dynamic module registration, `/dev/modules`).
- If runtime plugin loading is expanded later, Tasks A–C become critical infrastructure for discoverability and personalization; consider treating them as prerequisites for plugin‑heavy work.

