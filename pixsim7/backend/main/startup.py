"""
Backend startup helpers

Decomposed startup logic for testability and reusability.
Each helper function has a single responsibility and minimal side effects.

Usage:
    from pixsim7.backend.main.startup import (
        validate_settings,
        setup_domain_registry,
        setup_database_and_seed,
        # ...
    )
"""
from typing import Optional
from pathlib import Path
from fastapi import FastAPI

from pixsim_logging import configure_logging
from pixsim7.backend.main.shared.operation_mapping import assert_operation_coverage

logger = configure_logging("startup")


def validate_settings(settings) -> None:
    """
    Validate settings for production safety.

    Raises:
        ValueError: If settings are invalid for the current environment

    Why this is a separate function:
    - Testable in isolation
    - Clear failure message
    - Single responsibility: validation only
    """
    if not settings.debug and settings.secret_key == "change-this-in-production":
        raise ValueError(
            "SECRET_KEY must be set in production mode. "
            "Set DEBUG=true for development or provide a secure SECRET_KEY."
        )


def setup_domain_registry(models_dir: str | Path):
    """
    Initialize domain model registry from directory.

    Args:
        models_dir: Directory containing domain model definitions

    Returns:
        DomainModelRegistry instance with registered models

    Why this is a separate function:
    - Testable with a temporary directory
    - Can be reused in worker processes
    - No hidden globals
    """
    from pixsim7.backend.main.infrastructure.domain_registry import init_domain_registry
    registry = init_domain_registry(str(models_dir))

    # Validate operation coverage after domain models are registered.
    # This will raise AssertionError in case of drift or incomplete mappings,
    # failing fast in development/CI while remaining lightweight.
    try:
        assert_operation_coverage()
        logger.info("operation_mapping_validated")
    except AssertionError as e:
        # In development, it's useful to fail fast; in production we log
        # the error and continue, since this is primarily a developer guardrail.
        logger.error("operation_mapping_validation_failed", error=str(e))
        raise

    return registry


async def setup_database_and_seed() -> None:
    """
    Initialize database (REQUIRED) and seed default data (OPTIONAL).

    Database initialization must succeed or startup fails.
    Default preset seeding is optional and will only warn if it fails.

    Raises:
        Exception: If database initialization fails (fail-fast)

    Why this is a separate function:
    - Clear separation of required vs optional steps
    - Testable with test database
    - Explicit error handling policy
    """
    from pixsim7.backend.main.infrastructure.database.session import (
        init_database,
        get_async_session
    )

    # DB initialization is REQUIRED - no try/except, let it fail
    await init_database()
    logger.info("database_initialized")

    # Default preset seeding is OPTIONAL
    try:
        from pixsim7.backend.main.seeds.default_presets import seed_default_presets
        async with get_async_session() as db:
            await seed_default_presets(db)
        logger.info("default_presets_seeded")
    except Exception as e:
        logger.warning(
            "preset_seed_failed",
            error=str(e),
            error_type=e.__class__.__name__,
            msg="Continuing startup without default presets"
        )

    # Built-in plugin seeding is OPTIONAL
    try:
        from pixsim7.backend.main.services.plugin.plugin_service import PluginCatalogService
        async with get_async_session() as db:
            service = PluginCatalogService(db)
            count = await service.seed_builtin_plugins()
            if count:
                logger.info("builtin_plugins_seeded", count=count)
    except Exception as e:
        logger.warning(
            "plugin_seed_failed",
            error=str(e),
            error_type=e.__class__.__name__,
            msg="Continuing startup without built-in plugins"
        )


async def setup_analyzer_definitions() -> int:
    """
    Load custom analyzer definitions from the database.

    Returns:
        int: Number of analyzer definitions loaded
    """
    from pixsim7.backend.main.infrastructure.database.session import get_async_session
    from pixsim7.backend.main.services.analysis import load_analyzer_definitions

    async with get_async_session() as db:
        count = await load_analyzer_definitions(db)

    logger.info("custom_analyzers_loaded", count=count)
    return count


async def setup_analyzer_presets() -> int:
    """
    Load approved analyzer presets from the database.

    Returns:
        int: Number of presets applied
    """
    from pixsim7.backend.main.infrastructure.database.session import get_async_session
    from pixsim7.backend.main.services.analysis import load_analyzer_presets

    async with get_async_session() as db:
        count = await load_analyzer_presets(db)

    logger.info("approved_analyzer_presets_loaded", count=count)
    return count


