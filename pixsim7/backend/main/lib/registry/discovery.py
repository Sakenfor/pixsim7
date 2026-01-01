"""
Manifest discovery utilities for registry systems.

Provides shared logic for discovering manifest files in directory structures.
Used by PluginManager, DomainModelRegistry, and similar manifest-based registries.

Supports two patterns:
1. Direct: plugins/my_plugin/manifest.py
2. Nested: packages/plugins/my_plugin/backend/manifest.py
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Iterator, Optional, Set
import structlog

logger = structlog.get_logger(__name__)

# Default validation patterns (matches PluginManager conventions)
DEFAULT_NAME_PATTERN = re.compile(r"^[a-z][a-z0-9_-]*$")
DEFAULT_RESERVED_NAMES: Set[str] = frozenset(
    {"plugin", "plugins", "core", "system", "internal", "test", "tests"}
)


@dataclass
class DiscoveredManifest:
    """Result of manifest discovery."""

    name: str
    """Package/plugin name (directory name)."""

    manifest_path: Path
    """Full path to the manifest file."""

    package_dir: Path
    """Directory containing the manifest (for imports)."""

    root_dir: Path
    """The root package directory (may differ from package_dir for nested)."""


@dataclass
class NameValidator:
    """Validates package/plugin names.

    Args:
        pattern: Regex pattern names must match. Default: lowercase alphanumeric with _/-
        reserved: Set of reserved names to reject.
        allow_uppercase: If True, pattern check is case-insensitive.
    """

    pattern: re.Pattern = field(default_factory=lambda: DEFAULT_NAME_PATTERN)
    reserved: Set[str] = field(default_factory=lambda: set(DEFAULT_RESERVED_NAMES))
    allow_uppercase: bool = False

    def is_valid(self, name: str) -> bool:
        """Check if name is valid."""
        check_name = name.lower() if self.allow_uppercase else name

        if check_name in self.reserved:
            return False

        if self.allow_uppercase:
            return bool(re.match(self.pattern.pattern, check_name, re.IGNORECASE))
        return bool(self.pattern.match(name))

    def validate(self, name: str) -> Optional[str]:
        """Validate name and return error message if invalid, None if valid."""
        check_name = name.lower() if self.allow_uppercase else name

        if check_name in self.reserved:
            return f"Reserved name: {name}"

        if self.allow_uppercase:
            if not re.match(self.pattern.pattern, check_name, re.IGNORECASE):
                return f"Invalid name format: {name}"
        elif not self.pattern.match(name):
            return f"Invalid name format (must match {self.pattern.pattern}): {name}"

        return None


def discover_manifests(
    base_dir: str | Path,
    manifest_file: str = "manifest.py",
    validator: Optional[NameValidator] = None,
    skip_hidden: bool = True,
    skip_dunder: bool = True,
) -> list[DiscoveredManifest]:
    """
    Discover manifests in direct subdirectories.

    Structure:
        base_dir/
          package_a/
            manifest.py  <- discovered
          package_b/
            manifest.py  <- discovered
          _private/      <- skipped (dunder)
          .hidden/       <- skipped (hidden)

    Args:
        base_dir: Directory to search in.
        manifest_file: Name of manifest file to look for.
        validator: Optional name validator. If None, no validation.
        skip_hidden: Skip directories starting with '.'.
        skip_dunder: Skip directories starting with '_'.

    Returns:
        List of discovered manifests, sorted by name.
    """
    base_dir = Path(base_dir)
    discovered: list[DiscoveredManifest] = []

    if not base_dir.exists():
        logger.warning("Discovery directory not found", path=str(base_dir))
        return []

    if not base_dir.is_dir():
        logger.warning("Discovery path is not a directory", path=str(base_dir))
        return []

    for item in base_dir.iterdir():
        if not item.is_dir():
            continue

        name = item.name

        # Skip hidden/dunder
        if skip_hidden and name.startswith("."):
            continue
        if skip_dunder and name.startswith("_"):
            continue

        # Validate name if validator provided
        if validator:
            error = validator.validate(name)
            if error:
                logger.debug("Skipping invalid name", name=name, reason=error)
                continue

        # Check for manifest
        manifest_path = item / manifest_file
        if manifest_path.exists():
            discovered.append(
                DiscoveredManifest(
                    name=name,
                    manifest_path=manifest_path,
                    package_dir=item,
                    root_dir=item,
                )
            )
            logger.debug("Discovered manifest", name=name, path=str(manifest_path))

    # Sort by name for deterministic order
    discovered.sort(key=lambda m: m.name)
    return discovered


def discover_nested_manifests(
    base_dir: str | Path,
    nested_subdir: str,
    manifest_file: str = "manifest.py",
    validator: Optional[NameValidator] = None,
    skip_hidden: bool = True,
    skip_dunder: bool = True,
) -> list[DiscoveredManifest]:
    """
    Discover manifests in nested subdirectory structure.

    Structure:
        base_dir/
          package_a/
            {nested_subdir}/
              manifest.py  <- discovered
          package_b/
            {nested_subdir}/
              manifest.py  <- discovered

    Example (external plugins):
        packages/plugins/
          stealth/
            backend/
              manifest.py

        discover_nested_manifests("packages/plugins", "backend")

    Args:
        base_dir: Directory to search in.
        nested_subdir: Subdirectory name containing the manifest (e.g., "backend").
        manifest_file: Name of manifest file to look for.
        validator: Optional name validator.
        skip_hidden: Skip directories starting with '.'.
        skip_dunder: Skip directories starting with '_'.

    Returns:
        List of discovered manifests. Name is taken from parent dir, not nested_subdir.
    """
    base_dir = Path(base_dir)
    discovered: list[DiscoveredManifest] = []

    if not base_dir.exists():
        logger.debug("Nested discovery directory not found", path=str(base_dir))
        return []

    if not base_dir.is_dir():
        logger.warning("Nested discovery path is not a directory", path=str(base_dir))
        return []

    for item in base_dir.iterdir():
        if not item.is_dir():
            continue

        name = item.name

        # Skip hidden/dunder
        if skip_hidden and name.startswith("."):
            continue
        if skip_dunder and name.startswith("_"):
            continue

        # Validate name if validator provided
        if validator:
            error = validator.validate(name)
            if error:
                logger.debug("Skipping invalid name", name=name, reason=error)
                continue

        # Check for nested manifest
        nested_dir = item / nested_subdir
        manifest_path = nested_dir / manifest_file
        if manifest_path.exists():
            discovered.append(
                DiscoveredManifest(
                    name=name,
                    manifest_path=manifest_path,
                    package_dir=nested_dir,  # Where to import from
                    root_dir=item,  # Root package dir
                )
            )
            logger.debug(
                "Discovered nested manifest",
                name=name,
                nested_subdir=nested_subdir,
                path=str(manifest_path),
            )

    # Sort by name for deterministic order
    discovered.sort(key=lambda m: m.name)
    return discovered
