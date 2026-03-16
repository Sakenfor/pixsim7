"""PlanBuilder — constructs PromptPlanIR from resolution inputs/outputs."""

from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4

from .schema import (
    ConstraintRecord,
    PlanProvenance,
    PromptPlanIR,
    RenderPlan,
    SelectedPrimitiveRecord,
    SlotRecord,
)
from .hashing import compute_plan_hash


class PlanBuilder:
    """Builds a PromptPlanIR from resolution request, result, and composition output."""

    @staticmethod
    def build(
        *,
        resolution_request: Any,
        resolution_result: Any,
        slot_results: List[Dict[str, Any]],
        selected_blocks: List[Dict[str, Any]],
        assembled_prompt: str,
        composition_strategy: str = "sequential",
        template_id: Optional[str] = None,
        template_slug: Optional[str] = None,
        seed: Optional[int] = None,
        control_values: Optional[Dict[str, Any]] = None,
        assembly_budget_report: Optional[Dict[str, Any]] = None,
    ) -> PromptPlanIR:
        """Build a complete PromptPlanIR from roll outputs.

        Args:
            resolution_request: The compiled ResolutionRequest dataclass.
            resolution_result: The ResolutionResult dataclass from the resolver.
            slot_results: The slot_results list from _roll_template_object.
            selected_blocks: The selected_blocks list from _roll_template_object.
            assembled_prompt: The final composed prompt text.
            composition_strategy: The composition strategy used.
            template_id: Optional template UUID string.
            template_slug: Optional template slug.
            seed: Random seed used.
            control_values: Control values applied.
            assembly_budget_report: Budget report if layered budgeting was applied.
        """
        # -- Selected primitives --
        primitives: List[SelectedPrimitiveRecord] = []
        for block in selected_blocks:
            block_id = str(block.get("block_id") or block.get("id") or "")
            target_key = ""
            score: Optional[float] = None
            reasons: List[str] = []

            # Find matching slot result for target_key and score
            for sr in slot_results:
                if sr.get("status") == "selected" and sr.get("selected_block_string_id") == block_id:
                    debug = sr.get("selector_debug") or {}
                    target_key = debug.get("target_key", "")
                    score = debug.get("score")
                    reasons = list(debug.get("reasons") or [])
                    break

            # Also try resolution result
            if not target_key:
                selected_by_target = getattr(resolution_result, "selected_by_target", {}) or {}
                for tk, sel in selected_by_target.items():
                    if getattr(sel, "block_id", None) == block_id:
                        target_key = tk
                        score = getattr(sel, "score", score)
                        reasons = list(getattr(sel, "reasons", []) or reasons)
                        break

            primitives.append(SelectedPrimitiveRecord(
                primitive_id=block_id,
                db_id=str(block.get("id")) if block.get("id") != block.get("block_id") else None,
                target_key=target_key,
                category=block.get("category"),
                text=str(block.get("text") or ""),
                score=score,
                reasons=reasons,
                tags=dict(block.get("tags") or {}),
            ))

        # -- Slot records --
        slots: List[SlotRecord] = []
        for idx, sr in enumerate(slot_results):
            status = sr.get("status", "empty")
            outcome_map = {
                "selected": "selected",
                "fallback": "fallback",
                "skipped": "skipped",
                "reinforcement": "skipped",
                "empty": "empty",
            }
            slots.append(SlotRecord(
                slot_index=idx,
                target_key=sr.get("selector_debug", {}).get("target_key", f"slot_{idx}") if status == "selected" else f"slot_{idx}",
                label=sr.get("label"),
                category=sr.get("selected_block_category"),
                role=sr.get("selected_block_role"),
                optional=status == "skipped",
                outcome=outcome_map.get(status, "empty"),
                fallback_text=sr.get("fallback_text") if status == "fallback" else None,
                fallback_reason=sr.get("reason") if status in ("skipped", "empty") else None,
            ))

        # -- Constraint records --
        constraints: List[ConstraintRecord] = []
        request_constraints = getattr(resolution_request, "constraints", []) or []
        trace_events = []
        trace = getattr(resolution_result, "trace", None)
        if trace is not None:
            trace_events = getattr(trace, "events", []) or []

        constraint_failures = set()
        for ev in trace_events:
            if getattr(ev, "kind", "") == "constraint_failed":
                cid = (getattr(ev, "data", {}) or {}).get("constraint_id", "")
                if cid:
                    constraint_failures.add(cid)

        for c in request_constraints:
            cid = getattr(c, "id", "")
            constraints.append(ConstraintRecord(
                constraint_id=cid,
                kind=getattr(c, "kind", ""),
                target_key=getattr(c, "target_key", None),
                satisfied=cid not in constraint_failures,
                payload=dict(getattr(c, "payload", {}) or {}),
            ))

        # -- Resolved tags (merged from all selected blocks) --
        resolved_tags: Dict[str, Any] = {}
        for block in selected_blocks:
            for k, v in (block.get("tags") or {}).items():
                if k not in resolved_tags:
                    resolved_tags[k] = v

        # -- Candidate counts --
        candidates_by_target = getattr(resolution_request, "candidates_by_target", {}) or {}
        candidate_counts = {
            tk: len(cands) for tk, cands in candidates_by_target.items()
        }

        # -- Trace summary --
        trace_summary: Dict[str, int] = dict(Counter(
            getattr(ev, "kind", "unknown") for ev in trace_events
        ))

        # -- Render plan --
        budget_actions: List[Dict[str, Any]] = []
        if assembly_budget_report and isinstance(assembly_budget_report, dict):
            for action in assembly_budget_report.get("actions", []):
                if isinstance(action, dict):
                    budget_actions.append(dict(action))

        render_plan = RenderPlan(
            composition_strategy=composition_strategy,
            layer_assignments={},
            budget_actions=budget_actions,
            final_text=assembled_prompt,
            char_count=len(assembled_prompt),
        )

        # -- Provenance --
        provenance = PlanProvenance(
            compiler_id=str((getattr(resolution_request, "context", {}) or {}).get("compiler_id", "compiler_v1")),
            resolver_id=getattr(resolution_result, "resolver_id", "next_v1"),
            template_id=template_id,
            template_slug=template_slug,
            seed=seed,
            control_values=dict(control_values or {}),
            candidate_counts=candidate_counts,
            resolution_trace_summary=trace_summary,
        )

        ir = PromptPlanIR(
            plan_id=str(uuid4()),
            created_at=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            selected_primitives=primitives,
            slots=slots,
            constraints=constraints,
            resolved_tags=resolved_tags,
            resolved_ontology_ids=[],
            render_plan=render_plan,
            provenance=provenance,
        )
        ir.deterministic_hash = compute_plan_hash(ir)
        return ir
