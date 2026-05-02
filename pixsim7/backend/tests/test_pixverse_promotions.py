from types import SimpleNamespace
from unittest.mock import patch

from pixsim7.backend.main.services.provider.adapters.pixverse_promotions import (
    apply_promotions_to_metadata,
    extract_pixverse_promotions,
    normalize_pixverse_promotions,
    probe_promotion_discounts,
)


def test_normalize_pixverse_promotions_alias_key():
    promotions = normalize_pixverse_promotions({"is_v6_discount": True})
    assert promotions == {"v6": True}


def test_normalize_pixverse_promotions_discount_suffix():
    promotions = normalize_pixverse_promotions({"is_seedream_4_5_discount": 1})
    assert promotions == {"seedream_4_5": True}


def test_extract_pixverse_promotions_nested_payload():
    payload = {"promotions": {"is_v6_discount": True, "v5": False}}
    promotions = extract_pixverse_promotions(payload)
    assert promotions == {"v6": True, "v5": False}


def test_extract_pixverse_promotions_top_level_flags():
    payload = {
        "remainingCredits": 120,
        "is_v6_discount": "true",
        "is_seedream_4_5_discount": 0,
    }
    promotions = extract_pixverse_promotions(payload)
    assert promotions == {"v6": True, "seedream_4_5": False}


def test_extract_pixverse_promotions_promotion_discounts_field():
    payload = {
        "remainingCredits": 120,
        "promotion_discounts": {"happyhorse-1.0": True},
    }
    promotions = extract_pixverse_promotions(payload)
    assert promotions == {"happyhorse-1.0": True}


def test_extract_pixverse_promotions_merges_all_sources():
    payload = {
        "promotions": {"is_v6_discount": True},
        "is_seedream_4_5_discount": True,
        "promotion_discounts": {"happyhorse-1.0": True},
    }
    promotions = extract_pixverse_promotions(payload)
    assert promotions == {
        "v6": True,
        "seedream_4_5": True,
        "happyhorse-1.0": True,
    }


def test_probe_promotion_discounts_detects_free_promo():
    # Pretend Pixverse reports 0 cost for an active promo — should resolve to 0.0
    # multiplier (free), not be rejected as it was prior to the gate change.
    discovered = probe_promotion_discounts(
        {"happyhorse-1.0": True},
        estimate_fn=lambda quality, duration, model: 0,
    )
    assert discovered == {"happyhorse-1.0": 0.0}


def test_probe_promotion_discounts_ignores_full_price():
    # actual == base => not a discount, must not show up.
    discovered = probe_promotion_discounts(
        {"happyhorse-1.0": True},
        estimate_fn=lambda quality, duration, model: 1_000_000,
    )
    assert discovered == {}


def _make_account(metadata=None):
    return SimpleNamespace(provider_metadata=metadata)


@patch("sqlalchemy.orm.attributes.flag_modified")
def test_apply_promotions_to_metadata_writes_both_fields(_flag_modified):
    account = _make_account({"existing": "value"})
    credits = {
        "web": 100,
        "promotions": {"v6": True, "happyhorse-1.0": True},
        "promotion_discounts": {"v6": 0.7, "happyhorse-1.0": 0.0},
    }
    modified = apply_promotions_to_metadata(account, credits)
    assert modified is True
    assert account.provider_metadata["existing"] == "value"
    assert account.provider_metadata["promotions"] == {"v6": True, "happyhorse-1.0": True}
    assert account.provider_metadata["promotion_discounts"] == {"v6": 0.7, "happyhorse-1.0": 0.0}


@patch("sqlalchemy.orm.attributes.flag_modified")
def test_apply_promotions_to_metadata_no_promotions_is_noop(_flag_modified):
    account = _make_account({"existing": "value"})
    modified = apply_promotions_to_metadata(account, {"web": 100})
    assert modified is False
    assert account.provider_metadata == {"existing": "value"}


@patch("sqlalchemy.orm.attributes.flag_modified")
def test_apply_promotions_to_metadata_handles_none_metadata(_flag_modified):
    account = _make_account(None)
    credits = {"promotions": {"v6": True}}
    modified = apply_promotions_to_metadata(account, credits)
    assert modified is True
    assert account.provider_metadata == {"promotions": {"v6": True}}
