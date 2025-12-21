"""
Pixverse credits and ad status management

Handles fetching credits and ad watch task status.
"""
import asyncio
import uuid
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


class PixverseCreditsMixin:
    """Mixin for Pixverse credits operations"""

    async def get_credits_with_ad_task(self, account: ProviderAccount, *, retry_on_session_error: bool = True) -> dict:
        """Fetch current Pixverse credits (web + OpenAPI) + ad watch task status.

        Includes ad_watch_task in response dict for displaying daily watch progress.
        Use get_credits() for bulk operations where ad task data isn't needed.

        The `retry_on_session_error` flag controls whether session-invalid errors
        (10003/10005) should trigger PixverseSessionManager's auto-reauth logic.
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
            temp_account = Account(
                email=account.email,
                session={
                    "jwt_token": session.get("jwt_token"),
                    "cookies": session.get("cookies", {}),
                    **({"openapi_key": session["openapi_key"]} if "openapi_key" in session else {}),
                },
            )
            api = self._get_cached_api(account)

            web_total = 0
            try:
                web_data = await asyncio.wait_for(
                    api.get_credits(temp_account),
                    timeout=PIXVERSE_CREDITS_TIMEOUT_SEC,
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
                    # OpenAPI credits are optional for /pixverse-status and other
                    # snapshot-style calls. Treat failures here as non-fatal so
                    # that web credits and ad-task metadata can still be returned
                    # even if the OpenAPI key/session is stale.
                    logger.warning("PixverseAPI get_openapi_credits failed: %s", exc)
                    openapi_total = 0

            result: Dict[str, Any] = {
                "web": max(0, web_total),
                "openapi": max(0, openapi_total),
            }

            ad_task = await self._get_ad_task_status_best_effort(account, session)
            if ad_task is not None:
                result["ad_watch_task"] = ad_task
            return result

        return await self.session_manager.run_with_session(
            account=account,
            op_name="get_credits_with_ad_task",
            operation=_operation,
            retry_on_session_error=retry_on_session_error,
        )


    async def get_credits(self, account: ProviderAccount, *, retry_on_session_error: bool = False) -> dict:
        """Fetch Pixverse credits (web + OpenAPI) without ad-task lookup.

        This is the default/fast method for credit syncing. For ad task status,
        use get_credits_with_ad_task() instead.

        Args:
            account: Provider account
            retry_on_session_error: If True, enable auto-reauth on session errors.
                Set to True for user-triggered syncs, False for bulk operations.
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
            temp_account = Account(
                email=account.email,
                session={
                    "jwt_token": session.get("jwt_token"),
                    "cookies": session.get("cookies", {}),
                    **({"openapi_key": session["openapi_key"]} if "openapi_key" in session else {}),
                },
            )
            api = self._get_cached_api(account)

            web_total = 0
            try:
                web_data = await asyncio.wait_for(
                    api.get_credits(temp_account),
                    timeout=PIXVERSE_CREDITS_TIMEOUT_SEC,
                )
                if isinstance(web_data, dict):
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
                # For bulk/basic sync operations, treat Pixverse timeouts as
                # "no fresh credits data" rather than a hard failure. This lets
                # callers fall back to cookie-based extraction or simply report
                # that no new credits could be fetched, instead of surfacing a
                # 500 error to the user.
                log_provider_timeout(
                    provider_id="pixverse",
                    operation="get_credits_web_basic",
                    account_id=account.id,
                    email=account.email,
                    error=str(exc),
                    error_type=exc.__class__.__name__,
                )
                return {}
            except Exception as exc:
                log_provider_error(
                    provider_id="pixverse",
                    operation="get_credits_web_basic",
                    account_id=account.id,
                    email=account.email,
                    error=str(exc),
                    error_type=exc.__class__.__name__,
                )
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
                    # OpenAPI credits are optional for bulk sync; treat failures
                    # as non-fatal so that web credits can still be updated even
                    # if the OpenAPI key/session is stale.
                    logger.warning("PixverseAPI get_openapi_credits failed: %s", exc)
                    openapi_total = 0

            return {
                "web": max(0, web_total),
                "openapi": max(0, openapi_total),
            }

        return await self.session_manager.run_with_session(
            account=account,
            op_name="get_credits",
            operation=_operation,
            retry_on_session_error=retry_on_session_error,
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

        Example response snippet:
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
        # pixverse-py session validation strategy. Some fields (ai-trace-id,
        # ai-anonymous-id, x-platform) appear to influence which tasks are
        # returned by the API.
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
            "ai-trace-id": str(uuid.uuid4()),
            "ai-anonymous-id": str(uuid.uuid4()),
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

