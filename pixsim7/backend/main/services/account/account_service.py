"""
AccountService - provider account selection and management

Clean service for account pool management with normalized credit tracking
"""
import re
from typing import Optional, Dict, Any, Callable
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, and_, exists, cast, String
from sqlalchemy.exc import IntegrityError

from pixsim_logging import get_logger
from pixsim7.backend.main.services.account_event_service import AccountEventService

from pixsim7.backend.main.domain import AccountStatus, Generation, GenerationStatus
from pixsim7.backend.main.domain.providers import (
    ProviderAccount,
    ProviderCredit,
)
from pixsim7.backend.main.domain.grants import ResourceGrant, ResourceGrantType
from pixsim7.backend.main.services.grants import ResourceGrantService
from pixsim7.backend.main.domain.provider_auth import PixverseAuthMethod
from pixsim7.backend.main.shared.errors import (
    NoAccountAvailableError,
    AccountExhaustedError,
    ResourceNotFoundError,
)
from pixsim7.backend.main.infrastructure.queue import (
    clear_generation_wait_metadata,
    enqueue_generation_fresh_job,
    get_generation_wait_metadata,
)
from pixsim7.backend.main.domain.providers.model_families import MODEL_ID_TO_FAMILY

logger = get_logger()

# Maximum concurrent-limit cooldown (matches CONCURRENT_COOLDOWN_SECONDS in
# worker_concurrency.py).  Any remaining cooldown at or below this threshold
# was set by a concurrent-limit rejection and is stale once a slot frees.
# Auth cooldowns (300 s) are well above this and preserved.
_MAX_CONCURRENT_COOLDOWN_SECONDS = 30
_ACCOUNTLESS_CREDIT_FLOOR = 1_000_000
_ROUTING_CANDIDATE_SCAN_LIMIT = 200
_HIGH_COST_MIN_CREDIT_HINT = 50


def _normalize_route_token(value: Any) -> str:
    token = str(value or "").strip().lower()
    if token in {"", "*", "_any", "any"}:
        return "*"
    return token


def _strip_model_zero_segments(value: str) -> str:
    """
    Normalize ``x.0`` version segments used by operator shorthand.

    Example: ``seedream-5.0-lite`` -> ``seedream-5-lite``.
    """
    return re.sub(r"(?<=\d)\.0(?=(?:[^0-9]|$))", "", value)


def _build_route_model_alias_map() -> dict[str, str]:
    canonical_ids = {
        _normalize_route_token(model_id)
        for model_id in MODEL_ID_TO_FAMILY.keys()
        if str(model_id or "").strip()
    }

    aliases: dict[str, str] = {}
    ambiguous_aliases: set[str] = set()

    for canonical in canonical_ids:
        candidates: set[str] = set()
        if canonical.endswith("-lite"):
            base = canonical[: -len("-lite")]
            candidates.add(base)
            candidates.add(_strip_model_zero_segments(base))
        candidates.add(_strip_model_zero_segments(canonical))

        for alias in candidates:
            alias_token = _normalize_route_token(alias)
            if alias_token in {"*", canonical}:
                continue
            # Never alias over another explicit canonical ID.
            if alias_token in canonical_ids:
                continue
            existing = aliases.get(alias_token)
            if existing is None:
                aliases[alias_token] = canonical
            elif existing != canonical:
                ambiguous_aliases.add(alias_token)

    for ambiguous in ambiguous_aliases:
        aliases.pop(ambiguous, None)

    # Guardrail for current high-volume shorthand that appears in manual routing.
    aliases.setdefault("seedream-5.0", "seedream-5.0-lite")
    aliases.setdefault("seedream-5", "seedream-5.0-lite")
    return aliases


_ROUTE_MODEL_ALIAS_MAP = _build_route_model_alias_map()


def _normalize_route_model_token(value: Any) -> str:
    token = _normalize_route_token(value)
    if token == "*":
        return token
    return _ROUTE_MODEL_ALIAS_MAP.get(token, token)


def _parse_route_pattern(value: Any) -> tuple[str, str] | None:
    if value is None:
        return None
    if isinstance(value, dict):
        op = _normalize_route_token(value.get("operation"))
        model = _normalize_route_model_token(value.get("model"))
        return op, model

    text = str(value).strip().lower()
    if not text:
        return None
    if ":" in text:
        op_raw, model_raw = text.split(":", 1)
        return _normalize_route_token(op_raw), _normalize_route_model_token(model_raw)
    return _normalize_route_token(text), "*"


def _iter_route_patterns(raw: Any) -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    if raw is None:
        return out

    if isinstance(raw, dict):
        for op_key, model_values in raw.items():
            op = _normalize_route_token(op_key)
            if isinstance(model_values, (list, tuple, set)):
                for model_value in model_values:
                    out.append((op, _normalize_route_model_token(model_value)))
            else:
                out.append((op, _normalize_route_model_token(model_values)))
        return out

    items = raw if isinstance(raw, (list, tuple, set)) else [raw]
    for item in items:
        if isinstance(item, dict):
            op = _normalize_route_token(item.get("operation"))
            models = item.get("models")
            if isinstance(models, (list, tuple, set)):
                for model_value in models:
                    out.append((op, _normalize_route_model_token(model_value)))
                continue
            parsed = _parse_route_pattern(item)
            if parsed:
                out.append(parsed)
            continue

        parsed = _parse_route_pattern(item)
        if parsed:
            out.append(parsed)
    return out


def _iter_priority_rules(raw: Any) -> list[tuple[str, str, int]]:
    out: list[tuple[str, str, int]] = []
    if raw is None:
        return out

    if isinstance(raw, dict):
        for key, value in raw.items():
            if isinstance(value, dict):
                op = _normalize_route_token(key)
                for model_key, delta in value.items():
                    try:
                        out.append((op, _normalize_route_model_token(model_key), int(delta)))
                    except (TypeError, ValueError):
                        continue
                continue

            parsed = _parse_route_pattern(key)
            if not parsed:
                continue
            try:
                out.append((parsed[0], parsed[1], int(value)))
            except (TypeError, ValueError):
                continue
        return out

    items = raw if isinstance(raw, (list, tuple, set)) else [raw]
    for item in items:
        if not isinstance(item, dict):
            continue
        parsed = _parse_route_pattern(item)
        if not parsed:
            continue
        try:
            delta = int(item.get("delta"))
        except (TypeError, ValueError):
            continue
        out.append((parsed[0], parsed[1], delta))
    return out


def _matches_route_pattern(pattern_op: str, pattern_model: str, op: str, model: str) -> bool:
    op_match = pattern_op == "*" or pattern_op == op
    model_match = pattern_model == "*" or pattern_model == model
    return op_match and model_match


def _route_pattern_key(op: str, model: str) -> str:
    return f"{op}:{model}"


def _normalize_route_pattern_list(raw: Any) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for op, model in _iter_route_patterns(raw):
        pattern = _route_pattern_key(op, model)
        if pattern in seen:
            continue
        seen.add(pattern)
        out.append(pattern)
    return out


def _normalize_route_priority_overrides(raw: Any) -> dict[str, int]:
    out: dict[str, int] = {}
    for op, model, delta in _iter_priority_rules(raw):
        key = _route_pattern_key(op, model)
        out[key] = int(out.get(key, 0)) + int(delta)
    return out


def _account_route_payload(account: ProviderAccount) -> tuple[list[tuple[str, str]], list[tuple[str, str]], list[tuple[str, str, int]]]:
    allow_patterns = _iter_route_patterns(getattr(account, "routing_allow_patterns", None))
    deny_patterns = _iter_route_patterns(getattr(account, "routing_deny_patterns", None))
    priority_rules = _iter_priority_rules(getattr(account, "routing_priority_overrides", None))

    metadata = getattr(account, "provider_metadata", None)
    if not isinstance(metadata, dict):
        metadata = {}

    allow_patterns.extend(_iter_route_patterns(metadata.get("routing_allow_patterns")))
    deny_patterns.extend(_iter_route_patterns(metadata.get("routing_deny_patterns")))
    priority_rules.extend(_iter_priority_rules(metadata.get("routing_priority_overrides")))

    routing_rules = metadata.get("routing_rules")
    if isinstance(routing_rules, dict):
        allow_patterns.extend(_iter_route_patterns(routing_rules.get("allow_patterns")))
        deny_patterns.extend(_iter_route_patterns(routing_rules.get("deny_patterns")))
        priority_rules.extend(_iter_priority_rules(routing_rules.get("priority_overrides")))

    return allow_patterns, deny_patterns, priority_rules


def _account_matches_routing(account: ProviderAccount, *, operation_type: str | None, model: str | None) -> bool:
    if operation_type is None and model is None:
        return True

    op = _normalize_route_token(operation_type)
    model_token = _normalize_route_model_token(model)
    allow_patterns, deny_patterns, _ = _account_route_payload(account)

    if allow_patterns:
        if not any(_matches_route_pattern(p_op, p_model, op, model_token) for p_op, p_model in allow_patterns):
            return False

    if deny_patterns:
        if any(_matches_route_pattern(p_op, p_model, op, model_token) for p_op, p_model in deny_patterns):
            return False

    return True


def _account_priority_delta(account: ProviderAccount, *, operation_type: str | None, model: str | None) -> int:
    if operation_type is None and model is None:
        return 0

    op = _normalize_route_token(operation_type)
    model_token = _normalize_route_model_token(model)
    _, _, priority_rules = _account_route_payload(account)

    delta = 0
    for p_op, p_model, p_delta in priority_rules:
        if _matches_route_pattern(p_op, p_model, op, model_token):
            delta += p_delta
    return delta


_UNLIMITED_IMAGE_MODELS_METADATA_KEY = "plan_unlimited_image_models"


