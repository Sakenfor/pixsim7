from __future__ import annotations

from typing import Any, Awaitable, Callable, Dict, TypeVar, Union

from pixsim7.backend.main.domain.providers import ProviderAccount
from pixsim7.backend.main.domain.provider_auth import (
    PixverseAuthMethod,
    PixverseSessionData,
    SessionErrorOutcome,
)
from pixsim7.backend.main.shared.jwt_utils import extract_jwt_from_cookies, needs_refresh
from pixsim_logging import get_logger


logger = get_logger()

T = TypeVar("T")


class PixverseSessionManager:
    """Centralized session management for the Pixverse provider."""

    def __init__(self, provider: "PixverseProvider") -> None:
        self.provider = provider

    def build_session(self, account: ProviderAccount) -> PixverseSessionData:
        """Build a unified session dict from account credentials."""
        auth_method = PixverseAuthMethod.from_metadata(
            getattr(account, "provider_metadata", None) or {}
        )
        jwt_token = account.jwt_token
        jwt_source = "account"

        if needs_refresh(jwt_token, hours_threshold=12) and account.cookies:
            cookie_token = extract_jwt_from_cookies(account.cookies or {})
            if cookie_token:
                jwt_token = cookie_token
                jwt_source = "cookies"

        if jwt_token and jwt_token != account.jwt_token:
            account.jwt_token = jwt_token

        session: PixverseSessionData = {
            "jwt_token": jwt_token,
            "cookies": account.cookies or {},
            "jwt_source": jwt_source,
            "auth_method": auth_method.value,
        }

        api_keys = getattr(account, "api_keys", None) or []
        for entry in api_keys:
            if isinstance(entry, dict) and entry.get("kind") == "openapi" and entry.get("value"):
                session["openapi_key"] = entry["value"]
                break

        # Check for shared session IDs (for session sharing with browser)
        cookies = account.cookies or {}
        has_shared_trace_id = bool(cookies.get("_pxs7_trace_id"))
        has_shared_anonymous_id = bool(cookies.get("_pxs7_anonymous_id"))

        logger.debug(
            "pixverse_build_session",
            account_id=account.id,
            jwt_source=jwt_source,
            auth_method=auth_method.value,
            has_cookies=bool(account.cookies),
            has_openapi_key="openapi_key" in session,
            has_shared_trace_id=has_shared_trace_id,
            has_shared_anonymous_id=has_shared_anonymous_id,
        )

        if has_shared_trace_id or has_shared_anonymous_id:
            logger.info(
                "pixverse_using_shared_session_ids",
                account_id=account.id,
                has_trace_id=has_shared_trace_id,
                has_anonymous_id=has_shared_anonymous_id,
            )

        return session

    async def run_with_session(
        self,
        *,
        account: ProviderAccount,
        op_name: str,
        operation: Callable[[PixverseSessionData], Awaitable[T]],
        retry_on_session_error: bool = True,
    ) -> T:
        """Execute a Pixverse operation with session handling and optional auto-reauth."""
        # First attempt
        session = self.build_session(account)
        previous_jwt = account.jwt_token
        previous_cookies = account.cookies
        await self.provider._persist_if_credentials_changed(
            account,
            previous_jwt=previous_jwt,
            previous_cookies=previous_cookies,
        )

        try:
            return await operation(session)
        except Exception as exc:
            outcome = self.classify_error(exc, context=op_name)

            if outcome.should_invalidate_cache:
                self._invalidate_cache(account, outcome)

            if not (
                retry_on_session_error
                and outcome.should_attempt_reauth
                and outcome.is_session_error
            ):
                # Rollback before raising to clean up session state
                await self._rollback_db_session(account)
                if outcome.is_session_error:
                    raise outcome.original_error or exc
                raise exc

            reauth_success = await self._maybe_auto_reauth(account, outcome, context=op_name)
            if not reauth_success:
                # Rollback before raising - auto_reauth already rolled back,
                # but do it again to be safe
                await self._rollback_db_session(account)
                raise outcome.original_error or exc

        # Second (and final) attempt after successful re-auth
        logger.info(
            "pixverse_session_retry_after_reauth",
            account_id=account.id,
            context=op_name,
        )
        session = self.build_session(account)
        previous_jwt = account.jwt_token
        previous_cookies = account.cookies
        await self.provider._persist_if_credentials_changed(
            account,
            previous_jwt=previous_jwt,
            previous_cookies=previous_cookies,
        )
        result = await operation(session)
        logger.info(
            "pixverse_session_retry_success",
            account_id=account.id,
            context=op_name,
        )
        return result

    async def _rollback_db_session(self, account: ProviderAccount) -> None:
        """Rollback the database session to clean state."""
        try:
            from sqlalchemy.orm import object_session
            from sqlalchemy.ext.asyncio import AsyncSession

            db_session = object_session(account)
            if db_session and isinstance(db_session, AsyncSession):
                await db_session.rollback()
                logger.debug(
                    "pixverse_db_session_rollback",
                    account_id=account.id,
                )
        except Exception as e:
            logger.warning(
                "pixverse_db_session_rollback_failed",
                account_id=account.id,
                error=str(e),
            )

    def classify_error(
        self,
        error: Union[Exception, Dict[str, Any]],
        context: str,
    ) -> SessionErrorOutcome:
        """Classify errors from SDK exceptions or JSON responses."""
        if isinstance(error, Exception):
            return self._classify_exception(error, context)
        if isinstance(error, dict):
            return self._classify_json_error(error, context)

        logger.warning(
            "pixverse_session_error_detected",
            context=context,
            error_code=None,
            error_reason="unknown_error_type",
        )
        return SessionErrorOutcome.non_session_error(Exception(str(error)))

    def _classify_exception(self, error: Exception, context: str) -> SessionErrorOutcome:
        msg = str(error).lower()

        if "logged in elsewhere" in msg or "10005" in msg:
            outcome = SessionErrorOutcome(
                should_invalidate_cache=True,
                should_attempt_reauth=True,
                error_code="10005",
                error_reason="logged_elsewhere",
                is_session_error=True,
                original_error=error,
            )
        elif "user is not login" in msg or "10003" in msg:
            outcome = SessionErrorOutcome(
                should_invalidate_cache=True,
                should_attempt_reauth=True,
                error_code="10003",
                error_reason="user_not_login",
                is_session_error=True,
                original_error=error,
            )
        elif "token is expired" in msg or "10002" in msg:
            outcome = SessionErrorOutcome(
                should_invalidate_cache=True,
                should_attempt_reauth=True,
                error_code="10002",
                error_reason="token_expired",
                is_session_error=True,
                original_error=error,
            )
        elif "session expired" in msg:
            outcome = SessionErrorOutcome(
                should_invalidate_cache=True,
                should_attempt_reauth=True,
                error_code=None,
                error_reason="session_expired",
                is_session_error=True,
                original_error=error,
            )
        else:
            outcome = SessionErrorOutcome.non_session_error(error)

        if outcome.is_session_error:
            logger.warning(
                "pixverse_session_error_detected",
                context=context,
                error_code=outcome.error_code,
                error_reason=outcome.error_reason,
            )

        return outcome

    def _classify_json_error(self, data: Dict[str, Any], context: str) -> SessionErrorOutcome:
        err_code = data.get("ErrCode")
        if err_code in (10003, 10005):
            reason = "user_not_login" if err_code == 10003 else "logged_elsewhere"
            outcome = SessionErrorOutcome(
                should_invalidate_cache=True,
                should_attempt_reauth=True,
                error_code=str(err_code),
                error_reason=reason,
                is_session_error=True,
                original_error=None,
            )
            logger.warning(
                "pixverse_session_error_detected",
                context=context,
                error_code=outcome.error_code,
                error_reason=outcome.error_reason,
            )
            return outcome

        return SessionErrorOutcome(
            should_invalidate_cache=False,
            should_attempt_reauth=False,
            error_code=str(err_code) if err_code is not None else None,
            error_reason="api_error",
            is_session_error=False,
            original_error=None,
        )

    def _invalidate_cache(self, account: ProviderAccount, outcome: SessionErrorOutcome) -> None:
        logger.warning(
            "pixverse_session_invalidated",
            account_id=account.id,
            reason=outcome.error_reason,
            error_code=outcome.error_code,
        )
        self.provider._evict_account_cache(account)

    async def _maybe_auto_reauth(
        self,
        account: ProviderAccount,
        outcome: SessionErrorOutcome,
        context: str,
    ) -> bool:
        if not outcome.should_attempt_reauth:
            logger.debug(
                "pixverse_auto_reauth_skipped",
                account_id=account.id,
                reason="outcome_says_no",
                context=context,
            )
            return False

        auth_method = PixverseAuthMethod.from_metadata(
            getattr(account, "provider_metadata", None) or {}
        )
        if not auth_method.allows_password_reauth():
            logger.info(
                "pixverse_auto_reauth_skipped",
                account_id=account.id,
                auth_method=auth_method.value,
                reason="auth_method_incompatible",
                context=context,
            )
            return False

        try:
            from pixsim7.backend.main.api.v1.providers import _load_provider_settings as load_settings
        except Exception:  # pragma: no cover - defensive
            logger.info(
                "pixverse_auto_reauth_skipped",
                account_id=account.id,
                auth_method=auth_method.value,
                reason="settings_unavailable",
                context=context,
            )
            return False

        settings_map = load_settings()
        provider_settings = settings_map.get(self.provider.provider_id) if settings_map else None
        if not provider_settings or not getattr(provider_settings, "auto_reauth_enabled", False):
            logger.info(
                "pixverse_auto_reauth_skipped",
                account_id=account.id,
                auth_method=auth_method.value,
                reason="disabled_in_settings",
                context=context,
            )
            return False

        # Require either a per-account password or a global provider password
        # before attempting password-based auto-reauth. For OAuth-only accounts,
        # we expect password to be cleared and auth_method set to GOOGLE, so
        # they will have been skipped above.
        has_account_password = bool(getattr(account, "password", None))
        has_global_password = bool(getattr(provider_settings, "global_password", None))
        if not (has_account_password or has_global_password):
            logger.info(
                "pixverse_auto_reauth_skipped",
                account_id=account.id,
                auth_method=auth_method.value,
                reason="no_password_available",
                context=context,
            )
            return False

        logger.info(
            "pixverse_auto_reauth_attempt",
            account_id=account.id,
            auth_method=auth_method.value,
            error_code=outcome.error_code,
            error_reason=outcome.error_reason,
            context=context,
        )

        success = await self.provider._try_auto_reauth(account)

        logger.info(
            "pixverse_auto_reauth_completed",
            account_id=account.id,
            success=success,
            context=context,
        )

        return success
