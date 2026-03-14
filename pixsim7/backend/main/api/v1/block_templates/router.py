"""Top-level APIRouter assembly for block-templates.

Route modules import `router` from here and register their endpoints on it.
The imports at the bottom trigger endpoint registration.
"""
from fastapi import APIRouter

router = APIRouter(prefix="/block-templates", tags=["block-templates"])

# Import route modules to trigger endpoint registration on `router`.
# These MUST come after router is defined to avoid circular import issues.
# ORDER MATTERS: routes_templates defines /{template_id} (catch-all), so it
# must be imported LAST so static paths like /blocks register first.
from . import routes_blocks, routes_matrix, routes_content_packs, routes_templates  # noqa: E402, F401
