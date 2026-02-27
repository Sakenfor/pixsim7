"""
FanoutExecutor - tracked backend fanout execution for independent generation items.

Executes a list of generation submissions with no dependency wiring between items
("Each"-style semantics). This is the backend peer of frontend fanout modes and
complements ChainExecutor (sequential orchestration) without forcing chain
semantics onto independent submissions.
"""

from __future__ import annotations

import logging
from copy import deepcopy
from typing import Any, Dict, List, Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain import GenerationStatus, OperationType, User
from pixsim7.backend.main.domain.generation.chain import ChainExecution
from pixsim7.backend.main.services.generation.creation import GenerationCreationService
from pixsim7.backend.main.services.generation.execution_policy import ExecutionPolicyV1
from pixsim7.backend.main.services.generation.query import GenerationQueryService
from pixsim7.backend.main.services.generation.step_executor import (
    GenerationStepExecutor,
    StepTimeoutError,
)
from pixsim7.backend.main.shared.datetime_utils import utcnow

logger = logging.getLogger(__name__)


def _coerce_operation_type(value: Any) -> OperationType:
    if isinstance(value, OperationType):
        return value

    raw = str(value or "").strip().lower()
    aliases = {
        "txt2img": "text_to_image",
        "t2i": "text_to_image",
        "img2img": "image_to_image",
        "i2i": "image_to_image",
        "txt2vid": "text_to_video",
        "t2v": "text_to_video",
        "img2vid": "image_to_video",
        "i2v": "image_to_video",
    }
    normalized = aliases.get(raw, raw)
    try:
        return OperationType(normalized)
    except ValueError as exc:
        raise RuntimeError(f"Unsupported fanout item operation '{value}'") from exc


class FanoutExecutionResult:
    def __init__(
        self,
        execution_id: UUID,
        status: str,
        step_states: List[Dict[str, Any]],
        submitted_count: int,
        failed_count: int,
        error: Optional[str] = None,
    ):
        self.execution_id = execution_id
        self.status = status
        self.step_states = step_states
        self.submitted_count = submitted_count
        self.failed_count = failed_count
        self.error = error


