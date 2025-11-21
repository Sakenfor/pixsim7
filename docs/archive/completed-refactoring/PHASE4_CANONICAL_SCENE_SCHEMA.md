# Phase 4: Canonical Scene Schema & Storage

**Date:** 2025-11-16
**Phase:** Architecture Simplification - Phase 4
**Status:** ✅ Complete (Already Implemented)

## Overview

Phase 4 establishes `@pixsim7/types.Scene` as the canonical wire format for scene data across all frontends and backends. This phase documents the existing implementation and clarifies the responsibilities of storage vs. wire format.

## Canonical Scene Format

### Definition

**Location:** `packages/types/src/index.ts`

The canonical Scene format is defined in the shared types package:

```typescript
export interface Scene {
  id: string
  title?: string
  nodes: SceneNode[]
  edges: SceneEdge[]
  startNodeId: string
}

export interface SceneNode {
  id: string
  type: SceneNodeType // 'video' | 'action' | 'choice' | 'condition' | 'end' | 'scene_call' | 'return' | 'generation'
  label?: string
  mediaUrl?: string // legacy single-clip
  media?: MediaSegment[] // modular clips for this node
  selection?: SelectionStrategy // how to pick from media
  playback?: PlaybackMode // normal | loopSegment | progression

  // Type-specific fields (choice, condition, scene_call, return, end)
  choices?: Array<{ label: string; targetNodeId: string }>
  condition?: { key: string; op: string; value: any }
  trueTargetNodeId?: string
  falseTargetNodeId?: string
  targetSceneId?: string
  parameterBindings?: Record<string, any>
  returnRouting?: Record<string, string>
  returnPointId?: string
  returnValues?: Record<string, any>
  endType?: 'success' | 'failure' | 'neutral'
  endMessage?: string
  meta?: Record<string, any>
}

export interface MediaSegment {
  id: string
  url: string // Fully hydrated media URL (S3, download URL, etc.)
  durationSec?: number
  tags?: string[]
}

export interface SceneEdge {
  id: string
  from: string
  to: string
  label?: string
  conditions?: SceneEdgeCondition[]
  effects?: SceneEdgeEffect[]
  isDefault?: boolean
}
```

### Key Principles

1. **Single Source of Truth**: All scene consumers (editor, game-frontend, preview) expect this exact format
2. **Runtime Hydration**: Backend converts storage format → canonical Scene with fully hydrated URLs
3. **Type Safety**: Full TypeScript types shared across all packages
4. **Extensible**: `meta` field allows domain-specific extensions without breaking the contract

## Backend Storage Models

The backend has **two scene storage models** with different purposes:

### 1. Content Scenes (Editor/Organization)

**Location:** `pixsim7/backend/main/domain/scene.py`

```python
class Scene(SQLModel, table=True):
    """Content organization - for editor"""
    id: int
    user_id: int
    name: str
    description: Optional[str]
    tags: List[str]
    is_template: bool

class SceneAsset(SQLModel, table=True):
    """Asset within a scene (with position and ordering)"""
    id: int
    scene_id: int
    asset_id: int
    order: int
    position_x: float
    position_y: float
    meta_data: Dict[str, Any]

class SceneConnection(SQLModel, table=True):
    """Connection between assets in a scene"""
    id: int
    scene_id: int
    from_scene_asset_id: int
    to_scene_asset_id: int
    connection_type: str
    label: Optional[str]
    meta_data: Dict[str, Any]
```

**Purpose:**
- Content organization and editing
- Canvas layout (position_x, position_y)
- User ownership (user_id)
- Template management (is_template)

### 2. Game Scenes (Runtime Playback)

**Location:** `pixsim7/backend/main/domain/game/models.py`

```python
class GameScene(SQLModel, table=True):
    """Game scene graph - optimized for runtime"""
    id: int
    title: str
    description: Optional[str]
    entry_node_id: Optional[int]
    meta: Optional[Dict[str, Any]]

class GameSceneNode(SQLModel, table=True):
    """Node in scene graph"""
    id: int
    scene_id: int
    asset_id: int  # Primary asset reference
    label: Optional[str]
    loopable: bool
    skippable: bool
    reveal_choices_at_sec: Optional[float]
    meta: Optional[Dict[str, Any]]  # Contains segments, playback config, etc.

class GameSceneEdge(SQLModel, table=True):
    """Edge between nodes"""
    id: int
    scene_id: int
    from_node_id: int
    to_node_id: int
    choice_label: str
    conditions: Optional[Dict[str, Any]]
    effects: Optional[Dict[str, Any]]
```

**Purpose:**
- Runtime scene graph playback
- Game session state management
- Branching logic (conditions, effects)
- Multi-clip support via meta.segments

## Asset ID to MediaSegment Mapping

### Storage Convention

**Asset references are stored as IDs, not URLs:**

```python
# GameSceneNode stores asset references
node = GameSceneNode(
    asset_id=42,  # Primary asset reference
    meta={
        "segments": [
            {"asset_id": 42, "id": "seg1", "tags": ["intro"]},
            {"asset_id": 43, "id": "seg2", "tags": ["action"]},
            {"asset_id": 44, "id": "seg3", "tags": ["outro"]}
        ],
        "playback": {"kind": "progression", ...}
    }
)
```

