from pixsim7.backend.main.services.provider.adapters.pixverse_promotions import (
    extract_pixverse_promotions,
    normalize_pixverse_promotions,
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
