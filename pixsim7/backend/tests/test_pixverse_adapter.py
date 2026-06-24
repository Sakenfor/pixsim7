"""
Unit tests for PixverseProvider parameter mapping.

These tests focus on credit_change hints so we know the adapter
continues to surface pricing data for downstream consumers.
"""
from pixsim7.backend.main.services.provider.adapters import pixverse as pixverse_module
from pixsim7.backend.main.services.provider.adapters import pixverse_params as pixverse_params_module
from pixsim7.backend.main.services.provider.adapters.pixverse import PixverseProvider
from pixsim7.backend.main.domain import OperationType


def test_pixverse_image_credit_change_included():
    provider = PixverseProvider()

    params = provider.map_parameters(
        OperationType.TEXT_TO_IMAGE,
        {
            "prompt": "test",
            "model": "qwen-image",
            "quality": "720p",
        },
    )

    assert params["credit_change"] == 5


def test_pixverse_video_credit_change_uses_estimator(monkeypatch):
    provider = PixverseProvider()

    def fake_estimator(**kwargs):
        assert kwargs["quality"] == "360p"
        assert kwargs["duration"] == 8
        assert kwargs["model"] == "v5"
        return 123

    monkeypatch.setattr(pixverse_module, "estimate_video_credit_change", fake_estimator)

    params = provider.map_parameters(
        OperationType.TEXT_TO_VIDEO,
        {
            "prompt": "loop",
            "duration": 8,
            "quality": "360p",
            "model": "v5",
        },
    )

    assert params["credit_change"] == 123


def test_pixverse_video_duration_clamped_for_model_limit():
    provider = PixverseProvider()

    params = provider.map_parameters(
        OperationType.TEXT_TO_VIDEO,
        {
            "prompt": "loop",
            "duration": 20,
            "quality": "360p",
            "model": "v6",
        },
    )

    # Pixverse v6 caps duration at 15s (max_duration on the spec).
    assert params["duration"] == 15


def test_normalize_video_duration_fallback_clamp():
    assert pixverse_params_module.normalize_video_duration(20, "v6") == 15
    assert pixverse_params_module.normalize_video_duration(0, "v6") == 1


def test_compute_actual_credits_applies_account_promotion_discount(monkeypatch):
    """Promotions stored on the account flow into post-completion billing.

    Without the discount the v6 5s/360p call costs 20cr; with the v6 promo
    multiplier of 0.7 it should cost 14cr. The plumbing test guards the
    discount path so a regression here would surface as overcharging the
    account's local credit balance vs. Pixverse's actual ledger.
    """
    captured: dict = {}

    def fake_estimator(**kwargs):
        captured.update(kwargs)
        # Mimic the SDK's discount math so we exercise the real plumbing.
        base = 4 * kwargs["duration"]  # 360p base = 4 cr/sec
        mult = (kwargs.get("discounts") or {}).get(kwargs["model"], 1.0)
        return int(base * mult)

    monkeypatch.setattr(pixverse_module, "estimate_video_credit_change", fake_estimator)

    class FakeGen:
        operation_type = OperationType.TEXT_TO_VIDEO
        canonical_params = {"model": "v6", "quality": "360p", "duration": 5}
        estimated_credits = 999  # should not be used

    class FakeAccount:
        provider_metadata = {"promotion_discounts": {"v6": 0.7}}

    provider = PixverseProvider()
    cost = provider.compute_actual_credits(FakeGen(), FakeAccount(), actual_duration=5)

    assert cost == 14  # 20 * 0.7
    assert captured["discounts"] == {"v6": 0.7}


def test_compute_actual_credits_no_account_uses_base_pricing(monkeypatch):
    """When account is None, no discount is applied and base pricing wins."""
    captured: dict = {}

    def fake_estimator(**kwargs):
        captured.update(kwargs)
        return 20  # base 360p/5s for v6

    monkeypatch.setattr(pixverse_module, "estimate_video_credit_change", fake_estimator)

    class FakeGen:
        operation_type = OperationType.TEXT_TO_VIDEO
        canonical_params = {"model": "v6", "quality": "360p", "duration": 5}
        estimated_credits = 0

    provider = PixverseProvider()
    cost = provider.compute_actual_credits(FakeGen(), None, actual_duration=5)

    assert cost == 20
    assert captured["discounts"] is None


def test_compute_actual_credits_free_promo_charges_zero(monkeypatch):
    """Fully free promo (multiplier 0.0) results in 0 credits charged."""
    def fake_estimator(**kwargs):
        base = 30 * kwargs["duration"]  # happyhorse 720p = 30 cr/sec
        mult = (kwargs.get("discounts") or {}).get(kwargs["model"], 1.0)
        return int(base * mult)

    monkeypatch.setattr(pixverse_module, "estimate_video_credit_change", fake_estimator)

    class FakeGen:
        operation_type = OperationType.TEXT_TO_VIDEO
        canonical_params = {"model": "happyhorse-1.0", "quality": "720p", "duration": 5}
        estimated_credits = 999

    class FakeAccount:
        provider_metadata = {"promotion_discounts": {"happyhorse-1.0": 0.0}}

    provider = PixverseProvider()
    cost = provider.compute_actual_credits(FakeGen(), FakeAccount(), actual_duration=5)

    assert cost == 0
