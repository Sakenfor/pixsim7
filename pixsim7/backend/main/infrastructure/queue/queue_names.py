"""
Central queue name definitions for ARQ workers.
"""

# ARQ default queue name for fresh generation jobs.
GENERATION_FRESH_QUEUE_NAME = "arq:queue"

# Dedicated queue for generation retries/deferred work.
GENERATION_RETRY_QUEUE_NAME = "arq:queue:generation-retry"

# Dedicated queue for world simulation scheduler jobs.
SIMULATION_SCHEDULER_QUEUE_NAME = "arq:queue:simulation-scheduler"

# Dedicated queue for device automation execution jobs.
AUTOMATION_QUEUE_NAME = "arq:queue:automation"

# Dedicated queue for slow bulk media-maintenance jobs — archive relocate/restore
# over S3 plus durable signal-scan reprobe. Isolated from the generation hot path
# so long ZeroTier uploads / probe sweeps can't eat generation slots.
# See plan media-storage-tiering cp-k and signal-reprobe-backfill-run.
MEDIA_MAINTENANCE_QUEUE_NAME = "arq:queue:media-maintenance"

