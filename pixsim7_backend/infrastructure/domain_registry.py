"""
Domain Model Registry

Auto-discovers and registers SQLModel domain models for database schema creation.
"""

import importlib
import importlib.util
from pathlib import Path
from typing import Any, Optional, Type, List
import structlog

logger = structlog.get_logger(__name__)


class DomainModelManifest:
    """
    Manifest for domain model packages.

    Each domain area (core, automation, game) defines which models to register.
    """

    def __init__(
        self,
        id: str,
        name: str,
        description: str,
        models: List[str],  # List of model class names to import
        enabled: bool = True,
        dependencies: List[str] = None,
    ):
        self.id = id
        self.name = name
        self.description = description
        self.models = models
        self.enabled = enabled
        self.dependencies = dependencies or []


class DomainModelRegistry:
    """
    Manages domain model registration for SQLModel/SQLAlchemy.

    Features:
    - Auto-discovery of domain model packages
    - Manifest-based model declaration
    - Dependency resolution for load order
    """

    def __init__(self):
        self.packages: dict[str, dict[str, Any]] = {}
        self.registered_models: List[Type] = []
        self.load_order: list[str] = []

    def discover_packages(self, domain_dir: str | Path) -> list[str]:
        """
        Discover domain model packages in a directory.

        Expected structure:
        domain_models/
          core_models/
            manifest.py
          automation_models/
            manifest.py
          game_models/
            manifest.py
        """
        domain_dir = Path(domain_dir)
        discovered = []

        if not domain_dir.exists():
            logger.warning(f"Domain models directory not found: {domain_dir}")
            return []

        for item in domain_dir.iterdir():
            if item.is_dir() and not item.name.startswith('_'):
                manifest_file = item / 'manifest.py'
                if manifest_file.exists():
                    discovered.append(item.name)
                    logger.debug(f"Discovered domain package: {item.name}")

        return discovered

    def load_package(self, package_name: str, domain_dir: str | Path) -> bool:
        """
        Load a domain model package from directory.

        Returns True if loaded successfully, False otherwise.
        """
        try:
            domain_dir = Path(domain_dir)
            module_path = domain_dir / package_name / 'manifest.py'

            if not module_path.exists():
                logger.error(f"Domain package manifest not found: {module_path}")
                return False

            # Import module dynamically
            spec = importlib.util.spec_from_file_location(
                f"domain_models.{package_name}",
                module_path
            )
            if not spec or not spec.loader:
                logger.error(f"Failed to load spec for {package_name}")
                return False

            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)

            # Validate package exports
            if not hasattr(module, 'manifest'):
                logger.error(f"Domain package {package_name} missing 'manifest'")
                return False

            manifest: DomainModelManifest = module.manifest

            # Validate manifest
            if manifest.id != package_name:
                logger.warning(
                    f"Domain package ID mismatch: directory={package_name}, manifest={manifest.id}"
                )

            # Store package
            self.packages[manifest.id] = {
                'manifest': manifest,
                'module': module,
                'loaded': True,
                'enabled': manifest.enabled,
            }

            logger.info(
                f"Loaded domain package: {manifest.name}",
                package_id=manifest.id,
                model_count=len(manifest.models),
            )

            return True

        except Exception as e:
            logger.error(f"Failed to load domain package {package_name}: {e}", exc_info=True)
            return False

    def resolve_dependencies(self) -> list[str]:
        """
        Resolve package load order based on dependencies.

        Returns list of package IDs in load order.
        Raises ValueError if circular dependencies detected.
        """
        loaded = set()
        load_order = []

        def visit(package_id: str, visiting: set):
            if package_id in loaded:
                return
            if package_id in visiting:
                raise ValueError(f"Circular dependency detected: {package_id}")

            visiting.add(package_id)

            package = self.packages.get(package_id)
            if not package:
                raise ValueError(f"Missing dependency: {package_id}")

            # Visit dependencies first
            for dep in package['manifest'].dependencies:
                visit(dep, visiting)

            visiting.remove(package_id)
            loaded.add(package_id)
            load_order.append(package_id)

        # Visit all packages
        for package_id in self.packages:
            visit(package_id, set())

        return load_order

    def register_all(self) -> int:
        """
        Register all domain models with SQLModel.

        Returns the number of models registered.
        """
        try:
            # Resolve load order
            self.load_order = self.resolve_dependencies()
            logger.info(f"Domain package load order: {self.load_order}")

            # Register models from each package
            for package_id in self.load_order:
                package = self.packages[package_id]
                manifest = package['manifest']

                if not manifest.enabled:
                    logger.info(f"Skipping disabled domain package: {package_id}")
                    continue

                # Get the models from the module
                module = package['module']

                for model_name in manifest.models:
                    if hasattr(module, model_name):
                        model_class = getattr(module, model_name)
                        self.registered_models.append(model_class)
                        logger.debug(f"Registered model: {model_name} from {package_id}")
                    else:
                        logger.warning(f"Model {model_name} not found in {package_id}")

                logger.info(
                    f"Registered domain package: {manifest.name}",
                    package_id=package_id,
                    model_count=len(manifest.models),
                )

            return len(self.registered_models)

        except ValueError as e:
            logger.error(f"Dependency resolution failed: {e}")
            raise

    def get_package(self, package_id: str) -> Optional[dict]:
        """Get domain package info by ID"""
        return self.packages.get(package_id)

    def list_packages(self) -> list[dict]:
        """List all loaded domain packages"""
        return [
            {
                'id': package_id,
                'name': package['manifest'].name,
                'model_count': len(package['manifest'].models),
                'enabled': package['enabled'],
            }
            for package_id, package in self.packages.items()
        ]


# Global domain model registry instance
domain_registry: Optional[DomainModelRegistry] = None


def init_domain_registry(domain_dir: str | Path = "pixsim7_backend/domain_models") -> DomainModelRegistry:
    """
    Initialize the global domain model registry.

    Usage in main.py:
        from pixsim7_backend.infrastructure.domain_registry import init_domain_registry

        registry = init_domain_registry("pixsim7_backend/domain_models")
        # Models are now imported and registered with SQLModel
    """
    global domain_registry

    domain_registry = DomainModelRegistry()

    # Auto-discover packages
    discovered = domain_registry.discover_packages(domain_dir)
    logger.info(f"Discovered {len(discovered)} domain packages", packages=discovered)

    # Load all
    for package_name in discovered:
        domain_registry.load_package(package_name, domain_dir)

    # Register models with SQLModel
    model_count = domain_registry.register_all()
    logger.info(f"Registered {model_count} domain models")

    return domain_registry
