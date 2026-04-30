"""
Chain execution processor worker — runs persisted-chain, ephemeral-chain, and
ephemeral-fanout executions as ARQ jobs.

Replaces the in-process ``BackgroundTasks.add_task(...)`` pattern that the
``/generation-chains`` endpoints used to use.  Routing through ARQ (with a
unique job_id keyed on ``execution_id``) gives us:

- **Survives API restart**: an in-flight chain execution continues running in
  the worker even if the FastAPI process restarts.
- **Cross-process dedup** via ``_job_id=f"chain-exec:{execution_id}"`` —
  the API request always pre-creates a fresh ``ChainExecution`` row, so each
  enqueue is naturally unique.  The dedup only matters as a safety net.
- **Retry/backoff** via the worker's ``max_tries`` + ``retry_jobs`` settings.
- **Observability**: same structured-logging envelope as the other arq
  asset/entity jobs.

UI status reporting is unchanged — chain executors write progress to the
``ChainExecution`` row + emit ``asset:updated`` events from
``GenerationCreationService``, which the frontend polls / subscribes to.
"""
from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.generation.chain import (
    ChainExecution,
    GenerationChain,
)
from pixsim7.backend.main.services.generation.chain_executor import ChainExecutor
from pixsim7.backend.main.services.generation.creation import (
    GenerationCreationService,
)
from pixsim7.backend.main.services.generation.execution_policy import (
    normalize_chain_execution_policy,
    normalize_item_execution_policy,
)
from pixsim7.backend.main.services.generation.fanout_executor import FanoutExecutor
from pixsim7.backend.main.services.generation.query import GenerationQueryService
from pixsim7.backend.main.services.generation.step_executor import (
    GenerationStepExecutor,
)
from pixsim7.backend.main.services.prompt.block.template_service import (
    BlockTemplateService,
)
from pixsim7.backend.main.services.user.user_service import UserService
from pixsim7.backend.main.workers.asset_job import run_keyed_job


def _build_chain_executor(db: AsyncSession) -> ChainExecutor:
    user_service = UserService(db)
    creation = GenerationCreationService(db, user_service)
    query = GenerationQueryService(db)
    step_exec = GenerationStepExecutor(db, creation, query)
    template_svc = BlockTemplateService(db)
    return ChainExecutor(db, step_exec, template_svc)


def _build_fanout_executor(db: AsyncSession) -> FanoutExecutor:
    user_service = UserService(db)
    creation = GenerationCreationService(db, user_service)
    query = GenerationQueryService(db)
    return FanoutExecutor(db, creation, query)


async def _load_execution_and_user(
    db: AsyncSession,
    execution_id: UUID,
    user_id: int,
):
    """Shared bootstrap: load the pre-created execution + user, marking the
    execution failed if the user is gone.  Returns ``(execution, user)`` or
    ``(None, None)`` if the execution itself is missing."""
    execution = await db.get(ChainExecution, execution_id)
    if not execution:
        return None, None

    user_svc = UserService(db)
    user = await user_svc.get_user(user_id)
    if not user:
        execution.status = "failed"
        execution.error_message = "User not found"
        await db.commit()
        return execution, None

    return execution, user


async def process_chain_execution(
    ctx: dict,
    chain_id: str,
    execution_id: str,
    user_id: int,
    request_payload: dict[str, Any],
) -> dict:
    """Run a persisted ``GenerationChain`` execution.  Mirrors the body of
    the former ``_run_chain_background``."""
    # Lazy-import the schema so the worker doesn't import the FastAPI route
    # module's module-level router at startup.
    from pixsim7.backend.main.api.v1.generation_chains import ExecuteChainRequest

    chain_uuid = UUID(chain_id)
    execution_uuid = UUID(execution_id)
    request = ExecuteChainRequest.model_validate(request_payload)

    async def _op(db: AsyncSession) -> dict:
        chain = await db.get(GenerationChain, chain_uuid)
        execution, user = await _load_execution_and_user(db, execution_uuid, user_id)
        if not chain or not execution or not user:
            return {"reason": "chain_or_execution_or_user_missing"}

        executor = _build_chain_executor(db)
        policy = normalize_chain_execution_policy(
            request.execution_policy,
            legacy_step_timeout=request.step_timeout,
        )
        await executor.execute(
            chain,
            user,
            provider_id=request.provider_id,
            initial_asset_id=request.initial_asset_id,
            default_operation=request.default_operation,
            workspace_id=request.workspace_id,
            preferred_account_id=request.preferred_account_id,
            step_timeout=policy.step_timeout_seconds or request.step_timeout,
            execution_metadata=execution.execution_metadata or {},
            existing_execution=execution,
        )
        return {"chain_id": chain_id}

    return await run_keyed_job(
        "chain-execution",
        "execution_id",
        execution_id,
        operation=_op,
        extra_log_fields={"chain_id": chain_id, "user_id": user_id},
    )


