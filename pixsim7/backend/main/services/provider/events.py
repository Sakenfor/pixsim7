from pixsim7.backend.main.infrastructure.events.bus import register_event_type

PROVIDER_SUBMITTED = register_event_type("provider:submitted")
PROVIDER_COMPLETED = register_event_type("provider:completed")
PROVIDER_FAILED = register_event_type("provider:failed")
