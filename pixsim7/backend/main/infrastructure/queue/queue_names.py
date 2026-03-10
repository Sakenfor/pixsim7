"""
Central queue name definitions for ARQ workers.
"""

# ARQ default queue name for fresh generation jobs.
GENERATION_FRESH_QUEUE_NAME = "arq:queue"

# Dedicated queue for generation retries/deferred work.
GENERATION_RETRY_QUEUE_NAME = "arq:queue:generation-retry"

# Dedicated queue for world simulation scheduler jobs.
SIMULATION_SCHEDULER_QUEUE_NAME = "arq:queue:simulation-scheduler"

