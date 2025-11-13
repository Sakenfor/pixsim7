# Claude Long-Run Architecture Audit & Refactor Tasks (≈150k tokens)

This is a structured, multi-phase set of tasks for Claude to run autonomously across multiple long responses. The goal is to audit the repository, identify monolithic files and leaky boundaries, and propose/refactor toward a lean, modular architecture with clear interfaces, tests, and documentation. The plan is designed to consume roughly 150k tokens.

Keep your outputs actionable and incremental: end each phase with concrete artifacts (summaries, diffs, RFCs, checklists) that we can apply.

---

## Operating instructions for Claude

- Work in phases. Deliver each phase as a separate, clearly titled section.
- Quote relevant code (trimmed to essential parts) when you analyze or propose changes.
- Prefer final artifacts over narration: tables, diagrams (ASCII), checklists, diffs, and ready-to-paste code.
- When proposing refactors, include: why, before/after structure, a migration plan, and tests to keep things green.
- Keep interface contracts front-and-center: inputs, outputs, error modes.
- Flag risky areas and suggest safe rollout (feature flags, toggles, or parallel paths when needed).
- When you need repo facts (e.g., top 50 largest files), provide the exact commands; we’ll run them and paste results back.
- Budget guidance: Spend ~10–20k tokens per big phase; keep total near ≈150k tokens.

Optional commands we can run for you (Windows PowerShell):

```powershell
# Largest files by line count
Get-ChildItem -Recurse -File | % { $_.FullName } | % { "$(Get-Content $_ -ReadCount 0 | Measure-Object -Line).Lines`t$_" } | Sort-Object {[int]($_.Split("`t")[0])} -Descending | Select-Object -First 50

# Dependency graph (JS/TS, basic)
pnpm -C frontend ls --depth 2; pnpm -C game-frontend ls --depth 2

# Python import graph (quick & dirty)
Get-ChildItem pixsim7_backend -Recurse -Include *.py | % { $_.FullName }
```

---

## Repo map (context)

Key areas of interest (sample; verify by scanning the tree):
- Backend: `pixsim7_backend/`
  - `services/provider/adapters/pixverse.py` (very large ≈800+ lines)
  - `services/asset/asset_service.py` (appears large; internal references noted)
  - `api/v1/` routes (`assets.py` includes upload route)
  - `services/upload/upload_service.py` (new workflow and acceptance checks)
  - `shared/` (image utils, errors, schemas)
  - `domain/` (SQLModel entities, enums)
- Frontend: `frontend/`, `game-frontend/`, `packages/ui`, `packages/types`, `packages/config-tailwind`
  - `MediaCard` component hosts reusable upload badge UX
  - LocalFolders panel and asset gallery
- Admin: `admin/` (Svelte + Tailwind preset alignment)
- Extension: `chrome-extension/`
- Scripts: `scripts/` and root batch/ps1 helpers

---

## Phase 1 — Monolith discovery and map (≈12–18k tokens)

Goals:
- Identify top 50 largest files and categorize by responsibility.
- Find God-objects: files/classes/functions exceeding ~400–600 lines or mixing concerns.
- Produce a dependency overview (who imports whom) at a coarse level.

Deliverables:
- Table of largest files (path, lines, concern, notes on cohesion/coupling).
- Graph sketch of major module dependencies (ASCII acceptable).
- List of suspected monoliths with brief diagnosis.

Acceptance:
- At least 20 concrete candidates with 1–2 sentence justifications.

---

## Phase 2 — Backend architecture assessment (≈15–20k tokens)

Scope:
- Services layer boundaries: `services/upload`, `services/asset`, `services/account`, `services/provider`, `services/job`.
- API surface consistency: `api/v1/*` request/response shapes, errors, pagination.
- Domain health: entities, enums, relationships; places where domain leaks provider logic.

Tasks:
- Map current responsibility per service; note overlaps or leakage.
- Define target boundaries: clear responsibilities and input/output types for each service.
- Propose a light event bus or signals for cross-cutting concerns (e.g., on-asset-created).

Deliverables:
- “Service Contracts” doc: for each service, 3–5 bullets covering inputs/outputs, error modes, success criteria.
- A refactor outline with a prioritized list of moves (small, medium, large).

