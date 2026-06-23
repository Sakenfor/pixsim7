TEST_SUITE = {
    "id": "worker-tests",
    "label": "Worker Tests",
    "kind": "unit",
    "category": "backend",
    "subcategory": "workers",
    "covers": [
        "pixsim7/backend/main/workers/status_poller.py",
        "pixsim7/backend/main/workers/job_processor.py",
        "pixsim7/backend/main/workers/worker_concurrency.py",
        "pixsim7/backend/main/workers/redis_drain_job.py",
        "pixsim7/backend/main/workers/relocation_processor.py",
        "pixsim7/backend/main/workers/restore_processor.py",
    ],
    "order": 25,
}
