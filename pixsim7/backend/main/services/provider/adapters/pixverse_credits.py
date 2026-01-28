"""
Pixverse credits and ad status management

Handles fetching credits and ad watch task status.
"""
import asyncio
import uuid
from datetime import datetime, timezone
from typing import Dict, Any, Optional
from pixsim_logging import get_logger
from pixsim7.backend.main.domain.providers import ProviderAccount
from pixsim7.backend.main.domain.provider_auth import PixverseSessionData
from pixsim7.backend.main.services.provider.provider_logging import (
    log_provider_timeout,
    log_provider_error,
)

logger = get_logger()
# Allow a bit more time for Pixverse web dashboard credits endpoint, which can
# be slow or occasionally rate-limited. We still wrap calls in wait_for so
# hung requests won't block forever.
PIXVERSE_CREDITS_TIMEOUT_SEC = 8.0

# Default max concurrent jobs for free vs pro accounts
PIXVERSE_FREE_MAX_CONCURRENT_JOBS = 2
PIXVERSE_PRO_MAX_CONCURRENT_JOBS = 5


class PixverseCreditsMixin:
    """Mixin for Pixverse credits operations"""

    async def get_ad_watch_task(
        self,
        account: ProviderAccount,
        *,
        retry_on_session_error: bool = False,
    ) -> Optional[Dict[str, Any]]:
        """Fetch Pixverse daily watch-ad task status only (no credits)."""

        async def _operation(session: PixverseSessionData) -> Optional[Dict[str, Any]]:
            return await self._get_ad_task_status_best_effort(account, session)

        try:
            return await self.session_manager.run_with_session(
                account=account,
                op_name="get_ad_watch_task",
                operation=_operation,
                retry_on_session_error=retry_on_session_error,
            )
        except Exception as exc:
            log_provider_error(
                provider_id="pixverse",
                operation="get_ad_watch_task",
                account_id=account.id,
                email=account.email,
                error=str(exc),
                error_type=exc.__class__.__name__,
                severity="warning",
            )
            return None

    async def get_credits(
        self,
        account: ProviderAccount,
        *,
        include_ad_task: bool = False,
        retry_on_session_error: bool = False,
        force_refresh: bool = False,
    ) -> dict:
        """Fetch Pixverse credits (web + OpenAPI) with optional ad task status.

        Args:
            account: Provider account
            include_ad_task: If True, includes ad_watch_task in response (slower)
            retry_on_session_error: If True, enable auto-reauth on session errors.
                Set to True for user-triggered syncs, False for bulk operations.
            force_refresh: If True, sends refresh header to force Pixverse to
                recalculate credits (avoids stale cached values). Use for user-triggered syncs.

        Returns:
            Dictionary with 'web' and 'openapi' credit counts, and optionally
            'ad_watch_task' if include_ad_task=True.
        """
        try:
            from pixverse import Account  # type: ignore
        except ImportError:  # pragma: no cover
            Account = None  # type: ignore
        try:
            from pixverse.api.client import PixverseAPI  # type: ignore
        except ImportError:  # pragma: no cover
            PixverseAPI = None  # type: ignore

        if not Account or not PixverseAPI:
            raise Exception("pixverse-py not installed; cannot fetch credits")

        async def _operation(session: PixverseSessionData) -> dict:
            # JWT is required for pixverse-py SDK get_credits() call
            jwt_token = session.get("jwt_token")
            jwt_preview = jwt_token[:50] + "..." if jwt_token else "None"
            logger.debug(f"Fetching credits for {account.email} using JWT: {jwt_preview}")

            temp_account = Account(
                email=account.email,
                session={
                    "jwt_token": jwt_token,
                    "cookies": session.get("cookies", {}),
                    **({"openapi_key": session["openapi_key"]} if "openapi_key" in session else {}),
                },
            )
            api = self._get_cached_api(account)

            web_total = 0
            try:
                web_data = await asyncio.wait_for(
                    api.get_credits(temp_account, force_refresh=force_refresh),
                    timeout=PIXVERSE_CREDITS_TIMEOUT_SEC,
                )
                logger.debug(
                    "pixverse_sdk_credits_response",
                    account_id=account.id,
                    email=account.email,
                    raw_response=web_data,
                )
                if isinstance(web_data, dict):
                    # Prefer specific remaining/total fields, but be robust to SDK changes.
                    raw_web = (
                        web_data.get("remainingCredits")
                        or web_data.get("remaining_credits")
                        or web_data.get("total_credits")
                        or web_data.get("credits")
                    )
                    try:
                        web_total = int(raw_web or 0)
                    except (TypeError, ValueError):
                        web_total = 0
            except asyncio.TimeoutError as exc:
                # For pixverse-status, treat timeouts as "unknown credits" but do not
                # fail the entire call so ad-watch status and any cached credits can
                # still be shown.
                log_provider_timeout(
                    provider_id="pixverse",
                    operation="get_credits_web",
                    account_id=account.id,
                    email=account.email,
                    error=str(exc),
                    error_type=exc.__class__.__name__,
                )
                web_total = 0
            except Exception as exc:
                log_provider_error(
                    provider_id="pixverse",
                    operation="get_credits_web",
                    account_id=account.id,
                    email=account.email,
                    error=str(exc),
                    error_type=exc.__class__.__name__,
                    severity="warning",
                )
                # Let the session manager classify and potentially auto-reauth or
                # propagate a real error for non-timeout failures.
                raise

            openapi_total = 0
            if "openapi_key" in session:
                try:
                    openapi_data = await asyncio.wait_for(
                        api.get_openapi_credits(temp_account),
                        timeout=PIXVERSE_CREDITS_TIMEOUT_SEC,
                    )
                    if isinstance(openapi_data, dict):
                        raw_openapi = (
                            openapi_data.get("credits")
                            or openapi_data.get("total_credits")
                        )
                        try:
                            openapi_total = int(raw_openapi or 0)
                        except (TypeError, ValueError):
                            openapi_total = 0
                except Exception as exc:
                    # OpenAPI credits are optional - failures are non-fatal.
                    # SDK already logs at appropriate level (WARNING for session
                    # errors, ERROR for others), so we just log at DEBUG here.
                    logger.debug(
                        "OpenAPI credits unavailable (using web credits): %s", exc
                    )
                    openapi_total = 0

            result: Dict[str, Any] = {
                "web": max(0, web_total),
                "openapi": max(0, openapi_total),
            }

            logger.debug(
                "pixverse_credits_parsed",
                account_id=account.id,
                email=account.email,
                web_credits=result["web"],
                openapi_credits=result["openapi"],
            )

            # Optionally include ad task status
            if include_ad_task:
                ad_task = await self._get_ad_task_status_best_effort(account, session)
                if ad_task is not None:
                    result["ad_watch_task"] = ad_task

            return result

        return await self.session_manager.run_with_session(
            account=account,
            op_name="get_credits",
            operation=_operation,
            retry_on_session_error=retry_on_session_error,
        )

    async def get_credits_with_ad_task(
        self,
        account: ProviderAccount,
        *,
        retry_on_session_error: bool = True,
        force_refresh: bool = False,
    ) -> dict:
        """Backward compatibility wrapper for get_credits with ad task.

        DEPRECATED: Use get_credits(account, include_ad_task=True) instead.

        This method exists for backward compatibility with existing code.
        It calls get_credits with include_ad_task=True.
        """
        return await self.get_credits(
            account,
            include_ad_task=True,
            retry_on_session_error=retry_on_session_error,
            force_refresh=force_refresh,
        )

    async def _get_ad_task_status_best_effort(
        self,
        account: ProviderAccount,
        session: PixverseSessionData,
    ) -> Optional[Dict[str, Any]]:
        try:
            return await self._get_ad_task_status(account, session)
        except Exception as exc:
            logger.warning(
                "Pixverse ad task status check failed for account %s: %s",
                account.id,
                exc,
            )
            return None


    async def _get_ad_task_status(
        self,
        account: ProviderAccount,
        session: PixverseSessionData,
    ) -> Optional[Dict[str, Any]]:
        """Check Pixverse daily watch-ad task status via creative_platform/task/list.

        We are interested specifically in:
          - task_type == 1
          - sub_type == 11

        Example response snippet (note: total_counts can change over time):
            {
              "ErrCode": 0,
              "ErrMsg": "Success",
              "Resp": [
                {
                  "task_type": 1,
                  "sub_type": 11,
                  "reward": 30,
                  "progress": 1,
                  "total_counts": 2,
                  "completed_counts": 0,
                  ...
                },
                ...
              ]
            }

        Returns a small dict with progress info or None on failure.
        """
        try:
            import httpx  # type: ignore
        except ImportError:  # pragma: no cover
            return None

        # Build cookies from the current Pixverse session. This keeps ad-task
        # aligned with the same session object that credits use, while
        # preserving any browser-imported cookies already stored on the
        # account.
        cookies = dict(session.get("cookies") or {})
        jwt_token = session.get("jwt_token")

        # Ensure JWT is reflected in the cookie jar when no _ai_token is
        # present. This mirrors the fast-path session validation used in
        # pixverse-py, without overwriting an existing _ai_token that may have
        # been imported from the browser.
        if jwt_token and "_ai_token" not in cookies:
            cookies["_ai_token"] = jwt_token

        # Build headers to closely mirror the real web client and the
        # pixverse-py session validation strategy. Use shared session IDs from
        # browser when available to avoid "logged in elsewhere" errors.
        shared_trace_id = cookies.get("_pxs7_trace_id")
        shared_anonymous_id = cookies.get("_pxs7_anonymous_id")

        if shared_trace_id or shared_anonymous_id:
            logger.debug(
                "pixverse_ad_task_using_shared_session",
                account_id=account.id,
                has_trace_id=bool(shared_trace_id),
                has_anonymous_id=bool(shared_anonymous_id),
            )
        else:
            logger.debug(
                "pixverse_ad_task_no_shared_session",
                account_id=account.id,
                cookie_keys=list(cookies.keys())[:10],  # First 10 keys for debugging
            )

        headers: Dict[str, str] = {
            "Accept": "application/json, text/plain, */*",
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            "Origin": "https://app.pixverse.ai",
            "Referer": "https://app.pixverse.ai/",
            "x-platform": "Web",
            "ai-trace-id": shared_trace_id or str(uuid.uuid4()),
            "ai-anonymous-id": shared_anonymous_id or str(uuid.uuid4()),
        }
        if jwt_token:
            headers["token"] = jwt_token

        url = "https://app-api.pixverse.ai/creative_platform/task/list"

        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True, headers=headers) as client:
            resp = await client.get(url, cookies=cookies)
            logger.debug(f"Ad task API response status: {resp.status_code}")
            resp.raise_for_status()
            data = resp.json()
            logger.debug(f"Ad task API response: {data}")

        if not isinstance(data, dict):
            logger.warning(
                "Pixverse ad task invalid response type",
                account_id=account.id,
                email=account.email,
                response_type=type(data).__name__,
            )
            return None

        err_code = data.get("ErrCode")
        if err_code in (10003, 10005):
            logger.warning(
                "Pixverse ad task session error",
                account_id=account.id,
                err_code=err_code,
                err_msg=data.get("ErrMsg"),
            )
            # Evict cache so future calls can rebuild with fresh session,
            # but do not trigger auto-reauth from here.
            self._evict_account_cache(account)
            return None

        tasks = data.get("Resp") or []
        if not isinstance(tasks, list):
            logger.warning(
                "Pixverse ad task payload missing Resp list",
                account_id=account.id,
                err_code=err_code,
                raw=data,
            )
            return None

        # Log all tasks for debugging
        if tasks:
            task_summary = [
                {"task_type": t.get("task_type"), "sub_type": t.get("sub_type")}
                for t in tasks
                if isinstance(t, dict)
            ]
            logger.info(
                "Pixverse ad task list received",
                account_id=account.id,
                email=account.email,
                task_count=len(tasks),
                task_types=task_summary,
            )

        # Only treat the daily watch-ad task (task_type=1, sub_type=11) as the
        # one we expose in ad_watch_task. Other tasks (one-time rewards, etc.)
        # are intentionally ignored so the pill reflects just the daily watch
        # progress.
        for task in tasks:
            if (
                isinstance(task, dict)
                and task.get("task_type") == 1
                and task.get("sub_type") == 11
            ):
                logger.info(
                    "Pixverse ad task found",
                    account_id=account.id,
                    email=account.email,
                    progress=task.get("progress"),
                    total=task.get("total_counts"),
                    reward=task.get("reward"),
                )
                return {
                    "reward": task.get("reward"),
                    "progress": task.get("progress"),
                    "total_counts": task.get("total_counts"),
                    "completed_counts": task.get("completed_counts"),
                    "expired_time": task.get("expired_time"),
                }

        # No matching daily watch-ad task found; log the shape so we can adjust filters.
        logger.info(
            "Pixverse ad task no_matching_task",
            account_id=account.id,
            email=account.email,
            err_code=err_code,
            task_count=len(tasks),
            available_task_types=task_summary if tasks else [],
        )
        return None


    async def get_account_stats(self, account: ProviderAccount) -> Optional[Dict[str, Any]]:
        """Fetch lightweight account statistics (invited count, basic user info).

        This is designed to be cached in provider_metadata for quick access.
        Use get_invited_accounts_full() for the complete list of invited users.

        Args:
            account: Provider account

        Returns:
            Dictionary with invited_count and user_info, or None on failure
        """
        try:
            from pixverse import Account  # type: ignore
        except ImportError:  # pragma: no cover
            return None

        try:
            from pixverse.api.client import PixverseAPI  # type: ignore
        except ImportError:  # pragma: no cover
            return None

        async def _operation(session: PixverseSessionData) -> Optional[Dict[str, Any]]:
            # JWT is required for pixverse-py SDK calls
            temp_account = Account(
                email=account.email,
                session={
                    "jwt_token": session.get("jwt_token"),
                    "cookies": session.get("cookies", {}),
                },
            )
            api = self._get_cached_api(account)

            try:
                stats = await api.get_account_stats(temp_account)
                return stats
            except Exception as e:
                logger.warning(
                    "Failed to fetch account stats for %s: %s",
                    account.id,
                    str(e),
                )
                return None

        return await self.session_manager.run_with_session(
            account=account,
            op_name="get_account_stats",
            operation=_operation,
            retry_on_session_error=False,  # Don't trigger heavy reauth for stats
        )

    async def get_plan_details(
        self,
        account: ProviderAccount,
        *,
        retry_on_session_error: bool = False,
    ) -> Optional[Dict[str, Any]]:
        """Fetch Pixverse subscription plan details via SDK.

        Args:
            account: Provider account
            retry_on_session_error: If True, enable auto-reauth on session errors.

        Returns:
            Dictionary with plan details including:
            - plan_name: e.g., "Basic Plan", "Pro Plan"
            - current_plan_type: 0 = Basic/Free, 1+ = Premium tiers
            - qualities: list of available quality tiers
            - batch_generation: 0/1 flag
            - off_peak: 0/1 flag
            Or None on failure.
        """
        try:
            from pixverse import Account  # type: ignore
        except ImportError:  # pragma: no cover
            logger.warning("pixverse-py not installed; cannot fetch plan details")
            return None

        async def _operation(session: PixverseSessionData) -> Optional[Dict[str, Any]]:
            jwt_token = session.get("jwt_token")
            if not jwt_token:
                logger.warning(
                    "No JWT token available for plan details fetch",
                    account_id=account.id,
                    email=account.email,
                )
                return None

            temp_account = Account(
                email=account.email,
                session={
                    "jwt_token": jwt_token,
                    "cookies": session.get("cookies", {}),
                },
            )
            api = self._get_cached_api(account)

            try:
                plan_details = await asyncio.wait_for(
                    api.get_plan_details(temp_account),
                    timeout=PIXVERSE_CREDITS_TIMEOUT_SEC,
                )
                logger.debug(
                    "pixverse_plan_details_response",
                    account_id=account.id,
                    email=account.email,
                    raw_response=plan_details,
                )
                return plan_details
            except asyncio.TimeoutError as exc:
                log_provider_timeout(
                    provider_id="pixverse",
                    operation="get_plan_details",
                    account_id=account.id,
                    email=account.email,
                    error=str(exc),
                    error_type=exc.__class__.__name__,
                )
                return None
            except Exception as exc:
                log_provider_error(
                    provider_id="pixverse",
                    operation="get_plan_details",
                    account_id=account.id,
                    email=account.email,
                    error=str(exc),
                    error_type=exc.__class__.__name__,
                    severity="warning",
                )
                raise

        try:
            return await self.session_manager.run_with_session(
                account=account,
                op_name="get_plan_details",
                operation=_operation,
                retry_on_session_error=retry_on_session_error,
            )
        except Exception as exc:
            log_provider_error(
                provider_id="pixverse",
                operation="get_plan_details",
                account_id=account.id,
                email=account.email,
                error=str(exc),
                error_type=exc.__class__.__name__,
                severity="warning",
            )
            return None

    def apply_plan_to_account(
        self,
        account: ProviderAccount,
        plan_details: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Apply plan details to account.

        Sets max_concurrent_jobs based on plan type:
        - plan_type=0 (Basic/Free): 2 concurrent jobs
        - plan_type>=1 (Pro/Premium): 5 concurrent jobs

        Also stores plan details in provider_metadata for reference.

        Args:
            account: Provider account to update
            plan_details: Raw plan details from get_plan_details()

        Returns:
            Dictionary with applied changes:
            - max_concurrent_jobs: The new value set
            - is_pro: Whether this is a pro account
            - plan_name: The plan name
        """
        plan_type = plan_details.get("current_plan_type", 0)
        plan_name = plan_details.get("plan_name", "Unknown")
        is_pro = plan_type >= 1

        # Set max_concurrent_jobs based on plan type
        new_max_concurrent = (
            PIXVERSE_PRO_MAX_CONCURRENT_JOBS if is_pro
            else PIXVERSE_FREE_MAX_CONCURRENT_JOBS
        )
        account.max_concurrent_jobs = new_max_concurrent

        # Store plan details in provider_metadata
        metadata = account.provider_metadata or {}
        metadata["plan_name"] = plan_name
        metadata["plan_type"] = plan_type
        metadata["plan_is_pro"] = is_pro
        metadata["plan_qualities"] = plan_details.get("qualities", [])
        metadata["plan_batch_generation"] = plan_details.get("batch_generation", 0)
        metadata["plan_off_peak"] = plan_details.get("off_peak", 0)
        metadata["plan_synced_at"] = datetime.now(timezone.utc).isoformat()
        account.provider_metadata = metadata

        logger.info(
            "pixverse_plan_applied",
            account_id=account.id,
            email=account.email,
            plan_name=plan_name,
            plan_type=plan_type,
            is_pro=is_pro,
            max_concurrent_jobs=new_max_concurrent,
        )

        return {
            "max_concurrent_jobs": new_max_concurrent,
            "is_pro": is_pro,
            "plan_name": plan_name,
        }
