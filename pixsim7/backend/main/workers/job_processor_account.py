"""
Account management helpers for the generation job processor.

Credit verification, account reservation/release, cooldown application,
and credit hint estimation — extracted from job_processor.py.
"""
from datetime import datetime, timezone, timedelta
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain import Generation
from pixsim7.backend.main.domain.providers import ProviderAccount
from pixsim7.backend.main.services.account import AccountService
from pixsim7.backend.main.services.account_event_service import AccountEventService


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


def has_sufficient_credits(credits_data: dict, min_credits: int = 1) -> bool:
    """
    Check if account has any usable credits.

    Checks all credit types in credits_data. Returns True if any type has
    sufficient credits. This is provider-agnostic - works with any credit types.
    """
    if not credits_data:
        return False

    # Check if any credit type has sufficient credits
    for credit_type, amount in credits_data.items():
        try:
            if int(amount) >= min_credits:
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
) -> None:
    """Best-effort account release helper used across failure paths."""
    try:
        await account_service.release_account(account_id, skip_wake=skip_wake)
    except Exception as release_err:
        gen_logger.warning("account_release_failed", error=str(release_err))


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
