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
from pixsim7.backend.main.services.guidance.chain_inheritance import compile_chain_step_guidance
from pixsim7.backend.main.services.prompt.block.template_service import BlockTemplateService
from pixsim7.backend.main.shared.datetime_utils import utcnow

logger = logging.getLogger(__name__)


def _coerce_operation_type(value: Any) -> OperationType:
    """Accept canonical enum values plus common quick aliases."""
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
        raise RuntimeError(f"Unsupported step operation '{value}'") from exc


def _coerce_repeat_count(value: Any) -> int:
    if value is None:
        return 1
    try:
        count = int(value)
    except (TypeError, ValueError) as exc:
        raise RuntimeError(f"Invalid repeat_count '{value}'") from exc
    if count < 1:
        raise RuntimeError(f"repeat_count must be >= 1 (got {count})")
    return count


def _coerce_optional_int(value: Any, field_name: str) -> Optional[int]:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError) as exc:
        raise RuntimeError(f"Invalid {field_name} '{value}'") from exc


def _coerce_mapping(value: Any, field_name: str) -> Dict[str, Any]:
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise RuntimeError(f"{field_name} must be an object/dict")
    return dict(value)


def _deep_merge_dict(base: Dict[str, Any], patch: Dict[str, Any]) -> Dict[str, Any]:
    merged: Dict[str, Any] = dict(base)
    for key, value in patch.items():
        existing = merged.get(key)
        if isinstance(existing, dict) and isinstance(value, dict):
            merged[key] = _deep_merge_dict(existing, value)
        else:
            merged[key] = value
    return merged


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
        existing_execution: Optional[ChainExecution] = None,
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
            existing_execution: Optional pre-created execution record (e.g.
                from background task). If provided, reuses it instead of
                creating a new one.

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

        # --- Create or reuse execution record ---
        if existing_execution is not None:
            execution = existing_execution
            execution.steps_snapshot = list(chain.steps)
            execution.step_states = [
                {"step_id": s.get("id", f"step_{i}"), "status": "pending"}
                for i, s in enumerate(chain.steps)
            ]
            execution.status = "running"
            execution.current_step_index = 0
            execution.started_at = utcnow()
            if execution_metadata:
                execution.execution_metadata = execution_metadata
            await self.db.commit()
        else:
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
        previous_compiled_guidance: Optional[Dict[str, Any]] = None
        previous_settings_params: Dict[str, Any] = {}
        final_asset_id = None
        chain_error = None

        for i, step in enumerate(chain.steps):
            step_id = step.get("id", f"step_{i}")
            repeat_count = _coerce_repeat_count(step.get("repeat_count"))
            execution.current_step_index = i
            self._update_step_state(
                execution,
                step_id,
                status="rolling",
                repeat_count=repeat_count,
                repeat_index=1,
                iterations_completed=0,
            )
            await self.db.commit()

            try:
                result: Optional[StepResult] = None
                compiled_guidance: Optional[Dict[str, Any]] = None
                iteration_summaries: List[Dict[str, Any]] = []
                iteration_previous_asset_id = previous_asset_id
                iteration_previous_compiled_guidance = previous_compiled_guidance
                iteration_previous_settings_params = dict(previous_settings_params)
                effective_settings_params: Dict[str, Any] = dict(iteration_previous_settings_params)

                for repeat_index in range(repeat_count):
                    self._update_step_state(
                        execution,
                        step_id,
                        status="rolling",
                        repeat_count=repeat_count,
                        repeat_index=repeat_index + 1,
                        iterations_completed=repeat_index,
                    )
                    await self.db.commit()

                    result, compiled_guidance, effective_settings_params = await self._execute_single_step(
                        step=step,
                        step_index=i,
                        chain=chain,
                        user=user,
                        provider_id=provider_id,
                        previous_asset_id=iteration_previous_asset_id,
                        previous_compiled_guidance=iteration_previous_compiled_guidance,
                        previous_settings_params=iteration_previous_settings_params,
                        step_results=step_results,
                        default_operation=default_operation,
                        workspace_id=workspace_id,
                        preferred_account_id=preferred_account_id,
                        step_timeout=step_timeout,
                        step_poll_interval=step_poll_interval,
                        execution=execution,
                    )

                    step_results[step_id] = result
                    iteration_previous_asset_id = result.asset_id
                    iteration_previous_compiled_guidance = compiled_guidance
                    iteration_previous_settings_params = dict(effective_settings_params)
                    iteration_summaries.append({
                        "repeat_index": repeat_index + 1,
                        "generation_id": result.generation_id,
                        "asset_id": result.asset_id,
                        "status": str(result.status.value if hasattr(result.status, "value") else result.status),
                        "duration_seconds": result.duration_seconds,
                    })

                if result is None:
                    raise RuntimeError(f"Step '{step_id}' produced no result")

                previous_asset_id = result.asset_id
                previous_compiled_guidance = compiled_guidance
                previous_settings_params = dict(iteration_previous_settings_params)
                final_asset_id = result.asset_id

                self._update_step_state(
                    execution,
                    step_id,
                    status="completed",
                    generation_id=result.generation_id,
                    result_asset_id=result.asset_id,
                    completed_at=utcnow().isoformat(),
                    duration_seconds=result.duration_seconds,
                    compiled_guidance=compiled_guidance,
                    repeat_count=repeat_count,
                    repeat_index=repeat_count,
                    iterations_completed=repeat_count,
                    iteration_results=iteration_summaries if repeat_count > 1 else None,
                )
                await self.db.commit()

                logger.info(
                    "chain_executor.step_completed",
                    extra={
                        "execution_id": str(execution.id),
                        "step_id": step_id,
                        "step_index": i,
                        "asset_id": result.asset_id,
                        "repeat_count": repeat_count,
                        "has_guidance": compiled_guidance is not None,
                    },
                )

            except StepTimeoutError as e:
                chain_error = f"Step '{step_id}' timed out: {e}"
                self._update_step_state(
                    execution,
                    step_id,
                    status="failed",
                    error=chain_error,
                    repeat_count=repeat_count,
                )
                break

            except Exception as e:
                chain_error = f"Step '{step_id}' failed: {e}"
                self._update_step_state(
                    execution,
                    step_id,
                    status="failed",
                    error=str(e),
                    repeat_count=repeat_count,
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
        previous_compiled_guidance: Optional[Dict[str, Any]],
        previous_settings_params: Optional[Dict[str, Any]],
        step_results: Dict[str, StepResult],
        default_operation: str,
        workspace_id: Optional[int],
        preferred_account_id: Optional[int],
        step_timeout: float,
        step_poll_interval: float,
        execution: ChainExecution,
    ) -> tuple[StepResult, Optional[Dict[str, Any]], Dict[str, Any]]:
        """Execute one step: compile guidance → roll template → build params → submit → await.

        Returns:
            ``(step_result, compiled_guidance_dict, effective_settings_params)`` —
            the generation result, compiled guidance plan dict (for passing to
            next step), and the effective QuickGen-style settings params used
            for this step (for inheritance by later steps).
        """

        step_id = step.get("id", f"step_{step_index}")
        template_id = step.get("template_id")
        inline_prompt = (step.get("prompt") or "").strip() or None
        operation = step.get("operation", default_operation)
        step_provider_override = (step.get("provider_id") or "").strip() or None
        step_preferred_account_override = _coerce_optional_int(
            step.get("preferred_account_id"),
            "preferred_account_id",
        )
        inherit_previous_settings = (
            True if step.get("inherit_previous_settings") is None
            else bool(step.get("inherit_previous_settings"))
        )
        params_overrides = _coerce_mapping(step.get("params_overrides"), "params_overrides")
        inherited_settings_params = (
            _coerce_mapping(previous_settings_params, "previous_settings_params")
            if inherit_previous_settings else {}
        )
        effective_settings_params = _deep_merge_dict(inherited_settings_params, params_overrides)
        effective_provider_id = step_provider_override or provider_id
        effective_preferred_account_id = (
            step_preferred_account_override
            if step_preferred_account_override is not None
            else preferred_account_id
        )

        # --- Compile guidance (inheritance + step-local) ---
        step_guidance = step.get("guidance")
        guidance_inherit = step.get("guidance_inherit")

        compiled_plan, guidance_warnings = compile_chain_step_guidance(
            previous_compiled=previous_compiled_guidance,
            step_guidance=step_guidance,
            guidance_inherit=guidance_inherit,
        )

        compiled_guidance_dict: Optional[Dict[str, Any]] = None
        if compiled_plan is not None:
            compiled_guidance_dict = compiled_plan.model_dump(exclude_none=True)

        if guidance_warnings:
            logger.info(
                "chain_executor.guidance_warnings",
                extra={
                    "execution_id": str(execution.id),
                    "step_id": step_id,
                    "warnings": guidance_warnings,
                },
            )

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

            template_uuid = UUID(template_id) if isinstance(template_id, str) else template_id
            roll_result = await self._template_service.roll_template(
                template_uuid,
                control_values=control_overrides,
                character_bindings=char_overrides,
                current_user_id=user.id,
            )

            if not roll_result.get("success"):
                raise RuntimeError(
                    f"Template roll failed for step '{step_id}': "
                    f"{roll_result.get('error', 'unknown error')}"
                )

            prompt = roll_result["assembled_prompt"]
            roll_metadata = {
                "assembled_prompt": prompt,
                "selected_block_ids": roll_result.get("metadata", {}).get("selected_block_ids") or [
                    sr.get("selected_block_id")
                    for sr in (roll_result.get("slot_results") or [])
                    if isinstance(sr, dict) and sr.get("selected_block_id")
                ],
                "roll_seed": roll_result.get("metadata", {}).get("seed"),
                "slot_results": roll_result.get("slot_results"),
                "warnings": roll_result.get("warnings"),
            }
        elif inline_prompt:
            prompt = inline_prompt

        if not prompt:
            raise RuntimeError(
                f"Chain step '{step_id}' must provide template_id or prompt"
            )

        # Update step state with roll + guidance info
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
            compiled_guidance=compiled_guidance_dict,
            guidance_warnings=guidance_warnings if guidance_warnings else None,
            started_at=utcnow().isoformat(),
        )
        await self.db.commit()

        # --- Build structured generation params ---
        operation_type = _coerce_operation_type(operation)

        # run_context carries chain provenance + guidance
        run_context: Dict[str, Any] = {
            "run_mode": "generation_chain",
            "chain_id": str(chain.id),
            "execution_id": str(execution.id),
            "step_id": step_id,
            "step_index": step_index,
        }
        # Manifest keys expected by asset provenance tracking.
        run_context["run_id"] = str(execution.id)
        run_context["item_index"] = step_index
        if compiled_guidance_dict:
            run_context["guidance_plan"] = compiled_guidance_dict

        if template_id and roll_metadata:
            run_context["block_template_id"] = str(template_uuid)
            run_context["template_slug"] = step.get("template_slug")  # optional caller hint
            run_context["roll_seed"] = roll_metadata.get("roll_seed")
            run_context["slot_results"] = roll_metadata.get("slot_results") or []
            run_context["selected_block_ids"] = roll_metadata.get("selected_block_ids") or []
            run_context["assembled_prompt"] = roll_metadata.get("assembled_prompt")
            if control_overrides is not None:
                run_context["control_overrides"] = control_overrides
            if char_overrides is not None:
                run_context["character_binding_overrides"] = char_overrides
        elif inline_prompt:
            run_context["inline_prompt"] = inline_prompt
            run_context["assembled_prompt"] = inline_prompt

        gen_config: Dict[str, Any] = dict(effective_settings_params)
        gen_config["run_context"] = run_context
        if prompt:
            gen_config["prompt"] = prompt
        if source_asset_id:
            gen_config["source_asset_id"] = source_asset_id
            # Also provide as composition_assets for operations that need it
            gen_config["composition_assets"] = [{
                "asset_id": source_asset_id,
                "media_type": "image",
                "role": "source_image",
            }]

        params: Dict[str, Any] = {
            "generation_config": gen_config,
        }

        # --- Submit and await ---
        result = await self._step_executor.execute_step(
            user=user,
            operation_type=operation_type,
            provider_id=effective_provider_id,
            params=params,
            workspace_id=workspace_id,
            preferred_account_id=effective_preferred_account_id,
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

        return result, compiled_guidance_dict, effective_settings_params

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