class FanoutExecutor:
    """
    Submit independent generation items and track orchestration progress.

    This executor intentionally does not wait for child generations to finish.
    It tracks submission outcomes (generation IDs / submit failures) only.
    """

    def __init__(
        self,
        db: AsyncSession,
        creation_service: GenerationCreationService,
        query_service: GenerationQueryService,
    ):
        self.db = db
        self._creation = creation_service
        self._query = query_service
        self._step_executor = GenerationStepExecutor(db, creation_service, query_service)

    async def execute(
        self,
        *,
        items: List[Dict[str, Any]],
        user: User,
        default_provider_id: str,
        default_operation: str = "text_to_image",
        workspace_id: Optional[int] = None,
        preferred_account_id: Optional[int] = None,
        continue_on_error: bool = True,
        force_new: bool = True,
        execution_policy: Optional[ExecutionPolicyV1] = None,
        execution: ChainExecution,
    ) -> FanoutExecutionResult:
        """
        Submit all items in a fanout and update the provided execution record.

        Args:
            items: Fanout item payloads (id/params/operation/provider overrides)
            execution: Pre-created ChainExecution row used for tracking
        """
        policy = execution_policy or ExecutionPolicyV1(
            version=1,
            dispatch_mode="fanout",
            wait_policy="none",
            dependency_mode="none",
            failure_policy="continue" if continue_on_error else "stop",
            concurrency=1,
            step_timeout_seconds=None,
            force_new=force_new,
        )

        if policy.dispatch_mode == "sequential":
            return await self._execute_sequential(
                items=items,
                user=user,
                default_provider_id=default_provider_id,
                default_operation=default_operation,
                workspace_id=workspace_id,
                preferred_account_id=preferred_account_id,
                continue_on_error=continue_on_error,
                force_new=force_new,
                execution=execution,
                execution_policy=policy,
            )

        return await self._execute_fanout(
            items=items,
            user=user,
            default_provider_id=default_provider_id,
            default_operation=default_operation,
            workspace_id=workspace_id,
            preferred_account_id=preferred_account_id,
            continue_on_error=continue_on_error,
            force_new=force_new,
            execution=execution,
        )

    async def _execute_fanout(
        self,
        *,
        items: List[Dict[str, Any]],
        user: User,
        default_provider_id: str,
        default_operation: str = "text_to_image",
        workspace_id: Optional[int] = None,
        preferred_account_id: Optional[int] = None,
        continue_on_error: bool = True,
        force_new: bool = True,
        execution: ChainExecution,
    ) -> FanoutExecutionResult:
        execution.status = "running"
        execution.current_step_index = 0
        execution.started_at = utcnow()
        await self.db.commit()

        submitted_count = 0
        failed_count = 0
        top_error: Optional[str] = None

        for i, item in enumerate(items):
            item_id = str(item.get("id") or f"item_{i}")
            execution.current_step_index = i
            self._update_step_state(
                execution,
                item_id,
                status="submitting",
                started_at=utcnow().isoformat(),
            )
            await self.db.commit()

            try:
                provider_id = str(item.get("provider_id") or default_provider_id)
                operation = item.get("operation") or default_operation
                operation_type = _coerce_operation_type(operation)
                params = item.get("params")
                if not isinstance(params, dict):
                    raise RuntimeError("Fanout item params must be an object")

                generation = await self._creation.create_generation(
                    user=user,
                    operation_type=operation_type,
                    provider_id=provider_id,
                    params=params,
                    workspace_id=item.get("workspace_id", workspace_id),
                    preferred_account_id=item.get("preferred_account_id", preferred_account_id),
                    name=item.get("name"),
                    description=item.get("description"),
                    priority=int(item.get("priority", 5) or 5),
                    force_new=bool(item.get("force_new", force_new)),
                )

                submitted_count += 1
                self._update_step_state(
                    execution,
                    item_id,
                    status="submitted",
                    generation_id=generation.id,
                    provider_id=provider_id,
                    operation=operation_type.value,
                    completed_at=utcnow().isoformat(),
                )
                await self.db.commit()
            except Exception as exc:
                failed_count += 1
                msg = str(exc)
                if top_error is None:
                    top_error = msg
                self._update_step_state(
                    execution,
                    item_id,
                    status="failed",
                    error=msg,
                    completed_at=utcnow().isoformat(),
                )
                await self.db.commit()
                logger.error(
                    "fanout_executor.item_failed",
                    extra={
                        "execution_id": str(execution.id),
                        "item_id": item_id,
                        "item_index": i,
                        "error": msg,
                    },
                )
                if not continue_on_error:
                    break

        execution.completed_at = utcnow()
        execution.status = "completed" if failed_count == 0 else "failed"
        execution.error_message = None if failed_count == 0 else top_error

        # augment metadata with orchestration summary
        meta = dict(execution.execution_metadata or {})
        meta["execution_kind"] = "fanout"
        meta["submitted_count"] = submitted_count
        meta["failed_count"] = failed_count
        meta["total_items"] = len(items)
        execution.execution_metadata = meta
        await self.db.commit()

        return FanoutExecutionResult(
            execution_id=execution.id,
            status=execution.status,
            step_states=list(execution.step_states or []),
            submitted_count=submitted_count,
            failed_count=failed_count,
            error=execution.error_message,
        )

    async def _execute_sequential(
        self,
        *,
        items: List[Dict[str, Any]],
        user: User,
        default_provider_id: str,
        default_operation: str = "text_to_image",
        workspace_id: Optional[int] = None,
        preferred_account_id: Optional[int] = None,
        continue_on_error: bool = True,
        force_new: bool = True,
        execution: ChainExecution,
        execution_policy: ExecutionPolicyV1,
    ) -> FanoutExecutionResult:
        execution.status = "running"
        execution.current_step_index = 0
        execution.started_at = utcnow()
        await self.db.commit()

        submitted_count = 0
        failed_count = 0
        top_error: Optional[str] = None
        previous_asset_id: Optional[int] = None

        for i, item in enumerate(items):
            item_id = str(item.get("id") or f"item_{i}")
            execution.current_step_index = i
            self._update_step_state(
                execution,
                item_id,
                status="submitting",
                started_at=utcnow().isoformat(),
            )
            await self.db.commit()

            try:
                provider_id = str(item.get("provider_id") or default_provider_id)
                operation = item.get("operation") or default_operation
                operation_type = _coerce_operation_type(operation)
                params = item.get("params")
                if not isinstance(params, dict):
                    raise RuntimeError("Fanout item params must be an object")

                resolved_params = deepcopy(params)
                if (
                    execution_policy.dependency_mode == "previous"
                    and i > 0
                    and previous_asset_id is not None
                    and bool(item.get("use_previous_output_as_input"))
                ):
                    resolved_params = self._apply_previous_output_override(
                        resolved_params,
                        previous_asset_id,
                    )

                self._update_step_state(
                    execution,
                    item_id,
                    status="generating",
                    source_asset_id=previous_asset_id if bool(item.get("use_previous_output_as_input")) else None,
                )
                await self.db.commit()

                result = await self._step_executor.execute_step(
                    user=user,
                    operation_type=operation_type,
                    provider_id=provider_id,
                    params=resolved_params,
                    workspace_id=item.get("workspace_id", workspace_id),
                    preferred_account_id=item.get("preferred_account_id", preferred_account_id),
                    force_new=bool(item.get("force_new", force_new)),
                    poll_interval=3.0,
                    timeout=float(execution_policy.step_timeout_seconds or 600.0),
                    creation_kwargs={
                        "name": item.get("name"),
                        "description": item.get("description"),
                        "priority": int(item.get("priority", 5) or 5),
                    },
                )

                submitted_count += 1
                step_status = (
                    "completed"
                    if result.status == GenerationStatus.COMPLETED
                    else "cancelled" if result.status == GenerationStatus.CANCELLED
                    else "failed"
                )
                self._update_step_state(
                    execution,
                    item_id,
                    status=step_status,
                    generation_id=result.generation_id,
                    provider_id=provider_id,
                    operation=operation_type.value,
                    generation_status=result.status.value,
                    result_asset_id=result.asset_id,
                    error=result.error_message,
                    completed_at=utcnow().isoformat(),
                    duration_seconds=result.duration_seconds,
                )
                await self.db.commit()

                if result.status == GenerationStatus.COMPLETED:
                    previous_asset_id = result.asset_id
                else:
                    failed_count += 1
                    if top_error is None:
                        top_error = result.error_message or f"Generation {result.generation_id} {result.status.value}"
                    if not continue_on_error:
                        break
            except StepTimeoutError as exc:
                failed_count += 1
                msg = str(exc)
                if top_error is None:
                    top_error = msg
                self._update_step_state(
                    execution,
                    item_id,
                    status="timeout",
                    error=msg,
                    completed_at=utcnow().isoformat(),
                )
                await self.db.commit()
                if not continue_on_error:
                    break
            except Exception as exc:
                failed_count += 1
                msg = str(exc)
                if top_error is None:
                    top_error = msg
                self._update_step_state(
                    execution,
                    item_id,
                    status="failed",
                    error=msg,
                    completed_at=utcnow().isoformat(),
                )
                await self.db.commit()
                logger.error(
                    "fanout_executor.sequential_item_failed",
                    extra={
                        "execution_id": str(execution.id),
                        "item_id": item_id,
                        "item_index": i,
                        "error": msg,
                    },
                )
                if not continue_on_error:
                    break

        execution.completed_at = utcnow()
        execution.status = "completed" if failed_count == 0 else "failed"
        execution.error_message = None if failed_count == 0 else top_error

        meta = dict(execution.execution_metadata or {})
        meta["execution_kind"] = "raw_items_sequential"
        meta["submitted_count"] = submitted_count
        meta["failed_count"] = failed_count
        meta["total_items"] = len(items)
        meta["dependency_mode"] = execution_policy.dependency_mode
        execution.execution_metadata = meta
        await self.db.commit()

        return FanoutExecutionResult(
            execution_id=execution.id,
            status=execution.status,
            step_states=list(execution.step_states or []),
            submitted_count=submitted_count,
            failed_count=failed_count,
            error=execution.error_message,
        )

    @staticmethod
    def _apply_previous_output_override(params: Dict[str, Any], previous_asset_id: int) -> Dict[str, Any]:
        """
        Override source inputs in a raw generation params payload using previous output.

        This mirrors frontend sequential quickgen behavior, but on the backend so
        callers can remain thin payload builders.
        """
        patched = deepcopy(params)
        gen_cfg = patched.get("generation_config")
        if not isinstance(gen_cfg, dict):
            return patched

        gen_cfg["sourceAssetId"] = previous_asset_id
        gen_cfg["source_asset_id"] = previous_asset_id
        gen_cfg["sourceAssetIds"] = [previous_asset_id]
        gen_cfg["source_asset_ids"] = [previous_asset_id]
        gen_cfg.pop("original_video_id", None)
        gen_cfg.pop("composition_assets", None)
        return patched

    @staticmethod
    def _update_step_state(
        execution: ChainExecution,
        step_id: str,
        **updates: Any,
    ) -> None:
        for state in execution.step_states:
            if state.get("step_id") == step_id:
                state.update(updates)
                return
        execution.step_states.append({"step_id": step_id, **updates})
