"""
ChainExecutor - Sequential execution of GenerationChain pipelines.

Iterates through a chain's steps in order, rolling each step's template,
submitting a generation, awaiting completion via GenerationStepExecutor,
and piping the result asset to the next step.

This service owns the orchestration loop. It does NOT own:
- Template rolling (delegates to BlockTemplateService)
- Generation submission/awaiting (delegates to GenerationStepExecutor)
- Chain definition (reads from GenerationChain model)

See: docs/design/SEQUENTIAL_GENERATION_DESIGN.md
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain import OperationType, User
from pixsim7.backend.main.domain.generation.chain import ChainExecution, GenerationChain
from pixsim7.backend.main.services.generation.step_executor import (
    GenerationStepExecutor,
    StepResult,
    StepTimeoutError,
)
from pixsim7.backend.main.services.prompt.block.template_service import BlockTemplateService
from pixsim7.backend.main.shared.datetime_utils import utcnow

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Execution result
# ---------------------------------------------------------------------------


class ChainExecutionResult:
    """Summary returned after a chain finishes (success or failure)."""

    def __init__(
        self,
        execution_id: UUID,
        chain_id: UUID,
        status: str,
        step_states: List[Dict[str, Any]],
        final_asset_id: Optional[int] = None,
        error: Optional[str] = None,
    ):
        self.execution_id = execution_id
        self.chain_id = chain_id
        self.status = status
        self.step_states = step_states
        self.final_asset_id = final_asset_id
        self.error = error


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class ChainExecutor:
    """
    Execute a GenerationChain: iterate steps sequentially, roll templates,
    submit generations, await results, pipe assets between steps.

    Usage::

        executor = ChainExecutor(db, step_executor, template_service)
        result = await executor.execute(chain, user, provider_id="pixverse")
        print(result.final_asset_id)
    """

    def __init__(
        self,
        db: AsyncSession,
        step_executor: GenerationStepExecutor,
        template_service: BlockTemplateService,
    ):
        self.db = db
        self._step_executor = step_executor
        self._template_service = template_service

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def execute(
        self,
        chain: GenerationChain,
        user: User,
        *,
        provider_id: str,
        initial_asset_id: Optional[int] = None,
        default_operation: str = "txt2img",
        workspace_id: Optional[int] = None,
        preferred_account_id: Optional[int] = None,
        step_timeout: float = 600.0,
        step_poll_interval: float = 3.0,
        execution_metadata: Optional[Dict[str, Any]] = None,
    ) -> ChainExecutionResult:
        """
        Execute all steps in a chain sequentially.

        Args:
            chain: The GenerationChain to execute.
            user: Authenticated user.
            provider_id: Provider for all generation steps.
            initial_asset_id: Optional input asset for the first step.
            default_operation: Fallback operation type if step doesn't specify one.
            workspace_id: Optional workspace scope.
            preferred_account_id: Preferred provider account.
            step_timeout: Max seconds per step. Default 10 min.
            step_poll_interval: Poll interval for step completion. Default 3s.
            execution_metadata: Extra metadata stored on the execution record.

        Returns:
            ChainExecutionResult with final status and per-step states.
        """
        if not chain.steps:
            return ChainExecutionResult(
                execution_id=UUID(int=0),
                chain_id=chain.id,
                status="failed",
                step_states=[],
                error="Chain has no steps",
            )

        # --- Create execution record ---
        execution = ChainExecution(
            chain_id=chain.id,
            steps_snapshot=list(chain.steps),
            step_states=[
                {"step_id": s.get("id", f"step_{i}"), "status": "pending"}
                for i, s in enumerate(chain.steps)
            ],
            status="running",
            current_step_index=0,
            user_id=user.id,
            started_at=utcnow(),
            execution_metadata=execution_metadata or {},
        )
        self.db.add(execution)
        await self.db.commit()
        await self.db.refresh(execution)

        # --- Execute steps ---
        step_results: Dict[str, StepResult] = {}
        previous_asset_id = initial_asset_id
        final_asset_id = None
        chain_error = None

        for i, step in enumerate(chain.steps):
            step_id = step.get("id", f"step_{i}")
            execution.current_step_index = i
            self._update_step_state(execution, step_id, status="rolling")
            await self.db.commit()

            try:
                result = await self._execute_single_step(
                    step=step,
                    step_index=i,
                    chain=chain,
                    user=user,
                    provider_id=provider_id,
                    previous_asset_id=previous_asset_id,
                    step_results=step_results,
                    default_operation=default_operation,
                    workspace_id=workspace_id,
                    preferred_account_id=preferred_account_id,
                    step_timeout=step_timeout,
                    step_poll_interval=step_poll_interval,
                    execution=execution,
                )

                step_results[step_id] = result
                previous_asset_id = result.asset_id
                final_asset_id = result.asset_id

                self._update_step_state(
                    execution,
                    step_id,
                    status="completed",
                    generation_id=result.generation_id,
                    result_asset_id=result.asset_id,
                    completed_at=utcnow().isoformat(),
                    duration_seconds=result.duration_seconds,
                )
                await self.db.commit()

                logger.info(
                    "chain_executor.step_completed",
                    extra={
                        "execution_id": str(execution.id),
                        "step_id": step_id,
                        "step_index": i,
                        "asset_id": result.asset_id,
                    },
                )

            except StepTimeoutError as e:
                chain_error = f"Step '{step_id}' timed out: {e}"
                self._update_step_state(
                    execution, step_id, status="failed", error=chain_error,
                )
                break

            except Exception as e:
                chain_error = f"Step '{step_id}' failed: {e}"
                self._update_step_state(
                    execution, step_id, status="failed", error=str(e),
                )
                logger.error(
                    "chain_executor.step_failed",
                    extra={
                        "execution_id": str(execution.id),
                        "step_id": step_id,
                        "error": str(e),
                    },
                )
                break

        # --- Finalize execution ---
        final_status = "completed" if chain_error is None else "failed"
        execution.status = final_status
        execution.error_message = chain_error
        execution.completed_at = utcnow()

        # Increment chain usage counter on success
        if final_status == "completed":
            chain.execution_count = (chain.execution_count or 0) + 1

        await self.db.commit()

        return ChainExecutionResult(
            execution_id=execution.id,
            chain_id=chain.id,
            status=final_status,
            step_states=execution.step_states,
            final_asset_id=final_asset_id,
            error=chain_error,
        )

    # ------------------------------------------------------------------
    # Single step execution
    # ------------------------------------------------------------------

    async def _execute_single_step(
        self,
        step: Dict[str, Any],
        step_index: int,
        chain: GenerationChain,
        user: User,
        provider_id: str,
        previous_asset_id: Optional[int],
        step_results: Dict[str, StepResult],
        default_operation: str,
        workspace_id: Optional[int],
        preferred_account_id: Optional[int],
        step_timeout: float,
        step_poll_interval: float,
        execution: ChainExecution,
    ) -> StepResult:
        """Execute one step: roll template → build params → submit → await."""

        step_id = step.get("id", f"step_{step_index}")
        template_id = step.get("template_id")
        operation = step.get("operation", default_operation)

        # --- Resolve input asset ---
        source_asset_id = self._resolve_input_asset(
            step, step_index, chain, previous_asset_id, step_results,
        )

        # --- Roll template ---
        roll_result = None
        prompt = None
        roll_metadata: Dict[str, Any] = {}

        if template_id:
            control_overrides = step.get("control_overrides")
            char_overrides = step.get("character_binding_overrides")

            roll_result = await self._template_service.roll_template(
                UUID(template_id) if isinstance(template_id, str) else template_id,
                control_values=control_overrides,
                character_bindings=char_overrides,
            )

            if not roll_result.get("success"):
                raise RuntimeError(
                    f"Template roll failed for step '{step_id}': "
                    f"{roll_result.get('error', 'unknown error')}"
                )

            prompt = roll_result["assembled_prompt"]
            roll_metadata = {
                "assembled_prompt": prompt,
                "selected_block_ids": [
                    sr.get("block_id")
                    for sr in roll_result.get("slot_results", [])
                    if sr.get("block_id")
                ],
                "roll_seed": roll_result.get("metadata", {}).get("seed"),
                "slot_results": roll_result.get("slot_results"),
                "warnings": roll_result.get("warnings"),
            }

        # Update step state with roll info
        self._update_step_state(
            execution,
            step_id,
            status="generating",
            source_asset_id=source_asset_id,
            roll_result={
                "assembled_prompt": roll_metadata.get("assembled_prompt"),
                "selected_block_ids": roll_metadata.get("selected_block_ids", []),
                "roll_seed": roll_metadata.get("roll_seed"),
            } if roll_metadata else None,
            started_at=utcnow().isoformat(),
        )
        await self.db.commit()

        # --- Build generation params ---
        params: Dict[str, Any] = {}
        if prompt:
            params["prompt"] = prompt
        if source_asset_id:
            params["source_asset_id"] = source_asset_id

        # --- Submit and await ---
        operation_type = OperationType(operation)

        result = await self._step_executor.execute_step(
            user=user,
            operation_type=operation_type,
            provider_id=provider_id,
            params=params,
            workspace_id=workspace_id,
            preferred_account_id=preferred_account_id,
            force_new=True,  # Chain steps should always generate fresh
            poll_interval=step_poll_interval,
            timeout=step_timeout,
        )

        # Check for generation failure
        from pixsim7.backend.main.domain import GenerationStatus
        if result.status == GenerationStatus.FAILED:
            raise RuntimeError(
                f"Generation failed: {result.error_message or 'unknown error'}"
            )
        if result.status == GenerationStatus.CANCELLED:
            raise RuntimeError("Generation was cancelled")

        return result

    # ------------------------------------------------------------------
    # Input resolution
    # ------------------------------------------------------------------

    @staticmethod
    def _resolve_input_asset(
        step: Dict[str, Any],
        step_index: int,
        chain: GenerationChain,
        previous_asset_id: Optional[int],
        step_results: Dict[str, StepResult],
    ) -> Optional[int]:
        """
        Resolve the input asset for a step.

        Rules:
        - If step has explicit input_from, use that step's result asset.
        - Otherwise, default to previous step's result (sequential wiring).
        - First step uses initial_asset_id (may be None for txt2img).
        """
        input_from = step.get("input_from")

        if input_from:
            # Explicit wiring to a specific prior step
            source = step_results.get(input_from)
            if source is None:
                raise RuntimeError(
                    f"Step references input_from='{input_from}' but that step "
                    f"has not completed or does not exist"
                )
            return source.asset_id

        # Default: previous step's output
        if step_index == 0:
            return previous_asset_id  # initial_asset_id (may be None)

        return previous_asset_id

    # ------------------------------------------------------------------
    # Step state management
    # ------------------------------------------------------------------

    @staticmethod
    def _update_step_state(
        execution: ChainExecution,
        step_id: str,
        **updates: Any,
    ) -> None:
        """
        Update a specific step's state within the execution record.
        Mutates execution.step_states in place.
        """
        for state in execution.step_states:
            if state.get("step_id") == step_id:
                state.update(updates)
                return

        # Step not found — append (shouldn't happen with proper init)
        execution.step_states.append({"step_id": step_id, **updates})