def _account_has_unlimited_model(account: ProviderAccount, model: str | None) -> bool:
    """True when ``model`` is in the account's plan-unlimited list.

    PixVerse Pro plans rotate which models don't consume credits; the list
    is synced into ``provider_metadata.plan_unlimited_image_models`` by
    ``pixverse_credits.PixverseCreditsMixin`` during the credits poll.
    Account selection uses this as a top-tier preference: if account A has
    the chosen model unlimited and account B doesn't, A wins regardless of
    base priority — picking the paid account when a free one is available
    is never the right call. Matched via the routing-pattern alias
    normalizer so canonical ids (``seedream-4.0``) and operator shorthand
    (``seedream-4``) line up.
    """
    if not model:
        return False

    metadata = getattr(account, "provider_metadata", None)
    if not isinstance(metadata, dict):
        return False

    raw = metadata.get(_UNLIMITED_IMAGE_MODELS_METADATA_KEY)
    if not isinstance(raw, (list, tuple, set)) or not raw:
        return False

    target = _normalize_route_model_token(model)
    if target == "*":
        return False

    for entry in raw:
        if not entry:
            continue
        if _normalize_route_model_token(str(entry)) == target:
            return True
    return False


def _account_unlimited_model_sql_clause(model: str | None):
    """SQL counterpart of ``_account_has_unlimited_model``: a WHERE clause
    that's true for accounts whose
    ``provider_metadata.plan_unlimited_image_models`` list contains
    ``model``.

    Used to bypass the credit pre-filter — without this, an account whose
    stored credits are below ``min_credits`` is silently dropped at the SQL
    level even when the requested model is unlimited for that account, and
    the unlimited tier in ``_rank_candidates`` never gets to see it.

    Implementation: ``->>`` returns the JSON array's text form (e.g.
    ``["seedream-4.0","qwen-image"]``) and we LIKE-match the JSON-quoted
    variant against it. We expand ``model`` through ``_ROUTE_MODEL_ALIAS_MAP``
    so that operator shorthand (``seedream-4``) matches a stored canonical
    entry (``seedream-4.0``) and vice-versa, mirroring what the Python
    helper does. Scoping to that single key keeps the LIKE from matching
    against unrelated metadata strings.

    Returns ``None`` when ``model`` is missing or wildcard so the caller
    can skip OR-ing it in.
    """
    if not model:
        return None
    canonical = _normalize_route_model_token(model)
    if canonical == "*":
        return None

    # Variants: canonical token + every alias that maps to it. Without this,
    # an account that stores ``"seedream-4"`` won't match a request for
    # ``"seedream-4.0"`` even though they're the same model to the ranker.
    variants = {canonical}
    for alias, mapped in _ROUTE_MODEL_ALIAS_MAP.items():
        if mapped == canonical:
            variants.add(alias)

    unlimited_text = ProviderAccount.provider_metadata.op("->>")(
        _UNLIMITED_IMAGE_MODELS_METADATA_KEY
    )

    clauses = []
    for variant in variants:
        # JSON serializes strings with double-quotes, so a raw match
        # against the array's text form is unambiguous about element
        # boundaries.
        pattern = f'%"{variant}"%'
        clauses.append(unlimited_text.like(pattern))
    return or_(*clauses)


def extract_account_promotion_discounts(
    account: ProviderAccount | None,
) -> Dict[str, float]:
    """Validated ``provider_metadata.promotion_discounts`` map for an account.

    Single source of truth for reading the per-model discount multipliers
    that billing (``pixverse._account_promotion_discounts``) and selection
    (``_account_discount_factor``) both consume. Both used to inline the
    extraction with slightly different validation; centralizing keeps them
    from drifting again as the metadata schema evolves.

    Returns an empty dict when the account is missing, the metadata key is
    absent, or every entry is malformed — callers who need to distinguish
    "no promos" from "all-filtered" can check truthiness.

    Validation: numeric (rejects bool, which Python would otherwise coerce
    to 1/0) and within ``[0.0, 1.0)``. ``1.0`` is no discount and ``>1.0``
    would surcharge — neither is a valid discount, both are dropped.
    """
    if account is None:
        return {}
    metadata = getattr(account, "provider_metadata", None)
    if not isinstance(metadata, dict):
        return {}
    raw = metadata.get("promotion_discounts")
    if not isinstance(raw, dict):
        return {}
    return {
        str(model_id): float(multiplier)
        for model_id, multiplier in raw.items()
        if isinstance(multiplier, (int, float))
        and not isinstance(multiplier, bool)
        and 0.0 <= float(multiplier) < 1.0
    }


def _account_discount_factor(account: ProviderAccount, model: str | None) -> float:
    """Active promo multiplier for ``model`` on this account, ``1.0`` if none.

    Used as a sort tier between unlimited and base priority — when two
    accounts both lack the model in their unlimited list, prefer whichever
    has the deeper discount. Validation lives in
    ``extract_account_promotion_discounts``; this helper only adds the
    selection-specific concern of matching the model with alias
    normalization (so operator shorthand ``seedream-4`` hits a stored
    canonical entry ``seedream-4.0``).
    """
    if not model:
        return 1.0
    target = _normalize_route_model_token(model)
    if target == "*":
        return 1.0
    discounts = extract_account_promotion_discounts(account)
    for model_id, multiplier in discounts.items():
        if _normalize_route_model_token(model_id) == target:
            return multiplier
    return 1.0


def _account_discount_sql_clause(model: str | None):
    """SQL counterpart of ``_account_discount_factor``: clause that's true
    when an active promo for ``model`` exists in the account's
    ``provider_metadata.promotion_discounts`` dict.

    Same purpose as ``_account_unlimited_model_sql_clause`` but for the
    discount tier — the per-model cost on this account is below base price
    (possibly zero), so the credit pre-filter (sized to the *base* cost via
    ``_required_generation_credit_hint``) would over-eagerly drop it.
    Bypassing lets the discount tier rank it and the live ``verify_credits``
    catch genuinely-empty accounts.

    LIKE pattern ``%"variant":%`` matches a JSON object key — promo dict
    values are floats (``{"v6": 0.7}``), so the colon disambiguates a key
    match from a value or substring match. Variants are expanded through
    ``_ROUTE_MODEL_ALIAS_MAP`` for the same shorthand/canonical reason.
    """
    if not model:
        return None
    canonical = _normalize_route_model_token(model)
    if canonical == "*":
        return None

    variants = {canonical}
    for alias, mapped in _ROUTE_MODEL_ALIAS_MAP.items():
        if mapped == canonical:
            variants.add(alias)

    discounts_text = ProviderAccount.provider_metadata.op("->>")(
        "promotion_discounts"
    )

    clauses = []
    for variant in variants:
        pattern = f'%"{variant}":%'
        clauses.append(discounts_text.like(pattern))
    return or_(*clauses)


def _total_credits_subquery():
    """Correlated subquery yielding sum(amount) of all credits for the
    outer ProviderAccount row, coalesced to 0 when no credit rows exist."""
    return (
        select(func.coalesce(func.sum(ProviderCredit.amount), 0))
        .where(ProviderCredit.account_id == ProviderAccount.id)
        .correlate(ProviderAccount)
        .scalar_subquery()
        .label("total_credits")
    )


# JSON scope accessors for provider-slots ResourceGrant rows.
_GRANT_SCOPE_PROVIDER = ResourceGrant.scope.op("->>")("provider_id")
_GRANT_SCOPE_MODEL = ResourceGrant.scope.op("->>")("model")
_GRANT_SCOPE_ACCOUNT = ResourceGrant.scope.op("->>")("account_id")


def _grant_visibility_clause(user_id: int):
    """SQL EXISTS: an account is reachable by ``user_id`` via a live
    provider-slots grant when the rule's owner owns the account, the provider
    matches, and the rule is either pooled (no account in scope) or pinned to
    this account."""
    return exists().where(
        and_(
            ResourceGrant.recipient_user_id == user_id,
            ResourceGrant.resource_type == ResourceGrantType.PROVIDER_SLOTS,
            ResourceGrant.revoked_at.is_(None),
            or_(
                ResourceGrant.expires_at.is_(None),
                ResourceGrant.expires_at > func.now(),
            ),
            ResourceGrant.owner_user_id == ProviderAccount.user_id,
            _GRANT_SCOPE_PROVIDER == ProviderAccount.provider_id,
            or_(
                _GRANT_SCOPE_ACCOUNT.is_(None),
                _GRANT_SCOPE_ACCOUNT == cast(ProviderAccount.id, String),
            ),
        )
    )


def _apply_user_visibility_filter(query, user_id: Optional[int]):
    """Restrict an account query to the rows visible to ``user_id``: their
    own accounts, any shared (non-private) accounts, plus accounts reachable
    through a live provider-slots grant rule. With no user, only shared
    accounts are visible."""
    if user_id:
        return query.where(
            (ProviderAccount.user_id == user_id)
            | (ProviderAccount.is_private == False)  # noqa: E712
            | _grant_visibility_clause(user_id)
        )
    return query.where(ProviderAccount.is_private == False)  # noqa: E712