### Runtime Hydration

**Location:** `pixsim7/backend/main/api/v1/game_scenes.py:get_scene`

The API route converts storage format → canonical Scene:

```python
@router.get("/{scene_id}", response_model=SceneResponse)
async def get_scene(scene_id: int, db: DatabaseSession, asset_service: AssetSvc, user: CurrentUser):
    # 1. Fetch GameScene, GameSceneNodes, GameSceneEdges from database
    scene = await db.get(GameScene, scene_id)
    nodes = await db.execute(select(GameSceneNode).where(GameSceneNode.scene_id == scene.id))
    edges = await db.execute(select(GameSceneEdge).where(GameSceneEdge.scene_id == scene.id))

    # 2. For each node, hydrate asset_id → MediaSegment with URL
    for node in nodes:
        media_segments = []

        # Primary asset_id
        if node.asset_id:
            asset = await asset_service.get_asset_for_user(node.asset_id, user)
            media_segments.append(MediaSegment(
                id=str(asset.id),
                url=asset.remote_url or asset.download_url,  # Hydrated URL
                durationSec=asset.duration_sec,
                tags=asset.tags
            ))

        # Additional segments from meta.segments
        if node.meta and "segments" in node.meta:
            for seg in node.meta["segments"]:
                asset_id = seg.get("asset_id")
                asset = await asset_service.get_asset_for_user(asset_id, user)
                media_segments.append(MediaSegment(
                    id=seg.get("id", str(asset.id)),
                    url=asset.remote_url or asset.download_url,  # Hydrated URL
                    durationSec=asset.duration_sec,
                    tags=seg.get("tags") or asset.tags
                ))

        # 3. Build canonical SceneNode
        scene_nodes.append(SceneNode(
            id=str(node.id),
            type="video",
            label=node.label,
            media=media_segments,
            meta=node.meta
        ))

    # 4. Return canonical Scene format
    return SceneResponse(
        id=str(scene.id),
        title=scene.title,
        nodes=scene_nodes,
        edges=scene_edges,
        startNodeId=str(scene.entry_node_id)
    )
```

### Benefits of This Pattern

✅ **Storage Efficiency** - Store asset IDs (integers), not full URLs
✅ **URL Flexibility** - URLs can change (S3 bucket migration, CDN updates) without updating scenes
✅ **Permission Enforcement** - AssetService enforces user access control during hydration
✅ **Caching** - Asset metadata (duration, tags) cached separately from scene graph
✅ **Type Safety** - Storage model → canonical Scene conversion happens in one place

## Responsibilities

### Backend Responsibilities

**Storage:**
- Store asset references as IDs (GameSceneNode.asset_id, meta.segments[].asset_id)
- Store scene graph structure (nodes, edges, conditions, effects)
- Store game-specific metadata in meta field

**API Layer:**
- Convert GameScene → canonical Scene format
- Hydrate asset IDs → MediaSegment with URLs via AssetService
- Enforce user permissions during hydration
- Return fully hydrated Scene matching `@pixsim7/types.Scene`

### Frontend Responsibilities

**Consumption:**
- Consume Scene from `/api/v1/game/scenes/{id}` endpoint
- Use ScenePlayer from `@pixsim7/game-ui` for playback
- Never parse or depend on storage format details
- Trust that MediaSegment.url is ready to use

**Editing (Future):**
- Editor will create/update scenes via content API
- Editor stores asset_ids in scene graph
- Backend handles hydration for preview/playback

## API Endpoints

### GET /api/v1/game/scenes/{id}

**Returns:** Canonical Scene format with hydrated MediaSegments

**Example Response:**
```json
{
  "id": "1",
  "title": "Morning Routine",
  "startNodeId": "101",
  "nodes": [
    {
      "id": "101",
      "type": "video",
      "label": "Wake up",
      "media": [
        {
          "id": "42",
          "url": "https://s3.amazonaws.com/pixsim7-assets/videos/wakeup.mp4",
          "durationSec": 12.5,
          "tags": ["morning", "bedroom"]
        }
      ]
    },
    {
      "id": "102",
      "type": "choice",
      "label": "What to do?",
      "choices": [
        {"label": "Make breakfast", "targetNodeId": "103"},
        {"label": "Go back to sleep", "targetNodeId": "104"}
      ]
    }
  ],
  "edges": [
    {
      "id": "1001",
      "from": "101",
      "to": "102",
      "isDefault": true
    }
  ]
}
```

## Multi-Clip Nodes

### Storage Pattern

For nodes with multiple clips (progression mode, pooled selection, etc.):

```python
GameSceneNode(
    asset_id=None,  # No primary asset for multi-clip nodes
    meta={
        "segments": [
            {"asset_id": 42, "id": "wake", "tags": ["intro"]},
            {"asset_id": 43, "id": "stretch", "tags": ["action"]},
            {"asset_id": 44, "id": "coffee", "tags": ["outro"]}
        ],
        "selection": {"kind": "ordered"},
        "playback": {
            "kind": "progression",
            "segments": [
                {"label": "Wake up", "segmentIds": ["wake"]},
                {"label": "Stretch", "segmentIds": ["stretch"]},
                {"label": "Make coffee", "segmentIds": ["coffee"]}
            ]
        }
    }
)
```

