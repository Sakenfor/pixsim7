"""
Pixverse session and cache management

Handles session building, caching, and credential persistence.
"""
from typing import Dict, Any
from pixsim_logging import get_logger
from pixsim7.backend.main.domain import ProviderAccount

logger = get_logger()


class PixverseSessionMixin:
    """Mixin for Pixverse session and cache management"""

    def _evict_account_cache(self, account: ProviderAccount) -> None:
        """Remove cached API/client entries for account (e.g., session invalidated)."""
        account_id = account.id
        if account_id is None:
            return

        client_keys = [key for key in self._client_cache.keys() if key[0] == account_id]
        for key in client_keys:
            logger.debug('Evicting PixverseClient cache for account %s (key=%s)', account_id, key)
            self._client_cache.pop(key, None)

        api_keys = [key for key in self._api_cache.keys() if key[0] == account_id]
        for key in api_keys:
            logger.debug('Evicting PixverseAPI cache for account %s (key=%s)', account_id, key)
            self._api_cache.pop(key, None)

    def _build_web_session(self, account: ProviderAccount) -> Dict[str, Any]:
        """Backward-compatible wrapper that delegates to PixverseSessionManager."""
        session = self.session_manager.build_session(account)
        result: Dict[str, Any] = {
            "jwt_token": session.get("jwt_token"),
            "cookies": session.get("cookies", {}),
        }
        if "openapi_key" in session:
            result["openapi_key"] = session["openapi_key"]
        return result

    async def _persist_if_credentials_changed(
        self,
        account: ProviderAccount,
        *,
        previous_jwt: str | None,
        previous_cookies: Dict[str, Any] | None,
    ) -> None:
        """Persist and clear caches when JWT/cookies mutate in-memory.

        Some helper methods (like :py:meth:`_build_web_session`) update the
        account instance opportunistically—for example, swapping in a fresher
        JWT from cookies. Downstream callers should invoke this helper after
        session construction to avoid leaving updated credentials only in
        memory (which would cause cache mismatches and stale DB rows).
        """

        cookies_changed = (account.cookies or {}) != (previous_cookies or {})
        jwt_changed = account.jwt_token != previous_jwt

        if not (cookies_changed or jwt_changed):
            return

        self._evict_account_cache(account)
        await self._persist_account_credentials(account)

    def _create_client(
        self,
        account: ProviderAccount,
        use_method: str | None = None
    ) -> Any:
        """
        Create Pixverse client from provider account

        Args:
            account: Provider account with credentials
            use_method: Optional API method override (web-api, open-api, auto)

        Returns:
            Configured PixverseClient
        """
        try:
            from pixverse import PixverseClient  # type: ignore
        except ImportError:  # pragma: no cover
            PixverseClient = None  # type: ignore

        if not PixverseClient:
            raise Exception('pixverse-py not installed')

        session_data = self.session_manager.build_session(account)
        session: Dict[str, Any] = {
            "jwt_token": session_data.get("jwt_token"),
            "cookies": session_data.get("cookies", {}),
            "api_key": account.api_key,
        }

        # Include OpenAPI key if available (extracted by session_manager)
        if "openapi_key" in session_data:
            session["openapi_key"] = session_data["openapi_key"]

        # Add use_method if specified
        if use_method:
            session["use_method"] = use_method

        jwt_prefix = (account.jwt_token or '')[:20] if account.jwt_token else ''
        cache_key = (
            account.id,
            use_method or 'auto',
            jwt_prefix,
        )

        if cache_key in self._client_cache:
            logger.debug('Reusing cached PixverseClient for account %s', account.id)
            return self._client_cache[cache_key]

        client = PixverseClient(
            email=account.email,
            session=session
        )
        self._client_cache[cache_key] = client
        return client

    def _create_client_from_session(
        self,
        session_data: "PixverseSessionData",
        account: ProviderAccount,
        use_method: str | None = None
    ) -> Any:
        """
        Create Pixverse client from session data (for use with run_with_session)

        Args:
            session_data: Session data dict (jwt_token, cookies, etc.)
            account: Provider account (for email and api_key)
            use_method: Optional API method override (web-api, open-api, auto)

        Returns:
            Configured PixverseClient
        """
        try:
            from pixverse import PixverseClient  # type: ignore
        except ImportError:  # pragma: no cover
            PixverseClient = None  # type: ignore

        if not PixverseClient:
            raise Exception('pixverse-py not installed')

        session: Dict[str, Any] = {
            "jwt_token": session_data.get("jwt_token"),
            "cookies": session_data.get("cookies", {}),
            "api_key": account.api_key,
        }

        # Include OpenAPI key if available
        if "openapi_key" in session_data:
            session["openapi_key"] = session_data["openapi_key"]

        # Add use_method if specified
        if use_method:
            session["use_method"] = use_method

        # Note: We don't cache here because run_with_session may refresh credentials
        # and we want to use the latest session data on retry
        client = PixverseClient(
            email=account.email,
            session=session
        )
        return client

    def _get_cached_api(self, account: ProviderAccount) -> Any:
        """
        Get cached PixverseAPI instance for account to reuse session.

        This prevents creating new sessions on every API call, which causes
        Pixverse error 10005 ("logged in elsewhere").

        Args:
            account: Provider account

        Returns:
            Cached or new PixverseAPI instance
        """
        try:
            from pixverse.api.client import PixverseAPI  # type: ignore
        except ImportError:  # pragma: no cover
            PixverseAPI = None  # type: ignore

        if not PixverseAPI:
            raise Exception('pixverse-py not installed')

        # Create cache key from account ID and JWT prefix
        jwt_prefix = (account.jwt_token or '')[:20] if account.jwt_token else ''
        cache_key = (account.id, jwt_prefix)

        # Return cached API if exists and JWT hasn't changed
        if cache_key in self._api_cache:
            logger.debug(f'Reusing cached PixverseAPI for account {account.id}')
            return self._api_cache[cache_key]

        # Create new API instance and cache it
        logger.debug(f'Creating new PixverseAPI for account {account.id}')
        api = PixverseAPI()
        self._api_cache[cache_key] = api
        return api

    async def _persist_account_credentials(
        self,
        account: ProviderAccount,
        *,
        force_commit: bool = False,
    ) -> None:
        """Persist refreshed credentials to the bound session if available.

        Note: force_commit is only supported for sync sessions. For async sessions
        (AsyncSession), we can only flush - the caller must handle commits.
        """
        try:
            from sqlalchemy.orm import object_session
            from sqlalchemy.ext.asyncio import AsyncSession

            session = object_session(account)
            if not session:
                logger.debug(
                    "pixverse_skip_persist_no_session",
                    account_id=account.id,
                )
                return

            # Check if this is an async session - we can't do sync operations on it
            is_async_session = isinstance(session, AsyncSession)

            # Mark as dirty if needed
            if session.is_modified(account):
                session.add(account)

            if force_commit:
                if is_async_session:
                    # For async sessions, we cannot commit from here - the session
                    # requires greenlet context. Log a warning and skip.
                    # The changes are already on the account object and will be
                    # persisted when the outer transaction commits.
                    logger.warning(
                        "pixverse_persist_skip_async_commit",
                        account_id=account.id,
                        has_jwt=bool(account.jwt_token),
                        has_cookies=bool(account.cookies),
                        reason="async_session_cannot_force_commit",
                    )
                    # Try to flush at least (marks changes for commit)
                    try:
                        await session.flush()
                        logger.debug(
                            "pixverse_persist_async_flushed",
                            account_id=account.id,
                        )
                    except Exception as flush_err:
                        logger.warning(
                            "pixverse_persist_async_flush_failed",
                            account_id=account.id,
                            error=str(flush_err),
                        )
                else:
                    # Sync session - can commit directly
                    logger.debug(
                        "pixverse_persist_sync_commit",
                        account_id=account.id,
                        has_jwt=bool(account.jwt_token),
                        has_cookies=bool(account.cookies),
                    )
                    session.commit()
                    logger.debug(
                        "pixverse_persist_done",
                        account_id=account.id,
                    )
            else:
                # Just flush
                logger.debug(
                    "pixverse_persist_flush",
                    account_id=account.id,
                    has_jwt=bool(account.jwt_token),
                    has_cookies=bool(account.cookies),
                )
                if is_async_session:
                    await session.flush()
                else:
                    session.flush()

        except Exception as e:  # pragma: no cover - defensive
            logger.error(
                "pixverse_persist_failed",
                account_id=account.id,
                error=str(e),
                error_type=type(e).__name__,
                exc_info=True,
            )
            # For async sessions, try to rollback to avoid session corruption
            try:
                from sqlalchemy.ext.asyncio import AsyncSession
                session = object_session(account)
                if session and isinstance(session, AsyncSession):
                    await session.rollback()
                    logger.debug(
                        "pixverse_persist_rollback_after_error",
                        account_id=account.id,
                    )
            except Exception:
                pass  # Best effort rollback
