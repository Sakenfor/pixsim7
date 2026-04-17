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

