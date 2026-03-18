"""
Dev Testing API

Live test suite discovery, catalog validation, agent guidance, and coverage
gap detection.  Test execution is handled by the codegen API
(``/devtools/codegen/tests/run``).
"""
from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.api.dependencies import CurrentUser, get_database
from pixsim7.backend.main.services.testing.catalog import (
    build_catalog,
    validate_catalog,
)

router = APIRouter(prefix="/dev/testing", tags=["dev", "testing"])

TESTING_CONTRACT_VERSION = "2026-03-18.1"


# ═══════════════════════════════════════════════════════════════════════════
# Response models
# ═══════════════════════════════════════════════════════════════════════════


class SuiteResponse(BaseModel):
    id: str
    label: str
    path: str
    layer: str
    kind: Optional[str] = None
    category: Optional[str] = None
    subcategory: Optional[str] = None
    covers: List[str] = Field(default_factory=list)
    order: Optional[float] = None


class CatalogResponse(BaseModel):
    suite_count: int
    suites: List[SuiteResponse]


class ValidationResponse(BaseModel):
    ok: bool
    suite_count: int
    errors: List[str] = Field(default_factory=list)


class TestConventionRule(BaseModel):
    rule: str
    example: Optional[str] = None


class TestConventionsSection(BaseModel):
    title: str
    rules: List[TestConventionRule]


class TestGuidanceResponse(BaseModel):
    version: str
    summary: str
    valid_kinds: List[str]
    valid_layers: List[str]
    conventions: List[TestConventionsSection]
    test_suite_template: Dict[str, Any]
    checklist_before_creating: List[str]


class CoverageGapEntry(BaseModel):
    source_path: str
    reason: str = "no suite covers this path"


class CoverageGapResponse(BaseModel):
    scanned_paths: int
    covered_paths: int
    gap_count: int
    gaps: List[CoverageGapEntry]


class TestContractEndpoint(BaseModel):
    method: str
    path: str
    summary: str


class TestContractResponse(BaseModel):
    version: str
    suite_count: int
    layers: List[str]
    kinds: List[str]
    categories: List[str]
    endpoints: List[TestContractEndpoint]


# ═══════════════════════════════════════════════════════════════════════════
# Guidance data (hand-authored — same principle as ui_catalog_seed)
# ═══════════════════════════════════════════════════════════════════════════

_VALID_KINDS = ["unit", "contract", "integration", "e2e", "smoke"]
_VALID_LAYERS = ["backend", "frontend", "scripts"]

_CONVENTIONS: List[TestConventionsSection] = [
    TestConventionsSection(
        title="File placement",
        rules=[
            TestConventionRule(
                rule="Backend API tests go in pixsim7/backend/tests/api/test_<feature>.py",
                example="pixsim7/backend/tests/api/test_ui_catalog_meta.py",
            ),
            TestConventionRule(
                rule="Backend service/unit tests go in pixsim7/backend/tests/services/<domain>/test_<module>.py",
                example="pixsim7/backend/tests/services/meta/test_ui_catalog_registry.py",
            ),
            TestConventionRule(
                rule="Frontend tests go next to source as __tests__/<name>.test.ts",
                example="apps/main/src/lib/game/projectBundle/__tests__/lifecycleRuntime.test.ts",
            ),
            TestConventionRule(
                rule="Script tests go in scripts/tests/<domain>/",
            ),
        ],
    ),
    TestConventionsSection(
        title="Self-registration (TEST_SUITE dict)",
        rules=[
            TestConventionRule(
                rule="Every Python test file (or conftest.py for directory suites) must declare a module-level TEST_SUITE dict.",
                example=(
                    'TEST_SUITE = {\n'
                    '    "id": "ui-catalog-meta-api",\n'
                    '    "label": "UI Catalog Meta API Tests",\n'
                    '    "kind": "contract",\n'
                    '    "category": "backend/api",\n'
                    '    "subcategory": "meta-ui",\n'
                    '    "covers": [\n'
                    '        "pixsim7/backend/main/api/v1/meta_ui.py",\n'
                    '        "pixsim7/backend/main/services/meta/ui_catalog_registry.py",\n'
                    '    ],\n'
                    '    "order": 25,\n'
                    '}'
                ),
            ),
            TestConventionRule(
                rule="TEST_SUITE must be a plain dict literal (no variables, no function calls) — it's extracted via AST, not imported.",
            ),
            TestConventionRule(
                rule="id must be unique across the entire catalog. Use kebab-case: <domain>-<feature>[-<aspect>].",
                example="meta-contract-conformance, assets-upload-api, prompt-block-fit-scoring",
            ),
            TestConventionRule(
                rule='covers must list the source file paths this test verifies. This enables auto-discovery in plan coverage.',
            ),
            TestConventionRule(
                rule="Frontend suites cannot self-register. Add them to _STATIC_SUITES in services/testing/catalog.py.",
            ),
        ],
    ),
    TestConventionsSection(
        title="Kind selection",
        rules=[
            TestConventionRule(
                rule="unit — tests a single function/class in isolation, no DB or HTTP.",
            ),
            TestConventionRule(
                rule="contract — verifies an API endpoint or service contract (schema, status codes, behavior). Uses test DB.",
            ),
            TestConventionRule(
                rule="integration — tests interaction between multiple services or layers.",
            ),
            TestConventionRule(
                rule="e2e — full end-to-end test across frontend and backend.",
            ),
            TestConventionRule(
                rule="smoke — lightweight sanity check (e.g., eval scripts, import checks).",
            ),
        ],
    ),
    TestConventionsSection(
        title="Plan evidence linking",
        rules=[
            TestConventionRule(
                rule='Link tests to plans via checkpoint evidence: {"kind": "test_suite", "ref": "<suite-id>"}',
                example='POST /dev/plans/progress/{plan_id} with append_evidence: [{"kind": "test_suite", "ref": "ui-catalog-meta-api"}]',
            ),
            TestConventionRule(
                rule="GET /dev/plans/coverage/{plan_id} auto-discovers suites whose covers overlap with plan code_paths.",
            ),
            TestConventionRule(
                rule="Legacy bare-string evidence (file paths) still works and is auto-promoted to typed refs on read.",
            ),
        ],
    ),
]

