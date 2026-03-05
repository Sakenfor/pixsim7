"""Top-level APIRouter assembly for block-templates.

Route modules import `router` from here and register their endpoints on it.
The imports at the bottom trigger endpoint registration.
"""
from fastapi import APIRouter

router = APIRouter(prefix="/block-templates", tags=["block-templates"])

# Import route modules to trigger endpoint registration on `router`.
# These MUST come after router is defined to avoid circular import issues.
from . import routes_templates, routes_blocks, routes_matrix, routes_content_packs  # noqa: E402, F401
