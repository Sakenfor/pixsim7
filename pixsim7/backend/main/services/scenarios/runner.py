"""
Scenario Runner - Headless execution of scenario scripts
"""
from __future__ import annotations
from typing import Optional, Dict, Any, List
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.scenarios.models import (
    ScenarioScript,
    ScenarioStep,
    TickStep,
    InteractionStep,
    NarrativeStep,
    AssertStep,
    WorldSnapshot,
)
from pixsim7.backend.main.services.scenarios.snapshot_service import SnapshotService
from pixsim7.backend.main.services.game.world import GameWorldService


class ScenarioStepResult:
    """Result of executing a single scenario step"""

    def __init__(
        self,
        step_index: int,
        step: ScenarioStep,
        success: bool,
        error: Optional[str] = None,
        duration_ms: Optional[float] = None,
    ):
        self.step_index = step_index
        self.step = step
        self.success = success
        self.error = error
        self.duration_ms = duration_ms


class ScenarioResult:
    """Result of executing a complete scenario"""

    def __init__(
        self,
        script_id: str,
        success: bool,
        step_results: List[ScenarioStepResult],
        snapshots_at_asserts: Dict[str, WorldSnapshot],
        error: Optional[str] = None,
        total_duration_ms: Optional[float] = None,
    ):
        self.script_id = script_id
        self.success = success
        self.step_results = step_results
        self.snapshots_at_asserts = snapshots_at_asserts
        self.error = error
        self.total_duration_ms = total_duration_ms

    def to_dict(self) -> Dict[str, Any]:
        """Convert result to dictionary for serialization"""
        return {
            "script_id": self.script_id,
            "success": self.success,
            "total_steps": len(self.step_results),
            "failed_steps": sum(1 for r in self.step_results if not r.success),
            "assert_count": len(self.snapshots_at_asserts),
            "error": self.error,
            "total_duration_ms": self.total_duration_ms,
            "step_results": [
                {
                    "step_index": r.step_index,
                    "step_kind": r.step.kind,
                    "success": r.success,
                    "error": r.error,
                    "duration_ms": r.duration_ms,
                }
                for r in self.step_results
            ],
        }


class ScenarioRunner:
    """
    Headless runner for scenario scripts.

    Executes scenarios against backend domain services without UI.
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.snapshot_service = SnapshotService(db)
        self.world_service = GameWorldService(db)

    async def run_scenario(
        self,
        script: ScenarioScript,
        *,
        cleanup_after: bool = False
    ) -> ScenarioResult:
        """
        Execute a scenario script.

        Args:
            script: ScenarioScript to execute
            cleanup_after: If True, delete the test world after execution

        Returns:
            ScenarioResult with execution details and snapshots at assertion points
        """
        start_time = datetime.now()
        step_results: List[ScenarioStepResult] = []
        snapshots_at_asserts: Dict[str, WorldSnapshot] = {}
        world_id: Optional[int] = None

        try:
            # 1. Restore snapshot
            world_id = await self.snapshot_service.restore_world_snapshot(script.snapshot)

            # 2. Execute steps
            for i, step in enumerate(script.steps):
                step_start = datetime.now()
                try:
                    await self._execute_step(step, snapshots_at_asserts)
                    step_duration = (datetime.now() - step_start).total_seconds() * 1000
                    step_results.append(
                        ScenarioStepResult(
                            step_index=i,
                            step=step,
                            success=True,
                            duration_ms=step_duration,
                        )
                    )
                except Exception as e:
                    step_duration = (datetime.now() - step_start).total_seconds() * 1000
                    step_results.append(
                        ScenarioStepResult(
                            step_index=i,
                            step=step,
                            success=False,
                            error=str(e),
                            duration_ms=step_duration,
                        )
                    )
                    # Stop execution on first failure
                    break

            # Calculate total duration
            total_duration = (datetime.now() - start_time).total_seconds() * 1000

            # Check if all steps succeeded
            all_success = all(r.success for r in step_results)

            return ScenarioResult(
                script_id=script.id,
                success=all_success,
                step_results=step_results,
                snapshots_at_asserts=snapshots_at_asserts,
                total_duration_ms=total_duration,
            )

        except Exception as e:
            total_duration = (datetime.now() - start_time).total_seconds() * 1000
            return ScenarioResult(
                script_id=script.id,
                success=False,
                step_results=step_results,
                snapshots_at_asserts=snapshots_at_asserts,
                error=str(e),
                total_duration_ms=total_duration,
            )

        finally:
            # Cleanup test world if requested
            if cleanup_after and world_id is not None:
                # Note: Would need to implement world deletion in GameWorldService
                pass

    async def _execute_step(
        self,
        step: ScenarioStep,
        snapshots_at_asserts: Dict[str, WorldSnapshot],
    ) -> None:
        """
        Execute a single scenario step.

        Args:
            step: Step to execute
            snapshots_at_asserts: Dictionary to store snapshots at assertion points
        """
        if isinstance(step, TickStep):
            await self._execute_tick_step(step)
        elif isinstance(step, InteractionStep):
            await self._execute_interaction_step(step)
        elif isinstance(step, NarrativeStep):
            await self._execute_narrative_step(step)
        elif isinstance(step, AssertStep):
            await self._execute_assert_step(step, snapshots_at_asserts)
        else:
            raise ValueError(f"Unknown step kind: {step.kind}")

    async def _execute_tick_step(self, step: TickStep) -> None:
        """Execute a tick step - advance world time"""
        await self.world_service.advance_world_time(
            world_id=step.world_id,
            delta_seconds=step.delta_seconds,
        )

    async def _execute_interaction_step(self, step: InteractionStep) -> None:
        """Execute an interaction step"""
        # TODO: Call interaction execution service when available
        # For now, this is a placeholder
        # await interaction_service.execute_interaction(
        #     world_id=step.world_id,
        #     session_id=step.session_id,
        #     target_kind=step.target_kind,
        #     target_id=step.target_id,
        #     interaction_id=step.interaction_id,
        #     params=step.params,
        # )
        raise NotImplementedError("Interaction execution not yet implemented in runner")

    async def _execute_narrative_step(self, step: NarrativeStep) -> None:
        """Execute a narrative step"""
        # TODO: Call narrative runtime when available (Task 20)
        # For now, this is a placeholder
        # await narrative_runtime.step(
        #     world_id=step.world_id,
        #     session_id=step.session_id,
        #     npc_id=step.npc_id,
        #     input=step.input,
        # )
        raise NotImplementedError("Narrative step execution not yet implemented in runner")

    async def _execute_assert_step(
        self,
        step: AssertStep,
        snapshots_at_asserts: Dict[str, WorldSnapshot],
    ) -> None:
        """
        Execute an assert step - capture current state for later assertion.

        Note: This just captures the snapshot. Actual assertions are evaluated
        in Phase 25.4 by the assertion framework.
        """
        # Capture snapshot at this assertion point
        # We need to determine which world to snapshot - for now we'll need to
        # track the current world_id from previous steps
        # This is a simplified implementation - in practice we'd track context
        # For now, we'll skip the actual snapshot capture and just mark the checkpoint
        snapshots_at_asserts[step.assert_id] = None  # Placeholder
