"""
AccountService - provider account selection and management

Clean service for account pool management with normalized credit tracking
"""
from typing import Optional, Dict
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from pixsim_logging import get_logger

from pixsim7.backend.main.domain import AccountStatus, Generation, GenerationStatus
from pixsim7.backend.main.domain.providers import ProviderAccount, ProviderCredit
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

logger = get_logger()

# Maximum concurrent-limit cooldown (matches CONCURRENT_COOLDOWN_SECONDS in
# worker_concurrency.py).  Any remaining cooldown at or below this threshold
# was set by a concurrent-limit rejection and is stale once a slot frees.
# Auth cooldowns (300 s) are well above this and preserved.
_MAX_CONCURRENT_COOLDOWN_SECONDS = 30


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

    # ===== ACCOUNT SELECTION =====

    async def select_account(
        self,
        provider_id: str,
        user_id: Optional[int] = None,
        required_credits: Optional[int] = None
    ) -> ProviderAccount:
        """
        Select best available account for provider

        Selection strategy:
        1. User's private accounts first (if user_id provided)
        2. Shared accounts (is_private=False)
        3. Filter by required_credits if specified (provider-specific)
        4. Sort by: priority (desc), last_used (asc), credits (desc)

        Args:
            provider_id: Provider ID (e.g., "pixverse")
            user_id: User ID (optional, for private accounts)
            required_credits: Minimum credits required (optional, provider-specific)
                             If None, just checks that account has any credits

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

        # Add user filter (private + shared accounts)
        if user_id:
            query = query.where(
                (ProviderAccount.user_id == user_id) |  # User's private accounts
                (ProviderAccount.is_private == False)    # Shared accounts
            )
        else:
            # No user - only shared accounts
            query = query.where(ProviderAccount.is_private == False)

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

        # Sort by priority, least recently used
        query = query.order_by(
            ProviderAccount.priority.desc(),
            ProviderAccount.last_used.asc().nullsfirst()
        )

        result = await self.db.execute(query)
        accounts = result.scalars().all()

        # Filter by required credits (in Python, since credits are in related table)
        available_accounts = []
        for account in accounts:
            # Check basic availability (status, concurrency, cooldown)
            if not account.is_available():
                continue

            # If required_credits specified, check if account has sufficient credits
            if required_credits is not None:
                if not account.has_sufficient_credits(required_credits):
                    continue

            available_accounts.append(account)

        if not available_accounts:
            raise NoAccountAvailableError(provider_id)

        # Return first match (already sorted by priority, last_used)
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
        from sqlalchemy import select
        
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

    async def reserve_account_if_available(self, account_id: int) -> ProviderAccount | None:
        """
        Reserve account only if it has capacity. Returns None if at limit.

        Uses SELECT FOR UPDATE with a capacity filter to atomically check
        and reserve in one query, preventing race conditions.
        """
        query = select(ProviderAccount).where(
            ProviderAccount.id == account_id,
            ProviderAccount.current_processing_jobs < ProviderAccount.max_concurrent_jobs,
        ).with_for_update()

        result = await self.db.execute(query)
        account = result.scalar_one_or_none()

        if not account:
            return None

        account.current_processing_jobs += 1
        account.last_used = datetime.now(timezone.utc)
        await self.db.commit()
        await self.db.refresh(account)
        return account

    async def select_and_reserve_account(
        self,
        provider_id: str,
        user_id: Optional[int] = None,
        include_exhausted: bool = False,
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

        Returns:
            Reserved account with incremented concurrency counter

        Raises:
            NoAccountAvailableError: No suitable account found
        """
        now = datetime.now(timezone.utc)

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

        # Add user filter
        if user_id:
            query = query.where(
                (ProviderAccount.user_id == user_id) | (ProviderAccount.is_private == False)
            )
        else:
            query = query.where(ProviderAccount.is_private == False)

        # Sort by priority, least recently used
        query = query.order_by(
            ProviderAccount.priority.desc(),
            ProviderAccount.last_used.asc().nullsfirst()
        )

        # Lock and skip already-locked rows (concurrent jobs will get different accounts)
        query = query.with_for_update(skip_locked=True).limit(1)

        result = await self.db.execute(query)
        account = result.scalar_one_or_none()

        if not account:
            # Log why we couldn't find an account for debugging
            all_accounts_query = select(ProviderAccount).where(
                ProviderAccount.provider_id == provider_id,
            )
            if user_id:
                all_accounts_query = all_accounts_query.where(
                    (ProviderAccount.user_id == user_id) | (ProviderAccount.is_private == False)
                )
            else:
                all_accounts_query = all_accounts_query.where(ProviderAccount.is_private == False)

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

        # Reserve the account
        account.current_processing_jobs += 1
        account.last_used = now

        await self.db.commit()
        await self.db.refresh(account)

        return account

    async def release_account(self, account_id: int, *, skip_wake: bool = False) -> ProviderAccount:
        """
        Release account after job (decrement concurrency counter)

        Uses SELECT FOR UPDATE to ensure atomic decrement.

        Args:
            account_id: Account ID
            skip_wake: If True, skip the best-effort wake trigger for pinned
                       generations.  Used when the release is from an adaptive
                       concurrency defer — the slot is not truly available from
                       the provider's perspective, so waking another pinned
                       generation would just repeat the defer cycle.

        Returns:
            Updated account

        Raises:
            ResourceNotFoundError: Account not found
        """
        from sqlalchemy import select
        
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
                free_slots = max(
                    0,
                    int(account.max_concurrent_jobs or 0) - int(account.current_processing_jobs or 0),
                )
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
        query = select(ProviderAccount).where(
            ProviderAccount.id == account_id
        ).with_for_update()

        result = await self.db.execute(query)
        account = result.scalar_one_or_none()

        if not account:
            raise ResourceNotFoundError("ProviderAccount", account_id)

        previous_status = account.status
        account.status = AccountStatus.EXHAUSTED

        logger.info(
            "account_marked_exhausted",
            account_id=account_id,
            email=account.email,
            provider_id=account.provider_id,
            previous_status=previous_status.value if previous_status else None,
        )

        await self.db.commit()
        await self.db.refresh(account)

        return account

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
        nickname: Optional[str] = None
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
        is_google_account: Optional[bool] = None
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
            # User's accounts + shared accounts (not other users' private accounts)
            query = query.where(
                (ProviderAccount.user_id == user_id) |
                (ProviderAccount.user_id.is_(None)) |  # System accounts
                (ProviderAccount.is_private == False)   # Shared user accounts
            )
        elif user_id:
            # Only user's accounts
            query = query.where(ProviderAccount.user_id == user_id)

        if status:
            query = query.where(ProviderAccount.status == status)

        query = query.order_by(ProviderAccount.priority.desc(), ProviderAccount.created_at.desc())

        result = await self.db.execute(query)
        return list(result.scalars().all())

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
