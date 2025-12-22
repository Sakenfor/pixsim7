"""
Device Pool Service - Smart device assignment with LRU algorithm

Provides atomic device assignment for automation executions with:
- Least-Recently-Used (LRU) selection for fair distribution
- Race condition prevention via SELECT FOR UPDATE locking
- Extensibility hooks for future wait queue and affinity features
"""
from typing import Optional, Literal
from datetime import datetime
from dataclasses import dataclass
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from pixsim7.backend.main.domain.automation import AndroidDevice, DeviceStatus, AutomationExecution
from pixsim_logging import configure_logging

logger = configure_logging("device_pool")


@dataclass
class DeviceAssignmentResult:
    """Result of device assignment attempt"""
    status: Literal["assigned", "no_devices", "waiting"]
    device: Optional[AndroidDevice] = None
    wait_position: Optional[int] = None  # For future wait queue feature


class DevicePoolService:
    """
    Manages device pool and assigns devices to executions.

    Features:
    - LRU (Least Recently Used) selection algorithm
    - Atomic assignment with row-level locking
    - Support for preferred device (affinity feature)
    - Extensible for wait queue functionality
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def assign_device(
        self,
        execution: AutomationExecution,
        preferred_device_id: Optional[int] = None,
        wait_if_unavailable: bool = False,  # For future wait queue feature
    ) -> DeviceAssignmentResult:
        """
        Assign best available device to execution.

        Algorithm:
        1. If preferred_device_id specified and device is ONLINE -> use it
        2. Otherwise, select ONLINE device with oldest last_used_at (LRU)
        3. Lock device with SELECT FOR UPDATE to prevent race conditions
        4. Update execution.device_id and device.last_used_at atomically

        Args:
            execution: AutomationExecution to assign device to
            preferred_device_id: Optional preferred device (for affinity feature)
            wait_if_unavailable: If True, queue execution when no devices available (future)

        Returns:
            DeviceAssignmentResult with status and assigned device
        """
        logger.info(
            "device_assignment_start",
            execution_id=execution.id,
            account_id=execution.account_id,
            preferred_device_id=preferred_device_id,
        )

        # Try preferred device first (for future affinity feature)
        if preferred_device_id:
            device = await self._try_assign_preferred_device(preferred_device_id)
            if device:
                await self._assign_device_to_execution(execution, device)
                logger.info(
                    "device_assigned_preferred",
                    execution_id=execution.id,
                    device_id=device.id,
                    device_name=device.name,
                )
                return DeviceAssignmentResult(status="assigned", device=device)

        # Select best available device using LRU algorithm
        device = await self._select_best_available_device()

        if device:
            await self._assign_device_to_execution(execution, device)
            logger.info(
                "device_assigned_lru",
                execution_id=execution.id,
                device_id=device.id,
                device_name=device.name,
                last_used_at=device.last_used_at,
            )
            return DeviceAssignmentResult(status="assigned", device=device)

        # No devices available
        if wait_if_unavailable:
            # Future: Queue execution and return waiting status
            # wait_position = await self._queue_execution(execution)
            logger.info(
                "device_wait_queue_not_implemented",
                execution_id=execution.id,
            )
            return DeviceAssignmentResult(status="waiting", wait_position=0)

        logger.warning(
            "no_devices_available",
            execution_id=execution.id,
        )
        return DeviceAssignmentResult(status="no_devices")

    async def _try_assign_preferred_device(
        self,
        device_id: int,
    ) -> Optional[AndroidDevice]:
        """
        Try to assign preferred device if it's available.

        Uses SELECT FOR UPDATE to lock the device row and prevent race conditions.

        Returns:
            AndroidDevice if available, None if busy/offline/not found
        """
        query = (
            select(AndroidDevice)
            .where(
                AndroidDevice.id == device_id,
                AndroidDevice.status == DeviceStatus.ONLINE,
                AndroidDevice.is_enabled == True,
            )
            .with_for_update()  # Lock row to prevent concurrent assignment
        )

        result = await self.db.execute(query)
        device = result.scalars().first()

        return device

    async def _select_best_available_device(self) -> Optional[AndroidDevice]:
        """
        Select best available device using LRU (Least Recently Used) algorithm.

        Selection criteria:
        1. Device must be ONLINE and enabled
        2. Prefer device with oldest last_used_at (fair distribution)
        3. Devices never used (last_used_at=NULL) are prioritized

        Uses SELECT FOR UPDATE to lock the device row and prevent race conditions.

        Returns:
            AndroidDevice if available, None if all busy/offline
        """
        # Order by last_used_at ASC NULLS FIRST (never-used devices first, then LRU)
        query = (
            select(AndroidDevice)
            .where(
                AndroidDevice.status == DeviceStatus.ONLINE,
                AndroidDevice.is_enabled == True,
            )
            .order_by(AndroidDevice.last_used_at.asc().nulls_first())
            .limit(1)
            .with_for_update()  # Lock row to prevent concurrent assignment
        )

        result = await self.db.execute(query)
        device = result.scalars().first()

        return device

    async def _assign_device_to_execution(
        self,
        execution: AutomationExecution,
        device: AndroidDevice,
    ) -> None:
        """
        Assign device to execution and update usage tracking.

        Updates:
        1. execution.device_id = device.id
        2. device.last_used_at = now (for LRU tracking)
        3. device.status = BUSY (prevent concurrent assignment)
        4. Commits transaction atomically

        Args:
            execution: AutomationExecution to assign to
            device: AndroidDevice to assign
        """
        now = datetime.utcnow()

        execution.device_id = device.id
        device.last_used_at = now
        device.status = DeviceStatus.BUSY  # Mark BUSY atomically with assignment

        await self.db.commit()
