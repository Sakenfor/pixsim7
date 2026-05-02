import pytest

from pixverse.api.credits import CreditsOperations
from pixverse.models import Account


class _DummyClient:
    def __init__(self, response):
        self._response = response

    async def _request(self, *args, **kwargs):
        return self._response


@pytest.fixture
def web_account():
    return Account(
        email="test@example.com",
        password="pw",
        session={"jwt_token": "jwt"},
    )


@pytest.mark.asyncio
async def test_get_plan_details_normalizes_string_gen_simultaneously(web_account):
    ops = CreditsOperations(
        _DummyClient(
            {
                "ErrCode": 0,
                "Resp": {
                    "plan_name": "Pro",
                    "current_plan_type": 2,
                    "gen_simultaneously": "5",
                },
            }
        )
    )

    result = await ops.get_plan_details(web_account)

    assert result["gen_simultaneously"] == 5
    assert result["max_concurrent_jobs"] == 5


@pytest.mark.asyncio
async def test_get_plan_details_falls_back_to_plan_type_for_max_concurrent(web_account):
    ops = CreditsOperations(
        _DummyClient(
            {
                "ErrCode": 0,
                "Resp": {
                    "plan_name": "Basic",
                    "current_plan_type": 0,
                    "gen_simultaneously": "",
                },
            }
        )
    )

    result = await ops.get_plan_details(web_account)

    assert result["max_concurrent_jobs"] == 2


@pytest.mark.asyncio
async def test_get_user_info_adds_normalized_max_concurrent_jobs(web_account):
    ops = CreditsOperations(
        _DummyClient(
            {
                "ErrCode": 0,
                "Resp": {
                    "Mail": "user@example.com",
                    "Username": "user1",
                    "gen_simultaneously": "3",
                },
            }
        )
    )

    result = await ops.get_user_info(web_account)

    assert result["Mail"] == "user@example.com"
    assert result["max_concurrent_jobs"] == 3


@pytest.mark.asyncio
async def test_get_credits_passes_through_all_legacy_promo_flags(web_account):
    """Pre-fix: SDK hardcoded ``is_v6_discount`` + ``is_story_discount`` only,
    silently dropping any other ``is_*_discount`` / ``is_*_promo`` flags. Post-
    fix: pass through anything matching the shape so the backend (with full
    UI/registry context) is the only place that decides what to surface vs
    categorize as feature-flag noise.
    """
    ops = CreditsOperations(
        _DummyClient(
            {
                "ErrCode": 0,
                "Resp": {
                    "credit_daily": 0,
                    "credit_monthly": 0,
                    "credit_package": 0,
                    "is_v6_discount": False,
                    "is_story_discount": True,
                    "is_pro_free_generation_promo": True,
                    "is_invite_discount": True,
                    # Non-matching keys must NOT leak into promotions
                    "some_other_field": "value",
                    "remainingCredits": 100,
                },
            }
        )
    )

    result = await ops.get_credits(web_account)

    assert result["promotions"] == {
        "is_v6_discount": False,
        "is_story_discount": True,
        "is_pro_free_generation_promo": True,
        "is_invite_discount": True,
    }
    assert "some_other_field" not in result["promotions"]


@pytest.mark.asyncio
async def test_get_credits_passes_through_promotion_discounts_field(web_account):
    """The newer model-id-keyed ``promotion_discounts`` shape must reach the
    backend verbatim — pre-fix the SDK silently dropped it, making
    ``happyhorse-1.0`` and any future model promo invisible to consumers.
    """
    ops = CreditsOperations(
        _DummyClient(
            {
                "ErrCode": 0,
                "Resp": {
                    "credit_daily": 0,
                    "credit_monthly": 0,
                    "credit_package": 0,
                    "promotion_discounts": {"happyhorse-1.0": True},
                },
            }
        )
    )

    result = await ops.get_credits(web_account)

    assert result["promotion_discounts"] == {"happyhorse-1.0": True}


@pytest.mark.asyncio
async def test_get_credits_omits_promotions_when_no_active_flags(web_account):
    """No promo fields → no ``promotions`` key (don't pollute the result)."""
    ops = CreditsOperations(
        _DummyClient(
            {
                "ErrCode": 0,
                "Resp": {
                    "credit_daily": 5,
                    "credit_monthly": 0,
                    "credit_package": 0,
                },
            }
        )
    )

    result = await ops.get_credits(web_account)

    assert "promotions" not in result
    assert "promotion_discounts" not in result