_TEST_SUITE_TEMPLATE: Dict[str, Any] = {
    "id": "<domain>-<feature>",
    "label": "<Human-Readable Label> Tests",
    "kind": "unit | contract | integration | e2e | smoke",
    "category": "<layer>/<domain>",
    "subcategory": "<specific-area>",
    "covers": ["<repo-relative-path-to-source-file>"],
    "order": 25,
}

_CHECKLIST = [
    "Determine kind: unit (isolated), contract (API/service boundary), integration (cross-layer), smoke (sanity).",
    "Place file in the correct directory for the layer (see file placement conventions).",
    "Add TEST_SUITE dict at module level — must be a plain dict literal.",
    "Set covers to the source files this test verifies — enables plan coverage auto-discovery.",
    "Use a unique kebab-case id: <domain>-<feature>[-<aspect>].",
    "Run pnpm test:registry:check to validate the suite is discoverable.",
    "Link to plan evidence if applicable: POST /dev/plans/progress/{plan_id} with append_evidence.",
]


# ═══════════════════════════════════════════════════════════════════════════
# Endpoints
# ═══════════════════════════════════════════════════════════════════════════


@router.get("/contract", response_model=TestContractResponse)
async def get_testing_contract() -> TestContractResponse:
    """Testing catalog summary: counts, layers, kinds, available endpoints."""
    suites = build_catalog()
    categories = sorted({s.get("category", "") for s in suites if s.get("category")})
    return TestContractResponse(
        version=TESTING_CONTRACT_VERSION,
        suite_count=len(suites),
        layers=_VALID_LAYERS,
        kinds=_VALID_KINDS,
        categories=categories,
        endpoints=[
            TestContractEndpoint(
                method="GET",
                path="/api/v1/dev/testing/catalog",
                summary="List/filter test suites. Query: ?layer=backend&category=backend/api&kind=contract",
            ),
            TestContractEndpoint(
                method="GET",
                path="/api/v1/dev/testing/catalog/validate",
                summary="Validate all suite metadata (paths exist, required fields).",
            ),
            TestContractEndpoint(
                method="GET",
                path="/api/v1/dev/testing/guidance",
                summary="Conventions, TEST_SUITE template, and pre-creation checklist for agents.",
            ),
            TestContractEndpoint(
                method="GET",
                path="/api/v1/dev/testing/coverage-gaps",
                summary="Find source paths not covered by any test suite.",
            ),
        ],
    )


@router.get("/catalog", response_model=CatalogResponse)
async def get_catalog(
    layer: Optional[str] = Query(None, description="Filter by layer (backend, frontend, scripts)"),
    category: Optional[str] = Query(None, description="Filter by category prefix"),
    kind: Optional[str] = Query(None, description="Filter by kind"),
) -> CatalogResponse:
    """Live suite catalog — discovers TEST_SUITE dicts at request time."""
    suites = build_catalog()

    if layer:
        suites = [s for s in suites if s.get("layer") == layer]
    if category:
        suites = [s for s in suites if (s.get("category") or "").startswith(category)]
    if kind:
        suites = [s for s in suites if s.get("kind") == kind]

    return CatalogResponse(
        suite_count=len(suites),
        suites=[SuiteResponse(**s) for s in suites],
    )


@router.get("/catalog/validate", response_model=ValidationResponse)
async def validate_catalog_endpoint() -> ValidationResponse:
    """Validate all suite metadata (paths exist, required fields present)."""
    suites = build_catalog()
    errors = validate_catalog(suites)
    return ValidationResponse(
        ok=not errors,
        suite_count=len(suites),
        errors=errors,
    )


