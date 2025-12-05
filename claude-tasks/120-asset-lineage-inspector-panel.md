**Task 120: Asset Lineage Inspector Panel**

> **For Agents**
> - Build a UI surface to inspect parent/child relationships between Assets using the existing `AssetLineage` graph.
> - Use this when working on the Assets route, gallery tooling, or any debugging/dev tools that need to show “where did this clip come from?”.
> - Target files:
>   - Backend: `pixsim7/backend/main/domain/asset_lineage.py`, `services/asset/*`, new lineage query API.
>   - Frontend: `apps/main/src/routes/Assets.tsx`, gallery components, potentially a new panel under the `system` or `utilities` panel categories.

---

## Context

We now have a fairly complete cross-provider asset model and lineage system:

- **Asset model:**
  - `pixsim7/backend/main/domain/asset.py`
  - Captures:
    - Provider identity (`provider_id`, `provider_asset_id`), `media_type`, location (`remote_url`, `local_path`), and rich metadata (tags, content domain, `media_metadata`).
    - Cross-provider uploads via `provider_uploads` map.

- **Lineage model:**
  - `pixsim7/backend/main/domain/asset_lineage.py`:
    - `AssetLineage` table, with:
      - `parent_asset_id`, `child_asset_id`
      - `relation_type` (e.g. `SOURCE_IMAGE`, `TRANSITION_INPUT`, `SOURCE_VIDEO`, `FUSION_CHARACTER`, `PAUSED_FRAME`)
      - `operation_type` (`OperationType.IMAGE_TO_VIDEO`, `VIDEO_EXTEND`, `VIDEO_TRANSITION`, `FUSION`, etc.)
      - Temporal metadata: `parent_start_time`, `parent_end_time`, `parent_frame`
      - `sequence_order` for multi-input operations.

- **Relation type constants:**
  - `pixsim7/backend/main/domain/relation_types.py`
  - Includes image/video sources (`SOURCE_IMAGE`, `TRANSITION_INPUT`, `SOURCE_VIDEO`, `KEYFRAME`, `VIDEO_CLIP`, etc.) and fusion-specific relations.

- **Lineage writing:**
  - `pixsim7/backend/main/services/asset/asset_factory.py`:
    - `create_lineage_links(...)` writes `AssetLineage` rows for a given child and list of parents.
  - `pixsim7/backend/main/services/asset/enrichment_service.py`:
    - `_extract_and_register_embedded(asset, user)`:
      - Uses provider-specific `extract_embedded_assets` (e.g. Pixverse) to discover embedded parents.
      - Creates/upserts parent Assets via `add_asset(...)`.
      - Calls `create_lineage_links(...)` using `relation_type`/`operation_type` hints from the embedded items.
  - For Pixverse specifically, embedded extractors now express rich lineage:
    - Transitions: `TRANSITION_INPUT` + `VIDEO_TRANSITION` with per-image prompts/durations in `media_metadata.pixverse_transition`.
    - Fusion: `FUSION_CHARACTER` / `FUSION_BACKGROUND` / `FUSION_REFERENCE` + `FUSION` with fusion metadata in `media_metadata.pixverse_fusion`.
    - Extend: `SOURCE_VIDEO` + `VIDEO_EXTEND` with original video info in `media_metadata.pixverse_extend`.

- **Lineage refresh tooling:**
  - `pixsim7/backend/main/services/asset/lineage_refresh_service.py`:
    - `refresh_asset_lineage(asset_id, provider_id=None, clear_existing=True)` and `refresh_for_assets(...)` allow rebuilding lineage from stored metadata.
  - Task 119 describes how to expose this via an API and Provider Settings controls for Pixverse.

What we **do not** have yet is a dedicated UI to inspect this lineage graph from the Assets route: a way to select an Asset and see its parents, children, and how they connect through operations.

Separately, there is a scene/graph lineage task for the node editor (Task 47: graph visualization), but that is focused on **scene call hierarchy**, not **media asset derivation**. This task focuses on media Assets only.

