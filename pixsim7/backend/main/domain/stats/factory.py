"""
StatEngine factory for centralized engine creation and configuration.

Why a factory:
- Centralizes engine instantiation
- Future-proof for configuration injection
- Single source of truth for engine creation
"""
from typing import Optional
from .engine import StatEngine


def create_stat_engine(config: Optional[dict] = None) -> StatEngine:
    """
    Create a configured StatEngine instance.

    Args:
        config: Optional configuration dict for custom behavior
                (e.g., {"enable_caching": True, "derivation_mode": "strict"})

    Returns:
        StatEngine: Configured engine instance

    Example:
        # Default engine
        engine = create_stat_engine()

        # Configured engine (future)
        engine = create_stat_engine({"enable_caching": True})
    """
    # For now, just create default engine
    # Future: apply config, set up caching, register custom derivations, etc.
    engine = StatEngine()

    if config:
        # Future: apply configuration
        # engine.enable_caching = config.get("enable_caching", False)
        pass

    return engine
