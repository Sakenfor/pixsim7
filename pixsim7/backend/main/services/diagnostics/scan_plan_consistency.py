"""Scan-plan-consistency diagnostic.

Corpus-wide audit for checkpoint status/points/steps consistency lies across
every plan (including hidden/archived), reusing the exact write-time detection
rules from ``plan_authoring_policy`` — no duplicated logic. Three lie kinds:

    false_done             status='done' but points_done < points_total
    silent_done            points/steps complete but status != 'done'
    steps_points_conflict  steps[] AND explicit points that disagree

Dry-run by default (report only). The gated ``apply`` param canonicalizes each
offending checkpoint in place (same canonicalizers the progress path uses) and
persists, recording the apply in the backfill ledger.

Write-time enforcement (plan ``checkpoint-consistency-enforcement``) is the
primary guarantee; this diagnostic is the backlog-cleanup + drift safety-net
for rows that bypass the validator (direct DB writes, pre-enforcement data).
It composes with the existing diagnostics runner: on-demand for a user/agent,
schedulable via arq/cron, and observable via DiagnosticRunRecord.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any, AsyncIterator

from sqlalchemy import text

from pixsim7.backend.main.infrastructure.database.session import get_async_session
from pixsim7.backend.main.services.diagnostics.applied_ledger import record_backfill_applied
from pixsim7.backend.main.services.docs.plan_authoring_policy import (
    check_checkpoint_silent_done,
    check_checkpoint_status_points_consistent,
    check_checkpoint_steps_points_conflict,
    complete_underwater_done,
    promote_silent_done,
    strip_stepped_points,
)

from .base import (
    RUN_ACTOR_PARAM,
    Diagnostic,
    DiagnosticEvent,
    DiagnosticParam,
    DiagnosticSpec,
)

_PLAN_META_SCHEMA = "dev_meta"

LIE_FALSE_DONE = "false_done"
LIE_SILENT_DONE = "silent_done"
LIE_STEPS_POINTS_CONFLICT = "steps_points_conflict"


# ── Pure scan / canonicalize helpers (DB-free, unit-testable) ────────────


def coerce_checkpoints(raw: Any) -> list:
    """Normalize a plan_registry.checkpoints JSON value to a list of dicts."""
    if raw is None:
        return []
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except (TypeError, ValueError):
            return []
    return raw if isinstance(raw, list) else []


def scan_checkpoint(cp: dict) -> list[dict]:
    """Return [{kind, message}, ...] for one checkpoint dict (may be empty).

    Reuses the same detection helpers the write-time policy uses, so the audit
    can never drift from enforcement.
    """
    findings: list[dict] = []
    false_done = check_checkpoint_status_points_consistent(cp)
    if false_done:
        findings.append({"kind": LIE_FALSE_DONE, "message": false_done})
    silent_done = check_checkpoint_silent_done(cp)
    if silent_done:
        findings.append({"kind": LIE_SILENT_DONE, "message": silent_done})
    conflict = check_checkpoint_steps_points_conflict(cp)
    if conflict:
        findings.append({"kind": LIE_STEPS_POINTS_CONFLICT, "message": conflict})
    return findings


def scan_plans(plans: list[dict]) -> list[dict]:
    """Scan a list of ``{"id", "checkpoints"}`` plan rows.

    Returns a flat list of findings, each ``{plan_id, checkpoint_id, kind,
    message}``.
    """
    out: list[dict] = []
    for plan in plans:
        plan_id = str(plan.get("id") or "?")
        for cp in coerce_checkpoints(plan.get("checkpoints")):
            if not isinstance(cp, dict):
                continue
            cp_id = str(cp.get("id") or "?")
            for finding in scan_checkpoint(cp):
                out.append({"plan_id": plan_id, "checkpoint_id": cp_id, **finding})
    return out


def canonicalize_checkpoint(cp: dict) -> list[str]:
    """Resolve every status/points/steps lie on a checkpoint in place.

    Order matters: complete a FALSE-DONE first (the asserted status='done' wins
    → finish the points/steps), then promote a SILENT-DONE, then strip any
    redundant explicit points off a step-tracked checkpoint. Each step is a
    no-op when not applicable. Returns human-readable change notes.
    """
    notes: list[str] = []
    completed = complete_underwater_done(cp)
    if completed:
        notes.append(completed)
    promoted = promote_silent_done(cp)
    if promoted:
        notes.append(promoted)
    if strip_stepped_points(cp):
        notes.append(f"Checkpoint '{cp.get('id', '?')}': stripped explicit points (steps win).")
    return notes


# ── Diagnostic ───────────────────────────────────────────────────────────


class ScanPlanConsistencyDiagnostic(Diagnostic):
    spec = DiagnosticSpec(
        id="scan-plan-consistency",
        label="Scan plan checkpoint consistency",
        description=(
            "Audit every plan (incl. hidden/archived) for checkpoint "
            "status/points/steps consistency lies — FALSE-DONE (done but "
            "underwater), SILENT-DONE (complete but not marked done), and "
            "steps/points conflicts. Dry-run by default; enable Apply to "
            "canonicalize and persist. Write-time enforcement is the primary "
            "guarantee — this is the backlog-cleanup + drift safety-net."
        ),
        category="diagnostic",
        params=(
            DiagnosticParam(
                name="apply",
                kind="bool",
                label="Apply fixes (disable dry-run)",
                default=False,
                description=(
                    "Canonicalize the offending checkpoints and persist. "
                    "Default is a read-only report."
                ),
            ),
        ),
    )

    async def run(
        self,
        params: dict[str, Any],
        cancel_event: asyncio.Event,
    ) -> AsyncIterator[DiagnosticEvent]:
        apply = bool(params.get("apply"))
        actor = params.get(RUN_ACTOR_PARAM)

        loop = asyncio.get_event_loop()
        t0 = loop.time()

        def now() -> float:
            return loop.time() - t0

        # ── Phase: loading ──────────────────────────────────────────────
        yield DiagnosticEvent(now(), "phase", {"phase": "loading"})
        try:
            async with get_async_session() as session:
                rows = (
                    await session.execute(
                        text(f"SELECT id, checkpoints FROM {_PLAN_META_SCHEMA}.plan_registry")
                    )
                ).all()
        except Exception as exc:  # noqa: BLE001 — surface, never crash the runner
            yield DiagnosticEvent(
                now(), "error", {"message": f"DB load failed: {type(exc).__name__}: {exc}"}
            )
            return

        plans = [{"id": plan_id, "checkpoints": raw} for plan_id, raw in rows]
        yield DiagnosticEvent(
            now(), "log", {"level": "info", "message": f"Loaded {len(plans)} plans"}
        )
        if cancel_event.is_set():
            return

        # ── Phase: scanning ─────────────────────────────────────────────
        yield DiagnosticEvent(now(), "phase", {"phase": "scanning"})
        findings = scan_plans(plans)
        by_kind: dict[str, int] = {}
        for finding in findings:
            by_kind[finding["kind"]] = by_kind.get(finding["kind"], 0) + 1
            yield DiagnosticEvent(now(), "observation", {"source": "plan_consistency", **finding})

        # ── Phase: applying (gated) ─────────────────────────────────────
        applied_plans = 0
        applied_checkpoints = 0
        if apply and findings:
            yield DiagnosticEvent(now(), "phase", {"phase": "applying"})
            affected = {f["plan_id"] for f in findings}
            async with get_async_session() as session:
                for plan in plans:
                    if plan["id"] not in affected or cancel_event.is_set():
                        continue
                    checkpoints = coerce_checkpoints(plan["checkpoints"])
                    plan_touched = False
                    for cp in checkpoints:
                        if isinstance(cp, dict) and canonicalize_checkpoint(cp):
                            plan_touched = True
                            applied_checkpoints += 1
                    if plan_touched:
                        applied_plans += 1
                        await session.execute(
                            text(
                                f"UPDATE {_PLAN_META_SCHEMA}.plan_registry "
                                f"SET checkpoints = CAST(:cp AS json), updated_at = now() "
                                f"WHERE id = :id"
                            ),
                            {"cp": json.dumps(checkpoints), "id": plan["id"]},
                        )
                await session.commit()
            await record_backfill_applied(
                __file__,
                rows_affected=applied_checkpoints,
                actor=actor,
                notes=(
                    f"scan-plan-consistency: fixed {applied_checkpoints} checkpoint(s) "
                    f"across {applied_plans} plan(s)"
                ),
            )
            yield DiagnosticEvent(
                now(),
                "log",
                {
                    "level": "info",
                    "message": (
                        f"Applied: {applied_checkpoints} checkpoint(s) across "
                        f"{applied_plans} plan(s)"
                    ),
                },
            )
        elif apply:
            yield DiagnosticEvent(
                now(), "log", {"level": "info", "message": "No findings — nothing to apply."}
            )
        else:
            yield DiagnosticEvent(
                now(),
                "log",
                {
                    "level": "info",
                    "message": (
                        f"Dry run — {len(findings)} finding(s). Enable Apply to fix."
                    ),
                },
            )

        # ── Phase: done + summary ───────────────────────────────────────
        yield DiagnosticEvent(now(), "phase", {"phase": "done"})
        yield DiagnosticEvent(
            now(),
            "summary",
            {
                "plans_scanned": len(plans),
                "findings": len(findings),
                "by_kind": by_kind,
                "applied": apply,
                "applied_checkpoints": applied_checkpoints,
                "applied_plans": applied_plans,
            },
        )
