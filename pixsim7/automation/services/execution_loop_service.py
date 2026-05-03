"""
Execution Loop Service (PixSim7)

Schedules automation executions based on account selection strategies and
enqueues ARQ tasks. Phase 2d (plan: automation-package-extraction): the
account-selection step now goes through the AccountLookup protocol — backend
DB owns the reservation transaction, automation DB owns the execution row.
On any failure between reserve and enqueue, the reservation is released back
to the pool as a compensating action.
"""
import logging
from typing import Optional, List
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.automation.domain import (
    ExecutionLoop,
    LoopStatus,
    LoopSelectionMode,
    PresetExecutionMode,
    AutomationExecution,
    AutomationStatus,
    AppActionPreset,
    AndroidDevice,
    DeviceStatus,
)
from pixsim7.automation.locator import get_account_lookup, get_job_queue
from pixsim7.automation.protocols import AccountSnapshot, ReservationToken

logger = logging.getLogger(__name__)


class ExecutionLoopService:
    """Service for managing smart execution loops."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def can_loop_execute(self, loop: ExecutionLoop, bypass_status: bool = False) -> tuple[bool, Optional[str]]:
        """Check if loop can execute now."""
        if not loop.is_enabled:
            return False, "Loop is disabled"
        if not bypass_status and loop.status != LoopStatus.ACTIVE:
            return False, f"Loop status is {loop.status}"
        if loop.consecutive_failures >= loop.max_consecutive_failures:
            return False, f"Too many consecutive failures ({loop.consecutive_failures})"

        if loop.max_executions_per_day and loop.executions_today >= loop.max_executions_per_day:
            return False, f"Daily limit reached ({loop.executions_today}/{loop.max_executions_per_day})"

        if not bypass_status and loop.last_execution_at:
            next_allowed = loop.last_execution_at + timedelta(seconds=loop.delay_between_executions)
            if datetime.now(timezone.utc) < next_allowed:
                wait_seconds = int((next_allowed - datetime.now(timezone.utc)).total_seconds())
                return False, f"Waiting {wait_seconds}s before next execution"

        return True, None

    async def _get_accounts_with_active_executions(self) -> set[int]:
        """Account IDs with PENDING or RUNNING executions in the automation DB."""
        result = await self.db.execute(
            select(AutomationExecution.account_id).where(
                AutomationExecution.status.in_([AutomationStatus.PENDING, AutomationStatus.RUNNING])
            ).distinct()
        )
        return set(result.scalars().all())

    async def _count_available_devices(self, loop: ExecutionLoop) -> int:
        """Count ONLINE + enabled devices (limited to preferred_device_id if set)."""
        query = select(AndroidDevice).where(
            AndroidDevice.status == DeviceStatus.ONLINE,
            AndroidDevice.is_enabled == True,
        )
        if loop.preferred_device_id:
            query = query.where(AndroidDevice.id == loop.preferred_device_id)

        result = await self.db.execute(query)
        return len(result.scalars().all())

    async def _eligible_snapshots(
        self,
        loop: ExecutionLoop,
        exclude_account_ids: set[int] | None = None,
    ) -> list[AccountSnapshot]:
        """Fetch ACTIVE account snapshots via the AccountLookup protocol,
        then apply loop-specific filters in-memory.

        Backend owns the SQL query (it lives in the backend DB); we just hand
        it the criteria the protocol exposes. Credit-range filtering is done
        client-side from the snapshot.total_credits field.
        """
        account_ids = (
            list(loop.account_ids)
            if loop.selection_mode == LoopSelectionMode.SPECIFIC_ACCOUNTS and loop.account_ids
            else None
        )
        snapshots = await get_account_lookup().list_active(
            account_ids=account_ids,
            exclude_account_ids=list(exclude_account_ids) if exclude_account_ids else None,
        )

        filtered: list[AccountSnapshot] = []
        for snap in snapshots:
            if snap.total_credits < loop.min_credits:
                continue
            if loop.max_credits is not None and snap.total_credits > loop.max_credits:
                continue
            filtered.append(snap)
        return filtered

    def _ordered_candidates(
        self,
        loop: ExecutionLoop,
        snapshots: list[AccountSnapshot],
    ) -> list[AccountSnapshot]:
        """Apply selection-strategy ordering, with mode-specific pinning honoured.

        Returns candidates in attempt order. Caller iterates and tries to
        reserve each in turn — first successful reservation wins. SKIP LOCKED
        contention on a given candidate just falls through to the next.
        """
        if not snapshots:
            return []

        # SHARED_LIST mode: stick with the pinned account until its preset cycle finishes.
        if loop.preset_execution_mode == PresetExecutionMode.SHARED_LIST and loop.current_account_id:
            pinned = next((s for s in snapshots if s.id == loop.current_account_id), None)
            if pinned and loop.shared_preset_ids and loop.current_preset_index < len(loop.shared_preset_ids):
                return [pinned] + [s for s in snapshots if s.id != pinned.id]

        # PER_ACCOUNT mode: same idea, per-account preset list.
        if loop.preset_execution_mode == PresetExecutionMode.PER_ACCOUNT and loop.current_account_id:
            pinned = next((s for s in snapshots if s.id == loop.current_account_id), None)
            if pinned:
                presets = (
                    loop.account_preset_config.get(pinned.id)
                    or loop.account_preset_config.get(str(pinned.id))
                    or loop.default_preset_ids
                )
                if presets:
                    state = loop.account_execution_state.get(str(pinned.id)) or {"current_index": 0}
                    if int(state.get("current_index", 0)) < len(presets):
                        return [pinned] + [s for s in snapshots if s.id != pinned.id]

        if loop.selection_mode == LoopSelectionMode.ROUND_ROBIN:
            ordered = sorted(snapshots, key=lambda s: s.id or 0)
            if loop.last_account_id and any(s.id == loop.last_account_id for s in ordered):
                ids = [s.id for s in ordered]
                start = (ids.index(loop.last_account_id) + 1) % len(ordered)
                return ordered[start:] + ordered[:start]
            return ordered

        if loop.selection_mode == LoopSelectionMode.MOST_CREDITS:
            return sorted(snapshots, key=lambda s: s.total_credits, reverse=True)

        if loop.selection_mode == LoopSelectionMode.LEAST_CREDITS:
            return sorted(snapshots, key=lambda s: s.total_credits)

        # SPECIFIC_ACCOUNTS default (or any unknown mode): caller-supplied order.
        return list(snapshots)

    async def _create_execution_for_snapshot(
        self,
        loop: ExecutionLoop,
        snapshot: AccountSnapshot,
    ) -> AutomationExecution:
        """Insert the AutomationExecution row in the automation DB. Updates
        loop bookkeeping (counts, current_account_id, preset index advance).

        Caller is responsible for releasing the reservation on any failure
        raised from here.
        """
        preset_id = loop.get_next_preset_for_account(snapshot.id)
        if not preset_id:
            raise ValueError("No preset configured for loop")

        preset = await self.db.get(AppActionPreset, preset_id)
        total_actions = len(preset.actions) if preset and preset.actions else 0

        execution = AutomationExecution(
            user_id=snapshot.user_id or loop.user_id,
            preset_id=preset_id,
            account_id=snapshot.id,
            status=AutomationStatus.PENDING,
            priority=1,
            total_actions=total_actions,
            created_at=datetime.now(timezone.utc),
            source="loop",
            loop_id=loop.id,
        )
        self.db.add(execution)
        await self.db.commit()
        await self.db.refresh(execution)

        loop.total_executions += 1
        loop.executions_today += 1
        loop.last_execution_at = datetime.now(timezone.utc)
        loop.last_account_id = snapshot.id

        if loop.preset_execution_mode == PresetExecutionMode.SHARED_LIST:
            if loop.current_account_id != snapshot.id:
                loop.current_account_id = snapshot.id
                loop.current_preset_index = 0
        if loop.preset_execution_mode == PresetExecutionMode.PER_ACCOUNT:
            if loop.current_account_id != snapshot.id:
                loop.current_account_id = snapshot.id

        loop.advance_preset_index(snapshot.id)
        await self.db.commit()
        return execution

    async def _try_reserve_and_create(
        self,
        loop: ExecutionLoop,
        candidates: list[AccountSnapshot],
    ) -> Optional[AutomationExecution]:
        """Iterate candidates, reserve atomically in backend DB, then create
        the execution + enqueue. On any failure between reservation success
        and enqueue commit, release the reservation as compensation.

        Returns the created execution, or None if all candidates were
        contended / no reservation succeeded.
        """
        account_lookup = get_account_lookup()
        claimed_by = f"automation:loop:{loop.id}"

        for snapshot in candidates:
            reserve_result = await account_lookup.reserve_account(
                snapshot.id, claimed_by=claimed_by
            )
            if reserve_result is None:
                # SKIP LOCKED contention or full capacity — try the next candidate.
                continue

            reserved_snapshot, token = reserve_result
            try:
                execution = await self._create_execution_for_snapshot(loop, reserved_snapshot)
                task_id = await get_job_queue().enqueue_automation(execution.id)
                execution.task_id = task_id
                await self.db.commit()
                return execution
            except Exception:
                # Compensating release: the reservation succeeded but the
                # execution row / enqueue did not. Return the slot to the pool
                # so the next loop tick can retry.
                logger.exception(
                    "loop_execution_create_failed loop_id=%s account_id=%s — releasing reservation",
                    loop.id,
                    reserved_snapshot.id,
                )
                await _release_reservation_safely(account_lookup, token)
                raise

        return None

    async def process_loop(
        self,
        loop: ExecutionLoop,
        bypass_status: bool = False,
        max_parallel: int | None = None,
    ) -> List[AutomationExecution]:
        """Process loop and create executions, up to available device count."""
        can, reason = await self.can_loop_execute(loop, bypass_status=bypass_status)
        if not can:
            logger.debug(f"Loop {loop.id} cannot execute: {reason}")
            return []

        active_account_ids = await self._get_accounts_with_active_executions()
        available_devices = await self._count_available_devices(loop)
        if available_devices == 0:
            logger.debug(f"Loop {loop.id}: No devices available")
            return []

        num_to_create = min(available_devices, max_parallel) if max_parallel else available_devices
        created: list[AutomationExecution] = []
        excluded = set(active_account_ids)

        for i in range(num_to_create):
            snapshots = await self._eligible_snapshots(loop, exclude_account_ids=excluded)
            candidates = self._ordered_candidates(loop, snapshots)
            if not candidates:
                if i == 0:
                    loop.consecutive_failures += 1
                    loop.last_error = "No suitable account found"
                    await self.db.commit()
                break

            try:
                execution = await self._try_reserve_and_create(loop, candidates)
            except Exception as e:
                # _try_reserve_and_create already released the reservation;
                # just record the failure on the loop and stop this tick.
                loop.consecutive_failures += 1
                loop.last_error = str(e)[:500]
                await self.db.commit()
                break

            if execution is None:
                # All candidates contended / full. Stop this tick — next
                # process_loop call will retry once contention clears.
                if i == 0:
                    loop.consecutive_failures += 1
                    loop.last_error = "All eligible accounts contended"
                    await self.db.commit()
                break

            created.append(execution)
            excluded.add(execution.account_id)
            loop.consecutive_failures = 0
            loop.last_error = None
            await self.db.commit()

        return created


async def _release_reservation_safely(account_lookup, token: ReservationToken) -> None:
    """Best-effort release. If the release itself fails, log and continue —
    the loop must keep running, and orphaned reservations are recoverable
    out-of-band."""
    try:
        await account_lookup.release_reservation(token)
    except Exception:
        logger.exception(
            "release_reservation_failed account_id=%s claimed_by=%s",
            token.account_id,
            token.claimed_by,
        )
