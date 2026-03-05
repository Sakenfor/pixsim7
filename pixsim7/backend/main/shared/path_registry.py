"""
Centralized filesystem path registry for backend runtime and package roots.

This module is the single source of truth for:
- App-managed mutable data roots (media, logs, exports, cache, settings, models)
- Backend package roots (plugins, routes, content packs)
"""
from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from pixsim7.backend.main.shared.config import _resolve_repo_root, settings


def _resolve_configured_path(value: str | Path, *, repo_root: Path) -> Path:
    candidate = Path(value).expanduser()
    if candidate.is_absolute():
        return candidate.resolve()
    return (repo_root / candidate).resolve()


def _default_pixsim_home() -> Path:
    configured = settings.pixsim_home
    if configured:
        repo_root = _resolve_repo_root()
        return _resolve_configured_path(configured, repo_root=repo_root)

    if sys.platform == "win32":
        base = os.getenv("LOCALAPPDATA") or os.getenv("APPDATA") or str(Path.home())
        return (Path(base) / "PixSim7").resolve()

    if sys.platform == "darwin":
        return (Path.home() / "Library" / "Application Support" / "PixSim7").resolve()

    xdg_data_home = os.getenv("XDG_DATA_HOME")
    if xdg_data_home:
        return (Path(xdg_data_home).expanduser() / "pixsim7").resolve()
    return (Path.home() / ".local" / "share" / "pixsim7").resolve()


@dataclass(frozen=True)
class PathRegistry:
    repo_root: Path
    backend_root: Path
    pixsim_home: Path

    media_root: Path
    logs_root: Path
    exports_root: Path
    cache_root: Path
    temp_root: Path
    settings_root: Path
    models_root: Path
    automation_root: Path
    automation_screenshots_root: Path

    provider_settings_file: Path
    media_settings_file: Path

    feature_plugins_dir: Path
    external_plugins_dir: Path
    route_plugins_dir: Path
    middleware_dir: Path
    content_packs_root: Path
    prompt_content_packs_dir: Path

    def ensure_runtime_dirs(self) -> None:
        for directory in (
            self.pixsim_home,
            self.media_root,
            self.logs_root,
            self.exports_root,
            self.cache_root,
            self.temp_root,
            self.settings_root,
            self.models_root,
            self.automation_root,
            self.automation_screenshots_root,
        ):
            directory.mkdir(parents=True, exist_ok=True)


@lru_cache(maxsize=1)
def get_path_registry() -> PathRegistry:
    repo_root = _resolve_repo_root()
    backend_root = (repo_root / "pixsim7" / "backend" / "main").resolve()
    pixsim_home = _default_pixsim_home()

    media_root = (pixsim_home / "media").resolve()
    logs_root = (pixsim_home / "logs").resolve()
    exports_root = (pixsim_home / "exports").resolve()
    cache_root = (pixsim_home / "cache").resolve()
    temp_root = (pixsim_home / "temp").resolve()
    settings_root = (pixsim_home / "settings").resolve()
    models_root = (pixsim_home / "models").resolve()
    automation_root = (pixsim_home / "automation").resolve()
    automation_screenshots_root = (automation_root / "screenshots").resolve()

    feature_plugins_dir = _resolve_configured_path(settings.feature_plugins_dir, repo_root=repo_root)
    external_plugins_dir = _resolve_configured_path(settings.external_plugins_dir, repo_root=repo_root)
    route_plugins_dir = _resolve_configured_path(settings.route_plugins_dir, repo_root=repo_root)
    middleware_dir = _resolve_configured_path(settings.middleware_dir, repo_root=repo_root)

    content_packs_root = (backend_root / "content_packs").resolve()
    prompt_content_packs_dir = (content_packs_root / "prompt").resolve()

    registry = PathRegistry(
        repo_root=repo_root,
        backend_root=backend_root,
        pixsim_home=pixsim_home,
        media_root=media_root,
        logs_root=logs_root,
        exports_root=exports_root,
        cache_root=cache_root,
        temp_root=temp_root,
        settings_root=settings_root,
        models_root=models_root,
        automation_root=automation_root,
        automation_screenshots_root=automation_screenshots_root,
        provider_settings_file=(settings_root / "provider_settings.json").resolve(),
        media_settings_file=(settings_root / "media_settings.json").resolve(),
        feature_plugins_dir=feature_plugins_dir,
        external_plugins_dir=external_plugins_dir,
        route_plugins_dir=route_plugins_dir,
        middleware_dir=middleware_dir,
        content_packs_root=content_packs_root,
        prompt_content_packs_dir=prompt_content_packs_dir,
    )
    registry.ensure_runtime_dirs()
    return registry


def reset_path_registry_cache() -> None:
    """Clear cached registry, primarily for tests that patch environment."""
    get_path_registry.cache_clear()
