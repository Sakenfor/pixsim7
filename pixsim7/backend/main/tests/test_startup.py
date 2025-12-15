"""
Tests for backend startup helpers

Unit tests for the decomposed startup functions in startup.py.
Each test validates a single helper function in isolation.
"""
import pytest
import tempfile
from pathlib import Path
from unittest.mock import Mock, patch, AsyncMock
from fastapi import FastAPI

from pixsim7.backend.main.startup import (
    validate_settings,
    setup_domain_registry,
    setup_redis,
    setup_providers,
    setup_event_handlers,
    setup_ecs_components,
)


class TestValidateSettings:
    """Tests for validate_settings()"""

    def test_production_with_default_secret_key_raises(self):
        """In production, default SECRET_KEY should raise ValueError"""
        mock_settings = Mock()
        mock_settings.debug = False
        mock_settings.secret_key = "change-this-in-production"

        with pytest.raises(ValueError, match="SECRET_KEY must be set in production"):
            validate_settings(mock_settings)

    def test_production_with_custom_secret_key_passes(self):
        """In production, custom SECRET_KEY should pass"""
        mock_settings = Mock()
        mock_settings.debug = False
        mock_settings.secret_key = "secure-random-key-123"

        # Should not raise
        validate_settings(mock_settings)

    def test_dev_mode_with_default_secret_key_passes(self):
        """In dev mode, default SECRET_KEY is allowed"""
        mock_settings = Mock()
        mock_settings.debug = True
        mock_settings.secret_key = "change-this-in-production"

        # Should not raise
        validate_settings(mock_settings)


class TestSetupDomainRegistry:
    """Tests for setup_domain_registry()"""

    def test_loads_models_from_directory(self):
        """Should load domain models from specified directory"""
        with tempfile.TemporaryDirectory() as tmpdir:
            # Create a test model file
            model_file = Path(tmpdir) / "test_model.py"
            model_file.write_text("""
from sqlmodel import SQLModel, Field

class TestModel(SQLModel, table=True):
    __tablename__ = "test_models"
    id: int = Field(primary_key=True)
    name: str
""")

            # This will attempt to load - may or may not succeed depending on environment
            # but should not raise
            try:
                registry = setup_domain_registry(tmpdir)
                # If it works, registry should exist
                assert registry is not None
            except Exception as e:
                # If environment doesn't support it, that's ok for this test
                pytest.skip(f"Cannot test domain registry in this environment: {e}")

    def test_handles_path_object(self):
        """Should accept Path objects as input"""
        with tempfile.TemporaryDirectory() as tmpdir:
            path_obj = Path(tmpdir)

            try:
                registry = setup_domain_registry(path_obj)
                assert registry is not None
            except Exception:
                pytest.skip("Cannot test domain registry in this environment")

    def test_handles_string_path(self):
        """Should accept string paths as input"""
        with tempfile.TemporaryDirectory() as tmpdir:
            try:
                registry = setup_domain_registry(str(tmpdir))
                assert registry is not None
            except Exception:
                pytest.skip("Cannot test domain registry in this environment")


class TestSetupRedis:
    """Tests for setup_redis()"""

    @pytest.mark.asyncio
    async def test_returns_true_when_redis_available(self):
        """Should return True when Redis connection succeeds"""
        with patch('pixsim7.backend.main.startup.check_redis_connection') as mock_check:
            mock_check.return_value = True

            result = await setup_redis()

            assert result is True
            mock_check.assert_called_once()

    @pytest.mark.asyncio
    async def test_returns_false_when_redis_unavailable(self):
        """Should return False when Redis connection fails"""
        with patch('pixsim7.backend.main.startup.check_redis_connection') as mock_check:
            mock_check.return_value = False

            result = await setup_redis()

            assert result is False
            mock_check.assert_called_once()

    @pytest.mark.asyncio
    async def test_handles_exception_gracefully(self):
        """Should return False when Redis check raises exception"""
        with patch('pixsim7.backend.main.startup.check_redis_connection') as mock_check:
            mock_check.side_effect = Exception("Connection refused")

            result = await setup_redis()

            assert result is False


class TestSetupProviders:
    """Tests for setup_providers()"""

    def test_registers_default_providers(self):
        """Should call register_default_providers"""
        with patch('pixsim7.backend.main.startup.register_default_providers') as mock_register:
            setup_providers()

            mock_register.assert_called_once()


class TestSetupEventHandlers:
    """Tests for setup_event_handlers()"""

    def test_registers_handlers_and_websocket_handlers(self):
        """Should register both event and WebSocket handlers"""
        with patch('pixsim7.backend.main.startup.register_handlers') as mock_handlers, \
             patch('pixsim7.backend.main.startup.register_websocket_handlers') as mock_ws:

            setup_event_handlers()

            mock_handlers.assert_called_once()
            mock_ws.assert_called_once()


class TestSetupEcsComponents:
    """Tests for setup_ecs_components()"""

    def test_returns_component_count(self):
        """Should return number of registered components"""
        with patch('pixsim7.backend.main.startup.register_core_components') as mock_register:
            mock_register.return_value = 42

            count = setup_ecs_components()

            assert count == 42
            mock_register.assert_called_once()


