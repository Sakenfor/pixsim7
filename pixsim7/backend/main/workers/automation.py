"""
Automation worker tasks

Provides ARQ task to process a single AutomationExecution.
This is a minimal stub that simulates execution and marks it complete.
"""
import asyncio
from pixsim_logging import configure_logging
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.automation import AutomationExecution, AutomationStatus, AppActionPreset, AndroidDevice
from pixsim7.backend.main.infrastructure.database.session import get_db
from pixsim7.backend.main.services.automation import ExecutionLoopService
from sqlalchemy import select
from pathlib import Path
from pixsim7.backend.main.shared.config import settings
from pixsim7.backend.main.services.automation.action_executor import ActionExecutor, ExecutionContext, ExecutionError

logger = configure_logging("worker")


async def process_automation(ctx: dict, execution_id: int) -> dict:
    """
    Process a single automation execution (stub implementation).

    Args:
        ctx: ARQ worker context
        execution_id: ID of the automation execution to process

    In a full implementation, this would:
    - Connect to the device via ADB/UIA2
    - Execute preset actions with context
    - Capture screenshots and errors
    - Update execution status and history
    """
    logger.info("automation_start", execution_id=execution_id)

    async for db in get_db():
        try:
            execution = await db.get(AutomationExecution, execution_id)
            if not execution:
                return {"status": "error", "error": "execution_not_found"}

            if execution.status not in {AutomationStatus.PENDING, AutomationStatus.RUNNING}:
                return {"status": "skipped", "reason": f"status={execution.status}"}

            execution.status = AutomationStatus.RUNNING
            execution.started_at = datetime.utcnow()
            await db.commit()

            # Fetch preset, account, and device
            preset = await db.get(AppActionPreset, execution.preset_id)

            # Fetch account for credential injection
            from pixsim7.backend.main.domain import ProviderAccount
            account = await db.get(ProviderAccount, execution.account_id) if execution.account_id else None

            device = await db.get(AndroidDevice, execution.device_id) if execution.device_id else None
            if not device:
                # Pick any device by adb_id from first ONLINE one (optional enhancement: proper selection in loop)
                from sqlalchemy import select
                from pixsim7.backend.main.domain.automation import DeviceStatus
                result = await db.execute(select(AndroidDevice).where(AndroidDevice.status == DeviceStatus.ONLINE))
                device = result.scalars().first()
                if device:
                    execution.device_id = device.id
                    await db.commit()

            if not device:
                raise RuntimeError("No device available for automation execution")

            # Mark device BUSY to avoid concurrent use
            from pixsim7.backend.main.domain.automation import DeviceStatus
            prev_status = device.status
            try:
                device.status = DeviceStatus.BUSY
                await db.commit()

                # Build execution context with auto-injected account credentials
                screenshots_dir = Path(settings.storage_base_path) / settings.automation_screenshots_dir / f"exec-{execution.id}"

                # Start with existing context or empty dict
                variables = dict(execution.execution_context or {})

                # Auto-inject account credentials if account exists
                if account:
                    # Try account password first, then fall back to provider global password
                    password = account.password
                    if not password:
                        # Load provider settings for global password fallback
                        from pixsim7.backend.main.api.v1.providers import _load_provider_settings
                        provider_settings_map = _load_provider_settings()
                        provider_settings = provider_settings_map.get(account.provider_id)
                        if provider_settings:
                            password = provider_settings.global_password

                    variables.update({
                        "email": account.email,
                        "password": password or "",
                        "provider_id": account.provider_id,
                        "account_id": str(account.id),
                    })
                    logger.info(
                        "credentials_injected",
                        execution_id=execution_id,
                        account_id=account.id,
                        email=account.email,
                        has_account_password=bool(account.password),
                        has_global_password=bool(password and not account.password)
                    )

                ctx = ExecutionContext(serial=device.adb_id, variables=variables, screenshots_dir=screenshots_dir)

                # Execute actions
                executor = ActionExecutor()
                await executor.execute(preset, ctx)

                # Mark completed
                execution.status = AutomationStatus.COMPLETED
                execution.completed_at = datetime.utcnow()
                execution.current_action_index = ctx.current_action_index
                execution.total_actions = ctx.total_actions
                await db.commit()

                return {"status": "completed"}
            finally:
                # Restore device status
                try:
                    device = await db.get(AndroidDevice, device.id)
                    if device:
                        device.status = prev_status if prev_status != DeviceStatus.ERROR else DeviceStatus.ONLINE
                        await db.commit()
                except Exception as e:
                    logger.error("automation_restore_status_failed", error=str(e), exc_info=True)
        except ExecutionError as e:
            logger.error("automation_action_failed", error=str(e), action_index=e.action_index, action_type=e.action_type, exc_info=True)
            try:
                execution = await db.get(AutomationExecution, execution_id)
                if execution:
                    execution.status = AutomationStatus.FAILED
                    execution.error_message = str(e)
                    execution.error_action_index = e.action_index
                    execution.error_details = {
                        "action_type": e.action_type,
                        "action_params": e.action_params,
                        "error": str(e),
                        "action_index": e.action_index,
                    }
                    execution.completed_at = datetime.utcnow()
                    execution.current_action_index = e.action_index
                    execution.total_actions = ctx.total_actions if 'ctx' in locals() else 0
                    await db.commit()
            except Exception as commit_err:
                logger.error("failed_to_save_execution_error", error=str(commit_err))
            raise
        except Exception as e:
            logger.error("automation_failed", error=str(e), exc_info=True)
            try:
                execution = await db.get(AutomationExecution, execution_id)
                if execution:
                    execution.status = AutomationStatus.FAILED
                    execution.error_message = str(e)
                    execution.completed_at = datetime.utcnow()
                    await db.commit()
            except Exception:
                pass
            raise
        finally:
            await db.close()


