"""
Media Service Package

Central home for media pipeline concerns:
- settings: MediaSettings configuration (download, storage, derivatives, serving)
- download: Remote file download + format conversion
- derivatives: Thumbnail and preview generation
- metadata: Dimension/duration/codec extraction
"""
from .settings import MediaSettings, get_media_settings

__all__ = [
    "MediaSettings",
    "get_media_settings",
]
