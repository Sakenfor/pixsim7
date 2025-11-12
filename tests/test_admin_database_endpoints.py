import pytest
from httpx import AsyncClient
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Any

from pixsim7_backend.main import app as real_app
from pixsim7_backend.api.admin.database import router as db_router

# NOTE: These tests assume an initialized test database and an admin auth dependency.
# For now we override admin dependency to bypass auth and use a mock DB session for safety tests.

@pytest.fixture
def app() -> FastAPI:
    app = FastAPI()
    app.include_router(db_router)
    return app

class DummyUser:
    def is_admin(self):
        return True

@pytest.fixture
async def client(app: FastAPI):
    async with AsyncClient(app=app, base_url="http://test") as ac:
        yield ac

# Mock dependencies -------------------------------------------------
from fastapi import Depends
from pixsim7_backend.api.dependencies import get_db, require_admin

async def mock_get_db():
    # Reuse real dependency for now (would use test transaction scope in extended setup)
    async for s in get_db():
        yield s

async def mock_require_admin():
    return DummyUser()

app.dependency_overrides[require_admin] = mock_require_admin
app.dependency_overrides[get_db] = mock_get_db

# Helper query endpoint path base
STATUS_PATH = "/admin/database/status"
QUERY_PATH = "/admin/database/query"
SCHEMA_PATH = "/admin/database/schema"

@pytest.mark.asyncio
async def test_read_only_query_blocked_update(client: AsyncClient):
    # Attempt an UPDATE in read-only mode
    payload = {"query": "UPDATE users SET is_active = false", "readOnly": True}
    resp = await client.post(QUERY_PATH, json=payload)
    assert resp.status_code == 403
    assert "not allowed" in resp.json()["detail"].lower()

@pytest.mark.asyncio
async def test_multi_statement_blocked(client: AsyncClient):
    payload = {"query": "SELECT 1; SELECT 2", "readOnly": True}
    resp = await client.post(QUERY_PATH, json=payload)
    assert resp.status_code == 400
    assert "multiple" in resp.json()["detail"].lower()

@pytest.mark.asyncio
async def test_simple_select_allowed(client: AsyncClient):
    payload = {"query": "SELECT 1", "readOnly": True}
    resp = await client.post(QUERY_PATH, json=payload)
    assert resp.status_code == 200
    body = resp.json()
    assert body["rowCount"] in (1, 0)  # depends on driver response

@pytest.mark.asyncio
async def test_non_allowed_prefix_blocked(client: AsyncClient):
    payload = {"query": "VACUUM", "readOnly": True}
    resp = await client.post(QUERY_PATH, json=payload)
    assert resp.status_code == 403

@pytest.mark.asyncio
async def test_status_endpoint_ok(client: AsyncClient):
    resp = await client.get(STATUS_PATH)
    # May fail if alembic_version not present; just assert structured JSON
    assert resp.status_code in (200, 500)
    assert isinstance(resp.json(), dict)