@router.get("/guidance", response_model=TestGuidanceResponse)
async def get_testing_guidance() -> TestGuidanceResponse:
    """Conventions, TEST_SUITE template, and pre-creation checklist for agents."""
    return TestGuidanceResponse(
        version=TESTING_CONTRACT_VERSION,
        summary=(
            "Test suites self-register via a module-level TEST_SUITE dict literal. "
            "The AST-based discovery extracts these without importing the module. "
            "Every suite must declare covers (source paths it verifies) to enable "
            "plan coverage auto-discovery."
        ),
        valid_kinds=_VALID_KINDS,
        valid_layers=_VALID_LAYERS,
        conventions=_CONVENTIONS,
        test_suite_template=_TEST_SUITE_TEMPLATE,
        checklist_before_creating=_CHECKLIST,
    )


@router.get("/coverage-gaps", response_model=CoverageGapResponse)
async def get_coverage_gaps(
    scope: str = Query(
        "pixsim7/backend/main",
        description="Directory prefix to scan for source files (e.g., pixsim7/backend/main/api).",
    ),
) -> CoverageGapResponse:
    """Find source paths within scope that no test suite covers.

    Compares source files in ``scope`` against all suites' ``covers`` paths.
    A source file is considered covered if any suite's cover path is a prefix
    of the source file path (or vice versa).
    """
    from pixsim7.backend.main.services.testing.catalog import _get_root

    root = _get_root()
    scope_dir = root / scope
    if not scope_dir.is_dir():
        return CoverageGapResponse(scanned_paths=0, covered_paths=0, gap_count=0, gaps=[])

    # Collect all Python source files in scope (exclude tests, migrations, __pycache__)
    source_files: List[str] = []
    for p in scope_dir.rglob("*.py"):
        rel = str(p.relative_to(root)).replace("\\", "/")
        if any(skip in rel for skip in ("/tests/", "/__pycache__/", "/migrations/", "__init__.py")):
            continue
        source_files.append(rel)

    # Build set of all covered path prefixes from the catalog
    suites = build_catalog()
    all_covers: List[str] = []
    for suite in suites:
        all_covers.extend(suite.get("covers") or [])

    # Check each source file for coverage
    covered_count = 0
    gaps: List[CoverageGapEntry] = []

    for src in sorted(source_files):
        is_covered = any(
            src.startswith(cover) or cover.startswith(src)
            for cover in all_covers
        )
        if is_covered:
            covered_count += 1
        else:
            gaps.append(CoverageGapEntry(source_path=src))

    return CoverageGapResponse(
        scanned_paths=len(source_files),
        covered_paths=covered_count,
        gap_count=len(gaps),
        gaps=gaps,
    )


# ═══════════════════════════════════════════════════════════════════════════
# Sync — filesystem → DB
# ═══════════════════════════════════════════════════════════════════════════


class SyncResponse(BaseModel):
    created: int
    updated: int
    removed: int
    unchanged: int


@router.post("/sync", response_model=SyncResponse)
async def sync_suites(
    _user: CurrentUser,
    db: AsyncSession = Depends(get_database),
) -> SyncResponse:
    """Sync test suites from filesystem discovery into DB.

    Discovers TEST_SUITE dicts + static entries, then upserts to
    the ``test_suites`` table.  Stale DB entries are removed.
    """
    from pixsim7.backend.main.services.testing.sync import sync_test_suites

    result = await sync_test_suites(db)
    await db.commit()
    return SyncResponse(
        created=result.created,
        updated=result.updated,
        removed=result.removed,
        unchanged=result.unchanged,
    )


# ═══════════════════════════════════════════════════════════════════════════
# DB-backed catalog query
# ═══════════════════════════════════════════════════════════════════════════


@router.get("/suites", response_model=CatalogResponse)
async def list_suites_from_db(
    layer: Optional[str] = Query(None, description="Filter by layer"),
    category: Optional[str] = Query(None, description="Filter by category prefix"),
    kind: Optional[str] = Query(None, description="Filter by kind"),
    db: AsyncSession = Depends(get_database),
) -> CatalogResponse:
    """Query test suites from DB (requires prior sync).

    Faster than ``/catalog`` (no filesystem scan).  Returns empty if
    sync has never run.
    """
    from pixsim7.backend.main.domain.docs.models import TestSuiteRecord

    stmt = select(TestSuiteRecord)
    if layer:
        stmt = stmt.where(TestSuiteRecord.layer == layer)
    if category:
        stmt = stmt.where(TestSuiteRecord.category.startswith(category))
    if kind:
        stmt = stmt.where(TestSuiteRecord.kind == kind)
    stmt = stmt.order_by(TestSuiteRecord.order.asc().nullslast(), TestSuiteRecord.label.asc())

    rows = (await db.execute(stmt)).scalars().all()
    return CatalogResponse(
        suite_count=len(rows),
        suites=[
            SuiteResponse(
                id=r.id,
                label=r.label,
                path=r.path,
                layer=r.layer,
                kind=r.kind,
                category=r.category,
                subcategory=r.subcategory,
                covers=r.covers or [],
                order=r.order,
            )
            for r in rows
        ],
    )