async def run_automation_loops(ctx: dict) -> dict:
    """
    Cron task: process all active automation loops once.

    Args:
        ctx: ARQ worker context
    """
    processed = 0
    created = 0
    async for db in get_db():
        try:
            from pixsim7.backend.main.domain.automation import ExecutionLoop, LoopStatus
            result = await db.execute(select(ExecutionLoop).where(ExecutionLoop.is_enabled == True, ExecutionLoop.status == LoopStatus.ACTIVE))
            loops = result.scalars().all()
            svc = ExecutionLoopService(db)
            for loop in loops:
                processed += 1
                executions = await svc.process_loop(loop)
                created += len(executions)

            # Only log if loops were processed or executions were created
            if processed > 0 or created > 0:
                logger.info("automation_loops_processed", loops_processed=processed, executions_created=created)
            else:
                logger.debug("automation_loops_idle", msg="No active loops")

            return {"status": "ok", "loops_processed": processed, "executions_created": created}
        finally:
            await db.close()


async def queue_pending_executions(ctx: dict) -> dict:
    """
    Cron task: find PENDING executions and queue them to ARQ.

    This picks up any executions that are stuck in PENDING state
    (e.g., created manually, or from a previous session before worker crashed).

    Args:
        ctx: ARQ worker context
    """
    queued = 0
    async for db in get_db():
        try:
            from pixsim7.backend.main.infrastructure.queue import queue_task

            # Find PENDING executions that aren't already queued
            result = await db.execute(
                select(AutomationExecution)
                .where(AutomationExecution.status == AutomationStatus.PENDING)
                .order_by(AutomationExecution.created_at)
                .limit(50)  # Process max 50 per run to avoid overload
            )
            pending = result.scalars().all()

            # Only log if there are pending executions
            if pending:
                logger.info("queue_pending_check", found=len(pending))
            else:
                logger.debug("queue_pending_check_idle", msg="No pending executions")

            for execution in pending:
                try:
                    # Queue the execution
                    task_id = await queue_task("process_automation", execution.id)
                    queued += 1
                    logger.info("execution_queued", execution_id=execution.id, task_id=task_id)
                except Exception as e:
                    logger.error("queue_failed", execution_id=execution.id, error=str(e))

            return {"status": "ok", "queued": queued}
        except Exception as e:
            logger.error("queue_pending_error", error=str(e), exc_info=True)
            return {"status": "error", "error": str(e)}
        finally:
            await db.close()
