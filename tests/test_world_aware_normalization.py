"""
Integration tests for world-aware session normalization

Tests that GameSession normalization uses per-world relationship schemas
and that normalized values match preview API behavior.
"""

import pytest
from httpx import AsyncClient
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.api.v1.game_sessions import router as sessions_router
from pixsim7.backend.main.api.v1.game_worlds import router as worlds_router
from pixsim7.backend.main.api.v1.game_scenes import router as scenes_router
from pixsim7.backend.main.api.v1.game_relationship_preview import router as preview_router
from pixsim7.backend.main.domain.game.models import GameWorld, GameScene, GameSceneNode
from pixsim7.backend.main.infrastructure.database.session import get_db


@pytest.fixture
def app() -> FastAPI:
    """Create test app with all relevant routers."""
    app = FastAPI()
    app.include_router(sessions_router, prefix="/api/v1/game/sessions")
    app.include_router(worlds_router, prefix="/api/v1/game/worlds")
    app.include_router(scenes_router, prefix="/api/v1/game/scenes")
    app.include_router(preview_router, prefix="/api/v1/game/relationships")
    return app


@pytest.fixture
async def client(app: FastAPI):
    """Create test client."""
    async with AsyncClient(app=app, base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def test_world_with_schemas():
    """Create a test world with custom relationship schemas."""
    async for db in get_db():
        world = GameWorld(
            owner_user_id=1,
            name="Test World with Custom Schemas",
            meta={
                "relationship_schemas": {
                    "default": [
                        {"id": "stranger", "min": 0, "max": 29},
                        {"id": "acquaintance", "min": 30, "max": 59},
                        {"id": "friend", "min": 60, "max": 79},
                        {"id": "best_friend", "min": 80},
                    ]
                },
                "intimacy_schema": {
                    "levels": [
                        {
                            "id": "platonic",
                            "minAffinity": 0,
                            "minTrust": 0,
                            "minChemistry": 0,
                            "maxTension": 100,
                        },
                        {
                            "id": "flirty",
                            "minAffinity": 40,
                            "minTrust": 30,
                            "minChemistry": 40,
                            "maxTension": 50,
                        },
                        {
                            "id": "romantic",
                            "minAffinity": 70,
                            "minTrust": 60,
                            "minChemistry": 70,
                            "maxTension": 20,
                        },
                    ]
                },
            },
        )

        db.add(world)
        await db.commit()
        await db.refresh(world)

        yield world

        # Cleanup
        await db.delete(world)
        await db.commit()
        break


@pytest.fixture
async def test_scene():
    """Create a test scene with entry node."""
    async for db in get_db():
        # Create scene first
        scene = GameScene(
            title="Test Scene",
            description="Test scene for normalization",
        )
        db.add(scene)
        await db.commit()
        await db.refresh(scene)

        # Create entry node
        node = GameSceneNode(
            scene_id=scene.id,
            asset_id=1,  # Dummy asset ID
            label="Entry",
        )
        db.add(node)
        await db.commit()
        await db.refresh(node)

        # Update scene with entry node
        scene.entry_node_id = node.id
        db.add(scene)
        await db.commit()
        await db.refresh(scene)

        yield scene

        # Cleanup
        await db.delete(node)
        await db.delete(scene)
        await db.commit()
        break


# ===== World-Aware Normalization Tests =====


@pytest.mark.asyncio
async def test_session_normalization_uses_world_schemas(
    client: AsyncClient, test_world_with_schemas: GameWorld, test_scene: GameScene
):
    """Test that session normalization uses world-specific schemas."""
    # Create session linked to world with custom schemas
    create_response = await client.post(
        "/api/v1/game/sessions/",
        json={
            "scene_id": test_scene.id,
            "world_id": test_world_with_schemas.id,
            "flags": {},
        },
    )

    assert create_response.status_code == 200
    session_data = create_response.json()
    session_id = session_data["id"]

    # Update session with relationship values
    update_response = await client.patch(
        f"/api/v1/game/sessions/{session_id}",
        json={
            "relationships": {
                "npc:1": {
                    "affinity": 65.0,
                    "trust": 50.0,
                    "chemistry": 55.0,
                    "tension": 10.0,
                }
            }
        },
    )

    assert update_response.status_code == 200
    updated_session = update_response.json()

    # Check that normalized values use custom schema
    npc_rel = updated_session["relationships"]["npc:1"]

    # With custom schema, affinity 65 should be "friend" (60-79 range)
    assert npc_rel["tierId"] == "friend"

    # Verify intimacy level uses custom schema
    # affinity=65, trust=50, chemistry=55, tension=10 should be "flirty"
    # (meets: minAffinity=40, minTrust=30, minChemistry=40, maxTension=50)
    assert npc_rel["intimacyLevelId"] == "flirty"


@pytest.mark.asyncio
async def test_session_normalization_matches_preview_api(
    client: AsyncClient, test_world_with_schemas: GameWorld, test_scene: GameScene
):
    """Test that session normalization matches preview API results."""
    # Test values
    affinity = 85.0
    trust = 70.0
    chemistry = 80.0
    tension = 15.0

    # Get preview values
    tier_preview = await client.post(
        "/api/v1/game/relationships/preview-tier",
        json={
            "world_id": test_world_with_schemas.id,
            "affinity": affinity,
        },
    )
    assert tier_preview.status_code == 200
    expected_tier = tier_preview.json()["tier_id"]

    intimacy_preview = await client.post(
        "/api/v1/game/relationships/preview-intimacy",
        json={
            "world_id": test_world_with_schemas.id,
            "relationship_values": {
                "affinity": affinity,
                "trust": trust,
                "chemistry": chemistry,
                "tension": tension,
            },
        },
    )
    assert intimacy_preview.status_code == 200
    expected_intimacy = intimacy_preview.json()["intimacy_level_id"]

    # Create session and set same relationship values
    create_response = await client.post(
        "/api/v1/game/sessions/",
        json={
            "scene_id": test_scene.id,
            "world_id": test_world_with_schemas.id,
        },
    )
    assert create_response.status_code == 200
    session_id = create_response.json()["id"]

    update_response = await client.patch(
        f"/api/v1/game/sessions/{session_id}",
        json={
            "relationships": {
                "npc:1": {
                    "affinity": affinity,
                    "trust": trust,
                    "chemistry": chemistry,
                    "tension": tension,
                }
            }
        },
    )

    assert update_response.status_code == 200
    session_data = update_response.json()
    npc_rel = session_data["relationships"]["npc:1"]

    # Normalized values should match preview API
    assert npc_rel["tierId"] == expected_tier
    assert npc_rel["intimacyLevelId"] == expected_intimacy


@pytest.mark.asyncio
async def test_session_without_world_uses_defaults(
    client: AsyncClient, test_scene: GameScene
):
    """Test that sessions without world_id use default schemas."""
    # Create session WITHOUT world_id
    create_response = await client.post(
        "/api/v1/game/sessions/",
        json={
            "scene_id": test_scene.id,
            # No world_id provided
        },
    )

    assert create_response.status_code == 200
    session_id = create_response.json()["id"]

    # Update with relationship values
    update_response = await client.patch(
        f"/api/v1/game/sessions/{session_id}",
        json={
            "relationships": {
                "npc:1": {
                    "affinity": 45.0,
                    "trust": 30.0,
                    "chemistry": 35.0,
                    "tension": 20.0,
                }
            }
        },
    )

    assert update_response.status_code == 200
    session_data = update_response.json()

    # Should still compute normalized values using hardcoded defaults
    npc_rel = session_data["relationships"]["npc:1"]
    assert "tierId" in npc_rel
    assert "intimacyLevelId" in npc_rel


@pytest.mark.asyncio
async def test_cache_invalidation_on_schema_change(
    client: AsyncClient, test_world_with_schemas: GameWorld, test_scene: GameScene
):
    """Test that cached relationships are invalidated when world schemas change."""
    # Create session with initial relationship
    create_response = await client.post(
        "/api/v1/game/sessions/",
        json={
            "scene_id": test_scene.id,
            "world_id": test_world_with_schemas.id,
        },
    )
    session_id = create_response.json()["id"]

    # Set relationship value
    update_response = await client.patch(
        f"/api/v1/game/sessions/{session_id}",
        json={
            "relationships": {
                "npc:1": {
                    "affinity": 65.0,
                    "trust": 50.0,
                    "chemistry": 55.0,
                    "tension": 10.0,
                }
            }
        },
    )
    assert update_response.status_code == 200
    initial_tier = update_response.json()["relationships"]["npc:1"]["tierId"]
    assert initial_tier == "friend"  # Based on initial schema

    # Update world schemas
    new_meta = {
        **test_world_with_schemas.meta,
        "relationship_schemas": {
            "default": [
                {"id": "stranger", "min": 0, "max": 49},
                {"id": "companion", "min": 50, "max": 79},  # Changed tier name and range
                {"id": "soulmate", "min": 80},
            ]
        },
    }

    schema_update_response = await client.put(
        f"/api/v1/game/worlds/{test_world_with_schemas.id}/meta",
        json={"meta": new_meta},
    )
    assert schema_update_response.status_code == 200

    # Update session again (this should trigger re-normalization with new schema)
    reupdate_response = await client.patch(
        f"/api/v1/game/sessions/{session_id}",
        json={
            "relationships": {
                "npc:1": {
                    "affinity": 65.0,  # Same value
                    "trust": 50.0,
                    "chemistry": 55.0,
                    "tension": 10.0,
                }
            }
        },
    )

    assert reupdate_response.status_code == 200
    new_tier = reupdate_response.json()["relationships"]["npc:1"]["tierId"]

    # Tier should now be "companion" based on new schema (50-79 range)
    assert new_tier == "companion"
    assert new_tier != initial_tier  # Should have changed


@pytest.mark.asyncio
async def test_multiple_sessions_same_world(
    client: AsyncClient, test_world_with_schemas: GameWorld, test_scene: GameScene
):
    """Test that multiple sessions linked to same world use same schemas."""
    # Create two sessions for the same world
    session1_response = await client.post(
        "/api/v1/game/sessions/",
        json={
            "scene_id": test_scene.id,
            "world_id": test_world_with_schemas.id,
        },
    )
    session1_id = session1_response.json()["id"]

    session2_response = await client.post(
        "/api/v1/game/sessions/",
        json={
            "scene_id": test_scene.id,
            "world_id": test_world_with_schemas.id,
        },
    )
    session2_id = session2_response.json()["id"]

    # Set same relationship values in both sessions
    relationship_data = {
        "relationships": {
            "npc:1": {
                "affinity": 75.0,
                "trust": 65.0,
                "chemistry": 75.0,
                "tension": 15.0,
            }
        }
    }

    update1 = await client.patch(
        f"/api/v1/game/sessions/{session1_id}", json=relationship_data
    )
    update2 = await client.patch(
        f"/api/v1/game/sessions/{session2_id}", json=relationship_data
    )

    assert update1.status_code == 200
    assert update2.status_code == 200

    tier1 = update1.json()["relationships"]["npc:1"]["tierId"]
    tier2 = update2.json()["relationships"]["npc:1"]["tierId"]

    # Both should compute same tier using world schemas
    assert tier1 == tier2
    assert tier1 == "friend"  # 75 is in range 60-79