Acceptance:
- Contracts for at least UploadService, AssetService, AccountService, ProviderService, JobService.

---

## Phase 3 — Provider layer hardening (Pixverse focus) (≈18–22k tokens)

Scope:
- `services/provider/adapters/pixverse.py` (~845 lines): split by subdomains (operations, status, uploads, param mapping, errors).
- Ensure the `Provider` base interface is minimal, stable, and fully covered by Pixverse.

Tasks:
- Extract modules: `pixverse/operations.py`, `pixverse/status.py`, `pixverse/uploads.py`, `pixverse/mapping.py`, `pixverse/errors.py`.
- Normalize error mapping and ensure consistent `ProviderError` taxonomy.
- Add upload result normalization (URL vs ID) utilities.

Deliverables:
- Proposed directory structure and module boundaries.
- Pseudocode or patch plan for splitting with function/class names to move.

Acceptance:
- A step-by-step migration plan with checkpoints and tests to keep green between steps.

---

## Phase 4 — Upload pipeline generalization (≈12–18k tokens)

Scope:
- Build a provider acceptance matrix and preparation hooks (images now, videos next).
- Extend `_prepare_file_for_provider` into per-provider strategy objects.

Tasks:
- Define `AcceptanceRule` and `PreparationStrategy` interfaces (contract only).
- Draft rules for Pixverse videos (placeholder now; plan ffprobe checks).
- Sketch for future providers (Runway, Pika, Sora) with TODOs and constraints to research.

Deliverables:
- Interface sketches + example implementations for Pixverse image/video.
- Migration plan from hardcoded `if provider_id == ...` to strategies.

Acceptance:
- Code-ready design with clear extension points and test hooks.

---

## Phase 5 — API design and consistency (≈10–14k tokens)

Scope:
- Standardize response models, errors, and pagination across `api/v1/*`.

Tasks:
- Define error envelope and codes; map current endpoints to the new schema.
- Specify pagination (cursor vs offset) and deprecate the other with a transition plan.

Deliverables:
- API style guide (short and decisive).
- Concrete list of endpoints to update, with request/response examples.

Acceptance:
- Endpoints grouped into: keep, refactor now, refactor later.

---

## Phase 6 — Frontend architecture cleanup (≈12–18k tokens)

Scope:
- Consolidate shared UI via `packages/ui`.
- Ensure `MediaCard` + upload badge are canonical and reused by Local panel and galleries.
- Review Zustand stores, routing, and data fetching consistency.

Tasks:
- Identify duplicated components/styles; propose merges.
- Define minimal state slices and events for upload status, errors, and provider selection.

Deliverables:
- Component map and suggested merges.
- Small RFC for state management boundaries.

Acceptance:
- At least 5 concrete cleanup actions with effort estimates.

---

## Phase 7 — Test suite expansion (≈12–16k tokens)

Scope:
- Backend: unit tests for services (UploadService path selection, acceptance rules), provider adapter mocks, API tests for `/assets/upload`.
- Frontend: component tests for MediaCard badge states; integration test for Local panel upload flow.

Tasks:
- Propose a minimal test harness pattern (fixtures, registry stubs, temp files).
- List 10–15 high-value tests to add and group them by priority.

Deliverables:
- Test plan with examples (short code snippets acceptable).

Acceptance:
- Clear, actionable list with file paths to create.

---

## Phase 8 — Docs and ADRs (≈8–12k tokens)

Scope:
- Capture refactor decisions as short ADRs (Architecture Decision Records).
- Update existing docs (e.g., `PIXVERSE_INTEGRATION.md`) with new flows.

Tasks:
- Draft 3–5 ADRs: provider split, upload acceptance strategies, API error envelope, pagination choice.
- Propose index for `docs/` to keep navigation clean.

Deliverables:
- ADR skeletons with context, decision, consequences.

Acceptance:
- ADRs are concise (≤1 page each) and specific.

---

## Phase 9 — DevEx and scripts (≈6–10k tokens)

Scope:
- Align batch/PowerShell/sh scripts; ensure consistent start/stop for Windows and *nix.
- Developer onboarding checklist.

Tasks:
- Normalize environment variables across frontend/admin/backend.
- Add a top-level Makefile.ps1 or Taskfile guidance (doc-only if code change is deferred).

Deliverables:
- Onboarding guide updates and a proposed unified script matrix.

