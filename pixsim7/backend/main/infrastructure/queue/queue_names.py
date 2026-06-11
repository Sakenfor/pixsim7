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

# Dedicated queue for slow media-archive jobs (bulk relocate/restore over S3).
# Isolated from the generation hot path so long ZeroTier uploads can't eat
# generation slots. See plan media-storage-tiering cp-k.
MEDIA_ARCHIVE_QUEUE_NAME = "arq:queue:media-archive"