### Hydrated Output

```json
{
  "id": "101",
  "type": "video",
  "label": "Morning routine",
  "media": [
    {
      "id": "wake",
      "url": "https://s3.amazonaws.com/.../wake.mp4",
      "durationSec": 5.0,
      "tags": ["intro"]
    },
    {
      "id": "stretch",
      "url": "https://s3.amazonaws.com/.../stretch.mp4",
      "durationSec": 8.0,
      "tags": ["action"]
    },
    {
      "id": "coffee",
      "url": "https://s3.amazonaws.com/.../coffee.mp4",
      "durationSec": 10.0,
      "tags": ["outro"]
    }
  ],
  "selection": {"kind": "ordered"},
  "playback": {
    "kind": "progression",
    "segments": [
      {"label": "Wake up", "segmentIds": ["wake"]},
      {"label": "Stretch", "segmentIds": ["stretch"]},
      {"label": "Make coffee", "segmentIds": ["coffee"]}
    ]
  }
}
```

## Verification

### Backend Returns Canonical Format ✅

The backend already properly implements this pattern:

- [x] `@pixsim7/types.Scene` is the canonical wire format
- [x] API routes return SceneResponse matching canonical Scene
- [x] Asset IDs stored in database (GameSceneNode.asset_id, meta.segments)
- [x] Runtime hydration via AssetService.get_asset_for_user
- [x] MediaSegment contains fully hydrated URLs
- [x] Permission enforcement during hydration
- [x] No frontend parsing of storage format required

### Frontend Consumes Canonical Format ✅

Game frontend properly consumes Scene:

- [x] game-frontend/src/lib/gameApi.ts → fetchSceneById returns Scene
- [x] ScenePlayer from @pixsim7/game-ui accepts Scene prop
- [x] MediaSegment URLs ready to use (no further hydration needed)
- [x] Full TypeScript type safety via @pixsim7/types

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                    @pixsim7/types                            │
│                 (Canonical Scene Format)                     │
│   Scene, SceneNode, SceneEdge, MediaSegment                  │
└─────────────────────┬────────────────────────────────────────┘
                      │
         ┌────────────┴────────────┐
         │                         │
         ▼                         ▼
┌─────────────────┐      ┌─────────────────┐
│    Backend      │      │    Frontend     │
│                 │      │                 │
│  Storage:       │      │  Consumption:   │
│  ┌───────────┐ │      │  ┌───────────┐  │
│  │ GameScene │ │      │  │ ScenePlayer│ │
│  │ (asset_ids)│ │      │  │ (from      │ │
│  └───────────┘ │      │  │  @pixsim7/ │ │
│       │        │      │  │  game-ui)  │ │
│       ▼        │      │  └───────────┘  │
│  ┌───────────┐ │      │                 │
│  │ API Layer │ │──────┼──GET /scenes/1──┤
│  │ Hydration │ │      │                 │
│  └───────────┘ │      │  Canonical Scene│
│       │        │      │  with MediaSeg  │
│       ▼        │      │  .url ready     │
│  Canonical     │      │                 │
│  Scene         │      │                 │
└─────────────────┘      └─────────────────┘
```

## Benefits

✅ **Single Source of Truth** - `@pixsim7/types.Scene` defines the contract
✅ **Storage Independence** - Backend can change storage format without breaking frontends
✅ **URL Flexibility** - Asset URLs can change without scene graph updates
✅ **Type Safety** - Full TypeScript types across packages
✅ **Permission Enforcement** - AssetService checks user access during hydration
✅ **Efficient Storage** - Asset IDs are integers, not URLs
✅ **Caching** - Asset metadata cached separately from scene graph

## Implementation Status

**Phase 4 is complete.** The canonical Scene schema and runtime hydration pattern are already fully implemented:

- ✅ Canonical Scene format defined in @pixsim7/types
- ✅ Backend stores asset_ids in GameSceneNode
- ✅ API layer hydrates asset_ids → MediaSegment with URLs
- ✅ game-frontend consumes canonical Scene format
- ✅ ScenePlayer uses Scene from @pixsim7/game-ui
- ✅ Permission enforcement via AssetService
- ✅ Multi-clip nodes supported via meta.segments

## Notes

- This pattern was already implemented during Phase 1 backend consolidation
- Phase 4 documents the existing implementation for clarity
- No code changes needed - this is documentation-only
- Main editor integration (Phase 3 remaining work) will also use this format

## Related Documentation

- `ARCHITECTURE_SIMPLIFICATION_PLAN.md` - Phase 4 section
- `PHASE1_CONSOLIDATION_SUMMARY.md` - Backend consolidation that implemented hydration
- `PHASE3_FRONTEND_SIMPLIFICATION_SUMMARY.md` - Frontend Scene consumption
- `packages/types/src/index.ts` - Canonical Scene type definitions
- `pixsim7/backend/main/api/v1/game_scenes.py` - Hydration implementation