async def setup_redis() -> bool:
    """
    Initialize Redis connection (OPTIONAL - degraded mode without it).

    Redis is used for:
    - Background job queue (ARQ)
    - LLM response caching
    - Session caching

    If Redis is unavailable, the app continues but background jobs
    and caching are disabled.

    Returns:
        bool: True if Redis is available, False otherwise

    Why this is a separate function:
    - Clear optional vs required semantics
    - Returns status for readiness checks
    - Explicit degraded mode handling
    """
    from pixsim7.backend.main.infrastructure.redis import check_redis_connection

    try:
        available = await check_redis_connection()
        if available:
            logger.info("redis_connected")
        else:
            logger.warning(
                "redis_unavailable",
                msg="Background jobs and caching disabled"
            )
        return available
    except Exception as e:
        logger.warning(
            "redis_init_failed",
            error=str(e),
            error_type=e.__class__.__name__,
            msg="Continuing in degraded mode"
        )
        return False


def setup_providers() -> None:
    """
    Register default provider implementations.

    Providers are:
    - Video generation providers (Pixverse, Runway, etc.)
    - LLM providers (Anthropic, OpenAI)

    Why this is a separate function:
    - Independent of database/Redis
    - Can be tested in isolation
    - Clear registration point
    """
    from pixsim7.backend.main.services.provider import register_default_providers
    register_default_providers()
    logger.info("providers_registered")


def setup_ai_models() -> None:
    """
    Initialize AI Model Registry with default models and parsers.

    Registers:
    - Deterministic parsing engines (prompt-dsl)
    - LLM models for prompt editing and tag suggestion

    Why this is a separate function:
    - Independent of database/Redis
    - Can be tested in isolation
    - Clear registration point
    """
    from pixsim7.backend.main.services.ai_model.bootstrap import initialize_ai_models
    initialize_ai_models()
    logger.info("ai_models_registered")


def setup_analyzer_plugins() -> None:
    """
    Register plugin hooks for analyzer discovery.

    Must run before plugins load so analyzers are registered during load.
    """
    from pixsim7.backend.main.services.prompt.parser.analyzer_plugins import (
        setup_analyzer_plugin_hooks,
    )
    setup_analyzer_plugin_hooks()
    logger.info("analyzer_plugin_hooks_registered")


def setup_registry_cleanup_hooks() -> None:
    """
    Register plugin hooks for registry cleanup on plugin disable.
    """
    from pixsim7.backend.main.infrastructure.plugins.registry_cleanup import (
        setup_registry_cleanup_hooks as setup_hooks,
    )
    setup_hooks()
    logger.info("registry_cleanup_hooks_registered")


def setup_event_handlers() -> None:
    """
    Register event handlers and WebSocket handlers.

    Event handlers include:
    - Metrics collection
    - Webhook delivery
    - Auto-retry logic

    Why this is a separate function:
    - Independent initialization
    - Can be disabled for testing
    - Clear registration point
    """
    from pixsim7.backend.main.infrastructure.events.handlers import register_handlers
    from pixsim7.backend.main.infrastructure.events.websocket_handler import (
        register_websocket_handlers
    )

    register_handlers()
    register_websocket_handlers()
    logger.info("event_handlers_registered")


def setup_ecs_components() -> int:
    """
    Register core ECS (Entity-Component-System) components.

    Must happen before plugins load so plugins can see core components.

    Returns:
        int: Number of registered components

    Why this is a separate function:
    - Must run before plugins
    - Testable independently
    - Returns count for logging/assertions
    """
    from pixsim7.backend.main.domain.game.core.ecs import register_core_components
    count = register_core_components()
    logger.info("ecs_components_registered", count=count)
    return count


