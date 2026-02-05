from __future__ import annotations

from pixsim7.backend.main.shared.asset_refs import extract_asset_id, extract_asset_ref
from pixsim7.backend.main.shared.schemas.entity_ref import EntityRef
from pixsim7.backend.main.services.provider.adapters.pixverse_url_resolver import normalize_url


def test_extract_asset_id_variants() -> None:
    assert extract_asset_id(123) == 123
    assert extract_asset_id("asset:123") == 123
    assert extract_asset_id("asset_123") == 123
    assert extract_asset_id("123") == 123
    assert extract_asset_id("  123  ") == 123
    assert extract_asset_id({"type": "asset", "id": 456}) == 456
    assert extract_asset_id({"asset_id": "789"}) == 789
    assert extract_asset_id({"assetId": "12"}) == 12
    assert extract_asset_id({"id": "34"}) == 34
    assert extract_asset_id({"asset": "asset:98"}) == 98
    assert extract_asset_id("https://example.com/assets/55") is None


def test_extract_asset_id_disallow_numeric() -> None:
    assert extract_asset_id("123", allow_numeric_string=False) is None
    assert extract_asset_id("asset:123", allow_numeric_string=False) == 123


def test_extract_asset_ref_entity_ref() -> None:
    ref = EntityRef(type="asset", id=88)
    assert extract_asset_id(ref) == 88
    assert extract_asset_ref(ref) == "asset:88"


def test_extract_asset_ref_urls() -> None:
    url = "https://example.com/foo"
    assert extract_asset_ref(url) == url
    assert extract_asset_ref(url, allow_url_asset_id=True) == url


def test_extract_asset_ref_url_asset_id() -> None:
    url = "https://example.com/assets/42"
    assert extract_asset_ref(url, allow_url_asset_id=True) == "asset:42"
    assert extract_asset_ref(url) == url

    url_with_query = "https://example.com/foo?asset_id=77"
    assert extract_asset_ref(url_with_query, allow_url_asset_id=True) == "asset:77"


def test_normalize_url_pixverse_paths() -> None:
    assert normalize_url("pixverse/i2i/ori/foo.jpg") == (
        "https://media.pixverse.ai/pixverse/i2i/ori/foo.jpg"
    )
    assert normalize_url("openapi/abc.jpg") == "https://media.pixverse.ai/openapi/abc.jpg"
    assert normalize_url("media.pixverse.ai/openapi/abc.jpg") == (
        "https://media.pixverse.ai/openapi/abc.jpg"
    )


def test_normalize_url_case_and_query() -> None:
    url = "HTTPS://Media.Pixverse.AI/openapi/abc.jpg?x=1"
    assert normalize_url(url) == "https://media.pixverse.ai/openapi/abc.jpg?x=1"