class AccountService:
    """
    Provider account management service

    Handles:
    - Account selection (rotation, load balancing)
    - Account state management
    - Credit tracking
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    @staticmethod
    def _default_max_concurrent_jobs(provider_id: str) -> int:
        """
        Provider-specific account concurrency defaults.

        Remaker prompt-editor appears to allow one in-flight generation per
        account reliably; keep other providers on the historical default.
        """
        if (provider_id or "").strip().lower() == "remaker":
            return 1
        return 2

    @staticmethod
    def _accountless_email(provider_id: str) -> str:
        normalized = "".join(
            ch if ch.isalnum() else "-"
            for ch in (provider_id or "").strip().lower()
        ).strip("-")
        if not normalized:
            normalized = "provider"
        return f"accountless+{normalized}@pixsim.local"

    @staticmethod
    def _lookup_provider_manifest(provider_id: str) -> tuple[bool, list[str]]:
        """
        Return (requires_credentials, credit_types) from provider manifest.

        Unknown providers default to requires_credentials=True so callers
        keep existing behavior.
        """
        from pixsim7.backend.main.domain.providers.registry import registry

        try:
            provider = registry.get(provider_id)
        except Exception:
            return True, []

        manifest = provider.get_manifest() if hasattr(provider, "get_manifest") else None
        if manifest is None:
            return True, []

        requires_credentials = bool(getattr(manifest, "requires_credentials", True))
        raw_credit_types = getattr(manifest, "credit_types", None) or []
        credit_types = [item for item in raw_credit_types if isinstance(item, str) and item.strip()]
        return requires_credentials, credit_types

    async def _ensure_accountless_shared_account(
        self,
        provider_id: str,
    ) -> ProviderAccount | None:
        """
        Ensure a shared system account exists for no-credentials providers.

        This keeps existing worker/account flows intact while enabling local
        providers to run without manual account setup.
        """
        requires_credentials, credit_types = self._lookup_provider_manifest(provider_id)
        if requires_credentials:
            return None

        account_email = self._accountless_email(provider_id)

        def _account_query():
            return select(ProviderAccount).where(
                ProviderAccount.provider_id == provider_id,
                ProviderAccount.user_id.is_(None),
                ProviderAccount.email == account_email,
            )

        result = await self.db.execute(_account_query())
        account = result.scalar_one_or_none()

        if not account:
            account = ProviderAccount(
                user_id=None,
                email=account_email,
                provider_id=provider_id,
                is_private=False,
                nickname="Accountless System Account",
                status=AccountStatus.ACTIVE,
                max_concurrent_jobs=self._default_max_concurrent_jobs(provider_id),
                provider_metadata={
                    "accountless": True,
                    "managed_by": "system",
                },
                created_at=datetime.now(timezone.utc),
            )
            self.db.add(account)
            try:
                await self.db.flush()
            except IntegrityError:
                # Another worker created it concurrently.
                await self.db.rollback()
                result = await self.db.execute(_account_query())
                account = result.scalar_one_or_none()
                if not account:
                    return None

        # Normalize fields if a legacy/system row already exists.
        account.is_private = False
        if not account.max_concurrent_jobs or account.max_concurrent_jobs < 1:
            account.max_concurrent_jobs = self._default_max_concurrent_jobs(provider_id)
        if account.status not in (AccountStatus.ACTIVE, AccountStatus.EXHAUSTED):
            account.status = AccountStatus.ACTIVE
        account.cooldown_until = None

        metadata = dict(account.provider_metadata or {})
        metadata["accountless"] = True
        metadata.setdefault("managed_by", "system")
        account.provider_metadata = metadata

        await self.db.flush()

        credits = await self.get_credits(account.id)
        has_positive_credits = any(int(amount or 0) > 0 for amount in credits.values())
        if not has_positive_credits:
            credit_type = credit_types[0] if credit_types else "web"
            await self.set_credit(account.id, credit_type, _ACCOUNTLESS_CREDIT_FLOOR)

        # Ensure account is runnable after credit seeding.
        if account.status != AccountStatus.ACTIVE:
            account.status = AccountStatus.ACTIVE
            await self.db.flush()

        return account

    async def reserve_or_create_accountless_account(
        self,
        provider_id: str,
    ) -> ProviderAccount | None:
        """
        Reserve a shared accountless account for providers that don't need creds.
        """
        account = await self._ensure_accountless_shared_account(provider_id)
        if account is None:
            return None
        return await self.reserve_account_if_available(account.id)

    # ===== ACCOUNT SELECTION =====

    async def select_account(
        self,
        provider_id: str,
        user_id: Optional[int] = None,
        required_credits: Optional[int] = None,
        operation_type: Optional[str] = None,
        model: Optional[str] = None,
        ignore_availability: bool = False,
    ) -> ProviderAccount:
        """
        Select best available account for provider

        Selection strategy:
        1. User's private accounts first (if user_id provided)
        2. Shared accounts (is_private=False)
        3. Filter by required_credits if specified (provider-specific)
        4. Sort by: priority (desc), credits (asc), last_used (asc)

        Args:
            provider_id: Provider ID (e.g., "pixverse")
            user_id: User ID (optional, for private accounts)
            required_credits: Minimum credits required (optional, provider-specific)
                             If None, just checks that account has any credits
            operation_type: Optional operation identifier for routing filters
            model: Optional model identifier for routing filters
            ignore_availability: When True, skip the transient gates
                (concurrency, cooldown, daily-limit) and only check whether an
                account is *structurally* eligible — right status, right
                routing, and sufficient credits. Used by the creation-time
                fail-fast probe so concurrency-full accounts don't get
                mis-reported as "insufficient credits"; the worker already
                handles `NoAccountAvailableError` by deferring to the retry
                queue, so the fail-fast only needs to reject on real credit
                insufficiency.

        Returns:
            Selected account

        Raises:
            NoAccountAvailableError: No suitable account found
        """
        # Build query for available accounts
        query = select(ProviderAccount).where(
            ProviderAccount.provider_id == provider_id,
            ProviderAccount.status == AccountStatus.ACTIVE,
        )
        query = _apply_user_visibility_filter(query, user_id)

        if not ignore_availability:
            # Filter out accounts in cooldown
            now = datetime.now(timezone.utc)
            query = query.where(
                (ProviderAccount.cooldown_until == None) |
                (ProviderAccount.cooldown_until < now)
            )

            # Filter out accounts at max concurrency
            query = query.where(
                ProviderAccount.current_processing_jobs < ProviderAccount.max_concurrent_jobs
            )

        # Sort by priority, then lowest credits first (drain cheap accounts),
        # then least recently used as tiebreaker.
        _total_credits = _total_credits_subquery()
        query = query.order_by(
            ProviderAccount.priority.desc(),
            _total_credits.asc(),
            ProviderAccount.last_used.asc().nullsfirst(),
        )

        result = await self.db.execute(query)
        accounts = result.scalars().all()

        # Filter by required credits (in Python, since credits are in related table)
        available_accounts = []
        for account in accounts:
            # Credit-bypass tiers:
            #   - unlimited: model never consumes credits on this account.
            #   - discount (factor < 1.0): effective cost is below base, so
            #     the base-cost credit gate would over-eagerly drop accounts
            #     that could in fact afford the run. Same root cause as the
            #     SQL pre-filter issue ``_account_unlimited_model_sql_clause``
            #     fixes in ``select_and_reserve_account``. Live verify_credits
            #     catches genuinely-empty accounts downstream.
            unlimited = _account_has_unlimited_model(account, model)
            discount_factor = _account_discount_factor(account, model)
            cheaper_than_base = unlimited or discount_factor < 1.0

            if ignore_availability:
                # Structural eligibility only: status + any credits.
                # Cooldown/concurrency/daily-limit are transient and the
                # worker handles them via retry-queue deferral.
                if account.status != AccountStatus.ACTIVE:
                    continue
                if not cheaper_than_base and not account.has_any_credits():
                    continue
            else:
                if cheaper_than_base:
                    # Skip the credit half of is_available() — operational
                    # gates (status, cooldown, daily, concurrency) still
                    # apply.
                    if not account.is_operationally_available():
                        continue
                elif not account.is_available():
                    continue

            if required_credits is not None and not cheaper_than_base:
                if not account.has_sufficient_credits(required_credits):
                    continue

            if not _account_matches_routing(
                account,
                operation_type=operation_type,
                model=model,
            ):
                continue

            available_accounts.append(account)

        if not available_accounts:
            # No regular account available: for providers that explicitly do not
            # require credentials, fall back to a managed shared system account.
            accountless = await self._ensure_accountless_shared_account(provider_id)
            if accountless and (ignore_availability or accountless.is_operationally_available()):
                if required_credits is None or accountless.has_sufficient_credits(required_credits):
                    logger.info(
                        "accountless_account_selected",
                        provider_id=provider_id,
                        account_id=accountless.id,
                    )
                    return accountless
            raise NoAccountAvailableError(provider_id)

        if operation_type is not None or model is not None:
            # Same tiering as select_and_reserve_account: unlimited beats
            # discount beats base priority. Keeps the fail-fast probe in
            # sync with the live selector so the UI's cost preview reflects
            # the account that will actually be used.
            available_accounts.sort(
                key=lambda a: (
                    -1 if _account_has_unlimited_model(a, model) else 0,
                    _account_discount_factor(a, model),
                    -(
                        int(getattr(a, "priority", 0) or 0)
                        + _account_priority_delta(a, operation_type=operation_type, model=model)
                    ),
                    a.get_total_credits(),
                    a.last_used or datetime.min.replace(tzinfo=timezone.utc),
                )
            )

        # Return first match (sorted by unlimited, discount, routing-aware priority, credit/lru)
        return available_accounts[0]

    async def reserve_account(self, account_id: int) -> ProviderAccount:
        """
        Reserve account for job (increment concurrency counter)
        
        Uses SELECT FOR UPDATE to prevent race conditions when multiple jobs
        try to reserve the same account simultaneously.

        Args:
            account_id: Account ID

        Returns:
            Updated account

        Raises:
            ResourceNotFoundError: Account not found
        """
        # Lock row for update to prevent race conditions
        query = select(ProviderAccount).where(
            ProviderAccount.id == account_id
        ).with_for_update()

        result = await self.db.execute(query)
        account = result.scalar_one_or_none()

        if not account:
            raise ResourceNotFoundError("ProviderAccount", account_id)

        account.current_processing_jobs += 1
        account.last_used = datetime.now(timezone.utc)

        await self.db.commit()
        await self.db.refresh(account)

        return account

    async def reserve_account_if_available(
        self,
        account_id: int,
        *,
        require_active: bool = False,
        include_exhausted: bool = False,
        now: datetime | None = None,
        skip_locked: bool = False,
    ) -> ProviderAccount | None:
        """
        Reserve account only if it has capacity. Returns None if at limit.

        Uses SELECT FOR UPDATE with a capacity filter to atomically check
        and reserve in one query, preventing race conditions.

        When ``require_active`` is set, the row is also filtered on status and
        cooldown — used by the routing path to atomically lock-and-verify the
        full eligibility of a candidate that was chosen from an unlocked scan.
        ``skip_locked`` returns None immediately if another transaction holds
        the row lock; the caller should try the next candidate rather than
        wait.
        """
        clauses = [
            ProviderAccount.id == account_id,
            ProviderAccount.current_processing_jobs < ProviderAccount.max_concurrent_jobs,
        ]
        if require_active:
            allowed_statuses = (
                [AccountStatus.ACTIVE, AccountStatus.EXHAUSTED]
                if include_exhausted
                else [AccountStatus.ACTIVE]
            )
            clauses.append(ProviderAccount.status.in_(allowed_statuses))
            cutoff = now or datetime.now(timezone.utc)
            clauses.append(
                (ProviderAccount.cooldown_until == None)  # noqa: E711
                | (ProviderAccount.cooldown_until < cutoff)
            )

        query = (
            select(ProviderAccount)
            .where(*clauses)
            .with_for_update(skip_locked=skip_locked)
            .execution_options(populate_existing=True)
        )

        result = await self.db.execute(query)
        account = result.scalar_one_or_none()

        if not account:
            return None

        account.current_processing_jobs += 1
        account.last_used = now or datetime.now(timezone.utc)
        await self.db.commit()
        await self.db.refresh(account)
        return account

    async def select_and_reserve_account(
        self,
        provider_id: str,
        user_id: Optional[int] = None,
        include_exhausted: bool = False,
        min_credits: Optional[int] = None,
        required_credit_types: Optional[list[str]] = None,
        exclude_account_ids: Optional[list[int]] = None,
        operation_type: Optional[str] = None,
        model: Optional[str] = None,
    ) -> ProviderAccount:
        """
        Atomically select and reserve an account.

        Uses SELECT FOR UPDATE SKIP LOCKED to prevent race conditions when
        multiple jobs try to select accounts simultaneously.

        Args:
            provider_id: Provider ID (e.g., "pixverse")
            user_id: User ID (optional, for private accounts)
            include_exhausted: Also consider EXHAUSTED accounts (for unlimited
                models that don't consume credits)
            min_credits: If set, only consider accounts that have at least one
                credit row with amount >= this value (pre-filters in SQL to
                avoid picking accounts that can't afford the operation)
            required_credit_types: Optional credit pools to apply to `min_credits`
                pre-filter (e.g. ["web"] vs ["openapi"]).
            exclude_account_ids: Account IDs to skip (e.g., accounts reserved
                for pinned generations)
            operation_type: Optional operation identifier for routing filters.
            model: Optional model identifier for routing filters.

        Returns:
            Reserved account with incremented concurrency counter

        Raises:
            NoAccountAvailableError: No suitable account found
        """
        now = datetime.now(timezone.utc)

        # Grant-based sharing: a recipient may reach an otherwise-private account
        # through a live provider-slots ResourceGrant — (provider, model?, slots),
        # optionally pinned to one account. Each rule caps the recipient's
        # concurrent jobs within its scope (pooled across the owner's accounts
        # for the provider, or on the pinned account; optionally per model).
        #
        # Fetch the recipient's active rules for this provider plus their current
        # in-flight usage so the candidate scan can drop rules with no room.
        grant_rules: list[ResourceGrant] = []
        # (account_id, model_str) for each of the recipient's in-flight jobs on
        # this provider — used to compute per-rule usage in Python.
        grant_inflight: list[tuple[Optional[int], Optional[str]]] = []
        # account_id -> owner_user_id, to attribute in-flight jobs to a rule owner.
        provider_account_owner: dict[int, Optional[int]] = {}
        if user_id:
            rule_rows = await self.db.execute(
                select(ResourceGrant).where(
                    ResourceGrant.recipient_user_id == user_id,
                    ResourceGrant.resource_type == ResourceGrantType.PROVIDER_SLOTS,
                    _GRANT_SCOPE_PROVIDER == provider_id,
                    ResourceGrant.revoked_at.is_(None),
                    or_(
                        ResourceGrant.expires_at.is_(None),
                        ResourceGrant.expires_at > now,
                    ),
                )
            )
            grant_rules = list(rule_rows.scalars().all())
            if grant_rules:
                model_expr = Generation.canonical_params.op("->>")("model")
                inflight_rows = await self.db.execute(
                    select(Generation.account_id, model_expr).where(
                        Generation.user_id == user_id,
                        Generation.provider_id == provider_id,
                        Generation.status == GenerationStatus.PROCESSING,
                    )
                )
                grant_inflight = [(row[0], row[1]) for row in inflight_rows.all()]
                owner_rows = await self.db.execute(
                    select(ProviderAccount.id, ProviderAccount.user_id).where(
                        ProviderAccount.provider_id == provider_id
                    )
                )
                provider_account_owner = {aid: oid for aid, oid in owner_rows.all()}

        def _rule_account_id(rule: ResourceGrant) -> Optional[int]:
            raw = rule.scope_value("account_id")
            return int(raw) if raw is not None else None

        def _rule_model(rule: ResourceGrant) -> Optional[str]:
            raw = rule.scope_value("model")
            return str(raw).strip().lower() if raw else None

        def _rule_has_room(rule: ResourceGrant) -> bool:
            """Count the recipient's in-flight jobs within this rule's scope and
            compare to its cap. None cap = uncapped."""
            if rule.cap is None:
                return True
            rule_account = _rule_account_id(rule)
            rule_model = _rule_model(rule)
            used = 0
            for acct_id, gen_model in grant_inflight:
                if provider_account_owner.get(acct_id) != rule.owner_user_id:
                    continue
                if rule_account is not None and acct_id != rule_account:
                    continue
                if rule_model is not None:
                    if not gen_model or gen_model.strip().lower() != rule_model:
                        continue
                used += 1
            return used < rule.cap

        def _rule_matches_request(rule: ResourceGrant, candidate: ProviderAccount) -> bool:
            rule_account = _rule_account_id(rule)
            if rule_account is not None and rule_account != candidate.id:
                return False
            rule_model = _rule_model(rule)
            if rule_model is not None and (not model or str(model).strip().lower() != rule_model):
                return False
            return True

        def _candidate_allowed_by_grant(candidate: ProviderAccount) -> bool:
            """Grant-mediated candidates (private, not owned by the recipient)
            must be permitted by at least one live rule that still has room.
            Owned and publicly-shared accounts are unaffected."""
            if candidate.user_id == user_id:
                return True  # own account
            if not candidate.is_private:
                return True  # public share — no per-user cap
            for rule in grant_rules:
                if rule.owner_user_id != candidate.user_id:
                    continue
                if not _rule_matches_request(rule, candidate):
                    continue
                if _rule_has_room(rule):
                    return True
            return False

        # Status filter: ACTIVE only, or also EXHAUSTED for unlimited models
        if include_exhausted:
            status_filter = ProviderAccount.status.in_([AccountStatus.ACTIVE, AccountStatus.EXHAUSTED])
        else:
            status_filter = (ProviderAccount.status == AccountStatus.ACTIVE)

        # Build query with row-level locking
        query = select(ProviderAccount).where(
            ProviderAccount.provider_id == provider_id,
            status_filter,
            ProviderAccount.current_processing_jobs < ProviderAccount.max_concurrent_jobs,
            (ProviderAccount.cooldown_until == None) | (ProviderAccount.cooldown_until < now),
        )
        query = _apply_user_visibility_filter(query, user_id)

        # Skip accounts reserved for pinned generations
        if exclude_account_ids:
            query = query.where(ProviderAccount.id.notin_(exclude_account_ids))

        # Pre-filter: skip accounts whose DB credits are already too low.
        # This is an optimistic filter - DB credits may be stale (e.g. after
        # a provider refund that hasn't been synced).  If it eliminates all
        # candidates we retry without it and let the live verify_credits
        # check handle correctness.
        #
        # Unlimited-bypass: an account that has the chosen model in its
        # ``plan_unlimited_image_models`` list doesn't consume credits for
        # this request, so the credit-amount gate must not exclude it.
        # Otherwise the unlimited tier in ``_rank_candidates`` never gets a
        # chance to defend it (the fallback only triggers when the filter
        # excludes *everyone*; one passing paid account is enough to lose
        # the unlimited account silently).
        _applied_credit_filter = False
        normalized_credit_types: list[str] = []
        if min_credits is not None and min_credits > 0:
            credit_filter_query = select(ProviderCredit.account_id).where(
                ProviderCredit.amount >= min_credits
            )
            normalized_credit_types = [
                str(credit_type or "").strip().lower()
                for credit_type in (required_credit_types or [])
                if str(credit_type or "").strip()
            ]
            if normalized_credit_types:
                credit_filter_query = credit_filter_query.where(
                    ProviderCredit.credit_type.in_(normalized_credit_types)
                )

            _credit_filter = ProviderAccount.id.in_(credit_filter_query)
            unlimited_bypass = _account_unlimited_model_sql_clause(model)
            if unlimited_bypass is not None:
                _credit_filter = or_(_credit_filter, unlimited_bypass)
            # Same reasoning as unlimited: a discounted account's effective
            # cost is below base, so the base-cost credit gate would
            # over-eagerly drop accounts that could in fact afford the run.
            discount_bypass = _account_discount_sql_clause(model)
            if discount_bypass is not None:
                _credit_filter = or_(_credit_filter, discount_bypass)
            _applied_credit_filter = True
        prefer_high_credits = bool(
            min_credits is not None
            and min_credits >= _HIGH_COST_MIN_CREDIT_HINT
        )

        # Sort by priority, then lowest credits first (drain cheap accounts
        # before touching high-credit ones), then least recently used.
        _total_credits = _total_credits_subquery()

        def _finalize_query(q, *, prefer_high_credits: bool = False):
            credits_sort_expr = _total_credits.desc() if prefer_high_credits else _total_credits.asc()
            if prefer_high_credits:
                order_by_expr = (
                    credits_sort_expr,
                    ProviderAccount.priority.desc(),
                    ProviderAccount.last_used.asc().nullsfirst(),
                )
            else:
                order_by_expr = (
                    ProviderAccount.priority.desc(),
                    credits_sort_expr,
                    ProviderAccount.last_used.asc().nullsfirst(),
                )
            # Read-only scan — locking removed in 2026-04 to fix self-DOS.
            # Locking up to 200 rows here held those locks until commit, so
            # any other concurrent worker hitting the routing query during
            # that window saw 0 rows via SKIP LOCKED. Atomic reserve happens
            # later, per chosen candidate, via reserve_account_if_available.
            return (
                q.add_columns(_total_credits).order_by(*order_by_expr)
                .limit(_ROUTING_CANDIDATE_SCAN_LIMIT)
            )

        routing_enabled = operation_type is not None or model is not None

        async def _rank_candidates(candidate_query, *, prefer_high_credits: bool = False):
            """Run the candidate scan and return a routing-filtered, sorted list
            of candidates (best first) plus the routing-filtered count.

            The scan is read-only — atomic reservation happens per-candidate
            in the caller via reserve_account_if_available.
            """
            result = await self.db.execute(
                _finalize_query(candidate_query, prefer_high_credits=prefer_high_credits)
            )
            rows = list(result.all())
            if not rows:
                return [], 0

            # Drop grant-mediated candidates the recipient can't use right now
            # (no matching rule, or every matching rule is at its slot cap).
            if grant_rules:
                rows = [row for row in rows if _candidate_allowed_by_grant(row[0])]
                if not rows:
                    return [], 0

            if not routing_enabled:
                # SQL ORDER BY already enforces the contract; return as-is.
                return [row[0] for row in rows], 0

            # Score tuple:
            #   (unlimited_match, discount_factor, effective_priority,
            #    credits, last_used, candidate)
            #
            # Tiering, top-down:
            #   1. ``unlimited_match`` — model is in account's plan-unlimited
            #      list; doesn't consume credits at all. Strictly outranks
            #      everything else regardless of base priority or credits.
            #   2. ``discount_factor`` — active per-model promo multiplier
            #      ([0.0, 1.0); ``1.0`` = no promo). Lower is better; a
            #      half-price account beats a full-price account at every
            #      lower-tier setting.
            #   3. ``effective_priority`` — operator-set base priority plus
            #      any routing-rule delta.
            #   4. credits — drain cheap accounts first by default; flipped
            #      when ``prefer_high_credits`` for the stale-snapshot
            #      fallback path.
            #   5. ``last_used`` — LRU tiebreaker.
            scored: list[tuple[int, float, int, int, datetime, ProviderAccount]] = []
            filtered_out = 0
            for candidate, total_credits in rows:
                if not _account_matches_routing(
                    candidate,
                    operation_type=operation_type,
                    model=model,
                ):
                    filtered_out += 1
                    continue

                base_priority = int(getattr(candidate, "priority", 0) or 0)
                effective_priority = base_priority + _account_priority_delta(
                    candidate,
                    operation_type=operation_type,
                    model=model,
                )
                unlimited_match = 1 if _account_has_unlimited_model(candidate, model) else 0
                discount_factor = _account_discount_factor(candidate, model)
                credits_value = int(total_credits or 0)
                last_used = candidate.last_used or datetime.min.replace(tzinfo=timezone.utc)
                scored.append(
                    (
                        unlimited_match,
                        discount_factor,
                        effective_priority,
                        credits_value,
                        last_used,
                        candidate,
                    )
                )

            if not scored:
                return [], filtered_out

            if prefer_high_credits:
                scored.sort(
                    key=lambda item: (-item[0], item[1], -item[3], -item[2], item[4])
                )
            else:
                scored.sort(
                    key=lambda item: (-item[0], item[1], -item[2], item[3], item[4])
                )
            return [item[5] for item in scored], filtered_out

        async def _try_reserve(candidates):
            """Walk ranked candidates, atomically reserving the first one that
            still meets all eligibility predicates. Returns None if every
            candidate lost the race or had its state change between scan and
            lock."""
            for candidate in candidates:
                reserved = await self.reserve_account_if_available(
                    candidate.id,
                    require_active=True,
                    include_exhausted=include_exhausted,
                    now=now,
                    skip_locked=True,
                )
                if reserved is not None:
                    return reserved
            return None

        routing_filtered_count = 0
        candidates_scanned = 0

        # First attempt: with credit pre-filter (if applicable).  The primary
        # path always drains cheapest-first — ``prefer_high_credits`` is only
        # used by the stale-snapshot fallback below.  (Previously the flip was
        # applied here too for expensive jobs, which had the side-effect of
        # burning high-credit accounts before lower-credit ones even when the
        # low-credit accounts had plenty for the job, defeating the
        # deprioritization that ``priority`` exists for.)
        if _applied_credit_filter:
            candidates, routing_filtered_count = await _rank_candidates(
                query.where(_credit_filter),
            )
            candidates_scanned = len(candidates)
            account = await _try_reserve(candidates)
            if not account:
                # Credit pre-filter excluded everyone (or all candidates lost
                # the race) - DB credits may be stale.  Retry without the
                # filter; live verify_credits will catch genuinely-empty
                # accounts.
                logger.info(
                    "credit_prefilter_fallback",
                    provider_id=provider_id,
                    min_credits=min_credits,
                    required_credit_types=normalized_credit_types or None,
                    prefer_high_credits=prefer_high_credits,
                    msg="credit pre-filter excluded all candidates, retrying without it",
                    routing_filtered_count=routing_filtered_count,
                    candidates_scanned=candidates_scanned,
                )
                # When the DB pre-filter returns no rows (possibly stale credit
                # snapshots), probe high-credit accounts first for expensive
                # generations so we don't re-pick a low-credit account whose
                # stale DB reading is what caused the pre-filter to drop it.
                candidates, routing_filtered_count = await _rank_candidates(
                    query,
                    prefer_high_credits=prefer_high_credits,
                )
                candidates_scanned = len(candidates)
                account = await _try_reserve(candidates)
        else:
            candidates, routing_filtered_count = await _rank_candidates(query)
            candidates_scanned = len(candidates)
            account = await _try_reserve(candidates)

        if not account:
            if routing_enabled:
                logger.info(
                    "account_routing_no_match",
                    provider_id=provider_id,
                    operation_type=operation_type,
                    model=model,
                    routing_filtered_count=routing_filtered_count,
                    candidates_scanned=candidates_scanned,
                )
            accountless_reserved = await self.reserve_or_create_accountless_account(provider_id)
            if accountless_reserved is not None:
                logger.info(
                    "accountless_account_reserved",
                    provider_id=provider_id,
                    account_id=accountless_reserved.id,
                )
                return accountless_reserved

            # Log why we couldn't find an account for debugging
            all_accounts_query = _apply_user_visibility_filter(
                select(ProviderAccount).where(
                    ProviderAccount.provider_id == provider_id,
                ),
                user_id,
            )

            all_result = await self.db.execute(all_accounts_query)
            all_accounts = list(all_result.scalars().all())

            account_statuses = [
                {
                    "id": a.id,
                    "email": a.email,
                    "status": a.status.value if a.status else None,
                    "current_jobs": a.current_processing_jobs,
                    "max_jobs": a.max_concurrent_jobs,
                    "cooldown_until": str(a.cooldown_until) if a.cooldown_until else None,
                }
                for a in all_accounts
            ]
            logger.warning(
                "no_account_available_debug",
                provider_id=provider_id,
                user_id=user_id,
                total_accounts=len(all_accounts),
                account_statuses=account_statuses,
            )
            raise NoAccountAvailableError(provider_id)

        logger.debug(
            "account_selected",
            account_id=account.id,
            email=account.email,
            provider_id=provider_id,
            status=account.status.value if account.status else None,
        )

        return account

    async def release_account(self, account_id: int, *, skip_wake: bool = False) -> ProviderAccount:
        """
        Release account after job (decrement concurrency counter)

        Uses SELECT FOR UPDATE to ensure atomic decrement.

        Args:
            account_id: Account ID
            skip_wake: If True, skip the best-effort wake trigger for pinned
                       generations.  Used when the release is from an adaptive
                       concurrency defer - the slot is not truly available from
                       the provider's perspective, so waking another pinned
                       generation would just repeat the defer cycle.

        Returns:
            Updated account

        Raises:
            ResourceNotFoundError: Account not found
        """
        # Lock row for update
        query = select(ProviderAccount).where(
            ProviderAccount.id == account_id
        ).with_for_update()

        result = await self.db.execute(query)
        account = result.scalar_one_or_none()

        if not account:
            raise ResourceNotFoundError("ProviderAccount", account_id)

        account.current_processing_jobs = max(0, account.current_processing_jobs - 1)

        await self.db.commit()
        await self.db.refresh(account)

        if skip_wake:
            return account

        # Best-effort wake trigger: if a slot just opened, dispatch one ready
        # pinned generation waiting on this account (early-pipeline admission).
        try:
            now = datetime.now(timezone.utc)
            cooldown_active = bool(account.cooldown_until and account.cooldown_until > now)

            # Clear short concurrent-limit cooldowns now that a slot freed.
            # The provider rejected because it was at capacity, but a job just
            # completed so the condition no longer holds.  Auth cooldowns
            # (300 s) are well above the threshold and are preserved.
            if cooldown_active:
                remaining = (account.cooldown_until - now).total_seconds()
                if remaining <= _MAX_CONCURRENT_COOLDOWN_SECONDS:
                    account.cooldown_until = None
                    await self.db.commit()
                    await self.db.refresh(account)
                    cooldown_active = False
                    logger.debug(
                        "account_release_cleared_concurrent_cooldown",
                        account_id=account.id,
                        remaining_seconds=round(remaining, 1),
                    )

            if (
                account.status == AccountStatus.ACTIVE
                and int(account.max_concurrent_jobs or 0) > 0
                and int(account.current_processing_jobs or 0) < int(account.max_concurrent_jobs or 0)
                and not cooldown_active
            ):
                current_jobs = int(account.current_processing_jobs or 0)
                cap = int(account.max_concurrent_jobs or 0)

                # Respect learned adaptive cap when it's lower than the
                # configured DB cap.  This prevents waking more pinned
                # generations than the provider can actually handle, which
                # otherwise causes reserve->adaptive-defer->release cascades.
                try:
                    from pixsim7.backend.main.workers.worker_concurrency import (
                        get_account_effective_cap_hint,
                    )
                    effective_hint = await get_account_effective_cap_hint(account.id)
                    if effective_hint is not None and effective_hint < cap:
                        cap = effective_hint
                except Exception:
                    pass  # fall back to configured cap

                free_slots = max(0, cap - current_jobs)
                if free_slots <= 0:
                    return account
                result = await self.db.execute(
                    select(Generation)
                    .where(Generation.status == GenerationStatus.PENDING)
                    .where(Generation.preferred_account_id == account.id)
                    .where(
                        (Generation.account_id == None)
                        | (Generation.account_id == account.id)
                    )
                    .order_by(Generation.priority.desc(), Generation.created_at)
                    .limit(max(10, free_slots * 4))
                )
                candidates = list(result.scalars().all())
                if candidates:
                    from pixsim7.backend.main.infrastructure.redis import get_arq_pool

                    arq_pool = await get_arq_pool()
                    capacity_wait_reasons = {
                        "pinned_account_capacity_wait",
                        "pinned_account_concurrent_wait",
                        "pinned_account_concurrent_yield",
                        "pinned_content_filter_yield",
                    }
                    woke_count = 0

                    for ready_pinned in candidates:
                        if woke_count >= free_slots:
                            break
                        wait_meta = await get_generation_wait_metadata(arq_pool, ready_pinned.id)
                        wait_reason = (
                            str(wait_meta.get("reason"))
                            if isinstance(wait_meta, dict) and wait_meta.get("reason")
                            else None
                        )
                        scheduled_ready = (
                            ready_pinned.scheduled_at is None or ready_pinned.scheduled_at <= now
                        )
                        early_capacity_wake = wait_reason in capacity_wait_reasons
                        if not scheduled_ready and not early_capacity_wake:
                            continue

                        if not scheduled_ready and early_capacity_wake:
                            original_scheduled_at = ready_pinned.scheduled_at
                            ready_pinned.scheduled_at = None
                            ready_pinned.updated_at = now
                            await self.db.commit()
                            await self.db.refresh(ready_pinned)
                        else:
                            original_scheduled_at = ready_pinned.scheduled_at

                        enqueued = await enqueue_generation_fresh_job(arq_pool, ready_pinned.id)
                        if not enqueued:
                            if not scheduled_ready and early_capacity_wake:
                                try:
                                    ready_pinned.scheduled_at = original_scheduled_at
                                    ready_pinned.updated_at = datetime.now(timezone.utc)
                                    await self.db.commit()
                                    await self.db.refresh(ready_pinned)
                                except Exception as restore_err:
                                    await self.db.rollback()
                                    logger.warning(
                                        "account_release_restore_scheduled_after_dedupe_failed",
                                        account_id=account.id,
                                        generation_id=ready_pinned.id,
                                        error=str(restore_err),
                                    )
                            logger.warning(
                                "account_release_wake_enqueue_deduped",
                                account_id=account.id,
                                generation_id=ready_pinned.id,
                                wait_reason=wait_reason,
                                free_slots=free_slots,
                            )
                            continue

                        await clear_generation_wait_metadata(arq_pool, ready_pinned.id)
                        woke_count += 1
                        logger.info(
                            "account_release_woke_pinned_generation",
                            account_id=account.id,
                            generation_id=ready_pinned.id,
                            current_jobs=account.current_processing_jobs,
                            max_jobs=account.max_concurrent_jobs,
                            free_slots=free_slots,
                            wake_index=woke_count,
                            wait_reason=wait_reason,
                            early_capacity_wake=bool(early_capacity_wake and not scheduled_ready),
                        )
            elif cooldown_active:
                logger.debug(
                    "account_release_skip_wake_cooldown",
                    account_id=account.id,
                    cooldown_until=str(account.cooldown_until),
                    current_jobs=account.current_processing_jobs,
                    max_jobs=account.max_concurrent_jobs,
                )
        except Exception as wake_err:
            logger.warning(
                "account_release_wake_pinned_failed",
                account_id=account.id,
                error=str(wake_err),
            )

        return account

    async def _locked_status_transition(
        self,
        account_id: int,
        new_status: AccountStatus,
        *,
        log_event: str,
        record_event: str,
        log_level: str = "info",
        skip_if_already: bool = False,
        apply: Callable[[ProviderAccount], dict] | None = None,
    ) -> ProviderAccount:
        """Lock an account row, transition its status, log + record, commit.

        Shared skeleton for the ``mark_*`` transitions. ``apply(account)`` runs
        after the new status is set (e.g. to stamp ``provider_metadata``) and
        may return extra structured fields to merge into the log line. With
        ``skip_if_already`` the call is a no-op (returns the row) when the
        account is already in ``new_status``.

        Raises:
            ResourceNotFoundError: Account not found
        """
        result = await self.db.execute(
            select(ProviderAccount).where(
                ProviderAccount.id == account_id
            ).with_for_update()
        )
        account = result.scalar_one_or_none()

        if not account:
            raise ResourceNotFoundError("ProviderAccount", account_id)

        if skip_if_already and account.status == new_status:
            return account

        previous_status = account.status
        account.status = new_status
        extra_log = apply(account) if apply else {}

        getattr(logger, log_level)(
            log_event,
            account_id=account_id,
            email=account.email,
            provider_id=account.provider_id,
            previous_status=previous_status.value if previous_status else None,
            **extra_log,
        )
        AccountEventService.record(
            record_event,
            account_id,
            provider_id=account.provider_id,
            previous_status=previous_status.value if previous_status else None,
        )

        await self.db.commit()
        await self.db.refresh(account)

        return account

    async def mark_exhausted(self, account_id: int) -> ProviderAccount:
        """
        Mark account as exhausted (no credits remaining).

        Args:
            account_id: Account ID

        Returns:
            Updated account

        Raises:
            ResourceNotFoundError: Account not found
        """
        return await self._locked_status_transition(
            account_id,
            AccountStatus.EXHAUSTED,
            log_event="account_marked_exhausted",
            record_event="marked_exhausted",
        )

    async def mark_blocked(
        self,
        account_id: int,
        *,
        err_code: int | None = None,
        err_msg: str | None = None,
    ) -> ProviderAccount:
        """Disable an account the provider reports as blocked/banned.

        Sets status -> DISABLED so the account is excluded from generation
        selection and the periodic credit sweep, and stamps the reason on
        provider_metadata for traceability. Idempotent — a no-op (returns the
        row) if the account is already DISABLED.
        """
        def _stamp_block_reason(account: ProviderAccount) -> dict:
            metadata = dict(account.provider_metadata or {})
            metadata["disabled_reason"] = "provider_account_blocked"
            metadata["disabled_at"] = datetime.now(timezone.utc).isoformat()
            if err_code is not None:
                metadata["disabled_err_code"] = err_code
            if err_msg:
                metadata["disabled_err_msg"] = str(err_msg)[:200]
            account.provider_metadata = metadata
            return {"err_code": err_code}

        return await self._locked_status_transition(
            account_id,
            AccountStatus.DISABLED,
            log_event="account_marked_blocked",
            record_event="marked_blocked",
            log_level="warning",
            skip_if_already=True,
            apply=_stamp_block_reason,
        )

    async def reactivate_blocked_account(self, account_id: int) -> ProviderAccount:
        """Re-enable an account previously disabled as provider-blocked.

        Flips status DISABLED -> ACTIVE and strips the ``disabled_*`` markers
        stamped by :meth:`mark_blocked` (and any ``last_block_check_at`` probe
        timestamp). Used by the manual "re-check" probe once the provider has
        accepted the account again — callers must confirm the provider really
        accepts it (a live credit fetch that did not raise a block) before
        calling, since this does not re-verify on its own.
        """
        def _clear_block_reason(account: ProviderAccount) -> dict:
            metadata = dict(account.provider_metadata or {})
            for key in (
                "disabled_reason",
                "disabled_at",
                "disabled_by",          # legacy "manual_ban_cleanup" disable path
                "disabled_err_code",
                "disabled_err_msg",
                "last_block_check_at",
            ):
                metadata.pop(key, None)
            metadata["reactivated_at"] = datetime.now(timezone.utc).isoformat()
            account.provider_metadata = metadata
            return {}

        return await self._locked_status_transition(
            account_id,
            AccountStatus.ACTIVE,
            log_event="account_reactivated",
            record_event="reactivated",
            apply=_clear_block_reason,
        )

    # ===== CREDIT MANAGEMENT =====

    async def set_credit(
        self,
        account_id: int,
        credit_type: str,
        amount: int
    ) -> ProviderCredit:
        """
        Set/update credits for a specific type

        Args:
            account_id: Account ID
            credit_type: Credit type (e.g., "web", "openapi", "standard")
            amount: New credit amount

        Returns:
            Updated or created ProviderCredit

        Raises:
            ResourceNotFoundError: Account not found
        """
        # Verify account exists
        account = await self.db.get(ProviderAccount, account_id)
        if not account:
            raise ResourceNotFoundError("ProviderAccount", account_id)

        # Find or create credit entry
        query = select(ProviderCredit).where(
            ProviderCredit.account_id == account_id,
            ProviderCredit.credit_type == credit_type
        )
        result = await self.db.execute(query)
        credit = result.scalar_one_or_none()

        now = datetime.now(timezone.utc)

        if credit:
            # Update existing
            credit.amount = amount
            credit.updated_at = now
        else:
            # Create new
            credit = ProviderCredit(
                account_id=account_id,
                credit_type=credit_type,
                amount=amount,
                updated_at=now,
                created_at=now
            )
            self.db.add(credit)

        await self.db.flush()

        # Log credit update for debugging
        logger.debug(
            "credit_updated",
            account_id=account_id,
            credit_type=credit_type,
            amount=amount,
            was_existing=credit.id is not None,
        )

        # Update account status based on total credits
        await self._update_account_status(account_id)

        return credit

    async def deduct_credit(
        self,
        account_id: int,
        credit_type: str,
        amount: int
    ) -> ProviderCredit:
        """
        Deduct credits from specific type

        Args:
            account_id: Account ID
            credit_type: Credit type
            amount: Amount to deduct

        Returns:
            Updated credit

        Raises:
            ResourceNotFoundError: Account or credit not found
            AccountExhaustedError: Insufficient credits
        """
        # Get credit entry
        query = select(ProviderCredit).where(
            ProviderCredit.account_id == account_id,
            ProviderCredit.credit_type == credit_type
        )
        result = await self.db.execute(query)
        credit = result.scalar_one_or_none()

        if not credit:
            raise ResourceNotFoundError("ProviderCredit", f"{account_id}:{credit_type}")

        if credit.amount < amount:
            account = await self.db.get(ProviderAccount, account_id)
            raise AccountExhaustedError(account_id, account.provider_id if account else "unknown")

        credit.amount -= amount
        credit.updated_at = datetime.now(timezone.utc)

        await self.db.flush()

        # Update account status
        await self._update_account_status(account_id)

        return credit

    async def get_credits(self, account_id: int) -> Dict[str, int]:
        """
        Get all credits for an account

        Args:
            account_id: Account ID

        Returns:
            Dict mapping credit_type -> amount
        """
        query = select(ProviderCredit).where(ProviderCredit.account_id == account_id)
        result = await self.db.execute(query)
        credits = result.scalars().all()

        return {c.credit_type: c.amount for c in credits}

    async def _update_account_status(self, account_id: int) -> None:
        """
        Update account status based on credit availability

        Mark as EXHAUSTED if all credits are 0, otherwise ACTIVE.
        Also clears expired cooldowns.
        Provider adapters can set more specific statuses as needed.

        Args:
            account_id: Account ID
        """
        # Eagerly load credits relationship to ensure accurate check
        from sqlalchemy.orm import selectinload
        query = select(ProviderAccount).where(
            ProviderAccount.id == account_id
        ).options(selectinload(ProviderAccount.credits))

        result = await self.db.execute(query)
        account = result.scalar_one_or_none()

        if not account:
            return

        # Clear expired cooldown
        if account.cooldown_until and datetime.now(timezone.utc) >= account.cooldown_until:
            account.cooldown_until = None
            logger.info(
                "cooldown_expired",
                extra={
                    "account_id": account.id,
                    "provider_id": account.provider_id
                }
            )
            AccountEventService.record(
                "cooldown_expired",
                account.id,
                provider_id=account.provider_id,
            )

        # Simple check: does account have ANY credits at all?
        has_any_credits = account.has_any_credits()

        if not has_any_credits and account.status == AccountStatus.ACTIVE:
            account.status = AccountStatus.EXHAUSTED
            logger.info(
                "account_marked_exhausted",
                extra={
                    "account_id": account.id,
                    "provider_id": account.provider_id,
                    "reason": "no_credits"
                }
            )
        elif has_any_credits and account.status == AccountStatus.EXHAUSTED:
            # Re-activate if credits were added
            account.status = AccountStatus.ACTIVE
            logger.info(
                "account_reactivated",
                extra={
                    "account_id": account.id,
                    "provider_id": account.provider_id,
                    "total_credits": account.get_total_credits()
                }
            )
            AccountEventService.record(
                "reactivated",
                account.id,
                provider_id=account.provider_id,
                previous_status="exhausted",
            )

        await self.db.flush()

    async def cleanup_account_states(self, provider_id: Optional[str] = None) -> dict:
        """
        Maintenance task to clean up account states:
        - Clear expired cooldowns
        - Fix incorrectly marked EXHAUSTED accounts (that have credits)
        - Mark accounts with 0 credits as EXHAUSTED

        Args:
            provider_id: Optional provider filter

        Returns:
            Dict with cleanup statistics
        """
        from sqlalchemy.orm import selectinload

        # Build query
        query = select(ProviderAccount).options(
            selectinload(ProviderAccount.credits)
        )
        if provider_id:
            query = query.where(ProviderAccount.provider_id == provider_id)

        result = await self.db.execute(query)
        accounts = result.scalars().all()

        stats = {
            "cooldowns_cleared": 0,
            "reactivated": 0,
            "marked_exhausted": 0,
            "no_change": 0
        }

        now = datetime.now(timezone.utc)

        for account in accounts:
            changed = False

            # Clear expired cooldowns
            if account.cooldown_until and now >= account.cooldown_until:
                account.cooldown_until = None
                stats["cooldowns_cleared"] += 1
                changed = True
                logger.info(
                    "cleanup_cooldown_cleared",
                    extra={
                        "account_id": account.id,
                        "provider_id": account.provider_id
                    }
                )
                AccountEventService.record("cooldown_expired", account.id, provider_id=account.provider_id)

            # Check if status matches credit state
            has_credits = account.has_any_credits()

            if has_credits and account.status == AccountStatus.EXHAUSTED:
                # Has credits but marked exhausted - reactivate
                account.status = AccountStatus.ACTIVE
                stats["reactivated"] += 1
                changed = True
                logger.info(
                    "cleanup_reactivated",
                    extra={
                        "account_id": account.id,
                        "provider_id": account.provider_id,
                        "total_credits": account.get_total_credits()
                    }
                )
                AccountEventService.record("reactivated", account.id, provider_id=account.provider_id, previous_status="exhausted")
            elif not has_credits and account.status == AccountStatus.ACTIVE:
                # No credits but marked active - mark exhausted
                account.status = AccountStatus.EXHAUSTED
                stats["marked_exhausted"] += 1
                changed = True
                logger.info(
                    "cleanup_marked_exhausted",
                    extra={
                        "account_id": account.id,
                        "provider_id": account.provider_id
                    }
                )

            if not changed:
                stats["no_change"] += 1

        await self.db.commit()

        logger.info("cleanup_completed", extra=stats)
        return stats

    # ===== STATS TRACKING =====

    async def record_success(
        self,
        account_id: int,
        generation_time_sec: Optional[float] = None
    ) -> ProviderAccount:
        """
        Record successful generation

        Args:
            account_id: Account ID
            generation_time_sec: Generation time in seconds

        Returns:
            Updated account
        """
        account = await self.db.get(ProviderAccount, account_id)
        if not account:
            raise ResourceNotFoundError("ProviderAccount", account_id)

        account.total_videos_generated += 1
        account.failure_streak = 0  # Reset failure streak

        # Update average generation time
        if generation_time_sec:
            if account.avg_generation_time_sec:
                # Running average
                total = account.total_videos_generated
                account.avg_generation_time_sec = (
                    (account.avg_generation_time_sec * (total - 1) + generation_time_sec) / total
                )
            else:
                account.avg_generation_time_sec = generation_time_sec

        # Update success rate
        account.success_rate = account.calculate_success_rate()

        await self.db.commit()
        await self.db.refresh(account)

        return account

    async def record_failure(
        self,
        account_id: int,
        error_message: Optional[str] = None
    ) -> ProviderAccount:
        """
        Record failed generation

        Args:
            account_id: Account ID
            error_message: Error message

        Returns:
            Updated account
        """
        account = await self.db.get(ProviderAccount, account_id)
        if not account:
            raise ResourceNotFoundError("ProviderAccount", account_id)

        account.total_videos_failed += 1
        account.failure_streak += 1
        account.last_error = error_message

        # Update success rate
        account.success_rate = account.calculate_success_rate()

        # Mark as error if too many failures
        if account.failure_streak >= 5:
            account.status = AccountStatus.ERROR

        await self.db.commit()
        await self.db.refresh(account)

        return account

    # ===== ACCOUNT CRUD =====

    async def create_account(
        self,
        user_id: int,
        email: str,
        provider_id: str = "pixverse",
        *,
        password: Optional[str] = None,
        jwt_token: Optional[str] = None,
        api_key: Optional[str] = None,
        api_keys: Optional[list[dict]] = None,
        cookies: Optional[dict] = None,
        is_private: bool = False,
        nickname: Optional[str] = None,
        priority: int = 0,
        routing_allow_patterns: Optional[list[str]] = None,
        routing_deny_patterns: Optional[list[str]] = None,
        routing_priority_overrides: Optional[dict[str, int]] = None,
    ) -> ProviderAccount:
        """
        Create new provider account for user

        Args:
            user_id: Owner user ID
            email: Account email
            provider_id: Provider identifier (default "pixverse")
            password: Optional password for auto-refresh (skip for Google accounts)
            jwt_token: Optional JWT token (for WebAPI)
            api_key: Optional legacy/general API key
            api_keys: Optional list of API keys (provider-specific)
            cookies: Optional cookies dict
            is_private: Whether account is private to owner (default False = shared)
            nickname: Optional nickname for account
            priority: Base account priority (higher = preferred).
            routing_allow_patterns: Optional allow-list route patterns.
            routing_deny_patterns: Optional deny-list route patterns.
            routing_priority_overrides: Optional route priority deltas.

        Returns:
            Created ProviderAccount

        Raises:
            ValueError: If account with email already exists for user
        """
        # Check for duplicate
        existing = await self.check_duplicate(user_id, email, provider_id)
        if existing:
            raise ValueError(f"Account with email {email} already exists for provider {provider_id}")

        # Create account
        account = ProviderAccount(
            user_id=user_id,
            email=email,
            provider_id=provider_id,
            password=password,
            jwt_token=jwt_token,
            api_key=api_key,
            api_keys=api_keys,
            cookies=cookies or {},
            is_private=is_private,
            nickname=nickname,
            priority=int(priority or 0),
            routing_allow_patterns=(
                _normalize_route_pattern_list(routing_allow_patterns)
                if routing_allow_patterns is not None
                else None
            ),
            routing_deny_patterns=(
                _normalize_route_pattern_list(routing_deny_patterns)
                if routing_deny_patterns is not None
                else None
            ),
            routing_priority_overrides=(
                _normalize_route_priority_overrides(routing_priority_overrides)
                if routing_priority_overrides is not None
                else None
            ),
            max_concurrent_jobs=self._default_max_concurrent_jobs(provider_id),
            status=AccountStatus.ACTIVE,
            created_at=datetime.now(timezone.utc)
        )

        self.db.add(account)
        await self.db.flush()

        # Credits will be added separately via set_credit()
        # Don't initialize to 0 - let provider adapter set them

        return account

    async def update_account(
        self,
        account_id: int,
        user_id: int,
        *,
        email: Optional[str] = None,
        jwt_token: Optional[str] = None,
        api_key: Optional[str] = None,
        api_keys: Optional[list[dict]] = None,
        cookies: Optional[dict] = None,
        is_private: Optional[bool] = None,
        status: Optional[AccountStatus] = None,
        nickname: Optional[str] = None,
        is_google_account: Optional[bool] = None,
        priority: Optional[int] = None,
        routing_allow_patterns: Optional[list[str]] = None,
        routing_deny_patterns: Optional[list[str]] = None,
        routing_priority_overrides: Optional[dict[str, int]] = None,
    ) -> ProviderAccount:
        """
        Update existing account

        Args:
            account_id: Account ID
            user_id: Current user ID (for permission check)
            email: Optional new email
            jwt_token: Optional new JWT token (for WebAPI)
            api_key: Optional new generic API key
            api_keys: Optional new list of API keys
            cookies: Optional new cookies
            is_private: Optional new private status
            status: Optional new account status
            nickname: Optional new nickname
            is_google_account: Optional Google authentication flag
            priority: Optional new base priority
            routing_allow_patterns: Optional new allow-list patterns
            routing_deny_patterns: Optional new deny-list patterns
            routing_priority_overrides: Optional new route priority overrides

        Returns:
            Updated ProviderAccount

        Raises:
            ResourceNotFoundError: If account not found
            ValueError: If permission denied
        """
        account = await self.get_account(account_id)

        # Check permissions - only owner can update their accounts
        # System accounts (user_id=None) can only be updated by admins (checked in API layer)
        if account.user_id is not None and account.user_id != user_id:
            raise ValueError("Not your account")

        # Apply updates
        if email is not None:
            account.email = email

        if jwt_token is not None:
            account.jwt_token = jwt_token

        if api_key is not None:
            # Treat empty string as clearing the generic API key
            account.api_key = api_key or None

        if api_keys is not None:
            # Replace full API key list (empty list clears)
            account.api_keys = api_keys or []

        if cookies is not None:
            account.cookies = cookies

        if is_private is not None:
            account.is_private = is_private

        if status is not None:
            account.status = status

        if nickname is not None:
            account.nickname = nickname

        if priority is not None:
            account.priority = int(priority)

        if routing_allow_patterns is not None:
            account.routing_allow_patterns = _normalize_route_pattern_list(routing_allow_patterns)

        if routing_deny_patterns is not None:
            account.routing_deny_patterns = _normalize_route_pattern_list(routing_deny_patterns)

        if routing_priority_overrides is not None:
            account.routing_priority_overrides = _normalize_route_priority_overrides(
                routing_priority_overrides
            )

        if is_google_account is not None:
            # Update provider_metadata to reflect Google authentication status
            metadata = account.provider_metadata or {}
            if is_google_account:
                metadata["auth_method"] = PixverseAuthMethod.GOOGLE.value
            else:
                # Clear or set to PASSWORD if unchecking (default assumption)
                metadata["auth_method"] = PixverseAuthMethod.PASSWORD.value
            account.provider_metadata = metadata

        await self.db.flush()

        return account

    async def delete_account(
        self,
        account_id: int,
        user_id: int
    ) -> bool:
        """
        Delete account (hard delete)

        Args:
            account_id: Account ID
            user_id: Current user ID (for permission check)

        Returns:
            True if deleted successfully

        Raises:
            ResourceNotFoundError: If account not found
            ValueError: If permission denied
        """
        account = await self.get_account(account_id)

        # Check permissions - only owner can delete their accounts
        # System accounts cannot be deleted via API
        if account.user_id is None:
            raise ValueError("Cannot delete system accounts via API")

        if account.user_id != user_id:
            raise ValueError("Not your account")

        await self.db.delete(account)
        await self.db.flush()

        return True

    async def get_account(self, account_id: int) -> ProviderAccount:
        """Get account by ID"""
        account = await self.db.get(ProviderAccount, account_id)
        if not account:
            raise ResourceNotFoundError("ProviderAccount", account_id)
        return account

    async def list_accounts(
        self,
        provider_id: Optional[str] = None,
        user_id: Optional[int] = None,
        status: Optional[AccountStatus] = None,
        include_shared: bool = True
    ) -> list[ProviderAccount]:
        """
        List accounts with filters

        Args:
            provider_id: Filter by provider
            user_id: Filter by user (includes their private + shared accounts)
            status: Filter by status
            include_shared: Include shared accounts (default True)

        Returns:
            List of ProviderAccount objects
        """
        query = select(ProviderAccount)

        if provider_id:
            query = query.where(ProviderAccount.provider_id == provider_id)

        if user_id and include_shared:
            # User's accounts + shared accounts + accounts reachable via a live
            # grant rule (not other users' private accounts they have no grant for).
            query = query.where(
                (ProviderAccount.user_id == user_id) |
                (ProviderAccount.user_id.is_(None)) |  # System accounts
                (ProviderAccount.is_private == False) |  # Shared user accounts
                _grant_visibility_clause(user_id)  # Granted to user
            )
        elif user_id:
            # Only user's accounts
            query = query.where(ProviderAccount.user_id == user_id)

        if status:
            query = query.where(ProviderAccount.status == status)

        query = query.order_by(ProviderAccount.priority.desc(), ProviderAccount.created_at.desc())

        result = await self.db.execute(query)
        return list(result.scalars().all())

    # ===== ACCOUNT GRANTS (provider-slot view over the generic ResourceGrant) =====
    #
    # These are the provider-slots adapter over the generic ResourceGrant
    # primitive: they own slot-specific validation (account ownership, provider
    # match) and build the scope ``{provider_id, model?, account_id?}``; the
    # generic ``ResourceGrantService`` owns persistence/upsert/revoke. Bridge and
    # review sharing reuse the same primitive with their own scope + resource_type.

    @staticmethod
    def _slot_scope(provider_id: str, model: Optional[str], account_id: Optional[int]) -> dict:
        scope: dict = {"provider_id": provider_id}
        if model:
            scope["model"] = model
        if account_id is not None:
            scope["account_id"] = account_id
        return scope

    async def create_or_update_grant(
        self,
        *,
        owner_user_id: int,
        recipient_user_id: int,
        provider_id: str,
        model: Optional[str] = None,
        account_id: Optional[int] = None,
        slot_limit: int = 1,
        note: Optional[str] = None,
        expires_at: Optional[datetime] = None,
    ) -> ResourceGrant:
        """Create or update a provider-slots share rule: (provider, model?, slots)
        for a recipient, optionally pinned to a single account and time-boxed.

        Raises ValueError for invalid ownership / recipient combinations.
        """
        if recipient_user_id == owner_user_id:
            raise ValueError("Cannot grant slots to yourself")
        if slot_limit < 1:
            raise ValueError("slot_limit must be >= 1")
        provider_id = (provider_id or "").strip()
        if not provider_id:
            raise ValueError("provider_id is required")
        model = model.strip() if model and model.strip() else None

        if account_id is not None:
            account = await self.db.get(ProviderAccount, account_id)
            if not account:
                raise ResourceNotFoundError("ProviderAccount", account_id)
            if account.user_id != owner_user_id:
                raise ValueError("Not your account")
            if account.provider_id != provider_id:
                raise ValueError("Account does not belong to that provider")
        else:
            # Pooled rule — owner must actually have an account for the provider.
            owned = await self.db.execute(
                select(ProviderAccount.id).where(
                    ProviderAccount.user_id == owner_user_id,
                    ProviderAccount.provider_id == provider_id,
                ).limit(1)
            )
            if owned.first() is None:
                raise ValueError(f"You have no {provider_id} accounts to share")

        return await ResourceGrantService(self.db).create_or_update(
            owner_user_id=owner_user_id,
            recipient_user_id=recipient_user_id,
            resource_type=ResourceGrantType.PROVIDER_SLOTS,
            scope=self._slot_scope(provider_id, model, account_id),
            cap=slot_limit,
            note=note,
            expires_at=expires_at,
        )

    async def list_grants_issued(self, owner_user_id: int) -> list[ResourceGrant]:
        """Active provider-slot rules the owner has created (the 'shared by you' ledger)."""
        return await ResourceGrantService(self.db).list_issued(
            owner_user_id, ResourceGrantType.PROVIDER_SLOTS
        )

    async def list_grants_for_account(
        self, account_id: int, owner_user_id: int
    ) -> list[ResourceGrant]:
        """List active rules that touch a given account — pinned to it, or pooled
        over its provider. Powers the account card's 'shared' view."""
        account = await self.db.get(ProviderAccount, account_id)
        if not account:
            raise ResourceNotFoundError("ProviderAccount", account_id)
        if account.user_id != owner_user_id:
            raise ValueError("Not your account")
        result = await self.db.execute(
            select(ResourceGrant).where(
                ResourceGrant.owner_user_id == owner_user_id,
                ResourceGrant.resource_type == ResourceGrantType.PROVIDER_SLOTS,
                ResourceGrant.revoked_at.is_(None),
                or_(
                    ResourceGrant.expires_at.is_(None),
                    ResourceGrant.expires_at > func.now(),
                ),
                _GRANT_SCOPE_PROVIDER == account.provider_id,
                or_(
                    _GRANT_SCOPE_ACCOUNT.is_(None),
                    _GRANT_SCOPE_ACCOUNT == str(account_id),
                ),
            ).order_by(ResourceGrant.created_at.desc())
        )
        return list(result.scalars().all())

    async def list_grants_received(
        self, recipient_user_id: int
    ) -> list[ResourceGrant]:
        """Active provider-slot rules shared with this recipient (the 'shared with you' ledger)."""
        return await ResourceGrantService(self.db).list_received(
            recipient_user_id, ResourceGrantType.PROVIDER_SLOTS
        )

    async def revoke_grant(self, grant_id: int, owner_user_id: int) -> ResourceGrant:
        """Soft-revoke a rule. Only the granting owner may revoke."""
        return await ResourceGrantService(self.db).revoke(grant_id, owner_user_id)

    async def check_duplicate(
        self,
        user_id: int,
        email: str,
        provider_id: str
    ) -> Optional[ProviderAccount]:
        """
        Check if account with email already exists for user

        Args:
            user_id: User ID
            email: Email to check
            provider_id: Provider ID

        Returns:
            Existing account if found, None otherwise
        """
        query = select(ProviderAccount).where(
            ProviderAccount.user_id == user_id,
            ProviderAccount.email == email,
            ProviderAccount.provider_id == provider_id
        )

        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def update_credits_by_email(
        self,
        email: str,
        provider_id: str,
        credits_map: Dict[str, int]
    ) -> list[ProviderAccount]:
        """
        Update credits for all accounts with given email (bulk update)

        Args:
            email: Account email
            provider_id: Provider ID
            credits_map: Dict of credit_type -> amount (e.g., {"web": 100, "openapi": 50})

        Returns:
            List of updated accounts
        """
        # Find all accounts with this email
        query = select(ProviderAccount).where(
            ProviderAccount.email == email,
            ProviderAccount.provider_id == provider_id
        )

        result = await self.db.execute(query)
        accounts = list(result.scalars().all())

        # Update credits for each account
        for account in accounts:
            for credit_type, amount in credits_map.items():
                await self.set_credit(account.id, credit_type, amount)

        await self.db.flush()

        return accounts
