from launcher.core.worker_tasks import _worker_metadata_by_role


def test_media_maintenance_metadata_reflects_arq_settings():
    metadata = _worker_metadata_by_role()["media_maintenance"]

    labels = {task["label"] for task in metadata["functions"] if not task["runtime"]}

    assert metadata["settings_class"] == "MediaMaintenanceWorkerSettings"
    assert "archive" in metadata["description"].lower()
    assert {"Archive relocate", "Archive restore", "Signal-scan backfill"} <= labels
