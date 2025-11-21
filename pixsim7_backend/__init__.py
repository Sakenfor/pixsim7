"""
DEPRECATED: Legacy pixsim7_backend package

This module exists only for backward compatibility.
All code has been moved to pixsim7.backend.main

Please update your imports:
    OLD: from pixsim7_backend.X import Y
    NEW: from pixsim7.backend.main.X import Y

This shim will be removed in a future version.
"""
import warnings
import sys

# Show deprecation warning once per session
warnings.warn(
    "pixsim7_backend is deprecated. "
    "Use pixsim7.backend.main instead. "
    "This compatibility shim will be removed in a future version.",
    DeprecationWarning,
    stacklevel=2
)

# Forward all imports to the canonical location
# This allows legacy code to continue working during the transition
def __getattr__(name):
    """Forward attribute access to pixsim7.backend.main"""
    import importlib
    try:
        # Try to import from canonical location
        canonical_module = importlib.import_module(f"pixsim7.backend.main.{name}")
        return canonical_module
    except ImportError:
        raise AttributeError(
            f"Module 'pixsim7_backend' has no attribute '{name}'. "
            f"Try importing from 'pixsim7.backend.main.{name}' instead."
        )

# Expose main app for uvicorn compatibility
# Allows: uvicorn pixsim7_backend.main:app (deprecated)
# Forwards to: pixsim7.backend.main.main:app (canonical)
def __dir__():
    """List available attributes"""
    return ['main', 'api', 'services', 'domain', 'infrastructure', 'shared', 'workers']