async def process_ephemeral_chain_execution(
    ctx: dict,
    synthetic_chain_id: str,
    execution_id: str,
    user_id: int,
    request_payload: dict[str, Any],
) -> dict:
    """Run an ephemeral chain payload (no persisted ``GenerationChain`` row).
    Mirrors the body of the former ``_run_ephemeral_chain_background``."""
    from pixsim7.backend.main.api.v1.generation_chains import (
        ExecuteEphemeralChainRequest,
    )

    synthetic_uuid = UUID(synthetic_chain_id)
    execution_uuid = UUID(execution_id)
    request = ExecuteEphemeralChainRequest.model_validate(request_payload)

    async def _op(db: AsyncSession) -> dict:
        execution, user = await _load_execution_and_user(db, execution_uuid, user_id)
        if not execution or not user:
            return {"reason": "execution_or_user_missing"}

        chain = GenerationChain(
            id=synthetic_uuid,
            name=request.name or "Ephemeral Chain",
            description=request.description,
            steps=[s.model_dump(exclude_none=True) for s in request.steps],
            tags=[],
            chain_metadata=request.chain_metadata or {},
            is_public=False,
            created_by=str(user.id),
            execution_count=0,
        )

        policy = normalize_chain_execution_policy(
            request.execution_policy,
            legacy_step_timeout=request.step_timeout,
        )
        execution_metadata = dict(execution.execution_metadata or {})
        executor = _build_chain_executor(db)
        await executor.execute(
            chain,
            user,
            provider_id=request.provider_id,
            initial_asset_id=request.initial_asset_id,
            default_operation=request.default_operation,
            workspace_id=request.workspace_id,
            preferred_account_id=request.preferred_account_id,
            step_timeout=policy.step_timeout_seconds or request.step_timeout,
            execution_metadata=execution_metadata,
            existing_execution=execution,
        )
        return {"synthetic_chain_id": synthetic_chain_id}

    return await run_keyed_job(
        "ephemeral-chain-execution",
        "execution_id",
        execution_id,
        operation=_op,
        extra_log_fields={
            "synthetic_chain_id": synthetic_chain_id,
            "user_id": user_id,
        },
    )


async def process_ephemeral_fanout_execution(
    ctx: dict,
    execution_id: str,
    user_id: int,
    request_payload: dict[str, Any],
) -> dict:
    """Run an ephemeral fanout (Each-mode) payload.  Mirrors the body of the
    former ``_run_ephemeral_fanout_background``."""
    from pixsim7.backend.main.api.v1.generation_chains import (
        ExecuteEphemeralFanoutRequest,
    )

    execution_uuid = UUID(execution_id)
    request = ExecuteEphemeralFanoutRequest.model_validate(request_payload)

    async def _op(db: AsyncSession) -> dict:
        execution, user = await _load_execution_and_user(db, execution_uuid, user_id)
        if not execution or not user:
            return {"reason": "execution_or_user_missing"}

        policy = normalize_item_execution_policy(
            request.execution_policy,
            legacy_continue_on_error=request.continue_on_error,
            legacy_force_new=request.force_new,
        )
        fanout_executor = _build_fanout_executor(db)
        await fanout_executor.execute(
            items=[item.model_dump(exclude_none=True) for item in request.items],
            user=user,
            default_provider_id=request.provider_id,
            default_operation=request.default_operation,
            workspace_id=request.workspace_id,
            preferred_account_id=request.preferred_account_id,
            continue_on_error=(policy.failure_policy == "continue"),
            force_new=bool(
                policy.force_new if policy.force_new is not None else request.force_new
            ),
            execution_policy=policy,
            execution=execution,
        )
        return {"item_count": len(request.items)}

    return await run_keyed_job(
        "ephemeral-fanout-execution",
        "execution_id",
        execution_id,
        operation=_op,
        extra_log_fields={"user_id": user_id},
    )
