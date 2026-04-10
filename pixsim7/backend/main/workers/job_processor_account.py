"""
Account management helpers for the generation job processor.

Credit verification, account reservation/release, cooldown application,
and credit hint estimation — extracted from job_processor.py.
"""
from datetime import datetime, timezone, timedelta
from typing import Any, Iterable

from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain import Generation
from pixsim7.backend.main.domain.providers import ProviderAccount
from pixsim7.backend.main.services.account import AccountService
from pixsim7.backend.main.services.account_event_service import AccountEventService

_PIXVERSE_PROVIDER_ID = "pixverse"
_PIXVERSE_WEB_ONLY_OPERATION_TYPES = {
    "text_to_image",
    "image_to_image",
    "video_transition",
    "video_modify",
}
_PIXVERSE_OPENAPI_MODE_TOKENS = {"openapi", "open-api", "open_api", "open"}
_PIXVERSE_WEBAPI_MODE_TOKENS = {"webapi", "web-api", "web_api", "web"}


def _normalize_operation_type_value(value: Any) -> str:
    raw = getattr(value, "value", value)
    if not raw:
        return ""
    return str(raw).strip().lower()


def _normalize_api_mode_token(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        token = value.strip().lower()
        if token in _PIXVERSE_OPENAPI_MODE_TOKENS:
            return "openapi"
        if token in _PIXVERSE_WEBAPI_MODE_TOKENS:
            return "web"
        return None
    if isinstance(value, (bool, int)):
        return "openapi" if bool(value) else "web"
    return None


def _extract_style_api_override(container: dict[str, Any]) -> Any | None:
    generation_config = container.get("generation_config")
    if not isinstance(generation_config, dict):
        return None
    style = generation_config.get("style")
    if not isinstance(style, dict):
        return None
    provider_style = style.get("pixverse")
    if not isinstance(provider_style, dict):
        return None
    return (
        provider_style.get("api_method")
        or provider_style.get("pixverse_api_mode")
        or provider_style.get("use_openapi")
    )


def _extract_pixverse_api_mode_override(
    generation: Generation,
    params: dict[str, Any] | None = None,
) -> str | None:
    """Mirror Pixverse adapter override parsing for worker-side credit routing."""
    containers: list[dict[str, Any]] = []
    for candidate in (
        params,
        getattr(generation, "raw_params", None),
        getattr(generation, "canonical_params", None),
    ):
        if isinstance(candidate, dict):
            containers.append(candidate)

    for container in containers:
        for value in (
            container.get("api_method"),
            container.get("pixverse_api_mode"),
            container.get("use_openapi"),
            _extract_style_api_override(container),
        ):
            normalized = _normalize_api_mode_token(value)
            if normalized is not None:
                return normalized
    return None


def resolve_required_credit_types(
    generation: Generation,
    params: dict[str, Any] | None = None,
    *,
    account: ProviderAccount | None = None,
) -> list[str] | None:
    """Resolve credit pools required by this generation (provider-specific)."""
    provider_id = str(getattr(generation, "provider_id", "") or "").strip().lower()
    if provider_id != _PIXVERSE_PROVIDER_ID:
        return None

    operation_type = _normalize_operation_type_value(getattr(generation, "operation_type", None))
    if operation_type in _PIXVERSE_WEB_ONLY_OPERATION_TYPES:
        return ["web"]

    api_override = _extract_pixverse_api_mode_override(generation, params)
    if api_override == "openapi":
        return ["openapi"]
    if api_override == "web":
        return ["web"]

    # All generation routes through WebAPI. Accounts with only "openapi" credits
    # and zero web credits cannot submit via WebAPI and must not be selected.
    return ["web"]


def _normalize_required_credit_types(required_credit_types: Iterable[str] | None) -> list[str]:
    if required_credit_types is None:
        return []
    normalized: list[str] = []
    for credit_type in required_credit_types:
        token = str(credit_type or "").strip().lower()
        if not token:
            continue
        if token in _PIXVERSE_WEBAPI_MODE_TOKENS:
            token = "web"
        elif token in _PIXVERSE_OPENAPI_MODE_TOKENS:
            token = "openapi"
        if token not in normalized:
            normalized.append(token)
    return normalized


def has_positive_credits(
    credits_data: dict[str, Any] | None,
    *,
    required_credit_types: Iterable[str] | None = None,
) -> bool:
    """Return True when at least one applicable credit pool is positive."""
    if not credits_data:
        return False

    required = _normalize_required_credit_types(required_credit_types)
    if required:
        values = [credits_data.get(credit_type) for credit_type in required]
    else:
        values = list(credits_data.values())

    for amount in values:
        try:
            if int(amount or 0) > 0:
                return True
        except (TypeError, ValueError):
            continue
    return False


async def refresh_account_credits(
    account: ProviderAccount,
    account_service: AccountService,
    gen_logger,
) -> dict:
    """
    Refresh credits for an account from the provider.

    Returns dict with credit amounts, or empty dict on failure.
    Credit types are determined dynamically from the provider's manifest/adapter
    via get_credit_types() instead of being hardcoded.
    """
    from pixsim7.backend.main.domain.providers.registry import registry

    try:
        provider = registry.get(account.provider_id)

        # Use get_credits (fast, no ad-task lookup)
        if hasattr(provider, 'get_credits'):
            credits_data = await provider.get_credits(account, retry_on_session_error=False)
        else:
            # Provider has no remote credit-fetch method (e.g. web-API-replay
            # providers like Remaker).  Fall back to DB-stored credits so the
            # account isn't incorrectly rejected/exhausted.
            if account.credits:
                return {c.credit_type: c.amount for c in account.credits}
            gen_logger.debug("provider_no_credits_method", provider_id=account.provider_id)
            return {}

        # Get valid credit types from provider (no longer hardcoded)
        valid_credit_types = set()
        if hasattr(provider, 'get_credit_types'):
            valid_credit_types = set(provider.get_credit_types())
        else:
            # Fallback for providers without get_credit_types()
            valid_credit_types = {'web', 'openapi', 'standard', 'usage'}

        # Update credits in database and build filtered result
        filtered_credits = {}
        if credits_data:
            for credit_type, amount in credits_data.items():
                if credit_type in valid_credit_types:
                    try:
                        await account_service.set_credit(account.id, credit_type, int(amount))
                        filtered_credits[credit_type] = int(amount)
                    except Exception as e:
                        gen_logger.warning("credit_update_failed", credit_type=credit_type, error=str(e))

            gen_logger.info("credits_refreshed", account_id=account.id, credits=filtered_credits)
            AccountEventService.record(
                "credits_refreshed",
                account.id,
                provider_id=account.provider_id,
                extra={"credits": filtered_credits},
            )

        return filtered_credits

    except Exception as e:
        gen_logger.warning("credits_refresh_failed", account_id=account.id, error=str(e))
        return {}


async def refresh_account_credits_best_effort(
    account: ProviderAccount,
    account_service: AccountService,
    gen_logger,
    *,
    db: AsyncSession | None = None,
    success_log_event: str | None = None,
    success_log_fields: dict[str, Any] | None = None,
    failure_log_event: str | None = None,
    failure_log_fields: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Best-effort credit refresh wrapper with optional commit and caller-specific logs.

    This intentionally swallows errors and returns an empty dict so callers can keep
    their non-critical control flow unchanged.
    """
    try:
        credits = await refresh_account_credits(account, account_service, gen_logger)
        if db is not None:
            await db.commit()
        if success_log_event:
            info_fields = dict(success_log_fields or {})
            gen_logger.info(success_log_event, **info_fields)
        return credits or {}
    except Exception as e:
        warn_fields = dict(failure_log_fields or {})
        warn_fields.setdefault("error", str(e))
        if failure_log_event:
            gen_logger.warning(failure_log_event, **warn_fields)
        else:
            gen_logger.warning("credit_refresh_failed", **warn_fields)
        return {}


def has_sufficient_credits(
    credits_data: dict[str, Any] | None,
    min_credits: int = 1,
    *,
    required_credit_types: Iterable[str] | None = None,
) -> bool:
    """
    Check if account has any usable credits.

    Checks all credit types in credits_data. Returns True if any type has
    sufficient credits. This is provider-agnostic - works with any credit types.
    """
    if not credits_data:
        return False

    try:
        min_required = int(min_credits)
    except (TypeError, ValueError):
        min_required = 1

    if min_required <= 0:
        return has_positive_credits(
            credits_data,
            required_credit_types=required_credit_types,
        )

    required = _normalize_required_credit_types(required_credit_types)
    if required:
        values = [credits_data.get(credit_type) for credit_type in required]
    else:
        values = list(credits_data.values())

    for amount in values:
        try:
            if int(amount) >= min_required:
                return True
        except (ValueError, TypeError):
            continue

    return False


def _required_generation_credit_hint(
    generation: Generation,
    params: dict[str, Any] | None = None,
) -> int | None:
    """Best-effort required credit estimate for pre-submit account filtering.

    Prefer the normalized billing field computed at creation time, and fall back
    to provider-param hints when available.
    """
    estimated = getattr(generation, "estimated_credits", None)
    if estimated is not None:
        try:
            return max(0, int(estimated))
        except Exception:
            pass

    if isinstance(params, dict):
        raw_hint = params.get("credit_change")
        if raw_hint is not None:
            try:
                # `credit_change` is a delta hint; normalize to positive cost.
                return max(0, abs(int(raw_hint)))
            except Exception:
                try:
                    return max(0, abs(int(float(raw_hint))))
                except Exception:
                    pass

    return None


def is_unlimited_model(account: ProviderAccount, model: str | None) -> bool:
    """Check if the model is in the account's unlimited image models list.

    Unlimited models (e.g. qwen-image on Pro plans) don't consume credits,
    so credit checks should be bypassed for them.
    """
    if not model or not account.provider_metadata:
        return False
    unlimited = account.provider_metadata.get("plan_unlimited_image_models") or []
    return model in unlimited


def _is_pinned_account(generation: Generation, account: ProviderAccount) -> bool:
    """Return True when the account is the user's explicitly-pinned choice."""
    pref = getattr(generation, 'preferred_account_id', None)
    return pref is not None and pref == account.id


async def _release_account_reservation(
    *,
    account_service: AccountService,
    account_id: int,
    gen_logger,
    skip_wake: bool = False,
) -> bool:
    """Best-effort account release helper used across failure paths."""
    try:
        await account_service.release_account(account_id, skip_wake=skip_wake)
        return True
    except Exception as release_err:
        gen_logger.warning("account_release_failed", error=str(release_err))
        return False


async def _apply_account_cooldown(
    *,
    db: AsyncSession,
    account: ProviderAccount,
    cooldown_seconds: int,
    gen_logger,
    event_name: str,
    error_code: str | None = None,
) -> None:
    """Apply account cooldown and log outcome."""
    try:
        account.cooldown_until = datetime.now(timezone.utc) + timedelta(
            seconds=cooldown_seconds,
        )
        await db.commit()
        payload = {
            "account_id": account.id,
            "cooldown_seconds": cooldown_seconds,
        }
        if error_code:
            payload["error_code"] = error_code
        gen_logger.info(event_name, **payload)
        AccountEventService.record(
            "cooldown_applied",
            account.id,
            provider_id=account.provider_id,
            cooldown_seconds=cooldown_seconds,
            error_code=error_code,
        )
    except Exception as cooldown_err:
        gen_logger.warning(
            "account_cooldown_failed",
            account_id=account.id,
            error=str(cooldown_err),
        )
