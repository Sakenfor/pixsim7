"""
External Plugin Discovery Tests

Tests for the external plugin discovery system that allows plugins to be
self-contained in packages/plugins/*/backend/ structure.

Part of the unified plugin system - see packages/plugins/ for examples.
"""

import pytest
from pathlib import Path
from unittest.mock import MagicMock, patch
import tempfile
import os

from pixsim7.backend.main.infrastructure.plugins.manager import PluginManager


class TestExternalPluginDiscovery:
    """Test external plugin discovery in packages/plugins/*/backend/ structure"""

    @pytest.fixture
    def mock_app(self):
        """Create a mock FastAPI app"""
        app = MagicMock()
        app.include_router = MagicMock()
        return app

    @pytest.fixture
    def plugin_manager(self, mock_app):
        """Create a PluginManager instance"""
        return PluginManager(mock_app, plugin_type="feature")

    def test_discover_external_plugins_empty_dir(self, plugin_manager, tmp_path):
        """Should return empty list for empty directory"""
        result = plugin_manager.discover_external_plugins(tmp_path)
        assert result == []

    def test_discover_external_plugins_nonexistent_dir(self, plugin_manager):
        """Should return empty list for nonexistent directory"""
        result = plugin_manager.discover_external_plugins("/nonexistent/path")
        assert result == []

    def test_discover_external_plugins_finds_valid_plugin(self, plugin_manager, tmp_path):
        """Should find plugins with backend/manifest.py structure"""
        # Create a valid external plugin structure
        plugin_dir = tmp_path / "my-plugin"
        backend_dir = plugin_dir / "backend"
        backend_dir.mkdir(parents=True)

        # Create manifest.py
        manifest_file = backend_dir / "manifest.py"
        manifest_file.write_text("# Manifest file")

        result = plugin_manager.discover_external_plugins(tmp_path)

        assert len(result) == 1
        assert result[0][0] == "my-plugin"
        assert result[0][1] == backend_dir

    def test_discover_external_plugins_skips_invalid_names(self, plugin_manager, tmp_path):
        """Should skip plugins with invalid names"""
        # Create plugin with uppercase (invalid)
        invalid_plugin = tmp_path / "MyPlugin"
        invalid_backend = invalid_plugin / "backend"
        invalid_backend.mkdir(parents=True)
        (invalid_backend / "manifest.py").write_text("# Manifest")

        # Create plugin with valid name
        valid_plugin = tmp_path / "my-plugin"
        valid_backend = valid_plugin / "backend"
        valid_backend.mkdir(parents=True)
        (valid_backend / "manifest.py").write_text("# Manifest")

        result = plugin_manager.discover_external_plugins(tmp_path)

        # Only valid plugin should be found
        assert len(result) == 1
        assert result[0][0] == "my-plugin"

    def test_discover_external_plugins_skips_reserved_names(self, plugin_manager, tmp_path):
        """Should skip plugins with reserved names"""
        # Create plugin with reserved name
        reserved_plugin = tmp_path / "plugin"
        reserved_backend = reserved_plugin / "backend"
        reserved_backend.mkdir(parents=True)
        (reserved_backend / "manifest.py").write_text("# Manifest")

        # Create plugin with valid name
        valid_plugin = tmp_path / "stealth"
        valid_backend = valid_plugin / "backend"
        valid_backend.mkdir(parents=True)
        (valid_backend / "manifest.py").write_text("# Manifest")

        result = plugin_manager.discover_external_plugins(tmp_path)

        # Only valid plugin should be found
        assert len(result) == 1
        assert result[0][0] == "stealth"

    def test_discover_external_plugins_ignores_dirs_without_backend(self, plugin_manager, tmp_path):
        """Should ignore directories without backend/ subdirectory"""
        # Create directory without backend/
        no_backend = tmp_path / "not-a-plugin"
        no_backend.mkdir()
        (no_backend / "README.md").write_text("Not a plugin")

        # Create valid plugin
        valid_plugin = tmp_path / "valid-plugin"
        valid_backend = valid_plugin / "backend"
        valid_backend.mkdir(parents=True)
        (valid_backend / "manifest.py").write_text("# Manifest")

        result = plugin_manager.discover_external_plugins(tmp_path)

        assert len(result) == 1
        assert result[0][0] == "valid-plugin"

    def test_discover_external_plugins_ignores_hidden_dirs(self, plugin_manager, tmp_path):
        """Should ignore hidden directories (starting with .)"""
        # Create hidden directory
        hidden = tmp_path / ".hidden-plugin"
        hidden_backend = hidden / "backend"
        hidden_backend.mkdir(parents=True)
        (hidden_backend / "manifest.py").write_text("# Manifest")

        # Create valid plugin
        valid_plugin = tmp_path / "visible-plugin"
        valid_backend = valid_plugin / "backend"
        valid_backend.mkdir(parents=True)
        (valid_backend / "manifest.py").write_text("# Manifest")

        result = plugin_manager.discover_external_plugins(tmp_path)

        assert len(result) == 1
        assert result[0][0] == "visible-plugin"

    def test_discover_external_plugins_ignores_underscore_dirs(self, plugin_manager, tmp_path):
        """Should ignore directories starting with underscore"""
        # Create underscore-prefixed directory
        underscore = tmp_path / "_internal-plugin"
        underscore_backend = underscore / "backend"
        underscore_backend.mkdir(parents=True)
        (underscore_backend / "manifest.py").write_text("# Manifest")

        # Create valid plugin
        valid_plugin = tmp_path / "public-plugin"
        valid_backend = valid_plugin / "backend"
        valid_backend.mkdir(parents=True)
        (valid_backend / "manifest.py").write_text("# Manifest")

        result = plugin_manager.discover_external_plugins(tmp_path)

        assert len(result) == 1
        assert result[0][0] == "public-plugin"


class TestExternalPluginIntegration:
    """Integration tests for external plugin system with real plugin structure"""

    def test_stealth_plugin_discovered(self):
        """Should discover the stealth plugin in packages/plugins/stealth/"""
        from pixsim7.backend.main.infrastructure.plugins.manager import PluginManager
        from pixsim7.backend.main.shared.config import settings

        # Create a mock app
        mock_app = MagicMock()
        mock_app.include_router = MagicMock()

        manager = PluginManager(mock_app, plugin_type="feature")

        # Get the external plugins directory from settings
        external_plugins_dir = settings.external_plugins_dir

        # Discover external plugins
        discovered = manager.discover_external_plugins(external_plugins_dir)

        # Check that stealth plugin is discovered
        plugin_names = [name for name, _ in discovered]

        # Stealth should be in the list
        assert "stealth" in plugin_names, (
            f"Stealth plugin not found in external plugins. "
            f"Found: {plugin_names}. "
            f"Checked directory: {external_plugins_dir}"
        )