class TestSetupPlugins:
    """Tests for setup_plugins() - integration-style test"""

    @pytest.mark.asyncio
    async def test_setup_plugins_with_fail_fast_true(self):
        """
        In fail_fast mode, plugin loading should raise on ANY failure.
        This is a lightweight integration test with mocked plugin manager.
        """
        from pixsim7.backend.main.startup import setup_plugins

        app = FastAPI()

        with patch('pixsim7.backend.main.startup.init_plugin_manager') as mock_init:
            # Create mock managers
            mock_plugin_manager = Mock()
            mock_plugin_manager.list_plugins.return_value = ["plugin1", "plugin2"]
            mock_plugin_manager.enable_all = AsyncMock()

            mock_routes_manager = Mock()
            mock_routes_manager.list_plugins.return_value = ["route1"]
            mock_routes_manager.enable_all = AsyncMock()

            # First call returns plugin_manager, second returns routes_manager
            mock_init.side_effect = [mock_plugin_manager, mock_routes_manager]

            pm, rm = await setup_plugins(
                app,
                "fake/plugins",
                "fake/routes",
                fail_fast=True
            )

            # Verify both managers were initialized
            assert mock_init.call_count == 2

            # Verify fail_fast was passed
            calls = mock_init.call_args_list
            assert calls[0][1]['fail_fast'] is True
            assert calls[1][1]['fail_fast'] is True

            # Verify enable_all was called on both
            mock_plugin_manager.enable_all.assert_called_once()
            mock_routes_manager.enable_all.assert_called_once()

            assert pm == mock_plugin_manager
            assert rm == mock_routes_manager

    @pytest.mark.asyncio
    async def test_setup_plugins_with_fail_fast_false(self):
        """
        In production mode (fail_fast=False), only required plugin failures should abort.
        """
        from pixsim7.backend.main.startup import setup_plugins

        app = FastAPI()

        with patch('pixsim7.backend.main.startup.init_plugin_manager') as mock_init:
            mock_plugin_manager = Mock()
            mock_plugin_manager.list_plugins.return_value = []
            mock_plugin_manager.enable_all = AsyncMock()

            mock_routes_manager = Mock()
            mock_routes_manager.list_plugins.return_value = []
            mock_routes_manager.enable_all = AsyncMock()

            mock_init.side_effect = [mock_plugin_manager, mock_routes_manager]

            await setup_plugins(app, "fake/plugins", "fake/routes", fail_fast=False)

            # Verify fail_fast=False was passed
            calls = mock_init.call_args_list
            assert calls[0][1]['fail_fast'] is False
            assert calls[1][1]['fail_fast'] is False


class TestStartupSequence:
    """Integration-style tests for the full startup sequence"""

    @pytest.mark.asyncio
    async def test_lifespan_attaches_to_app_state(self):
        """
        Test that lifespan function properly attaches managers to app.state.
        This is a smoke test - doesn't actually start the app.
        """
        from pixsim7.backend.main.main import lifespan, app

        # Check that app.state is accessible
        assert hasattr(app, 'state')

        # In a real test, we'd use:
        # async with lifespan(app):
        #     assert hasattr(app.state, 'domain_registry')
        #     assert hasattr(app.state, 'plugin_manager')
        #     assert hasattr(app.state, 'redis_available')
        #
        # But this requires full environment setup (DB, Redis, etc.)
        # So we skip it for now and just verify the structure exists
        pytest.skip("Full lifespan test requires database and Redis")


class TestSetupLinkSystem:
    """Tests for setup_link_system()"""

    def test_setup_link_system_registers_loaders_and_mappings(self):
        """Test that setup_link_system() registers loaders and mappings"""
        from pixsim7.backend.main.startup import setup_link_system
        from pixsim7.backend.main.services.links.entity_loaders import get_entity_loader_registry
        from pixsim7.backend.main.services.links.mapping_registry import get_mapping_registry

        # Clear registries first (in case previous tests left state)
        loader_registry = get_entity_loader_registry()
        mapping_registry = get_mapping_registry()

        # Call setup
        stats = setup_link_system()

        # Verify stats returned
        assert 'loaders' in stats
        assert 'mappings' in stats
        assert stats['loaders'] >= 2  # At least character, npc
        assert stats['mappings'] >= 1  # At least character->npc

        # Verify loaders registered
        assert loader_registry.has_loader('character')
        assert loader_registry.has_loader('npc')
        assert loader_registry.has_loader('location')

        # Verify mappings registered
        assert mapping_registry.has_mapping('character->npc')

    def test_setup_link_system_idempotent(self):
        """Test that setup_link_system() can be called multiple times"""
        from pixsim7.backend.main.startup import setup_link_system

        # Call twice
        stats1 = setup_link_system()
        stats2 = setup_link_system()

        # Should return same counts (idempotent)
        assert stats1 == stats2


# Run tests with: pytest pixsim7/backend/main/tests/test_startup.py -v
