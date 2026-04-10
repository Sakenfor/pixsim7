from types import SimpleNamespace

from pixsim7.backend.main.workers import status_poller as sp


def test_status_result_has_retrievable_cdn_false_for_placeholder_payload():
    status_result = SimpleNamespace(
        video_url="https://media.pixverse.ai/pixverse-preview/mp4/media/default.mp4",
        metadata={"video_url_is_placeholder": True},
    )

    assert sp._status_result_has_retrievable_cdn(status_result) is False


def test_status_result_has_retrievable_cdn_true_for_real_media_url():
    status_result = SimpleNamespace(
        video_url="https://media.pixverse.ai/pixverse/mp4/media/web/ori/example.mp4",
        metadata={"video_url_is_placeholder": False},
    )

    assert sp._status_result_has_retrievable_cdn(status_result) is True


def test_status_result_has_retrievable_cdn_prefers_metadata_flag():
    status_result = SimpleNamespace(
        video_url="https://media.pixverse.ai/pixverse/mp4/media/web/ori/example.mp4",
        metadata={"has_retrievable_media_url": False},
    )

    assert sp._status_result_has_retrievable_cdn(status_result) is False
