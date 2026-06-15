"""Evidence normalization and plan-query filtering helpers."""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple, TYPE_CHECKING

from pixsim7.backend.main.services.docs.plan_write import HIDDEN_STATUSES, PLAN_LIST_FIELDS

if TYPE_CHECKING:
    from pixsim7.backend.main.services.docs.plan_write import PlanBundle


EVIDENCE_KINDS = (
    "file_path",     # repo-relative source file path
    "test_suite",    # registered test suite ID
    "git_commit",    # commit SHA
    "doc_ref",       # reference to a document/plan
    "issue_link",    # external issue tracker link
    "migration",     # database migration file
)


def _normalize_evidence_ref(
    item: Any,
    *,
    strict: bool = True,
) -> Optional[Dict[str, str]]:
    """Normalize an evidence item to {"kind": ..., "ref": ...} form."""
    if isinstance(item, str):
        text = item.strip()
        return {"kind": "file_path", "ref": text} if text else None
    if isinstance(item, dict) and item.get("ref"):
        kind = item.get("kind", "file_path")
        ref = str(item["ref"]).strip()
        if not ref:
            return None
        if strict and kind not in EVIDENCE_KINDS:
            raise ValueError(
                f"Unknown evidence kind '{kind}'. "
                f"Valid kinds: {', '.join(EVIDENCE_KINDS)}"
            )
        return {"kind": kind, "ref": ref}
    return None


def _evidence_key(ref: Dict[str, str]) -> str:
    return f"{ref['kind']}:{ref['ref']}"


def _merge_evidence(existing: Any, appends: Optional[list]) -> List[Dict[str, str]]:
    """Merge evidence refs, deduplicating by kind+ref."""
    out: List[Dict[str, str]] = []
    seen: set[str] = set()

    for item in (existing if isinstance(existing, list) else []):
        ref = _normalize_evidence_ref(item, strict=False)
        if ref is None:
            continue
        key = _evidence_key(ref)
        if key in seen:
            continue
        seen.add(key)
        out.append(ref)

    for item in appends or []:
        ref = _normalize_evidence_ref(item)
        if ref is None:
            continue
        key = _evidence_key(ref)
        if key in seen:
            continue
        seen.add(key)
        out.append(ref)

    return out


def _checkpoint_text_matches(cp: Dict[str, Any], needle: str) -> bool:
    """True if any text field within a checkpoint dict contains needle."""
    text_keys = ("id", "label", "description", "note", "criteria", "eta")
    for key in text_keys:
        if needle in str(cp.get(key) or "").lower():
            return True
    for step in (cp.get("steps") or []):
        if not isinstance(step, dict):
            continue
        if needle in str(step.get("label") or "").lower():
            return True
    last_update = cp.get("last_update") or cp.get("lastUpdate")
    if isinstance(last_update, dict):
        if needle in str(last_update.get("note") or "").lower():
            return True
    for blocker in (cp.get("blockers") or []):
        if needle in str(blocker or "").lower():
            return True
    return False


def _matches_query(
    bundle: "PlanBundle",
    needle: str,
    *,
    include_body: bool = False,
) -> Tuple[bool, List[str]]:
    """Return (matched, matched_checkpoint_ids) for bundle against needle."""
    if not needle:
        return True, []
    doc = bundle.doc
    plan = bundle.plan

    scalar_hit = False
    scalar_fields = (
        bundle.id,
        doc.title,
        doc.summary,
        doc.owner,
        doc.namespace,
        plan.scope,
        plan.plan_type,
    )
    for value in scalar_fields:
        if needle in str(value or "").lower():
            scalar_hit = True
            break

    if not scalar_hit:
        list_fields = [doc.tags or []]
        for field in PLAN_LIST_FIELDS:
            list_fields.append(getattr(plan, field, None) or [])
        for values in list_fields:
            for value in values:
                if needle in str(value or "").lower():
                    scalar_hit = True
                    break
            if scalar_hit:
                break

    matched_cp_ids: List[str] = []
    for cp in (plan.checkpoints or []):
        if not isinstance(cp, dict):
            continue
        cp_id = str(cp.get("id") or "")
        if not cp_id:
            continue
        if _checkpoint_text_matches(cp, needle):
            matched_cp_ids.append(cp_id)

    body_hit = False
    if include_body and not scalar_hit and not matched_cp_ids:
        if needle in str(doc.markdown or "").lower():
            body_hit = True

    matched = scalar_hit or bool(matched_cp_ids) or body_hit
    return matched, matched_cp_ids


def _collect_matched_checkpoint_ids(
    bundle: "PlanBundle",
    q: Optional[str],
    *,
    include_body: bool = False,
) -> List[str]:
    needle = (q or "").strip().lower()
    if not needle:
        return []
    _, matched_cp_ids = _matches_query(bundle, needle, include_body=include_body)
    return matched_cp_ids


def _filter_bundles(
    bundles: List["PlanBundle"],
    *,
    status: Optional[str] = None,
    owner: Optional[str] = None,
    namespace: Optional[str] = None,
    priority: Optional[str] = None,
    plan_type: Optional[str] = None,
    tag: Optional[str] = None,
    q: Optional[str] = None,
    include_hidden: bool = False,
    include_body: bool = False,
) -> List["PlanBundle"]:
    """Apply common filters to a list of plan bundles."""
    query = (q or "").strip().lower()

    out: list["PlanBundle"] = []
    for b in sorted(bundles, key=lambda b: b.id):
        if not include_hidden and not status and b.doc.status in HIDDEN_STATUSES:
            continue
        if status and b.doc.status != status:
            continue
        if owner and owner.lower() not in b.doc.owner.lower():
            continue
        if namespace and b.doc.namespace != namespace:
            continue
        if priority and b.plan.priority != priority:
            continue
        if plan_type and b.plan.plan_type != plan_type:
            continue
        if tag and tag not in (b.doc.tags or []):
            continue
        if query:
            matched, _ = _matches_query(b, query, include_body=include_body)
            if not matched:
                continue
        out.append(b)
    return out

