from pixsim7.backend.main.infrastructure.events.bus import register_event_type

JOB_CREATED = register_event_type("job:created")
JOB_STARTED = register_event_type("job:started")
JOB_COMPLETED = register_event_type("job:completed")
JOB_FAILED = register_event_type("job:failed")
JOB_CANCELLED = register_event_type("job:cancelled")
JOB_PAUSED = register_event_type("job:paused")
JOB_RESUMED = register_event_type("job:resumed")
