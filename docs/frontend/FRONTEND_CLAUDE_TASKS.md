# Frontend UI Tasks for Claude (Sonnet)

This document defines precise, implementable UI tasks for the gallery so you can write code directly to this repo without copy/paste. Keep data contracts stable; modify only presentational code unless noted.

Repo paths referenced are relative to `frontend/` unless stated.

## Global Context
- Stack: React + Vite + TypeScript + Tailwind (utility-first)
- API base: built from `VITE_BACKEND_URL` (default http://localhost:8001) in `src/lib/api/client.ts`
- Existing hooks/components
  - `src/hooks/useAssets.ts` – paged list via `/api/v1/assets`
  - `src/components/media/MediaCard.tsx` – gallery card with hover-scrub
  - `src/components/primitives/StatusBadge.tsx` – asset sync status
  - `src/routes/Assets.tsx` – list page stub

Please avoid changing the API client or server contracts unless specified. Focus on UI/UX components and state wiring.

---

## 1) FiltersBar component + URL query sync

Goal: Add a filter bar at the top of the Assets page with search, provider select, tag chips, and sort. Sync with the URL query string and call the provided callbacks. Keep accessible and responsive.

Files to add:
- `src/components/filters/FiltersBar.tsx`

Files to edit:
- `src/routes/Assets.tsx` – render the FiltersBar and wire events
- `src/hooks/useAssets.ts` – add ability to fetch with `q`, `tag`, `provider_id`, `sort` and reset when filters change

Contract (FiltersBar):
- Props:
  - `value: { q?: string; tag?: string; providerId?: string | null; sort?: 'new'|'old'|'alpha' }`
  - `onChange: (v: value) => void`
  - `providers: Array<{ id: string; name: string }>`
  - `tags: string[]`
- Behavior:
  - Debounce text input (q) 250ms before onChange
  - Single-select tag (chips) for now
  - Sort dropdown with options: Newest, Oldest, A–Z
  - Small screens: collapse filters under a disclosure (e.g., details/summary)
  - Accessibility: label each input, keyboard navigable chips, focus states, ARIA for the disclosure
- Visual: Tailwind only. Keep it light and neutral.

URL sync:
- Read `q`, `tag`, `provider_id`, `sort` from `location.search`
- Push changes back to URL (replaceState) when filters change
- Persist last used filters in `sessionStorage` (key: `assets_filters`)

useAssets updates:
- Accept optional params: `{ q?, tag?, provider_id?, sort?, limit?, cursor? }`
- Include those params in the `/assets` request
- Expose a `reset()` that clears list and cursor (for when filters change)

Acceptance criteria:
- Toggling filters reloads list from page 1
- URL reflects current filters and can be shared/reloaded
- Works with keyboard and is screen-reader friendly

---

## 2) Tabs for gallery scopes

Goal: Tabs above the filters switch scopes like All, Favorites, Mine, Recent. For now they only affect URL query `scope` and show a placeholder badge on the page.

Files to add:
- `src/components/navigation/Tabs.tsx`

Files to edit:
- `src/routes/Assets.tsx` – render Tabs above FiltersBar; keep scope in URL `?scope=<id>`

Contract (Tabs):
- Props: `tabs: { id: string; label: string; count?: number }[]; value: string; onChange(id: string): void`
- Focus/keyboard: arrow keys move focus between tabs; Enter/Space selects
- Responsive: horizontal scroll on small screens

---

## 3) Masonry grid for MediaCard

Goal: Replace simple grid with a responsive masonry layout for thumbnails of mixed aspect ratios.

Files to add:
- `src/components/layout/MasonryGrid.tsx`

Files to edit:
- `src/routes/Assets.tsx` – use MasonryGrid to lay out MediaCards

Contract (MasonryGrid):
- Props: `items: React.ReactNode[]; columnGap?: number; rowGap?: number; minColumnWidth?: number`
- Behavior: CSS columns approach (no heavy libs), falling back to simple grid if prefers-reduced-motion is set or if unsupported
- Accessibility: reading order preserved; ensure focus order is logical (consider reordering via CSS only)

---

## 4) Skeletons, Empty, Error states

Goal: Provide polished UI states for list loading, empty result, and retry on error.

Files to add:
- `src/components/states/GridSkeleton.tsx`
- `src/components/states/EmptyState.tsx`
- `src/components/states/ErrorState.tsx`

Integration:
- In `Assets.tsx`, render GridSkeleton for initial load; EmptyState when items=0 and not loading; ErrorState with retry button on failure.

---

## 5) Lineage graph page v1 (presentational)

Goal: Implement a presentational graph using Cytoscape or React Flow with minimal config. We will wire data via `useLineageGraph` later.

Files to add:
- `src/components/graph/LineageGraph.tsx`

Contract:
- Props: `{ nodes: { id: string; label: string; thumbUrl?: string }[]; edges: { from: string; to: string }[]; onNodeClick?: (id: string) => void }`
- Style: container div fills parent; zoom controls; fit-to-content on mount; accessible fallback when no nodes

---

## 6) Optional: Storybook setup for visual iteration

If we want a visual design loop, add Storybook so UI can be refined without running the whole app.

Files to add:
- Storybook config and stories for MediaCard, StatusBadge, FiltersBar, Tabs, States

Notes:
- Keep dependencies minimal. Prefer Tailwind utilities over component libraries.

---

## Helpers and data

Providers list endpoint exists at backend: `GET /api/v1/providers` returning `[{ provider_id, name, capabilities, ... }]`. If needed, create a tiny hook:
- `src/hooks/useProviders.ts` that fetches and maps to `{ id, name }`.

Tags: derive from assets list by collecting unique tags across loaded items (simple) or add an endpoint later.

---

## Ground rules
- Do not change API shapes unless a task requests it.
- Keep presentational components self-contained.
- Prefer accessibility and keyboard support.
- Keep code in small, focused files with clear props.
- Use `clsx` sparingly for conditional classes.

When you open a PR/commit, reference the section number here (e.g., "1) FiltersBar + URL sync").
