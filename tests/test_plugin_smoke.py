"""
Plugin Smoke Tests

Minimal tests to verify that critical plugins load correctly and their
endpoints are accessible (no 404, no import errors).

Part of Phase 31.1 - Backend Plugin & Route Health Checks.
"""

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="module")
def client():
    """
    Create a test client with the FastAPI app.

    This will trigger plugin loading, allowing us to verify that
    plugins load successfully.
    """
    # Import here to ensure clean environment
    from pixsim7_backend.main import app

    return TestClient(app)


class TestCriticalPluginEndpoints:
    """Test that critical plugin endpoints are accessible"""

    def test_logs_endpoint_exists(self, client):
        """
        Test that the logs plugin is loaded and POST /api/v1/logs/ingest exists.

        This endpoint should return 401 (unauthorized) or 400 (bad request),
        not 404 (not found) or 500 (import/load error).
        """
        response = client.post("/api/v1/logs/ingest", json={
            "source": "test",
            "message": "test message",
            "level": "info",
        })

        # Should NOT be 404 (would indicate plugin didn't load)
        assert response.status_code != 404, (
            "Logs endpoint returned 404 - plugin may not be loaded. "
            "Check pixsim7_backend/routes/logs/manifest.py"
        )

        # Should NOT be 500 (would indicate import/syntax error)
        assert response.status_code != 500, (
            "Logs endpoint returned 500 - plugin may have import errors. "
            "Check pixsim7_backend/api/v1/logs.py"
        )

        # Expected: 401 (no auth) or 400 (bad payload) or 422 (validation)
        assert response.status_code in [400, 401, 422], (
            f"Unexpected status code: {response.status_code}"
        )

    def test_websocket_endpoint_exists(self, client):
        """
        Test that the websocket plugin is loaded and /api/v1/ws/generations exists.

        WebSocket endpoints can't be tested with normal HTTP, so we check
        that the endpoint is registered (returns 426 Upgrade Required or similar,
        not 404).
        """
        # Try to access WebSocket endpoint with HTTP (should fail gracefully)
        response = client.get("/api/v1/ws/generations")

        # Should NOT be 404 (would indicate plugin didn't load)
        assert response.status_code != 404, (
            "WebSocket endpoint returned 404 - plugin may not be loaded. "
            "Check pixsim7_backend/routes/websocket/manifest.py"
        )

        # Should NOT be 500 (would indicate import/syntax error)
        assert response.status_code != 500, (
            "WebSocket endpoint returned 500 - plugin may have import errors. "
            "Check pixsim7_backend/api/v1/websocket.py"
        )

        # Expected: 400, 403, 426, etc. (anything but 404 or 500)
        # Different FastAPI/Starlette versions may return different codes
        assert response.status_code not in [404, 500], (
            f"Unexpected status code: {response.status_code}"
        )

    def test_auth_endpoints_exist(self, client):
        """
        Test that the auth plugin is loaded and endpoints are accessible.

        Verify /api/v1/auth/login exists.
        """
        response = client.post("/api/v1/auth/login", json={
            "email": "test@example.com",
            "password": "testpassword",
        })

        # Should NOT be 404 (would indicate plugin didn't load)
        assert response.status_code != 404, (
            "Auth login endpoint returned 404 - plugin may not be loaded. "
            "Check pixsim7_backend/routes/auth/manifest.py"
        )

        # Should NOT be 500 (would indicate import/syntax error)
        assert response.status_code != 500, (
            "Auth login endpoint returned 500 - plugin may have import errors. "
            "Check pixsim7_backend/api/v1/auth.py"
        )

        # Expected: 400, 401, 422 (invalid credentials or bad payload)
        assert response.status_code in [400, 401, 422], (
            f"Unexpected status code: {response.status_code}"
        )


class TestPluginManager:
    """Test plugin manager health checks"""

    def test_all_required_plugins_loaded(self, client):
        """
        Test that all required plugins loaded successfully.

        This test accesses the plugin manager to verify that no required
        plugins failed to load.
        """
        from pixsim7_backend.main import app

        # Get the routes manager from app state (if stored)
        # For now, we'll just verify the app started successfully
        # (which means required plugins passed the fail-fast check)

        # If we get here without an exception during app startup,
        # required plugins loaded successfully
        assert app is not None
        assert hasattr(app, "routes")
        assert len(app.routes) > 0, "No routes registered - plugin system may have failed"

    def test_no_orphan_critical_routers(self):
        """
        Test that critical routers have manifests.

        Runs the orphan router detection script and verifies that at least
        the critical routers (logs, auth, websocket) have manifests.
        """
        import subprocess
        import sys
        from pathlib import Path

        script_path = Path(__file__).parent.parent / "scripts" / "check_orphan_routers.py"

        # Run the orphan detection script
        result = subprocess.run(
            [sys.executable, str(script_path)],
            capture_output=True,
            text=True,
        )

        # Script returns 0 if all routers have manifests, 1 if orphans detected
        # For this test, we just want to ensure it runs without crashing
        assert result.returncode in [0, 1], (
            f"Orphan router detection script failed: {result.stderr}"
        )

        # Parse output to check for critical orphans
        output = result.stdout
        critical_orphans = []

        for line in output.split("\n"):
            line = line.strip()
            if line.startswith("- logs"):
                critical_orphans.append("logs")
            elif line.startswith("- auth"):
                critical_orphans.append("auth")
            elif line.startswith("- websocket"):
                critical_orphans.append("websocket")

        assert len(critical_orphans) == 0, (
            f"Critical plugins are missing manifests: {critical_orphans}"
        )
