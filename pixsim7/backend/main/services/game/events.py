from pixsim7.backend.main.infrastructure.events.bus import register_event_type

SCENE_CREATED = register_event_type("scene:created")
SCENE_UPDATED = register_event_type("scene:updated")
