"""
Pixverse authentication and account management

Handles user info extraction, auto re-auth, and account data extraction.
"""
import json
import base64
import asyncio
import uuid as uuid_mod
from typing import Dict, Any
from pixsim_logging import get_logger
from pixsim7.backend.main.domain.providers import ProviderAccount
from pixsim7.backend.main.domain.provider_auth import PixverseAuthMethod
from pixsim7.backend.main.services.provider.provider_logging import (
    log_provider_error,
)

logger = get_logger()


class PixverseAuthMixin:
    """Mixin for Pixverse authentication operations"""

    async def _persist_oauth_only_account_state(self, account: ProviderAccount) -> bool:
        """
        Persist OAuth-only account markers in an isolated transaction.

        Auto-reauth failures trigger session rollbacks in the caller's DB session.
        Persisting via a separate session ensures the OAuth-only flags survive that
        rollback and prevent repeated password reauth attempts.
        """
        account_id = getattr(account, "id", None)
        if account_id is None:
            return False

        try:
            from pixsim7.backend.main.infrastructure.database.session import AsyncSessionLocal
            from pixsim7.backend.main.domain.providers import ProviderAccount as ProviderAccountModel

            async with AsyncSessionLocal() as isolated_session:
                stored = await isolated_session.get(ProviderAccountModel, account_id)
                if not stored:
                    logger.warning(
                        "pixverse_oauth_only_persist_missing_account",
                        account_id=account_id,
                    )
                    return False

                merged_meta = dict(getattr(stored, "provider_metadata", None) or {})
                merged_meta.update(getattr(account, "provider_metadata", None) or {})
                merged_meta["auth_method"] = PixverseAuthMethod.GOOGLE.value

                stored.provider_metadata = merged_meta
                stored.password = None
                await isolated_session.commit()

                logger.info(
                    "pixverse_oauth_only_persisted",
                    account_id=account_id,
                    auth_method=PixverseAuthMethod.GOOGLE.value,
                )
                return True
        except Exception as persist_exc:
            logger.warning(
                "pixverse_oauth_only_persist_failed",
                account_id=account_id,
                error=str(persist_exc),
            )
            return False

    async def get_user_info(self, jwt_token: str, cookies: dict = None) -> dict:
        """
        Get user info from Pixverse API (like pixsim6)

        Uses pixverse-py library's getUserInfo API endpoint.

        Args:
            jwt_token: Pixverse JWT token

          Returns:
              {
                  'email': str,
                  'username': str,
                  'nickname': str,
                  'account_id': str,
                  'raw_data': dict,  # Full getUserInfo response
              }

        Raises:
            Exception: If API call fails
        """
        # Guard imports so adapter remains loadable without optional SDK pieces
        try:
            from pixverse import Account  # type: ignore
        except ImportError:  # pragma: no cover
            Account = None  # type: ignore
        try:
            from pixverse.api.client import PixverseAPI  # type: ignore
        except ImportError:  # pragma: no cover
            PixverseAPI = None  # type: ignore

        # Create temporary account to call getUserInfo (like pixsim6)
        session_data = {"jwt_token": jwt_token}
        if cookies:
            session_data["cookies"] = cookies
        temp_account = Account(
            email="temp@pixverse.ai",  # Doesn't matter, just for API call
            session=session_data
        )

        user_info_data = {}
        if PixverseAPI and Account and temp_account:
            try:
                # Note: Can't use cached API here as we don't have full account object, just JWT
                api = PixverseAPI()
                user_info_data = await api.get_user_info(temp_account)
            except Exception as e:  # pragma: no cover - defensive fallback
                # Check if this is a session error (expected when account not active)
                err_str = str(e).lower()
                is_session_error = "10005" in err_str or "10003" in err_str or "logged in elsewhere" in err_str or "not login" in err_str

                # Only log at warning for non-session errors; session errors are expected
                # when checking multiple accounts but only one is active in browser
                if not is_session_error:
                    log_provider_error(
                        provider_id="pixverse",
                        operation="get_user_info",
                        stage="provider:status",
                        account_id=None,
                        email=None,
                        error=str(e),
                        error_type=e.__class__.__name__,
                        severity="warning",
                    )
                    logger.warning(f"PixverseAPI get_user_info failed: {e}")
                else:
                    logger.debug(f"PixverseAPI get_user_info session error (expected): {e}")
                user_info_data = {}

        # Extract user details from the flat response (no "Resp" wrapper)
        # pixverse-py library already unwraps the Resp, so we get flat dict
        email = user_info_data.get("Mail")  # Real email like "holyfruit19@hotmail.com"
        username = user_info_data.get("Username")  # Username like "holyfruit19"
        nickname = user_info_data.get("Nickname") or username
        acc_id = user_info_data.get("AccId") or user_info_data.get("AccountId")

        # Allow username as fallback if email is missing
        if not email and not username:
            raise Exception("Email and Username not found in getUserInfo response")

        # Use username as email if email is missing
        if not email and username:
            email = username

        return {
            'email': email,
            'username': username,
            'nickname': nickname,
            'account_id': str(acc_id) if acc_id else None,
            'raw_data': user_info_data,  # Save entire response
        }


    async def _try_auto_reauth(self, account: ProviderAccount) -> bool:
        """Attempt password-based auto-reauth for Pixverse accounts."""
        from pixsim7.backend.main.services.provider.pixverse_auth_service import PixverseAuthService
        from pixsim7.backend.main.api.v1.providers import _load_provider_settings

        auth_method = PixverseAuthMethod.from_metadata(
            getattr(account, "provider_metadata", None) or {}
        )
        if not auth_method.allows_password_reauth():
            logger.info(
                "pixverse_auto_reauth_skipped",
                account_id=account.id,
                auth_method=auth_method.value,
                reason="incompatible_auth_method",
            )
            return False

        settings = _load_provider_settings()
        provider_settings = settings.get(self.provider_id) if settings else None
        if not provider_settings or not provider_settings.auto_reauth_enabled:
            logger.info(
                "pixverse_auto_reauth_skipped",
                account_id=account.id,
                auth_method=auth_method.value,
                reason="disabled_in_settings",
            )
            return False

        password = account.password or (provider_settings.global_password if provider_settings else None)
        if not password:
            logger.info(
                "pixverse_auto_reauth_failed",
                account_id=account.id,
                reason="no_password",
            )
            return False

        try:
            logger.info(
                "pixverse_auto_reauth_api_login_starting",
                account_id=account.id,
                email=account.email,
            )

            # Use lightweight API-only login (no browser automation)
            async with PixverseAuthService() as auth_service:
                session_data = await auth_service.login_with_password(
                    account.email,
                    password,
                    use_browser_fallback=False,  # Fast: Direct API only
                )

            logger.info(
                "pixverse_auto_reauth_api_login_completed",
                account_id=account.id,
            )

            try:
                # Use existing account email as fallback since getUserInfo might fail with new session
                extracted = await self.extract_account_data(
                    session_data,
                    fallback_email=account.email
                )
                logger.debug(
                    "pixverse_auto_reauth_extract_completed",
                    account_id=account.id,
                    has_jwt=bool(extracted.get("jwt_token")),
                    has_cookies=bool(extracted.get("cookies")),
                )
            except Exception as extract_exc:
                logger.error(
                    "pixverse_auto_reauth_extract_failed",
                    account_id=account.id,
                    error=str(extract_exc),
                    exc_info=True,
                )
                raise

            logger.debug(
                "pixverse_auto_reauth_updating_credentials",
                account_id=account.id,
            )

            meta = extracted.get("provider_metadata") or {}
            meta["auth_method"] = PixverseAuthMethod.PASSWORD.value
            extracted["provider_metadata"] = meta

            if extracted.get("jwt_token"):
                account.jwt_token = extracted["jwt_token"]
            if extracted.get("cookies"):
                # Preserve session sharing IDs from old cookies during reauth
                # These allow backend to appear as same session as browser
                old_cookies = account.cookies or {}
                new_cookies = extracted["cookies"]
                for session_id_key in ("_pxs7_trace_id", "_pxs7_anonymous_id"):
                    if old_cookies.get(session_id_key) and session_id_key not in new_cookies:
                        new_cookies[session_id_key] = old_cookies[session_id_key]
                        logger.debug(
                            "pixverse_auto_reauth_preserving_session_id",
                            account_id=account.id,
                            key=session_id_key,
                        )
                # If no session IDs exist (e.g., password-only account), generate stable ones
                # to avoid "logged in elsewhere" errors from random IDs on each request
                if "_pxs7_trace_id" not in new_cookies:
                    new_cookies["_pxs7_trace_id"] = str(uuid_mod.uuid4())
                    logger.debug(
                        "pixverse_auto_reauth_generated_session_id",
                        account_id=account.id,
                        key="_pxs7_trace_id",
                    )
                if "_pxs7_anonymous_id" not in new_cookies:
                    new_cookies["_pxs7_anonymous_id"] = str(uuid_mod.uuid4())
                    logger.debug(
                        "pixverse_auto_reauth_generated_session_id",
                        account_id=account.id,
                        key="_pxs7_anonymous_id",
                    )
                account.cookies = new_cookies
            account.provider_metadata = meta

            logger.debug(
                "pixverse_auto_reauth_credentials_updated",
                account_id=account.id,
            )

            # Skip persisting here - let the caller (run_with_session) handle it
            # to avoid double-persist which can cause session detachment issues
            logger.debug(
                "pixverse_auto_reauth_skip_persist_defer_to_caller",
                account_id=account.id,
                has_jwt=bool(account.jwt_token),
                has_cookies=bool(account.cookies),
            )

            self._evict_account_cache(account)

            logger.info(
                "pixverse_auto_reauth_success",
                account_id=account.id,
                auth_method=PixverseAuthMethod.PASSWORD.value,
            )
            return True
        except Exception as exc:
            msg = str(exc).lower()

            # Check for rate limiting - trigger global cooldown
            if "too many login attempts" in msg or "500213" in str(exc):
                from pixsim7.backend.main.services.provider.adapters.pixverse_session_manager import (
                    _global_rate_limit_until,
                    GLOBAL_RATE_LIMIT_COOLDOWN_SECONDS,
                )
                import time
                import pixsim7.backend.main.services.provider.adapters.pixverse_session_manager as sm
                sm._global_rate_limit_until = time.time() + GLOBAL_RATE_LIMIT_COOLDOWN_SECONDS
                logger.warning(
                    "pixverse_rate_limit_detected",
                    account_id=account.id,
                    cooldown_seconds=GLOBAL_RATE_LIMIT_COOLDOWN_SECONDS,
                    note="global_reauth_cooldown_activated",
                )

            if "sign in via oauth" in msg:
                # This is an OAuth-only account (Google/Discord/Apple); password-based
                # reauth will never work. Mark it as GOOGLE so future auto-reauth
                # attempts are skipped and rely purely on cookie-based flows.
                meta = getattr(account, "provider_metadata", None) or {}
                meta["auth_method"] = PixverseAuthMethod.GOOGLE.value
                account.provider_metadata = meta
                # Clear any stored password so that future auto-reauth attempts are
                # definitively skipped even if auth_method metadata is missing.
                account.password = None
                persisted = await self._persist_oauth_only_account_state(account)
                logger.info(
                    "pixverse_detected_oauth_only_account",
                    account_id=account.id,
                    auth_method=PixverseAuthMethod.GOOGLE.value,
                    persisted=persisted,
                )

            # Rollback the session to clean state after any auto-reauth failure
            await self._rollback_session_if_needed(account)

            logger.error(
                "pixverse_auto_reauth_error",
                account_id=account.id,
                error=str(exc),
                exc_info=True,
            )
            return False

    async def _rollback_session_if_needed(self, account: ProviderAccount) -> None:
        """Rollback the database session if it's in a bad state."""
        try:
            from sqlalchemy.orm import object_session
            from sqlalchemy.ext.asyncio import AsyncSession

            session = object_session(account)
            if session and isinstance(session, AsyncSession):
                await session.rollback()
                logger.debug(
                    "pixverse_session_rollback_after_error",
                    account_id=account.id,
                )
        except Exception as rollback_exc:
            logger.warning(
                "pixverse_session_rollback_failed",
                account_id=account.id,
                error=str(rollback_exc),
            )


    async def extract_account_data(self, raw_data: dict, *, fallback_email: str = None) -> dict:
        """
        Extract Pixverse account data from raw cookies or API login response

        Pixverse-specific extraction (like pixsim6):
        1. Extract JWT from _ai_token cookie OR from jwt_token field (API login)
        2. Call Pixverse API getUserInfo to get real email
        3. Fallback to JWT parsing if API call fails
        4. Use fallback_email if provided and no email found

        Args:
            raw_data: {'cookies': {...}} or {'jwt_token': str, 'cookies': {...}, ...}
            fallback_email: Optional email to use if extraction fails (e.g., during auto re-auth)

        Returns:
            {'email': str, 'jwt_token': str, 'cookies': dict, 'username': str, 'nickname': str}

        Raises:
            ValueError: If _ai_token not found or email cannot be extracted
        """
        import json
        import base64

        cookies = raw_data.get('cookies', {})

        # Extract JWT token (from _ai_token cookie OR from jwt_token field for API login)
        ai_token = raw_data.get('jwt_token') or cookies.get('_ai_token')
        if not ai_token:
            raise ValueError("Pixverse: JWT token not found in cookies or raw_data")

        # Try to get email from Pixverse API (like pixsim6)
        email = None
        username = None
        nickname = None
        account_id = None
        provider_metadata = None

        try:
            # Call getUserInfo API (now natively async via httpx)
            user_info = await self.get_user_info(ai_token, cookies)
            email = user_info['email']
            username = user_info.get('username')
            nickname = user_info.get('nickname')
            account_id = user_info.get('account_id')
            provider_metadata = user_info.get('raw_data')
            logger.debug(
                f"[Pixverse] getUserInfo success: email={email}, username={username}"
            )

        except Exception as e:
            # Check if this is a session error (expected when account not active in browser)
            err_str = str(e).lower()
            is_session_error = "10005" in err_str or "10003" in err_str or "logged in elsewhere" in err_str or "not login" in err_str

            # Only log at warning for non-session errors; session errors are expected
            if not is_session_error:
                log_provider_error(
                    provider_id="pixverse",
                    operation="get_user_info_extract",
                    stage="provider:status",
                    account_id=None,
                    email=fallback_email,
                    error=str(e),
                    error_type=type(e).__name__,
                    extra={
                        "has_jwt": bool(ai_token),
                        "jwt_length": len(ai_token) if ai_token else 0,
                    },
                    severity="warning",
                )
                logger.warning(
                    "pixverse_get_user_info_failed",
                    error=str(e),
                    error_type=type(e).__name__,
                    has_jwt=bool(ai_token),
                    jwt_length=len(ai_token) if ai_token else 0,
                    exc_info=True,
                )
            else:
                logger.debug(
                    "pixverse_get_user_info_session_error",
                    error=str(e),
                    note="expected when account not active in browser, falling back to JWT",
                )

            # Fallback: Parse JWT to extract username/account_id and generate pseudo-email
            try:
                parts = ai_token.split('.')
                if len(parts) == 3:
                    payload_encoded = parts[1]
                    # Add padding if needed
                    padding = len(payload_encoded) % 4
                    if padding:
                        payload_encoded += '=' * (4 - padding)

                    payload_json = base64.urlsafe_b64decode(payload_encoded).decode('utf-8')
                    payload = json.loads(payload_json)

                    logger.debug(f"[Pixverse] JWT payload keys: {list(payload.keys())}")

                    # Extract username and account ID
                    jwt_username = payload.get('Username') or payload.get('username')
                    jwt_account_id = payload.get('AccountId') or payload.get('account_id')
                    jwt_email = payload.get('Mail') or payload.get('email') or payload.get('Email')

                    # Prefer email claim from JWT if present
                    if jwt_email:
                        email = jwt_email
                        logger.info(
                            "pixverse_jwt_email_found",
                            email=email,
                            has_username=bool(jwt_username),
                            has_account_id=bool(jwt_account_id),
                        )
                    # Do NOT fabricate placeholder emails; keep username/account_id only
                    else:
                        # Not a warning - fallback_email will be used if available
                        logger.debug(
                            "pixverse_jwt_no_email",
                            jwt_keys=list(payload.keys()),
                            has_username=bool(jwt_username),
                            has_account_id=bool(jwt_account_id),
                        )

                    # Also populate username/account_id if we didn't have them from API
                    if not username:
                        username = jwt_username
                    if not account_id:
                        account_id = str(jwt_account_id) if jwt_account_id else None

            except Exception as jwt_error:
                log_provider_error(
                    provider_id="pixverse",
                    operation="parse_jwt",
                    stage="provider:status",
                    account_id=None,
                    email=fallback_email,
                    error=str(jwt_error),
                    error_type=jwt_error.__class__.__name__,
                )
                logger.error(f"[Pixverse] JWT parsing also failed: {jwt_error}", exc_info=True)

        if not email:
            if fallback_email and '@' in fallback_email:
                logger.info(
                    "pixverse_using_fallback_email",
                    fallback_email=fallback_email,
                    has_username=bool(username),
                    has_account_id=bool(account_id),
                )
                email = fallback_email
            # Note: Don't use username as email - it creates malformed accounts without @
            # that break presets and relogin functionality
            else:
                log_provider_error(
                    provider_id="pixverse",
                    operation="extract_account_data",
                    stage="provider:status",
                    account_id=None,
                    email=fallback_email,
                    error="email_extraction_failed",
                    error_type="EmailExtractionError",
                    extra={
                        "has_jwt": bool(ai_token),
                        "has_username": bool(username),
                        "has_account_id": bool(account_id),
                        "getUserInfo_attempted": True,
                    },
                )
                logger.error(
                    "pixverse_email_extraction_failed",
                    has_jwt=bool(ai_token),
                    has_username=bool(username),
                    has_account_id=bool(account_id),
                    getUserInfo_attempted=True,
                )
                raise ValueError(
                    "Pixverse: Could not extract email or username. Ensure pixverse-py is installed on backend for getUserInfo, or JWT includes 'Mail'/'Username'."
                )

        # Include session IDs in cookies for session sharing
        # These allow backend to appear as same session as browser, preventing
        # "logged in elsewhere" errors
        session_ids = raw_data.get('session_ids') or {}
        if session_ids.get('ai_trace_id'):
            cookies['_pxs7_trace_id'] = session_ids['ai_trace_id']
        if session_ids.get('ai_anonymous_id'):
            cookies['_pxs7_anonymous_id'] = session_ids['ai_anonymous_id']

        # If no session IDs were captured (e.g., password login without browser),
        # generate stable ones to avoid "logged in elsewhere" errors from random
        # IDs being generated on each API request
        if '_pxs7_trace_id' not in cookies:
            cookies['_pxs7_trace_id'] = str(uuid_mod.uuid4())
            logger.debug("pixverse_generated_session_id", key="_pxs7_trace_id")
        if '_pxs7_anonymous_id' not in cookies:
            cookies['_pxs7_anonymous_id'] = str(uuid_mod.uuid4())
            logger.debug("pixverse_generated_session_id", key="_pxs7_anonymous_id")

        return {
            'email': email,
            'jwt_token': ai_token,
            'cookies': cookies,
            'username': username,
            'nickname': nickname,
            'account_id': account_id,
            'provider_metadata': provider_metadata,  # Full getUserInfo response
        }
