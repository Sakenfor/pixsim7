"""
DEPRECATED: Legacy pixsim7_backend.main module

This module exists only for backward compatibility.
All code has been moved to pixsim7.backend.main.main

Please update your imports:
    OLD: from pixsim7_backend.main import app
    NEW: from pixsim7.backend.main.main import app

Or for uvicorn:
    OLD: uvicorn pixsim7_backend.main:app
    NEW: uvicorn pixsim7.backend.main.main:app

This shim will be removed in a future version.
"""
import warnings

warnings.warn(
    "pixsim7_backend.main is deprecated. "
    "Use pixsim7.backend.main.main instead. "
    "This compatibility shim will be removed in a future version.",
    DeprecationWarning,
    stacklevel=2
)

# Forward app import to canonical location
from pixsim7.backend.main.main import app, lifespan

__all__ = ['app', 'lifespan']
