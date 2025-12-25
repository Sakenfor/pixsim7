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

            # Check if this is a test execution with inline actions
            is_test = execution.source == "test" and execution.execution_context
            test_actions = execution.execution_context.get("test_actions") if is_test else None
            test_variables = execution.execution_context.get("test_variables") if is_test else None

            # Fetch preset (or create a mock one for tests)
            if test_actions:
                # Create a minimal preset-like object for test execution
                class TestPreset:
                    def __init__(self, actions, variables):
                        self.actions = actions
                        self.variables = variables
                        self.app_package = None
                preset = TestPreset(test_actions, test_variables)
            elif execution.preset_id:
                preset = await db.get(AppActionPreset, execution.preset_id)
                if not preset:
                    raise RuntimeError(f"Preset {execution.preset_id} not found")
            else:
                raise RuntimeError("No preset or test actions provided")

            # Fetch account for credential injection
            from pixsim7.backend.main.domain.providers import ProviderAccount
            account = await db.get(ProviderAccount, execution.account_id) if execution.account_id else None

            # Smart device assignment using device pool service
            if not execution.device_id:
                from pixsim7.backend.main.services.automation import DevicePoolService
                pool_service = DevicePoolService(db)
                assignment_result = await pool_service.assign_device(execution)

                if assignment_result.status == "no_devices":
                    raise RuntimeError("No devices available for automation execution")
                elif assignment_result.status == "waiting":
                    # Future: Handle wait queue - for now, just fail
                    raise RuntimeError("Device wait queue not yet implemented")
                # If assigned, execution.device_id was already set by the service

            device = await db.get(AndroidDevice, execution.device_id)
            if not device:
                raise RuntimeError("No device available for automation execution")

            # Pre-flight check: verify device is actually reachable via ADB
            from pixsim7.backend.main.services.automation.adb import ADB
            from pixsim7.backend.main.domain.automation import DeviceStatus
            adb = ADB()
            adb_devices = await adb.devices()
            adb_serials = {serial for serial, state in adb_devices if state == "device"}

            if device.adb_id not in adb_serials:
                # Device not reachable - update status and fail
                logger.warning(
                    "device_not_reachable",
                    execution_id=execution_id,
                    device_id=device.id,
                    adb_id=device.adb_id,
                    available_devices=list(adb_serials)
                )
                device.status = DeviceStatus.OFFLINE
                await db.commit()
                raise RuntimeError(f"Device {device.adb_id} not reachable via ADB. Available: {list(adb_serials)}")

            # Device should already be BUSY from assignment (no need to set again)
            # Just verify and continue with execution
            try:

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

                    # Provider-specific dynamic variables (best-effort).
                    # For Pixverse rewards, the daily ad cap (total_counts) can change over time
                    # (e.g., 2 or 3). Fetch the current task status once so presets can loop
                    # the correct number of times.
                    if account.provider_id == "pixverse":
                        try:
                            from pixsim7.backend.main.services.provider import registry as provider_registry
                            provider = provider_registry.get("pixverse")
                            ad_task = None
                            if hasattr(provider, "get_ad_watch_task"):
                                ad_task = await provider.get_ad_watch_task(
                                    account,
                                    retry_on_session_error=False,
                                )
                            if isinstance(ad_task, dict):
                                total_counts = ad_task.get("total_counts")
                                if total_counts is not None:
                                    variables["pixverse_ad_total_counts"] = int(total_counts)
                                progress = ad_task.get("progress")
                                if progress is not None:
                                    variables["pixverse_ad_progress"] = int(progress)
                                completed_counts = ad_task.get("completed_counts")
                                if completed_counts is not None:
                                    variables["pixverse_ad_completed_counts"] = int(completed_counts)
                        except Exception:
                            pass

                ctx = ExecutionContext(serial=device.adb_id, variables=variables, screenshots_dir=screenshots_dir)

                # Add root preset to call stack to detect self-referential calls
                if hasattr(preset, 'id') and preset.id:
                    ctx.preset_call_stack.append(preset.id)

                # Create preset loader for call_preset action
                async def load_preset(preset_id: int) -> AppActionPreset | None:
                    return await db.get(AppActionPreset, preset_id)

                # Execute actions
                executor = ActionExecutor(preset_loader=load_preset)
                await executor.execute(preset, ctx)

                # Mark completed
                execution.status = AutomationStatus.COMPLETED
                execution.completed_at = datetime.utcnow()
                execution.current_action_index = ctx.current_action_index
                execution.total_actions = ctx.total_actions
                # Store condition results for IF actions
                if ctx.condition_results:
                    execution.error_details = {"condition_results": ctx.condition_results}
                await db.commit()

                return {"status": "completed"}
            finally:
                # Restore device to ONLINE (it was marked BUSY during assignment)
                try:
                    device = await db.get(AndroidDevice, device.id)
                    if device:
                        # Only restore to ONLINE if device was BUSY (expected state)
                        # If device is OFFLINE/ERROR from connectivity check, preserve that
                        if device.status == DeviceStatus.BUSY:
                            device.status = DeviceStatus.ONLINE
                        await db.commit()
                except Exception as e:
                    logger.error("automation_restore_status_failed", error=str(e), exc_info=True)
        except ExecutionError as e:
            logger.error("automation_action_failed", error=str(e), action_index=e.action_index, action_type=e.action_type, action_path=e.action_path, exc_info=True)
            try:
                execution = await db.get(AutomationExecution, execution_id)
                if execution:
                    execution.status = AutomationStatus.FAILED
                    execution.error_message = str(e)
                    execution.error_action_index = e.action_index
                    execution.error_details = {
                        "action_type": e.action_type,
                        "action_params": e.action_params,
                        "action_path": e.action_path,  # Full path for nested actions [top, nested, nested...]
                        "error": str(e),
                        "action_index": e.action_index,
                        "condition_results": ctx.condition_results if 'ctx' in locals() else {},
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
