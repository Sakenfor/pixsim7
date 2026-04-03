from pixsim7.backend.main.infrastructure.events.bus import register_event_type

# Fired after a new PromptVersion is committed via prompt authoring.
# Payload: {family_id, version_id, prompt_text, category, user_id}
PROMPT_VERSION_CREATED = register_event_type("prompt:version_created")
