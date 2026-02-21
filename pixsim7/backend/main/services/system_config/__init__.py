"""
System config service — namespaced JSON config persistence with applier registry.

Usage::

    from pixsim7.backend.main.services.system_config import (
        get_config, patch_config, apply_namespace,
    )
"""
from .service import (  # noqa: F401
    get_config,
    set_config,
    patch_config,
    register_applier,
    apply_namespace,
    apply_all_from_db,
)
