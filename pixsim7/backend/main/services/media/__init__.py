"""
Media Service Package

Central home for media pipeline concerns:
- settings: MediaSettings configuration (download, storage, derivatives, serving)
- download: Remote file download + format conversion
- derivatives: Thumbnail and preview generation
- metadata: Dimension/duration/codec extraction
"""
from typing import TYPE_CHECKING

__all__ = [
    "MediaSettings",
    "get_media_settings",
]

# Lazy re-export (PEP 562). ``settings`` imports ``asset.signal_scoring_params``,
# which pulls in the whole ``asset`` package (→ ``prompt.analysis`` → ``analysis``
# → ``prompt.parser``). Importing leaf submodules of this package (e.g.
# ``embedding_input_config``, a pure-constants module consumed by the prompt
# parser registry) must NOT trigger that heavy chain, or it forms a circular
# import during startup. Deferring the settings import keeps this __init__ light.
if TYPE_CHECKING:
    from .settings import MediaSettings, get_media_settings


def __getattr__(name: str):
    if name in __all__:
        from . import settings
        return getattr(settings, name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