def setup_stat_packages() -> int:
    """
    Register core stat packages.

    Stat packages are plugin-extensible bundles of StatDefinition objects
    (relationships, personality, mood, etc.) that worlds can discover and use.

    Returns:
        int: Number of packages registered

    Why this is a separate function:
    - Makes registration explicit in startup flow
    - Returns count for observability
    - Testable in isolation
    """
    from pixsim7.backend.main.domain.game.stats import (
        register_core_stat_packages,
        list_stat_packages,
        setup_stat_package_hooks,
    )

    # Set up plugin hooks for stat package registration
    setup_stat_package_hooks()
    register_core_stat_packages()
    packages = list_stat_packages()

    logger.info(
        "stat_packages_registered",
        count=len(packages),
        packages=[p.id for p in packages.values()]
    )

    return len(packages)


def setup_composition_packages() -> int:
    """
    Register core composition packages.

    Composition packages define roles for multi-image generation
    (main_character, environment, pov_hands, etc.).

    Returns:
        int: Number of packages registered

    Why this is a separate function:
    - Makes registration explicit in startup flow
    - Returns count for observability
    - Testable in isolation
    """
    from pixsim7.backend.main.domain.composition import (
        register_core_composition_package,
        list_composition_packages,
    )

    register_core_composition_package()
    packages = list_composition_packages()

    logger.info(
        "composition_packages_registered",
        count=len(packages),
        packages=[p.id for p in packages.values()]
    )

    return len(packages)


def setup_link_system() -> dict:
    """
    Initialize the generic ObjectLink system.

    Registers:
    - Entity loaders for all core entity types
    - Field mappings for template↔runtime pairs

    Returns:
        dict: Statistics (loaders, mappings registered)

    Why this is a separate function:
    - Must run after database init but before plugins
    - Independent, testable initialization
    - Returns stats for logging
    """
    from pixsim7.backend.main.services.links.entity_loaders import (
        register_default_loaders,
        get_entity_loader_registry
    )
    from pixsim7.backend.main.services.links.link_types import (
        register_default_link_types,
        get_link_type_registry,
    )
    from pixsim7.backend.main.services.links.default_mappings import (
        register_default_mappings
    )
    from pixsim7.backend.main.services.links.mapping_registry import (
        get_mapping_registry
    )
    from pixsim7.backend.main.services.refs.entity_ref_registry import (
        register_default_ref_mappings,
        get_entity_ref_registry
    )

    # Register link types (template/runtime pairs)
    register_default_link_types()
    link_type_count = len(get_link_type_registry().list_specs())

    # Register entity loaders
    register_default_loaders()
    loader_count = len(get_entity_loader_registry().list_loaders())

    # Register field mappings (for template↔runtime syncing)
    register_default_mappings()
    mapping_count = len(get_mapping_registry().list_mappings())

    # Register EntityRef field mappings (for API DTOs)
    register_default_ref_mappings()
    ref_mapping_count = len(get_entity_ref_registry().list_mappings())

    logger.info(
        "link_system_initialized",
        link_types=link_type_count,
        loaders=loader_count,
        mappings=mapping_count,
        ref_mappings=ref_mapping_count
    )

    return {
        'link_types': link_type_count,
        'loaders': loader_count,
        'mappings': mapping_count,
        'ref_mappings': ref_mapping_count
    }


def setup_behavior_builtins() -> dict:
    """
    Register built-in game behaviors (conditions, effects, scoring factors).

    This must be called before plugins are loaded so that:
    1. Built-in behaviors are available when plugins initialize
    2. Plugins can extend or override built-in behaviors
    3. The behavior registry is populated before it's locked

    Returns:
        dict: Statistics about registered behaviors

    Why this is a separate function:
    - Makes registration explicit in startup flow
    - Prevents import-time side effects
    - Returns stats for observability
    - Testable in isolation
    """
    from pixsim7.backend.main.domain.game.behavior.bootstrap import (
        register_game_behavior_builtins
    )

    stats = register_game_behavior_builtins()

    logger.info(
        "behavior_builtins_registered",
        conditions=stats.get('conditions', 0),
        effects=stats.get('effects', 0),
        scoring_factors=stats.get('scoring_factors', 0),
    )

    return stats


