"""
Cross-DB isolation regression tests — pins the Phase 2e audit conclusions.

Plan: automation-package-extraction Phase 2e.

These are static guards (grep-as-test) on the package boundary. They catch:
  - automation/* opening a backend session (AsyncSessionLocal / get_db /
    get_async_session) — would write to wrong DB after cutover
  - backend code querying an automation table via the backend session
  - SQLAlchemy Relationship() declarations that span the boundary

Allow-list: shared utilities (settings, datetime_utils, logging) and the
get_automation_db session factory may be imported from backend by automation
since they aren't backend domain or services. That carve-out is documented
in pixsim7/automation/__init__.py.
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[3]
AUTOMATION_PKG = REPO_ROOT / "pixsim7" / "automation"
BACKEND_PKG = REPO_ROOT / "pixsim7" / "backend" / "main"


# Backend session factories that must NOT appear in pixsim7/automation/.
# get_automation_db is allowed (it's the right session factory).
BACKEND_SESSION_PATTERNS = (
    re.compile(r"\bget_db\b"),
    re.compile(r"\bAsyncSessionLocal\b"),
    re.compile(r"\bget_async_session\b(?!\w*automation)"),
)


# Backend imports automation/* may NOT make. Allowed: shared utility modules
# and the session factory that wraps the automation engine.
DISALLOWED_BACKEND_IMPORT_RE = re.compile(
    r"from\s+pixsim7\.backend(?!"
    r"\.main\.shared\.(config|datetime_utils|logging)"  # shared utilities
    r"|\.main\.infrastructure\.database\.session\s+import\s+get_automation_db"  # right session factory
    r")\.[\w.]*\s+import"
)


def _python_files(root: Path) -> list[Path]:
    return [
        p for p in root.rglob("*.py")
        if "__pycache__" not in p.parts
    ]


def test_no_backend_session_factory_used_in_automation_package() -> None:
    """Any get_db/AsyncSessionLocal/get_async_session call inside automation/
    means a write would land in the backend DB — broken after cutover.
    """
    offenders: list[str] = []
    for path in _python_files(AUTOMATION_PKG):
        text = path.read_text(encoding="utf-8")
        for pattern in BACKEND_SESSION_PATTERNS:
            for match in pattern.finditer(text):
                line_no = text[:match.start()].count("\n") + 1
                offenders.append(
                    f"{path.relative_to(REPO_ROOT)}:{line_no} — uses {match.group()}"
                )
    assert not offenders, (
        "pixsim7/automation/ must not use backend session factories. "
        "Use pixsim7.backend.main.infrastructure.database.session.get_automation_db "
        "or get_async_automation_session instead.\n"
        + "\n".join(offenders)
    )


def test_no_disallowed_backend_imports_in_automation_package() -> None:
    """Automation may import shared utilities (settings, datetime_utils,
    logging) and get_automation_db, nothing else from pixsim7.backend.*.

    The protocol/locator pattern is the only way to reach backend domain
    or services from inside automation.
    """
    offenders: list[str] = []
    for path in _python_files(AUTOMATION_PKG):
        text = path.read_text(encoding="utf-8")
        for line_no, line in enumerate(text.splitlines(), start=1):
            if DISALLOWED_BACKEND_IMPORT_RE.search(line):
                offenders.append(
                    f"{path.relative_to(REPO_ROOT)}:{line_no} — {line.strip()}"
                )
    assert not offenders, (
        "Disallowed backend imports in automation/. "
        "Use pixsim7.automation.protocols + locator instead.\n"
        + "\n".join(offenders)
    )


# Backend modules that legitimately reach into automation models. Anything
# else importing from pixsim7.automation.domain should use the new automation
# session factory (AsyncAutomationSessionLocal / get_automation_db /
# get_async_automation_session) — not the backend AsyncSessionLocal.
_BACKEND_AUTOMATION_TABLE_USERS = {
    # Path (relative to repo root) → reason it's allowed
    "pixsim7/backend/main/api/v1/automation.py":
        "API router; uses get_automation_db (verified separately).",
    "pixsim7/backend/main/api/v1/device_agents.py":
        "API router; uses get_automation_db (verified separately).",
    "pixsim7/backend/main/seeds/default_presets.py":
        "Seed function takes session as parameter; caller decides DB.",
    "pixsim7/backend/main/services/account/reservation_service.py":
        "Reservation service has 'Reservation' in its name but doesn't query "
        "automation tables; module name pattern miss.",
}


def test_backend_modules_querying_automation_tables_are_known() -> None:
    """Whitelist guard: any new backend module that imports an automation
    domain class needs an entry in _BACKEND_AUTOMATION_TABLE_USERS justifying
    that it uses the automation session, not the backend one.
    """
    offenders: list[str] = []
    pattern = re.compile(
        r"from\s+pixsim7\.automation\.domain[\w.]*\s+import\s+([\w,\s]+)"
    )
    for path in _python_files(BACKEND_PKG):
        text = path.read_text(encoding="utf-8")
        if not pattern.search(text):
            continue
        rel = str(path.relative_to(REPO_ROOT)).replace("\\", "/")
        if rel in _BACKEND_AUTOMATION_TABLE_USERS:
            continue
        offenders.append(
            f"{rel} — imports automation domain; if intentional, add it to "
            "_BACKEND_AUTOMATION_TABLE_USERS in this test with a justification "
            "and ensure it uses get_automation_db, not get_db."
        )
    assert not offenders, (
        "Backend modules importing automation domain that aren't whitelisted:\n"
        + "\n".join(offenders)
    )


def test_no_relationship_crosses_automation_boundary() -> None:
    """SQLAlchemy Relationship() declarations bind two models on the same
    MetaData. If automation models declared a Relationship to a backend table
    (or vice versa), SQLAlchemy would attempt to resolve it at flush time
    and fail across DBs. Phase 2c removed all FKs; no Relationship should
    have survived.
    """
    rel_pattern = re.compile(r"Relationship\s*\(")

    automation_offenders: list[str] = []
    for path in _python_files(AUTOMATION_PKG / "domain"):
        text = path.read_text(encoding="utf-8")
        for match in rel_pattern.finditer(text):
            line_no = text[:match.start()].count("\n") + 1
            automation_offenders.append(
                f"{path.relative_to(REPO_ROOT)}:{line_no} — Relationship() on automation model"
            )
    assert not automation_offenders, (
        "Automation models must not use Relationship() — cross-DB FK refs are "
        "dropped, intra-automation refs use plain int columns.\n"
        + "\n".join(automation_offenders)
    )


def test_capability_registry_lists_automation_for_all_relevant_hosts() -> None:
    """Worker startup binds via capability_registry.bind_for_host(...).
    Automation must be registered for every host that runs automation code:
    fastapi (request handlers create executions), main_worker (none today,
    but keep it bound so cron triggers work), automation_worker (the
    process_automation arq function lives there).
    """
    from pixsim7.backend.main.capability_registry import all_bindings

    automation_binding = next(
        (b for b in all_bindings() if b.name == "automation"), None
    )
    assert automation_binding is not None, "automation not in all_bindings()"
    expected_hosts = {"fastapi", "main_worker", "automation_worker"}
    assert expected_hosts.issubset(automation_binding.hosts), (
        f"automation must bind in {expected_hosts}, got {automation_binding.hosts}"
    )