---

## Goals

1. **Expose lineage data via a clean backend API**
   - Provide an API that, given an Asset ID, returns its lineage neighborhood:
     - Direct parents and children (with relation/operation metadata).
     - Optionally, a small multi-hop tree (e.g., parents, grandparents, and immediate children).
   - Summarize the graph in a form suitable for UI visualization (nodes + edges).

2. **Build an Asset Lineage Inspector panel in the frontend**
   - Integrate into the Assets route and/or panel system so that:
     - When a user selects a media asset (video/image), they can open a “Lineage” view.
     - The view shows parent/child assets, relation types, and operations (e.g., “This video was extended from X; generated from Y images”).

3. **Support debugging and provenance use cases**
   - Make it easy to answer:
     - “Which images were used to create this Pixverse transition?”
     - “Which extended versions exist for this base video?”
     - “What clips were extracted as paused frames from this video?”
   - Reuse this inspector in dev tools and potentially in user-facing provenance screens.

---

## Deliverables

### 1. Backend: Asset lineage query API

Create a new router, e.g. `pixsim7/backend/main/api/v1/asset_lineage.py` (or extend the one introduced for Task 119 if already present) and register it.

**Endpoint: `GET /assets/{asset_id}/lineage`**

- Auth: logged-in user; Asset must belong to the user (or be visible under future multi-tenant rules).
- Query params:
  - `direction`: `"both" | "parents" | "children"` (default `"both"`).
  - `max_depth`: int (default 1) – how many hops up/down to traverse.
  - `max_nodes`: int (default 50) – safety cap for large graphs.
- Behavior:
  - Load the child Asset (`asset_id`), ensure `asset.user_id == current_user.id`.
  - Query `AssetLineage` for:
    - Parents: `where child_asset_id == asset_id`.
    - Children: `where parent_asset_id == asset_id`.
  - If `max_depth > 1`, recursively expand to grandparents / grandchildren up to the limit, but keep it simple:
    - Breadth-first expansion up to `max_depth` in each direction, capping at `max_nodes` total nodes.
  - Build a graph representation:

    ```jsonc
    {
      "root_asset_id": 123,
      "nodes": [
        {
          "asset": {
            "id": 123,
            "media_type": "video",
            "provider_id": "pixverse",
            "provider_asset_id": "374351749764234",
            "thumbnail_url": "...",
            "description": "..."
          },
          "depth": 0
        },
        {
          "asset": { "id": 456, ... },
          "depth": -1  // parent level (optional)
        },
        {
          "asset": { "id": 789, ... },
          "depth": +1  // child level (optional)
        }
      ],
      "edges": [
        {
          "parent_asset_id": 456,
          "child_asset_id": 123,
          "relation_type": "SOURCE_VIDEO",
          "operation_type": "video_extend",
          "sequence_order": 0
        },
        {
          "parent_asset_id": 999,
          "child_asset_id": 123,
          "relation_type": "TRANSITION_INPUT",
          "operation_type": "video_transition",
          "sequence_order": 1
        }
      ]
    }
    ```

- Implementation notes:
  - Keep it asset-focused; do not mix in `Generation` nodes for now.
  - Include minimal Asset fields necessary for a gallery-like thumbnail rendering: `id`, `media_type`, `provider_id`, `provider_asset_id`, `thumbnail_url`, `remote_url`, `description`.

Optionally, a second endpoint:

**`GET /assets/{asset_id}/lineage/flat`**

- Returns direct parents and children as simple lists (no graph), for use in more basic UIs:

```jsonc
{
  "asset_id": 123,
  "parents": [ { ...asset summary + relation/operation... } ],
  "children": [ { ... } ]
}
```

---

### 2. Frontend: Lineage Inspector panel / view

Add a lineage view to the Assets route and panel system.

**2.1. Panel registration**

