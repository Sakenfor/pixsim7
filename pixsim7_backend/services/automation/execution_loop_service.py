"""
Execution Loop Service (PixSim7)

Simplified, clean version to schedule automation executions based on
account selection strategies and enqueue ARQ tasks.
"""
import logging
from typing import Optional, List
from datetime import datetime, timedelta
from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7_backend.domain.automation import (
    ExecutionLoop,
    LoopStatus,
    LoopSelectionMode,
    AutomationExecution,
    AutomationStatus,
    AppActionPreset,
)
from pixsim7_backend.domain import ProviderAccount, AccountStatus
from pixsim7_backend.infrastructure.queue import queue_task

logger = logging.getLogger(__name__)


class ExecutionLoopService:
    """Service for managing smart execution loops"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def can_loop_execute(self, loop: ExecutionLoop, bypass_status: bool = False) -> tuple[bool, Optional[str]]:
        """Check if loop can execute now"""
        if not loop.is_enabled:
            return False, "Loop is disabled"
        if not bypass_status and loop.status != LoopStatus.ACTIVE:
            return False, f"Loop status is {loop.status}"
        if loop.consecutive_failures >= loop.max_consecutive_failures:
            return False, f"Too many consecutive failures ({loop.consecutive_failures})"

        # Daily limit
        if loop.max_executions_per_day and loop.executions_today >= loop.max_executions_per_day:
            return False, f"Daily limit reached ({loop.executions_today}/{loop.max_executions_per_day})"

        # Delay between executions
        if not bypass_status and loop.last_execution_at:
            next_allowed = loop.last_execution_at + timedelta(seconds=loop.delay_between_executions)
            if datetime.utcnow() < next_allowed:
                wait_seconds = int((next_allowed - datetime.utcnow()).total_seconds())
                return False, f"Waiting {wait_seconds}s before next execution"

        return True, None

    async def _eligible_accounts_query(self, loop: ExecutionLoop) -> List[ProviderAccount]:
        query = select(ProviderAccount).where(ProviderAccount.status == AccountStatus.ACTIVE)

        # Filter by specific account IDs
        if loop.selection_mode == LoopSelectionMode.SPECIFIC_ACCOUNTS and loop.account_ids:
            query = query.where(ProviderAccount.id.in_(loop.account_ids))

        # Credit filters: use total credits across types
        # This is enforced after fetch because credits are a relationship
        result = await self.db.execute(query)
        accounts = result.scalars().all()

        # In-memory credit filtering using relationship methods
        filtered = []
        for acct in accounts:
            total = acct.get_total_credits()
            if total is None:
                total = 0
            if total < loop.min_credits:
                continue
            if loop.max_credits is not None and total > loop.max_credits:
                continue
            filtered.append(acct)
        return filtered

    async def select_next_account(self, loop: ExecutionLoop) -> Optional[ProviderAccount]:
        accounts = await self._eligible_accounts_query(loop)
        if not accounts:
            return None

        # SHARED_LIST mode: stick with current account until all presets are completed
        if loop.preset_execution_mode == PresetExecutionMode.SHARED_LIST and loop.current_account_id:
            current_account = next((a for a in accounts if a.id == loop.current_account_id), None)
            if current_account:
                # Check if we still have presets to execute for this account
                if loop.shared_preset_ids and loop.current_preset_index < len(loop.shared_preset_ids):
                    return current_account
                # All presets completed for this account, will select next account below

        # PER_ACCOUNT mode: stick with current account until all its presets are completed
        if loop.preset_execution_mode == PresetExecutionMode.PER_ACCOUNT and loop.current_account_id:
            current_account = next((a for a in accounts if a.id == loop.current_account_id), None)
            if current_account:
                # Get account's preset configuration
                account_presets = (
                    loop.account_preset_config.get(current_account.id)
                    or loop.account_preset_config.get(str(current_account.id))
                    or loop.default_preset_ids
                )
                if account_presets:
                    key = str(current_account.id)
                    state = loop.account_execution_state.get(key) or {"current_index": 0, "completed_cycles": 0}
                    current_index = int(state.get("current_index", 0))
                    # If we haven't completed all presets for this account, continue with it
                    if current_index < len(account_presets):
                        return current_account
                # All presets completed for this account, will select next account below

        if loop.selection_mode == LoopSelectionMode.ROUND_ROBIN:
            accounts_sorted = sorted(accounts, key=lambda a: a.id or 0)
            if loop.last_account_id and any(a.id == loop.last_account_id for a in accounts_sorted):
                ids = [a.id for a in accounts_sorted]
                i = ids.index(loop.last_account_id)
                return accounts_sorted[(i + 1) % len(accounts_sorted)]
            return accounts_sorted[0]

        if loop.selection_mode == LoopSelectionMode.MOST_CREDITS:
            return max(accounts, key=lambda a: a.get_total_credits())

        if loop.selection_mode == LoopSelectionMode.LEAST_CREDITS:
            return min(accounts, key=lambda a: a.get_total_credits())

        # SPECIFIC_ACCOUNTS default: first eligible
        return accounts[0]

    async def create_execution_from_loop(self, loop: ExecutionLoop, account: ProviderAccount) -> AutomationExecution:
        preset_id = loop.get_next_preset_for_account(account.id)
        if not preset_id:
            raise ValueError("No preset configured for loop")

        preset = await self.db.get(AppActionPreset, preset_id)
        total_actions = len(preset.actions) if preset and preset.actions else 0

        execution = AutomationExecution(
            user_id=loop.user_id,
            preset_id=preset_id,
            account_id=account.id,
            status=AutomationStatus.PENDING,
            priority=1,
            total_actions=total_actions,
            created_at=datetime.utcnow(),
            source="loop",
            loop_id=loop.id,
        )
        self.db.add(execution)
        await self.db.commit()
        await self.db.refresh(execution)

        loop.total_executions += 1
        loop.executions_today += 1
        loop.last_execution_at = datetime.utcnow()
        loop.last_account_id = account.id

        # For SHARED_LIST mode, set current account when starting a new account's preset cycle
        if loop.preset_execution_mode == PresetExecutionMode.SHARED_LIST:
            if loop.current_account_id != account.id:
                loop.current_account_id = account.id
                loop.current_preset_index = 0  # Reset to first preset for new account

        # For PER_ACCOUNT mode, track current account
        if loop.preset_execution_mode == PresetExecutionMode.PER_ACCOUNT:
            if loop.current_account_id != account.id:
                loop.current_account_id = account.id

        loop.advance_preset_index(account.id)
        await self.db.commit()

        return execution

    async def process_loop(self, loop: ExecutionLoop, bypass_status: bool = False) -> Optional[AutomationExecution]:
        can, reason = await self.can_loop_execute(loop, bypass_status=bypass_status)
        if not can:
            logger.debug(f"Loop {loop.id} cannot execute: {reason}")
            return None

        account = await self.select_next_account(loop)
        if not account:
            loop.consecutive_failures += 1
            loop.last_error = "No suitable account found"
            await self.db.commit()
            return None

        # Create execution and enqueue processing task
        try:
            execution = await self.create_execution_from_loop(loop, account)
            task_id = await queue_task("process_automation", execution.id)
            execution.task_id = task_id
            await self.db.commit()

            loop.consecutive_failures = 0
            loop.last_error = None
            await self.db.commit()

            return execution
        except Exception as e:
            logger.exception(f"Failed to create or queue execution for loop {loop.id}: {e}")
            loop.consecutive_failures += 1
            loop.last_error = str(e)[:500]
            await self.db.commit()
            return None