Acceptance:
- Documented happy-path setup on Windows with pnpm & Python.

---

## Phase 10 — Security and observability (≈8–12k tokens)

Scope:
- Secret handling (API keys), error logging, and minimal telemetry standards.

Tasks:
- Inventory secrets in domain models and ensure they never leak via logs.
- Propose structured logging fields and sampling.

Deliverables:
- Security checklist and logging/metrics conventions.

Acceptance:
- 10-item actionable checklist with owners or locations.

---

## Deliverables checklist (compiled)

- [ ] Largest files table + dependency sketch
- [ ] Service contracts and boundaries doc
- [ ] Provider layer split plan (Pixverse)
- [ ] Upload acceptance strategy design
- [ ] API style guide + endpoint migration list
- [ ] Frontend cleanup plan + component/state maps
- [ ] Test plan with prioritized cases
- [ ] 3–5 ADRs
- [ ] DevEx script matrix + onboarding updates
- [ ] Security & observability checklist

---

## Ready-to-copy prompts for each phase

Paste these as-is to start each phase. Claude should reply with the deliverables described above.

### P1: Monolith discovery

"""
You are auditing the repo to find monolithic files and coupling hotspots. Produce:
1) A table of the top 50 largest files (path, lines, responsibility guess, notes),
2) A coarse dependency sketch (ASCII) of major modules,
3) A list of monolith candidates with 1–2 sentence justifications.
Quote relevant code snippets to support your claims.
If you need file sizes, give me commands to run in Windows PowerShell.
"""

### P2: Backend architecture assessment

"""
Analyze backend services and APIs in pixsim7_backend. Produce service contracts (inputs/outputs, error modes) for UploadService, AssetService, AccountService, ProviderService, JobService. Propose target boundaries and list overlaps/leakage found. End with a prioritized refactor outline.
Quote code to support. Keep it actionable.
"""

### P3: Provider layer hardening (Pixverse)

"""
Focus on services/provider/adapters/pixverse.py. Propose a split into modules: operations, status, uploads, mapping, errors. Provide a stepwise migration plan with tests to keep green and an example of one function moved with before/after code. Ensure Provider interface remains minimal and sufficient.
"""

### P4: Upload pipeline generalization

"""
Design an acceptance matrix and preparation strategies for uploads. Define interfaces for AcceptanceRule and PreparationStrategy. Convert current hardcoded conditions into pluggable strategies (Pixverse image/video as first). Provide example implementations and migration steps.
"""

### P5: API design consistency

"""
Draft an API style guide for error envelopes, pagination (prefer one), and response shapes. Map current endpoints in api/v1 to this style and create a migration list with examples. Keep it concise and decisive.
"""

### P6: Frontend architecture cleanup

"""
Audit frontend and game-frontend for duplicated components and styles. Ensure MediaCard with upload badge is the canonical display and reused in Local panel. Propose a component map, merges, and minimal Zustand slices for upload state. Provide 5+ concrete actions with estimates.
"""

### P7: Test suite expansion

"""
Propose a backend and frontend test plan: list 10–15 high-value tests, with short code snippets or skeletons. Include UploadService paths, provider adapter mocks, and /assets/upload API tests. Group by priority and effort.
"""

### P8: Docs and ADRs

"""
Draft 3–5 ADRs for the refactors (provider split, uploads acceptance strategies, API error envelope, pagination choice). Each ≤1 page: context, decision, consequences. Propose a docs/ index for easy navigation.
"""

### P9: DevEx and scripts

"""
Audit start/stop scripts and environment alignment across apps. Propose a unified script matrix for Windows and *nix and an onboarding checklist with step order. Keep code changes optional; focus on a crisp doc first.
"""

### P10: Security & observability

"""
Inventory secrets in domain models, ensure they don’t leak into logs, and draft a structured logging convention (fields, sampling). Deliver a 10-item security/observability checklist with specific locations/owners.
"""

---

## Token budgeting

- P1: 12–18k
- P2: 15–20k
- P3: 18–22k
- P4: 12–18k
- P5: 10–14k
- P6: 12–18k
- P7: 12–16k
- P8: 8–12k
- P9: 6–10k
- P10: 8–12k

Total target ≈ 125–160k tokens. Adjust within range based on findings.