- In `apps/main/src/lib/panels/corePanelsPlugin.tsx` or similar, add a new panel definition, e.g.:

  ```ts
  {
    id: 'asset-lineage',
    group: 'system' as const,
    title: 'Asset Lineage',
    component: AssetLineagePanel,
  }
  ```

- Or, for a lighter integration, embed the inspector directly into the `Assets` route sidebar rather than as a standalone panel. The task can pick whichever is more consistent with the existing panel layout.

**2.2. React component: `AssetLineagePanel`**

Create a new component, e.g. `apps/main/src/components/assets/AssetLineagePanel.tsx`:

- Inputs:
  - `selectedAssetId: number | null` – from the Assets route state or a global store.
- Behavior:
  - When `selectedAssetId` changes:
    - Call the backend API `GET /assets/{id}/lineage?direction=both&max_depth=1`.
    - Store the result in component state.
  - UI layout (simple first version):
    - Header with selected asset info (thumbnail, provider, ID).
    - Two sections:
      - **Parents**
        - List each parent as a small card (thumbnail, provider, media_type), with badges for `relation_type` and `operation_type` (e.g., “SOURCE_VIDEO / VIDEO_EXTEND”).
      - **Children**
        - Same as parents, for children.
    - Optional: a small “graph” layout later (e.g. stacked nodes with arrows), but start with lists.

- Interactions:
  - Clicking a parent/child could:
    - Update selection in the Assets route (so you can quickly navigate lineage).
    - Or open that asset in a new tab (depending on UX preference).
  - Add a refresh button for reloading lineage after running lineage rebuild operations.

**2.3. Assets route integration**

- In `apps/main/src/routes/Assets.tsx` (or wherever the main assets gallery is rendered):
  - Ensure there is a notion of “currently selected asset” (a single focus item) in state or store.
  - When an asset is clicked, set `selectedAssetId` and show the Lineage panel:
    - Either in a side drawer / right-hand column.
    - Or by toggling to the “Asset Lineage” panel in the panel stack.

- For Pixverse in particular, this should allow you to test:
  - Extended clip shows one parent with `SOURCE_VIDEO / VIDEO_EXTEND`.
  - Transition clip shows multiple parents with `TRANSITION_INPUT / VIDEO_TRANSITION`.
  - Fusion clip shows multiple parents with appropriate fusion relation types (`FUSION_* / FUSION`).

---

### 3. Optional: Dev tooling hooks

If time allows:

- Add a quick link from Provider Settings Pixverse sync section (Task 119) to the Asset Lineage Inspector:
  - e.g., a button “Open Asset Lineage” that navigates to the Assets route with a specific `asset_id` preselected.

- Add a small badge or icon in the gallery view on the Assets route:
  - Displays how many parents/children an asset has (e.g., `2↑ / 3↓`).
  - Clicking it opens the lineage inspector for that asset.

These are nice-to-have and can be scoped into a follow-up task if too large.

---

## Acceptance Criteria

- `GET /assets/{id}/lineage` (and optional `/flat`) returns a structured view of lineage for the given asset, limited by depth and node count, and only for assets the user owns.
- For a Pixverse extended video Asset:
  - The lineage API shows a `SOURCE_VIDEO` parent with `operation_type="video_extend"`.
- For a Pixverse transition video Asset:
  - The lineage API shows multiple parents with `relation_type="TRANSITION_INPUT"` and `operation_type="video_transition"`.
- For a Pixverse fusion video Asset:
  - The lineage API shows the expected parents with `relation_type` matching fusion relation types and `operation_type="fusion"`.
- In the frontend:
  - When an asset is selected in the Assets route, the Lineage Inspector panel (or sidebar) can be opened and shows its parents and children with clear labels for relation type and operation type.
  - Clicking on a parent/child in the Lineage Inspector updates the selected asset and refreshes the view.
- The lineage inspector is read-only and does not modify Assets or AssetLineage; it’s purely for visualization and debugging.
*** End Patch***  !!}
