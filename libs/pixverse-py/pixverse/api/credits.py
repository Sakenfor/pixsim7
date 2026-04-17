"""
Credits and account information operations for Pixverse API (async)
Handles credit balance, user info, and plan details
"""

import logging
from typing import Dict, Any, Optional
from ..models import Account
from ..exceptions import APIError

logger = logging.getLogger(__name__)


class CreditsOperations:
    """Credits and account-related API operations (async)"""

    def __init__(self, client):
        """
        Initialize credits operations

        Args:
            client: Reference to the main PixverseAPI client
        """
        self.client = client

    @staticmethod
    def _coerce_positive_int(value: Any) -> Optional[int]:
        """Coerce provider values like 5 / '5' / '5.0' to a positive int."""
        try:
            if isinstance(value, bool):
                return None
            if isinstance(value, int):
                return value if value > 0 else None
            if isinstance(value, float):
                ivalue = int(value)
                return ivalue if ivalue > 0 else None
            if isinstance(value, str):
                raw = value.strip()
                if not raw:
                    return None
                if raw.isdigit():
                    ivalue = int(raw)
                    return ivalue if ivalue > 0 else None
                ivalue = int(float(raw))
                return ivalue if ivalue > 0 else None
        except Exception:
            return None
        return None

    @staticmethod
    def _coerce_int(value: Any) -> Optional[int]:
        """Coerce provider values like 0 / '0' / '2.0' to an int."""
        try:
            if isinstance(value, bool):
                return None
            if isinstance(value, int):
                return value
            if isinstance(value, float):
                return int(value)
            if isinstance(value, str):
                raw = value.strip()
                if not raw:
                    return None
                if raw.isdigit() or (raw.startswith("-") and raw[1:].isdigit()):
                    return int(raw)
                return int(float(raw))
        except Exception:
            return None
        return None

    @staticmethod
    def _norm_key(key: Any) -> str:
        if not isinstance(key, str):
            return ""
        return "".join(ch for ch in key.lower() if ch.isalnum())

    def _find_numeric_field(self, obj: Any, wanted_keys: set[str], depth: int = 0) -> Optional[int]:
        """Recursively search nested objects for a numeric field by normalized key."""
        if depth > 4:
            return None
        if isinstance(obj, dict):
            for key, value in obj.items():
                if self._norm_key(key) in wanted_keys:
                    parsed = self._coerce_positive_int(value)
                    if parsed is not None:
                        return parsed
                nested = self._find_numeric_field(value, wanted_keys, depth + 1)
                if nested is not None:
                    return nested
        elif isinstance(obj, list):
            for item in obj:
                nested = self._find_numeric_field(item, wanted_keys, depth + 1)
                if nested is not None:
                    return nested
        return None

    def _infer_max_concurrent_from_user_info(self, data: Dict[str, Any]) -> Optional[int]:
        """Infer max concurrency from getUserInfo payload when Pixverse exposes it."""
        explicit_keys = {
            "gensimultaneously",
            "generatesimultaneously",
            "maxconcurrentjobs",
            "maxconcurrentjob",
            "concurrentlimit",
            "concurrentnum",
            "generationconcurrency",
        }
        inferred = self._find_numeric_field(data, explicit_keys)
        if inferred is not None:
            return inferred

        # If only a plan/membership tier marker exists, provide a heuristic fallback.
        plan_type_keys = {
            "currentplantype",
            "plantype",
            "membershiptype",
            "membertype",
            "viptype",
            "subscribetype",
        }
        plan_type = self._find_numeric_field(data, plan_type_keys)
        if plan_type is not None:
            return 5 if plan_type >= 1 else 2
        return None

    async def get_credits(self, account: Account, force_refresh: bool = False) -> Dict[str, int]:
        """
        Get credit balance for an account

        Args:
            account: Account to check credits for
            force_refresh: If True, sends 'refresh: credit' header to force Pixverse
                          to recalculate credits (use for user-triggered syncs).
                          If False, returns potentially cached values (use for background checks).

        Returns:
            Dictionary with 'total_credits', 'credit_daily', 'credit_monthly', and 'credit_package'
            - total_credits: Sum of all credit types (usable total)
            - credit_daily: Daily free credits (resets each day)
            - credit_monthly: Monthly subscription credits
            - credit_package: Purchased credit packages

        Raises:
            APIError: If API request fails or account doesn't have JWT token
        """
        # Only Web API (JWT) supports credit check
        if not (account.session and account.session.get("jwt_token")):
            raise APIError("get_credits() requires JWT authentication (Web API)")

        response = await self.client._request(
            "GET",
            "/creative_platform/user/credits",
            account=account,
            include_refresh=force_refresh  # Only refresh on user-triggered syncs
        )

        resp_data = response.get("Resp", {})
        credit_daily = resp_data.get("credit_daily", 0)
        credit_monthly = resp_data.get("credit_monthly", 0)
        credit_package = resp_data.get("credit_package", 0)

        # Total credits is the sum of all three types
        total_credits = credit_daily + credit_monthly + credit_package

        result: Dict[str, Any] = {
            "total_credits": total_credits,
            "credit_daily": credit_daily,
            "credit_monthly": credit_monthly,
            "credit_package": credit_package,
        }

        # Surface active discount/promotion flags for pricing callers
        promotions: Dict[str, bool] = {}
        if resp_data.get("is_v6_discount"):
            promotions["v6"] = True
        if resp_data.get("is_story_discount"):
            promotions["story"] = True
        if promotions:
            result["promotions"] = promotions

        return result

    async def get_user_info(self, account: Account) -> Dict[str, Any]:
        """
        Get detailed user information for an account

        Returns real email, username, nickname, invite code, and other account details.

        Args:
            account: Account to get info for

        Returns:
            Dictionary with user info including:
                - Mail: Real email address (not @pixverse domain)
                - Username: Account username
                - Nickname: Display nickname
                - invite_code: Referral code

        Raises:
            APIError: If API request fails or account doesn't have JWT token

        Example:
            >>> info = await api.get_user_info(account)
            >>> real_email = info["Mail"]  # "user@hotmail.com"
            >>> username = info["Username"]  # "user1024"
        """
        # Only Web API (JWT) supports getUserInfo
        if not (account.session and account.session.get("jwt_token")):
            raise APIError("get_user_info() requires JWT authentication (Web API)")

        response = await self.client._request(
            "GET",
            "/creative_platform/getUserInfo",
            account=account,
            include_refresh=False  # Don't include refresh header for read-only operation
        )

        resp_data = response.get("Resp", {})

        # Log response keys to catch Pixverse API format changes early
        if resp_data:
            logger.debug("getUserInfo Resp keys: %s", list(resp_data.keys()))
        else:
            # Resp key missing or empty — check if data is at the top level
            logger.warning(
                "getUserInfo: 'Resp' key empty/missing, raw keys: %s",
                list(response.keys()),
            )
            # Fallback: some API versions return user data at the top level
            # (outside of Resp wrapper). Use the full response minus known
            # envelope keys so the caller still gets usable data.
            envelope_keys = {"ErrCode", "ErrMsg", "Resp"}
            fallback = {k: v for k, v in response.items() if k not in envelope_keys}
            if fallback:
                logger.info("getUserInfo: using top-level fallback keys: %s", list(fallback.keys()))
                resp_data = fallback

        normalized = dict(resp_data)
        max_concurrent_jobs = self._infer_max_concurrent_from_user_info(resp_data)
        if max_concurrent_jobs is not None:
            normalized["max_concurrent_jobs"] = max_concurrent_jobs
        return normalized

    async def get_plan_details(self, account: Account) -> Dict[str, Any]:
        """
        Get account plan details (subscription tier, credits, quality access, etc.)

        This endpoint provides comprehensive plan information including:
        - Plan type (Basic vs Premium)
        - Daily credit limits
        - Available qualities
        - Concurrency limits
        - Feature access (batch generation, off-peak, etc.)

        Args:
            account: Account to get plan details for (must have JWT token)

        Returns:
            Dictionary with plan details:
            - plan_name: e.g., "Basic Plan", "Pro - Monthly"
            - current_plan_type: 0 = Basic, 1 = Standard, 2 = Pro
            - credit_daily: Base daily credits
            - credit_daily_gift: Bonus daily credits (e.g., 60)
            - credit_monthly_gift: Monthly gift credits (e.g., 6000)
            - initial_credit_gift: One-time signup bonus
            - credit_package: Purchased credit packages
            - gen_simultaneously: Max concurrent generations (e.g., 2 free, 5 pro)
            - qualities: Available quality tiers (e.g., ["360p", "540p", "720p", "1080p"])
            - off_peak: 0/1 if off-peak access enabled
            - off_peak_discount: Discount multiplier during off-peak (e.g., "0.7" = 30% off)
            - preview_mode: 0/1 if preview mode enabled
            - preview_mode_discount: Discount multiplier for preview (e.g., "0.8" = 20% off)
            - unlimited_image_models: Models with unlimited usage (e.g., ["qwen-image"])
            - external_models: Available external models (e.g., ["sora-2", "veo-3.1-standard"])
            - veo_sora_models: 0/1 if external model access enabled
            - batch_generation: 0/1 if batch feature enabled
            - album_num: Max albums allowed
            - expired_date: Plan expiration date (ISO 8601)
            - remaining_days: Days until plan expires

        Raises:
            APIError: If API request fails or account doesn't have JWT token

        Example:
            >>> plan = await api.get_plan_details(account)
            >>> print(f"Plan: {plan['plan_name']}")
            >>> print(f"Daily credits: {plan['credit_daily'] + plan['credit_daily_gift']}")
            >>> print(f"Max concurrent: {plan['gen_simultaneously']}")
            >>> print(f"Unlimited models: {plan.get('unlimited_image_models', [])}")
        """
        # Only Web API (JWT) supports plan_details
        if not (account.session and account.session.get("jwt_token")):
            raise APIError("get_plan_details() requires JWT authentication (Web API)")

        response = await self.client._request(
            "POST",
            "/creative_platform/toc/members/plan_details",
            account=account,
            include_refresh=False,  # Don't include refresh header for read-only operation
            json={},  # Pixverse currently expects a JSON object body on this POST
        )

        resp_data = response.get("Resp", {})
        if not resp_data:
            logger.warning(
                "get_plan_details: 'Resp' key empty/missing, raw keys: %s",
                list(response.keys()),
            )
            envelope_keys = {"ErrCode", "ErrMsg", "Resp"}
            fallback = {k: v for k, v in response.items() if k not in envelope_keys}
            if fallback:
                logger.info(
                    "get_plan_details: using top-level fallback keys: %s",
                    list(fallback.keys()),
                )
                resp_data = fallback

        normalized = dict(resp_data)

        gen_simultaneously_raw = (
            resp_data.get("gen_simultaneously")
            if isinstance(resp_data, dict)
            else None
        )
        if gen_simultaneously_raw is None and isinstance(response, dict):
            # Defensive fallback: some responses may surface this field outside Resp
            gen_simultaneously_raw = response.get("gen_simultaneously")
        gen_simultaneously = self._coerce_positive_int(gen_simultaneously_raw)
        if gen_simultaneously is not None:
            normalized["gen_simultaneously"] = gen_simultaneously
            normalized["max_concurrent_jobs"] = gen_simultaneously
        else:
            # Heuristic fallback based on plan type (keeps older callers working)
            plan_type = self._coerce_int(
                resp_data.get("current_plan_type") if isinstance(resp_data, dict) else None
            )
            if plan_type is None and isinstance(response, dict):
                plan_type = self._coerce_int(response.get("current_plan_type"))
            if plan_type is not None:
                normalized["max_concurrent_jobs"] = 5 if plan_type >= 1 else 2

        return normalized

    async def create_api_key(self, account: Account, name: str = "pixverse-py") -> Dict[str, Any]:
        """
        Create an OpenAPI key for a JWT-authenticated account.

        This allows any account to get an API key for efficient status polling
        (using /openapi/v2/video/result instead of listing all videos).

        Args:
            account: Account with JWT token
            name: Name for the API key (default: "pixverse-py")

        Returns:
            Dictionary with:
            - api_key_id: The key ID
            - api_key_name: The name provided
            - api_key_sign: The actual API key (sk-...)

        Raises:
            APIError: If API request fails or account doesn't have JWT token

        Example:
            >>> result = await api.create_api_key(account, "my-app")
            >>> api_key = result["api_key_sign"]  # "sk-16bc0e5f..."
            >>> account.session["openapi_key"] = api_key  # Store for future use
        """
        if not (account.session and account.session.get("jwt_token")):
            raise APIError("create_api_key() requires JWT authentication (Web API)")

        response = await self.client._request(
            "POST",
            "/openapi/v2/key",
            account=account,
            json={"name": name},
            include_refresh=False
        )

        resp_data = response.get("Resp", {})
        return {
            "api_key_id": resp_data.get("api_key_id"),
            "api_key_name": resp_data.get("api_key_name"),
            "api_key_sign": resp_data.get("api_key_sign"),
        }

    async def get_openapi_credits(self, account: Account) -> Dict[str, int]:
        """
        Get credit balance for an OpenAPI account

        Args:
            account: Account to check credits for (must have openapi_key)

        Returns:
            Dictionary with:
            - total_credits: Sum of all credit types
            - credit_daily: Daily free credits
            - credit_monthly: Monthly subscription credits
            - credit_monthly_gift: Monthly gift/bonus credits
            - credit_package: Purchased credit packages
            - effects_available: Number of effects available
            - remaining_effects: Remaining effects
            - account_id: Account ID

        Raises:
            APIError: If API request fails or account doesn't have OpenAPI key
        """
        # Only OpenAPI (API Key) supports this endpoint
        if not (account.session and account.session.get("openapi_key")):
            raise APIError("get_openapi_credits() requires OpenAPI key authentication")

        # Use prefer_openapi=True to send API-KEY header while also including the
        # JWT token header. The /openapi/v2/account/credits endpoint requires both:
        # - API-KEY for OpenAPI authentication
        # - token header to associate with an active session (prevents 10003 errors)
        response = await self.client._request(
            "GET",
            "/openapi/v2/account/credits",
            account=account,
            include_refresh=False,  # Don't include refresh header for read-only operation
            prefer_openapi=True,  # Forces API-KEY headers while keeping token header
        )

        resp_data = response.get("Resp", {})
        account_id = resp_data.get("account_id", 0)
        credit_daily = resp_data.get("credit_daily", 0)
        credit_monthly = resp_data.get("credit_monthly", 0)
        credit_monthly_gift = resp_data.get("credit_monthly_gift", 0)
        credit_package = resp_data.get("credit_package", 0)

        # Total credits (all types)
        total_credits = credit_daily + credit_monthly + credit_monthly_gift + credit_package

        return {
            "total_credits": total_credits,
            "credit_daily": credit_daily,
            "credit_monthly": credit_monthly,
            "credit_monthly_gift": credit_monthly_gift,
            "credit_package": credit_package,
            "effects_available": resp_data.get("effects_available", 0),
            "remaining_effects": resp_data.get("remaining_effects", 0),
            "account_id": account_id
        }
