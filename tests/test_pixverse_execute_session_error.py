import types

import pytest

from pixsim7.backend.main.domain import OperationType, ProviderAccount
from pixsim7.backend.main.services.provider.adapters.pixverse import PixverseProvider
from pixsim7.backend.main.services.provider.base import ProviderError


@pytest.mark.asyncio
async def test_execute_session_error_evicts_cache(monkeypatch):
  """
  When a generation call encounters a Pixverse session error (e.g. user_not_login),
  execute() should evict the account's client/API cache and re-raise a ProviderError.
  """
  provider = PixverseProvider()

  account = ProviderAccount(
      id=1,
      user_id=None,
      provider_id="pixverse",
      email="user@example.com",
  )

  # Prepopulate caches to verify that _evict_account_cache is invoked.
  provider._client_cache[(account.id, "auto", "prefix")] = object()
  provider._api_cache[(account.id, "prefix")] = object()

  # Avoid importing/using the real pixverse-py client.
  monkeypatch.setattr(
      PixverseProvider,
      "_create_client",
      lambda self, account_obj, use_method=None: object(),
  )

  async def _fake_generate_text_to_video(self, client, params):
      # Simulate a Pixverse session error from the SDK.
      raise Exception("user is not login, error 10003")

  monkeypatch.setattr(
      PixverseProvider,
      "_generate_text_to_video",
      _fake_generate_text_to_video,
  )

  # execute() should surface a ProviderError after classifying the session error.
  with pytest.raises(ProviderError):
      await provider.execute(
          OperationType.TEXT_TO_VIDEO,
          account,
          {"prompt": "test prompt"},
      )

  # After a session error, the account-specific cache entries should be evicted.
  assert all(key[0] != account.id for key in provider._client_cache.keys())
  assert all(key[0] != account.id for key in provider._api_cache.keys())

