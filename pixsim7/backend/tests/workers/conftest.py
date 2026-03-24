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
    ],
    "order": 25,
}
