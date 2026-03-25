from pixsim7.backend.main.infrastructure.events.bus import register_event_type

ACCOUNT_SELECTED = register_event_type("account:selected")
ACCOUNT_EXHAUSTED = register_event_type("account:exhausted")
ACCOUNT_ERROR = register_event_type("account:error")
