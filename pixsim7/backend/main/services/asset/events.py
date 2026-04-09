from pixsim7.backend.main.infrastructure.events.bus import register_event_type

ASSET_CREATED = register_event_type("asset:created")
ASSET_UPDATED = register_event_type("asset:updated")
ASSET_DOWNLOADED = register_event_type("asset:downloaded")
ASSET_DOWNLOAD_FAILED = register_event_type("asset:download_failed")
ASSET_DELETED = register_event_type("asset:deleted")