async def setup_plugins(
    app: FastAPI,
    plugins_dir: str | Path,
    routes_dir: str | Path,
    fail_fast: bool,
    external_plugins_dir: str | Path | None = None
) -> tuple:
    """
    Initialize and enable plugin managers for features and routes.

    Loads plugins from two sources:
    1. Core plugins in plugins_dir and routes_dir
    2. External plugins in external_plugins_dir/*/backend/ (self-contained packages)

    Args:
        app: FastAPI application instance
        plugins_dir: Directory containing core feature plugins
        routes_dir: Directory containing core route plugins
        fail_fast: If True, abort startup on plugin failure (dev/CI mode)
        external_plugins_dir: Optional directory containing external plugin packages
                              (e.g., packages/plugins/). Only loaded for feature plugins.

    Returns:
        tuple: (plugin_manager, routes_manager)

    Why this is a separate function:
    - Complex initialization logic isolated
    - Testable with dummy app
    - Returns managers for app.state attachment
    """
    from pixsim7.backend.main.infrastructure.plugins import init_plugin_manager
    from pixsim7.backend.main.lib.registry import RegistryManager, set_registry_manager

    registry_manager = RegistryManager()
    set_registry_manager(registry_manager, migrate=True)

    # Initialize feature plugins (includes external plugins)
    plugin_manager = init_plugin_manager(
        app,
        str(plugins_dir),
        plugin_type="feature",
        fail_fast=fail_fast,
        external_plugins_dir=str(external_plugins_dir) if external_plugins_dir else None,
        registry_manager=registry_manager,
    )
    logger.info(
        "feature_plugins_loaded",
        count=len(plugin_manager.list_plugins()),
        plugins_dir=str(plugins_dir),
        external_plugins_dir=str(external_plugins_dir) if external_plugins_dir else None
    )

    # Initialize route plugins (no external plugins for routes)
    routes_manager = init_plugin_manager(
        app,
        str(routes_dir),
        plugin_type="route",
        fail_fast=fail_fast,
        registry_manager=registry_manager,
    )
    logger.info(
        "route_plugins_loaded",
        count=len(routes_manager.list_plugins()),
        routes_dir=str(routes_dir)
    )

    # Enable all plugins
    await plugin_manager.enable_all()
    await routes_manager.enable_all()
    logger.info("plugins_enabled")

    return plugin_manager, routes_manager


def setup_behavior_registry_lock(plugin_manager, routes_manager) -> dict:
    """
    Lock behavior extension registry after plugins are loaded.

    Prevents runtime registration of new behaviors, conditions, and effects.

    Args:
        plugin_manager: Feature plugin manager
        routes_manager: Route plugin manager

    Returns:
        dict: Registry statistics (conditions, effects, simulation_configs)

    Why this is a separate function:
    - Must run after all plugins loaded
    - Returns stats for logging/verification
    - Single responsibility: registry locking
    """
    from pixsim7.backend.main.infrastructure.plugins.behavior_registry import (
        behavior_registry
    )

    behavior_registry.lock()
    stats = behavior_registry.get_stats()

    logger.info(
        "behavior_registry_locked",
        conditions=stats.get('conditions', {}).get('total', 0),
        effects=stats.get('effects', {}).get('total', 0),
        simulation_configs=stats.get('simulation_configs', {}).get('total', 0)
    )

    return stats


async def setup_middleware_lifecycle(app: FastAPI) -> None:
    """
    Enable middleware lifecycle hooks.

    Args:
        app: FastAPI application instance

    Why this is a separate function:
    - Separate from middleware registration
    - Can be called conditionally
    - Clear lifecycle management
    """
    from pixsim7.backend.main.infrastructure.middleware.manager import middleware_manager

    if middleware_manager:
        await middleware_manager.enable_all()
        logger.info("middleware_enabled")
    else:
        logger.warning("middleware_manager_not_initialized")


def configure_admin_diagnostics(plugin_manager, routes_manager) -> None:
    """
    Configure admin plugin diagnostics endpoint.

    Sets up the /admin/plugins endpoint to inspect plugin state.

    Args:
        plugin_manager: Feature plugin manager
        routes_manager: Route plugin manager

    Why this is a separate function:
    - Optional admin feature
    - Depends on both plugin managers
    - Can be disabled for security
    """
    try:
        # Expose plugin managers via admin_plugins dependency (stored on app.state)
        from pixsim7.backend.main.api.v1 import admin_plugins
        admin_plugins.set_plugin_managers(plugin_manager, routes_manager)
        logger.info("admin_diagnostics_configured")
    except Exception as e:
        # Admin diagnostics are optional; log and continue if module unavailable
        logger.info("admin_diagnostics_skipped", error=str(e))
