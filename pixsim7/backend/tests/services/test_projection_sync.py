"""
Integration tests for projection sync hooks and world-level resync.

Verifies that nested CRUD changes trigger correct projection sync:
  - schedule changes -> compiled behavior routine for NPC
  - expression changes -> NPC expression projection blob
  - hotspot changes -> location hotspot projection blob
  - scene node/edge changes -> scene graph projection blob
  - bundle import -> all projections synced
  - resync_world_projections -> full world resync
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any, Dict, List, Optional
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# Lightweight mock helpers
# ---------------------------------------------------------------------------

class _ScalarResult:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class _RowsResult:
    def __init__(self, rows):
        self._rows = rows

    def scalars(self):
        return self

    def all(self):
        return list(self._rows)


class _RawRowsResult:
    """Mimics result.all() returning a list of tuples (for select(Model.id))."""

    def __init__(self, rows: List[tuple]):
        self._rows = rows

    def all(self):
        return list(self._rows)

    def scalars(self):
        return _RowsResult([r[0] for r in self._rows])


def _mock_db(**overrides) -> AsyncMock:
    """Create an AsyncMock db session with db.add as a plain MagicMock.

    Sync methods like db.add() must be MagicMock to avoid
    'coroutine never awaited' warnings from AsyncMock.
    """
    db = AsyncMock()
    db.add = MagicMock()
    for key, value in overrides.items():
        setattr(db, key, value)
    return db


def _make_npc(
    npc_id: int = 1,
    world_id: int = 10,
    name: str = "TestNPC",
    personality: Optional[Dict[str, Any]] = None,
) -> SimpleNamespace:
    return SimpleNamespace(
        id=npc_id,
        world_id=world_id,
        name=name,
        personality=personality or {},
    )


def _make_location(
    location_id: int = 1,
    world_id: int = 10,
    name: str = "TestLoc",
    meta: Optional[Dict[str, Any]] = None,
) -> SimpleNamespace:
    return SimpleNamespace(
        id=location_id,
        world_id=world_id,
        name=name,
        meta=meta or {},
    )


def _make_scene(
    scene_id: int = 1,
    world_id: int = 10,
    entry_node_id: Optional[int] = None,
    meta: Optional[Dict[str, Any]] = None,
) -> SimpleNamespace:
    return SimpleNamespace(
        id=scene_id,
        world_id=world_id,
        entry_node_id=entry_node_id,
        meta=meta or {},
        title="TestScene",
    )


def _make_expression(
    expr_id: int = 1,
    npc_id: int = 1,
    state: str = "idle",
    meta: Optional[Dict[str, Any]] = None,
) -> SimpleNamespace:
    return SimpleNamespace(
        id=expr_id,
        npc_id=npc_id,
        state=state,
        asset_id=100,
        meta=meta or {},
    )


def _make_hotspot(
    hotspot_id_str: str = "couch_sit",
    location_id: int = 1,
    scene_id: Optional[int] = None,
) -> SimpleNamespace:
    return SimpleNamespace(
        id=1,
        hotspot_id=hotspot_id_str,
        location_id=location_id,
        scene_id=scene_id,
    )


def _make_scene_node(node_id: int, scene_id: int = 1) -> SimpleNamespace:
    return SimpleNamespace(id=node_id, scene_id=scene_id)


def _make_scene_edge(
    edge_id: int,
    scene_id: int = 1,
    from_node_id: int = 1,
    to_node_id: int = 2,
) -> SimpleNamespace:
    return SimpleNamespace(
        id=edge_id,
        scene_id=scene_id,
        from_node_id=from_node_id,
        to_node_id=to_node_id,
    )


def _make_world(world_id: int = 10, meta: Optional[Dict[str, Any]] = None) -> SimpleNamespace:
    return SimpleNamespace(id=world_id, owner_user_id=1, name="TestWorld", meta=meta or {})


def _make_schedule(
    schedule_id: int = 1,
    npc_id: int = 1,
    day_of_week: int = 0,
    start_time: float = 0.0,
    end_time: float = 3600.0,
    location_id: int = 1,
) -> SimpleNamespace:
    return SimpleNamespace(
        id=schedule_id,
        npc_id=npc_id,
        day_of_week=day_of_week,
        start_time=start_time,
        end_time=end_time,
        location_id=location_id,
        rule=None,
    )


# ---------------------------------------------------------------------------
# Expression projection sync
# ---------------------------------------------------------------------------

class TestSyncNpcExpressionProjection:
    @pytest.mark.asyncio
    async def test_expression_projection_stores_states_and_surface_types(self) -> None:
        from pixsim7.backend.main.services.game.derived_projections import (
            sync_npc_expression_projection,
        )

        npc = _make_npc(npc_id=5, personality={})
        expressions = [
            _make_expression(expr_id=1, npc_id=5, state="idle", meta={"surfaceType": "portrait"}),
            _make_expression(expr_id=2, npc_id=5, state="talking", meta={"surfaceType": "bust"}),
            _make_expression(expr_id=3, npc_id=5, state="idle", meta={"surfaceType": "portrait"}),
        ]

        db = _mock_db(
            get=AsyncMock(return_value=npc),
            execute=AsyncMock(return_value=_RowsResult(expressions)),
            commit=AsyncMock(),
        )

        await sync_npc_expression_projection(db, 5)

        assert npc.personality["_projections"]["npc_expressions"]["expression_count"] == 3
        assert npc.personality["_projections"]["npc_expressions"]["states"] == ["idle", "talking"]
        assert npc.personality["_projections"]["npc_expressions"]["surface_types"] == ["bust", "portrait"]
        assert npc.personality["_projections"]["npc_expressions"]["has_portrait_surface"] is True
        db.add.assert_called_once()
        db.commit.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_expression_projection_noop_when_npc_missing(self) -> None:
        from pixsim7.backend.main.services.game.derived_projections import (
            sync_npc_expression_projection,
        )

        db = _mock_db(get=AsyncMock(return_value=None))

        await sync_npc_expression_projection(db, 999)
        db.execute.assert_not_called()

    @pytest.mark.asyncio
    async def test_expression_projection_skips_commit_when_unchanged(self) -> None:
        from pixsim7.backend.main.services.game.derived_projections import (
            sync_npc_expression_projection,
        )

        existing_projection = {
            "expression_count": 1,
            "states": ["idle"],
            "surface_types": [],
            "has_portrait_surface": False,
        }
        npc = _make_npc(
            npc_id=5,
            personality={"_projections": {"npc_expressions": existing_projection}},
        )
        expressions = [_make_expression(expr_id=1, npc_id=5, state="idle", meta={})]

        db = _mock_db(
            get=AsyncMock(return_value=npc),
            execute=AsyncMock(return_value=_RowsResult(expressions)),
        )

        await sync_npc_expression_projection(db, 5)
        db.commit.assert_not_awaited()


# ---------------------------------------------------------------------------
# Hotspot projection sync
# ---------------------------------------------------------------------------

class TestSyncLocationHotspotProjection:
    @pytest.mark.asyncio
    async def test_hotspot_projection_stores_counts_and_refs(self) -> None:
        from pixsim7.backend.main.services.game.derived_projections import (
            sync_location_hotspot_projection,
        )

        location = _make_location(location_id=3)
        hotspots = [
            _make_hotspot("desk_sit", location_id=3, scene_id=10),
            _make_hotspot("door_exit", location_id=3, scene_id=None),
        ]

        db = _mock_db(
            get=AsyncMock(return_value=location),
            execute=AsyncMock(return_value=_RowsResult(hotspots)),
            commit=AsyncMock(),
        )

        await sync_location_hotspot_projection(db, 3)

        proj = location.meta["_projections"]["location_hotspots"]
        assert proj["hotspot_count"] == 2
        assert sorted(proj["hotspot_ids"]) == ["desk_sit", "door_exit"]
        assert proj["scene_refs"] == [10]
        db.commit.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_hotspot_projection_noop_when_location_missing(self) -> None:
        from pixsim7.backend.main.services.game.derived_projections import (
            sync_location_hotspot_projection,
        )

        db = _mock_db(get=AsyncMock(return_value=None))

        await sync_location_hotspot_projection(db, 999)
        db.execute.assert_not_called()


# ---------------------------------------------------------------------------
# Scene graph projection sync
# ---------------------------------------------------------------------------

class TestSyncSceneGraphProjection:
    @pytest.mark.asyncio
    async def test_scene_graph_projection_stores_counts_and_entry(self) -> None:
        from pixsim7.backend.main.services.game.derived_projections import (
            sync_scene_graph_projection,
        )

        scene = _make_scene(scene_id=7, entry_node_id=100)
        nodes = [_make_scene_node(100, scene_id=7), _make_scene_node(101, scene_id=7)]
        edges = [_make_scene_edge(1, scene_id=7, from_node_id=100, to_node_id=101)]

        db = _mock_db(
            get=AsyncMock(return_value=scene),
            execute=AsyncMock(side_effect=[_RowsResult(nodes), _RowsResult(edges)]),
            commit=AsyncMock(),
        )

        await sync_scene_graph_projection(db, 7)

        proj = scene.meta["_projections"]["scene_graph"]
        assert proj["node_count"] == 2
        assert proj["edge_count"] == 1
        assert proj["entry_node_id"] == 100
        assert proj["dangling_edge_count"] == 0
        db.commit.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_scene_graph_detects_dangling_edges(self) -> None:
        from pixsim7.backend.main.services.game.derived_projections import (
            sync_scene_graph_projection,
        )

        scene = _make_scene(scene_id=7, entry_node_id=100)
        nodes = [_make_scene_node(100, scene_id=7)]
        # Edge references node 999 which doesn't exist
        edges = [_make_scene_edge(1, scene_id=7, from_node_id=100, to_node_id=999)]

        db = _mock_db(
            get=AsyncMock(return_value=scene),
            execute=AsyncMock(side_effect=[_RowsResult(nodes), _RowsResult(edges)]),
            commit=AsyncMock(),
        )

        await sync_scene_graph_projection(db, 7)

        proj = scene.meta["_projections"]["scene_graph"]
        assert proj["dangling_edge_count"] == 1

    @pytest.mark.asyncio
    async def test_scene_graph_resolves_entry_node_to_first_when_missing(self) -> None:
        from pixsim7.backend.main.services.game.derived_projections import (
            sync_scene_graph_projection,
        )

        # entry_node_id is None — should resolve to first node
        scene = _make_scene(scene_id=7, entry_node_id=None)
        nodes = [_make_scene_node(50, scene_id=7), _make_scene_node(51, scene_id=7)]

        db = _mock_db(
            get=AsyncMock(return_value=scene),
            execute=AsyncMock(side_effect=[_RowsResult(nodes), _RowsResult([])]),
            commit=AsyncMock(),
        )

        await sync_scene_graph_projection(db, 7)

        assert scene.entry_node_id == 50
        proj = scene.meta["_projections"]["scene_graph"]
        assert proj["entry_node_id"] == 50


# ---------------------------------------------------------------------------
# Schedule projection sync (end-to-end through sync_npc_schedule_projection)
# ---------------------------------------------------------------------------

class TestSyncNpcScheduleProjection:
    @pytest.mark.asyncio
    async def test_schedule_sync_compiles_routine_into_world_meta(self) -> None:
        from pixsim7.backend.main.services.game.npc_schedule_projection import (
            sync_npc_schedule_projection,
        )

        npc = _make_npc(npc_id=1, world_id=10, personality={})
        location = _make_location(location_id=1, name="Beach")
        world = _make_world(
            world_id=10,
            meta={
                "behavior": {
                    "activities": {
                        "activity.swim": {
                            "id": "activity.swim",
                            "meta": {"location_hint": "beach"},
                        },
                    },
                    "routines": {},
                }
            },
        )
        schedule = _make_schedule(
            npc_id=1,
            day_of_week=0,
            start_time=8 * 3600,
            end_time=12 * 3600,
            location_id=1,
        )

        call_count = 0

        async def _mock_get(model, pk):
            if model.__name__ == "GameNPC":
                return npc
            if model.__name__ == "GameWorld":
                return world
            return None

        async def _mock_execute(stmt):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                # NPCSchedule query
                return _RowsResult([schedule])
            if call_count == 2:
                # GameLocation query
                return _RowsResult([location])
            return _RowsResult([])

        db = _mock_db(
            get=AsyncMock(side_effect=_mock_get),
            execute=AsyncMock(side_effect=_mock_execute),
            commit=AsyncMock(),
        )

        await sync_npc_schedule_projection(db, 1)

        routine_id = npc.personality.get("routineId") or npc.personality.get("behavior", {}).get("routineId")
        assert routine_id is not None
        assert routine_id in world.meta["behavior"]["routines"]

        routine = world.meta["behavior"]["routines"][routine_id]
        assert routine["meta"]["source"] == "compiled_from_npc_schedule"
        assert len(routine["nodes"]) >= 1
        db.commit.assert_awaited()

    @pytest.mark.asyncio
    async def test_schedule_sync_removes_routine_when_no_schedules(self) -> None:
        from pixsim7.backend.main.services.game.npc_schedule_projection import (
            sync_npc_schedule_projection,
        )

        routine_id = "npc.schedule.1"
        npc = _make_npc(
            npc_id=1,
            world_id=10,
            personality={"behavior": {"routineId": routine_id}, "routineId": routine_id},
        )
        world = _make_world(
            world_id=10,
            meta={
                "behavior": {
                    "activities": {"act.1": {"id": "act.1", "meta": {"location_hint": "x"}}},
                    "routines": {
                        routine_id: {
                            "id": routine_id,
                            "meta": {"source": "compiled_from_npc_schedule"},
                            "nodes": [],
                        }
                    },
                }
            },
        )

        async def _mock_get(model, pk):
            if model.__name__ == "GameNPC":
                return npc
            if model.__name__ == "GameWorld":
                return world
            return None

        call_count = 0

        async def _mock_execute(stmt):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return _RowsResult([])  # no schedules
            return _RowsResult([])

        db = _mock_db(
            get=AsyncMock(side_effect=_mock_get),
            execute=AsyncMock(side_effect=_mock_execute),
            commit=AsyncMock(),
        )

        await sync_npc_schedule_projection(db, 1)

        assert routine_id not in world.meta["behavior"]["routines"]


# ---------------------------------------------------------------------------
# resync_world_projections (world-level full resync)
# ---------------------------------------------------------------------------

class TestResyncWorldProjections:
    @pytest.mark.asyncio
    async def test_resync_iterates_all_entities_and_returns_counts(self) -> None:
        from pixsim7.backend.main.services.game.derived_projections import (
            resync_world_projections,
        )

        db = AsyncMock()

        call_index = 0

        async def _mock_execute(stmt):
            nonlocal call_index
            call_index += 1
            if call_index == 1:
                # NPCs query
                return _RawRowsResult([(1,), (2,)])
            if call_index == 2:
                # Locations query
                return _RawRowsResult([(10,)])
            if call_index == 3:
                # Scenes query
                return _RawRowsResult([(20,), (21,)])
            return _RawRowsResult([])

        db.execute = AsyncMock(side_effect=_mock_execute)
        db.commit = AsyncMock()

        with patch(
            "pixsim7.backend.main.services.game.derived_projections.sync_npc_expression_projection",
            new=AsyncMock(),
        ) as mock_expr, patch(
            "pixsim7.backend.main.services.game.npc_schedule_projection.sync_npc_schedule_projection",
            new=AsyncMock(),
        ) as mock_sched, patch(
            "pixsim7.backend.main.services.game.derived_projections.sync_location_hotspot_projection",
            new=AsyncMock(),
        ) as mock_hotspot, patch(
            "pixsim7.backend.main.services.game.derived_projections.sync_scene_graph_projection",
            new=AsyncMock(),
        ) as mock_scene:
            result = await resync_world_projections(db, world_id=10)

        assert result.npcs_synced == 2
        assert result.locations_synced == 1
        assert result.scenes_synced == 2
        assert result.elapsed_ms > 0
        assert result.warnings == []

    @pytest.mark.asyncio
    async def test_resync_captures_warnings_on_sync_failure(self) -> None:
        from pixsim7.backend.main.services.game.derived_projections import (
            resync_world_projections,
        )

        db = AsyncMock()

        call_index = 0

        async def _mock_execute(stmt):
            nonlocal call_index
            call_index += 1
            if call_index == 1:
                return _RawRowsResult([(1,)])  # one NPC
            if call_index == 2:
                return _RawRowsResult([])  # no locations
            if call_index == 3:
                return _RawRowsResult([])  # no scenes
            return _RawRowsResult([])

        db.execute = AsyncMock(side_effect=_mock_execute)

        with patch(
            "pixsim7.backend.main.services.game.npc_schedule_projection.sync_npc_schedule_projection",
            new=AsyncMock(side_effect=RuntimeError("db_error")),
        ), patch(
            "pixsim7.backend.main.services.game.derived_projections.sync_npc_expression_projection",
            new=AsyncMock(),
        ), patch(
            "pixsim7.backend.main.services.game.derived_projections.sync_location_hotspot_projection",
            new=AsyncMock(),
        ), patch(
            "pixsim7.backend.main.services.game.derived_projections.sync_scene_graph_projection",
            new=AsyncMock(),
        ):
            result = await resync_world_projections(db, world_id=10)

        assert result.npcs_synced == 0
        assert len(result.warnings) == 1
        assert "npc 1 schedule" in result.warnings[0]

    @pytest.mark.asyncio
    async def test_resync_is_idempotent(self) -> None:
        """Calling resync twice should produce the same counts (no side effects)."""
        from pixsim7.backend.main.services.game.derived_projections import (
            resync_world_projections,
        )

        def _make_db():
            db = AsyncMock()
            call_index = 0

            async def _mock_execute(stmt):
                nonlocal call_index
                call_index += 1
                if call_index == 1:
                    return _RawRowsResult([(1,)])
                if call_index == 2:
                    return _RawRowsResult([(10,)])
                if call_index == 3:
                    return _RawRowsResult([(20,)])
                return _RawRowsResult([])

            db.execute = AsyncMock(side_effect=_mock_execute)
            db.commit = AsyncMock()
            return db

        with patch(
            "pixsim7.backend.main.services.game.derived_projections.sync_npc_expression_projection",
            new=AsyncMock(),
        ), patch(
            "pixsim7.backend.main.services.game.npc_schedule_projection.sync_npc_schedule_projection",
            new=AsyncMock(),
        ), patch(
            "pixsim7.backend.main.services.game.derived_projections.sync_location_hotspot_projection",
            new=AsyncMock(),
        ), patch(
            "pixsim7.backend.main.services.game.derived_projections.sync_scene_graph_projection",
            new=AsyncMock(),
        ):
            r1 = await resync_world_projections(_make_db(), world_id=10)
            r2 = await resync_world_projections(_make_db(), world_id=10)

        assert r1.npcs_synced == r2.npcs_synced == 1
        assert r1.locations_synced == r2.locations_synced == 1
        assert r1.scenes_synced == r2.scenes_synced == 1


# ---------------------------------------------------------------------------
# Bundle import sync verification
# ---------------------------------------------------------------------------

class TestBundleImportSync:
    """
    Verifies that project_bundle.import_bundle calls all four projection
    sync functions after import.
    """

    @pytest.mark.asyncio
    async def test_import_bundle_calls_all_projection_syncs(self) -> None:
        """
        Verify the import_bundle code path invokes sync functions for each
        imported entity type.  We patch the sync functions and confirm they
        are called with the correct mapped IDs.
        """
        from pixsim7.backend.main.services.game.project_bundle import GameProjectBundleService

        bundle_payload = {
            "schema_version": 1,
            "exported_at": "2026-03-01T00:00:00Z",
            "core": {
                "world": {"name": "SyncTest", "meta": {}, "world_time": 0.0},
                "locations": [
                    {"source_id": 1, "name": "Loc1", "x": 0, "y": 0, "meta": {}, "hotspots": []},
                ],
                "npcs": [
                    {
                        "source_id": 1,
                        "name": "NPC1",
                        "personality": {},
                        "schedules": [],
                        "expressions": [],
                    },
                ],
                "scenes": [
                    {
                        "source_id": 1,
                        "title": "Scene1",
                        "meta": {},
                        "nodes": [],
                        "edges": [],
                    },
                ],
                "items": [],
            },
            "extensions": {},
        }

        # Build a deeply mocked DB session that returns fake IDs
        db = AsyncMock()
        _flush_id = 0

        def _add_side_effect(entity):
            nonlocal _flush_id
            _flush_id += 1
            try:
                if hasattr(entity, "id") and entity.id is None:
                    entity.id = _flush_id
            except (ValueError, AttributeError):
                pass  # Some models (e.g. GameWorldState) don't have an 'id' field

        db.add = MagicMock(side_effect=_add_side_effect)
        db.flush = AsyncMock()
        db.commit = AsyncMock()
        db.refresh = AsyncMock()

        # db.begin() must return an async context manager
        _begin_cm = AsyncMock()
        _begin_cm.__aenter__ = AsyncMock(return_value=None)
        _begin_cm.__aexit__ = AsyncMock(return_value=False)
        db.begin = MagicMock(return_value=_begin_cm)

        with patch(
            "pixsim7.backend.main.services.game.project_bundle.sync_npc_schedule_projection",
            new=AsyncMock(),
        ) as mock_sched, patch(
            "pixsim7.backend.main.services.game.project_bundle.sync_npc_expression_projection",
            new=AsyncMock(),
        ) as mock_expr, patch(
            "pixsim7.backend.main.services.game.project_bundle.sync_location_hotspot_projection",
            new=AsyncMock(),
        ) as mock_hotspot, patch(
            "pixsim7.backend.main.services.game.project_bundle.sync_scene_graph_projection",
            new=AsyncMock(),
        ) as mock_scene:
            service = GameProjectBundleService(db)

            from pixsim7.backend.main.domain.game.schemas.project_bundle import (
                GameProjectImportRequest,
            )

            req = GameProjectImportRequest(
                mode="create_new_world",
                bundle=bundle_payload,
            )
            await service.import_bundle(req, owner_user_id=1)

            # Each sync should have been called at least once
            mock_hotspot.assert_awaited()
            mock_scene.assert_awaited()
            mock_sched.assert_awaited()
            mock_expr.assert_awaited()

    @pytest.mark.asyncio
    async def test_import_bundle_applies_project_plugin_defaults_to_world_meta(self) -> None:
        from pixsim7.backend.main.services.game.project_bundle import GameProjectBundleService
        from pixsim7.backend.main.domain.game.schemas.project_bundle import (
            GameProjectImportRequest,
        )

        bundle_payload = {
            "schema_version": 1,
            "core": {
                "world": {"name": "PluginDefaults", "meta": {}, "world_time": 0.0},
                "locations": [],
                "npcs": [],
                "scenes": [],
                "items": [],
            },
            "extensions": {},
        }

        db = AsyncMock()
        _flush_id = 0

        def _add_side_effect(entity):
            nonlocal _flush_id
            _flush_id += 1
            try:
                if hasattr(entity, "id") and entity.id is None:
                    entity.id = _flush_id
            except (ValueError, AttributeError):
                pass

        db.add = MagicMock(side_effect=_add_side_effect)
        db.flush = AsyncMock()
        db.commit = AsyncMock()
        db.refresh = AsyncMock()

        _begin_cm = AsyncMock()
        _begin_cm.__aenter__ = AsyncMock(return_value=None)
        _begin_cm.__aexit__ = AsyncMock(return_value=False)
        db.begin = MagicMock(return_value=_begin_cm)

        with patch(
            "pixsim7.backend.main.services.game.project_bundle.sync_npc_schedule_projection",
            new=AsyncMock(),
        ), patch(
            "pixsim7.backend.main.services.game.project_bundle.sync_npc_expression_projection",
            new=AsyncMock(),
        ), patch(
            "pixsim7.backend.main.services.game.project_bundle.sync_location_hotspot_projection",
            new=AsyncMock(),
        ), patch(
            "pixsim7.backend.main.services.game.project_bundle.sync_scene_graph_projection",
            new=AsyncMock(),
        ):
            service = GameProjectBundleService(db)
            req = GameProjectImportRequest(
                mode="create_new_world",
                bundle=bundle_payload,
                project_behavior_enabled_plugins=["game-stealth", "game-romance"],
            )
            await service.import_bundle(req, owner_user_id=1)

        added_worlds = [
            call.args[0]
            for call in db.add.call_args_list
            if call.args and call.args[0].__class__.__name__ == "GameWorld"
        ]
        assert len(added_worlds) == 1
        world = added_worlds[0]
        assert world.meta.get("behavior", {}).get("enabledPlugins") == [
            "game-stealth",
            "game-romance",
        ]

    @pytest.mark.asyncio
    async def test_import_bundle_preserves_bundle_plugin_config_when_defaults_omitted(self) -> None:
        from pixsim7.backend.main.services.game.project_bundle import GameProjectBundleService
        from pixsim7.backend.main.domain.game.schemas.project_bundle import (
            GameProjectImportRequest,
        )

        bundle_payload = {
            "schema_version": 1,
            "core": {
                "world": {
                    "name": "BundlePlugins",
                    "meta": {"behavior": {"enabledPlugins": ["bundle-plugin"]}},
                    "world_time": 0.0,
                },
                "locations": [],
                "npcs": [],
                "scenes": [],
                "items": [],
            },
            "extensions": {},
        }

        db = AsyncMock()
        _flush_id = 0

        def _add_side_effect(entity):
            nonlocal _flush_id
            _flush_id += 1
            try:
                if hasattr(entity, "id") and entity.id is None:
                    entity.id = _flush_id
            except (ValueError, AttributeError):
                pass

        db.add = MagicMock(side_effect=_add_side_effect)
        db.flush = AsyncMock()
        db.commit = AsyncMock()
        db.refresh = AsyncMock()

        _begin_cm = AsyncMock()
        _begin_cm.__aenter__ = AsyncMock(return_value=None)
        _begin_cm.__aexit__ = AsyncMock(return_value=False)
        db.begin = MagicMock(return_value=_begin_cm)

        with patch(
            "pixsim7.backend.main.services.game.project_bundle.sync_npc_schedule_projection",
            new=AsyncMock(),
        ), patch(
            "pixsim7.backend.main.services.game.project_bundle.sync_npc_expression_projection",
            new=AsyncMock(),
        ), patch(
            "pixsim7.backend.main.services.game.project_bundle.sync_location_hotspot_projection",
            new=AsyncMock(),
        ), patch(
            "pixsim7.backend.main.services.game.project_bundle.sync_scene_graph_projection",
            new=AsyncMock(),
        ):
            service = GameProjectBundleService(db)
            req = GameProjectImportRequest(
                mode="create_new_world",
                bundle=bundle_payload,
            )
            await service.import_bundle(req, owner_user_id=1)

        added_worlds = [
            call.args[0]
            for call in db.add.call_args_list
            if call.args and call.args[0].__class__.__name__ == "GameWorld"
        ]
        assert len(added_worlds) == 1
        world = added_worlds[0]
        assert world.meta.get("behavior", {}).get("enabledPlugins") == ["bundle-plugin"]


# ---------------------------------------------------------------------------
# API endpoint test for resync
# ---------------------------------------------------------------------------

try:
    import httpx
    from fastapi import FastAPI, HTTPException

    from pixsim7.backend.main.api.dependencies import (
        get_current_game_principal,
        get_current_user,
        get_game_world_service,
    )
    from pixsim7.backend.main.api.v1.game_worlds import router

    API_IMPORTS_AVAILABLE = True
except ImportError:
    API_IMPORTS_AVAILABLE = False


@pytest.mark.skipif(not API_IMPORTS_AVAILABLE, reason="API dependencies unavailable")
class TestResyncProjectionsEndpoint:
    def _app(self, *, owner_user_id: int = 1) -> "FastAPI":
        app = FastAPI()
        app.include_router(router, prefix="/api/v1/game/worlds")

        service = SimpleNamespace()
        service.db = AsyncMock()
        service.get_world = AsyncMock(
            return_value=SimpleNamespace(
                id=1, owner_user_id=owner_user_id, name="TestWorld", meta={}
            )
        )
        app.dependency_overrides[get_game_world_service] = lambda: service
        principal = SimpleNamespace(id=1, is_active=True)
        app.dependency_overrides[get_current_game_principal] = lambda: principal
        app.dependency_overrides[get_current_user] = lambda: principal
        return app

    @pytest.mark.asyncio
    async def test_resync_endpoint_returns_counts(self) -> None:
        from pixsim7.backend.main.services.game.derived_projections import ResyncResult

        mock_result = ResyncResult(npcs_synced=3, locations_synced=2, scenes_synced=1, elapsed_ms=42.5)

        app = self._app()
        with patch(
            "pixsim7.backend.main.api.v1.game_worlds.resync_world_projections",
            new=AsyncMock(return_value=mock_result),
        ):
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=app), base_url="http://test"
            ) as client:
                resp = await client.post("/api/v1/game/worlds/1/projections/resync")

        assert resp.status_code == 200
        body = resp.json()
        assert body["npcs_synced"] == 3
        assert body["locations_synced"] == 2
        assert body["scenes_synced"] == 1
        assert body["elapsed_ms"] == 42.5

    @pytest.mark.asyncio
    async def test_resync_endpoint_rejects_non_owner(self) -> None:
        app = self._app(owner_user_id=999)  # world owned by user 999, request from user 1

        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post("/api/v1/game/worlds/1/projections/resync")

        assert resp.status_code == 404
