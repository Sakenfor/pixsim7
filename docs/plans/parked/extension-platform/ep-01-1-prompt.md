# EP-01.1 Claude Execution Prompt (Superseded)

Status: superseded on March 5, 2026 after revert.
Do not execute this prompt until EP-01.0 analyzer ID migration planning is complete.
Use:
- [`extension-platform-ep-01-0-claude-execution-prompt.md`](./extension-platform-ep-01-0-claude-execution-prompt.md)

Task ID: `EP-01.1`  
Program: Extension Platform Unification  
Date: March 5, 2026

## Copy-Paste Prompt (for Claude)

```md
You are implementing EP-01.1 from the extension-platform tracker.

Objective:
Adopt shared extension identity adapters at analyzer preset service/API boundaries without breaking current analyzer preset behavior.

Context:
- Shared contract exists in `pixsim7/backend/main/shared/extension_contract.py`.
- We need real usage in analyzer presets as first identity adoption slice.
- Existing analyzer IDs are mixed legacy/canonical; migration must be compatibility-first.

Scope (in):
1. Analyzer preset service boundary adapter usage.
2. Non-breaking response metadata for identity observability.
3. Focused tests for adapter behavior.
4. Docs tracker update for EP-01.1 completion status.

Scope (out):
1. DB migrations for canonical identity columns.
2. Semantic pack changes (that is EP-01.2).
3. Runtime plugin/analyzer registry refactors.

Files to modify (expected):
- `pixsim7/backend/main/services/analysis/analyzer_preset_service.py`
- `pixsim7/backend/main/api/v1/analyzers.py`
- `pixsim7/backend/tests/services/analysis/` (new EP-01.1 tests)
- `docs/architecture/extension-platform-program-tracker.md`

Implementation requirements:
1. Add a small helper in analyzer preset service to parse analyzer identity via:
   - `parse_extension_identity(analyzer_id, expected_kind="analyzer", allow_legacy=True)`
2. Use this helper in service entry points that accept analyzer IDs:
   - create/list/update paths where analyzer_id is consumed.
3. Do not force canonical rewrite yet; preserve stored IDs for compatibility.
4. Add non-breaking identity metadata in `AnalyzerPresetResponse`:
   - `analyzer_identity_key: Optional[str]`
   - `analyzer_identity_canonical: Optional[bool]`
   - `analyzer_identity_scope: Optional[str]`
5. Populate these fields in `_build_preset_response`.
6. Keep existing fields unchanged.

Testing requirements:
1. Add focused tests for the adapter behavior:
   - canonical analyzer ID parse behavior
   - legacy analyzer ID parse behavior
   - empty/invalid input handling (where applicable)
2. Add response-building test(s) for new metadata fields.
3. Run targeted tests and report exact command + result.

Acceptance criteria:
1. Analyzer preset CRUD/submit/approve/reject code paths still compile and run.
2. Legacy analyzer IDs remain valid.
3. Canonical IDs are accepted by adapter logic (no regression from parser).
4. Response metadata fields are present and correct.
5. Tracker updated with EP-01.1 progress note.

Safety constraints:
1. Do not remove legacy analyzer ID handling.
2. Do not change database schema in this slice.
3. Keep PR narrowly scoped to EP-01.1.

Deliverables:
1. Code changes in listed files.
2. New tests.
3. Brief summary with:
   - what changed
   - test command output summary
   - residual risks
```

## Reviewer Checklist

1. Identity adapter is actually called from analyzer preset service methods.
2. API response fields are optional/non-breaking.
3. No schema migration included.
4. Legacy IDs still pass.
5. Tests are focused and green.

## Suggested Test Command

```bash
pytest -q \
  pixsim7/backend/tests/test_extension_contract.py \
  pixsim7/backend/tests/services/analysis/test_analyzer_preset_identity_adapter.py
```

## Notes

If service-level DB fixtures are heavy, keep adapter tests pure and isolate response tests to `_build_preset_response` with lightweight object stubs.
