import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pixsim7.backend.main.infrastructure.events.redis_bridge import _summarize_event_data


def test_summarize_asset_updated_event_contains_core_fields():
    payload = {
        "asset_id": 48955,
        "user_id": 1,
        "reason": "ingestion_completed",
        "source_generation_id": 68071,
        "thumbnail_generated": True,
    }

    summary = _summarize_event_data("asset:updated", payload)

    assert summary == {
        "asset_id": 48955,
        "user_id": 1,
        "reason": "ingestion_completed",
        "source_generation_id": 68071,
    }

