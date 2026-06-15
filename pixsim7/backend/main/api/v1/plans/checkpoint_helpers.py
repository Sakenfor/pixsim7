"""Checkpoint/todo helper utilities shared by plans API helpers."""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from pixsim7.backend.main.api.v1.plans.schemas import OpenCheckpoint, OpenSummary
from pixsim_logging import get_logger

logger = get_logger()

_NOTE_TRUNCATE_CHARS = 240


def _checkpoint_int(value: Any) -> Optional[int]:
    if isinstance(value, bool):
        return None
    return value if isinstance(value, int) else None


def _derive_checkpoint_points(checkpoint: Dict[str, Any]) -> tuple[int, Optional[int]]:
    """Resolve checkpoint progress points."""
    points_done = _checkpoint_int(checkpoint.get("points_done"))
    points_total = _checkpoint_int(checkpoint.get("points_total"))

    steps = checkpoint.get("steps")
    if isinstance(steps, list) and steps:
        step_dicts = [s for s in steps if isinstance(s, dict)]
        steps_total = len(step_dicts)
        steps_done = sum(1 for s in step_dicts if bool(s.get("done")))

        if (
            (points_total is not None and points_total != steps_total)
            or (points_done is not None and points_done != steps_done)
        ):
            logger.warning(
                "checkpoint %r has both steps[] and explicit points_*; "
                "steps win (steps=%d/%d, explicit=%s/%s) - drop the "
                "explicit fields or update them to match.",
                checkpoint.get("id"),
                steps_done,
                steps_total,
                points_done,
                points_total,
            )

        points_total = steps_total
        points_done = steps_done

    if points_done is None:
        points_done = 0
    return points_done, points_total


def _truncate_note(text: Optional[str], n: int = _NOTE_TRUNCATE_CHARS) -> Optional[str]:
    if text is None:
        return None
    s = str(text)
    return s if len(s) <= n else s[: n - 1] + "\u2026"


def _compute_open_summary(
    checkpoints: List[Any],
    *,
    max_open_checkpoints: int = 8,
) -> Optional[OpenSummary]:
    """Compute the open-work aggregate for a list of checkpoint dicts."""
    if not checkpoints:
        return None

    open_entries: List[OpenCheckpoint] = []
    open_points = 0
    total_points = 0

    for cp in checkpoints:
        if not isinstance(cp, dict):
            continue
        done, total = _derive_checkpoint_points(cp)
        if total is not None:
            total_points += total

        if total and done < total:
            open_points += (total - done)
            last_update = cp.get("last_update") if isinstance(cp.get("last_update"), dict) else None
            last_at = last_update.get("at") if last_update else None
            last_note = last_update.get("note") if last_update else None
            open_entries.append(
                OpenCheckpoint(
                    id=str(cp.get("id") or ""),
                    label=str(cp.get("label") or ""),
                    status=str(cp.get("status") or "pending"),
                    points_done=done,
                    points_total=total,
                    last_update_at=str(last_at) if last_at else None,
                    last_note=_truncate_note(last_note),
                )
            )

    open_entries.sort(
        key=lambda c: (c.last_update_at or "", c.id),
        reverse=True,
    )

    return OpenSummary(
        open_points=open_points,
        total_points=total_points,
        open_checkpoint_count=len(open_entries),
        open_checkpoints=open_entries[:max_open_checkpoints],
    )


def _compute_checkpoint_delta(
    old_raw: Optional[str],
    new_raw: Optional[str],
) -> Optional[List[Dict[str, Any]]]:
    """Diff two checkpoint-array JSON strings into a compact per-checkpoint delta."""

    def _parse(raw: Optional[str]) -> List[Dict[str, Any]]:
        if not raw:
            return []
        try:
            data = json.loads(raw)
        except (TypeError, ValueError):
            return []
        return [c for c in data if isinstance(c, dict)] if isinstance(data, list) else []

    old_list = _parse(old_raw)
    new_list = _parse(new_raw)
    if not old_list and not new_list:
        return None

    by_id_old = {str(c.get("id")): c for c in old_list if c.get("id")}
    by_id_new = {str(c.get("id")): c for c in new_list if c.get("id")}

    deltas: List[Dict[str, Any]] = []

    for cp_id in by_id_new.keys() - by_id_old.keys():
        cp = by_id_new[cp_id]
        done, total = _derive_checkpoint_points(cp)
        deltas.append(
            {
                "checkpoint_id": cp_id,
                "kind": "added",
                "points_done_after": done,
                "points_total_after": total,
                "status_after": cp.get("status"),
            }
        )

    for cp_id in by_id_old.keys() - by_id_new.keys():
        cp = by_id_old[cp_id]
        done, total = _derive_checkpoint_points(cp)
        deltas.append(
            {
                "checkpoint_id": cp_id,
                "kind": "removed",
                "points_done_before": done,
                "points_total_before": total,
                "status_before": cp.get("status"),
            }
        )

    for cp_id in by_id_old.keys() & by_id_new.keys():
        old_cp = by_id_old[cp_id]
        new_cp = by_id_new[cp_id]
        old_done, old_total = _derive_checkpoint_points(old_cp)
        new_done, new_total = _derive_checkpoint_points(new_cp)
        old_status = old_cp.get("status")
        new_status = new_cp.get("status")
        old_label = old_cp.get("label")
        new_label = new_cp.get("label")

        old_lu = old_cp.get("last_update") if isinstance(old_cp.get("last_update"), dict) else None
        new_lu = new_cp.get("last_update") if isinstance(new_cp.get("last_update"), dict) else None
        old_at = (old_lu or {}).get("at")
        new_at = (new_lu or {}).get("at")
        new_note = (new_lu or {}).get("note") if new_lu else None

        unchanged = (
            (old_done, old_total, old_status, old_label) == (new_done, new_total, new_status, new_label)
            and old_at == new_at
        )
        if unchanged:
            continue

        if old_status != new_status:
            kind = "status"
        elif (old_done, old_total) != (new_done, new_total):
            kind = "progressed"
        elif old_label != new_label:
            kind = "renamed"
        else:
            kind = "noted"

        deltas.append(
            {
                "checkpoint_id": cp_id,
                "kind": kind,
                "points_done_before": old_done,
                "points_done_after": new_done,
                "points_total_before": old_total,
                "points_total_after": new_total,
                "status_before": old_status,
                "status_after": new_status,
                "note": _truncate_note(new_note),
            }
        )

    return deltas if deltas else None

