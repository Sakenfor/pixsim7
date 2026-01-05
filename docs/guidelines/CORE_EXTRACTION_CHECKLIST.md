# Core Extraction Checklist

Use this when moving "pure logic" from app code into shared packages.
Goal: reuse across frontends without hidden app coupling or drift.

## Pre-checks

- Confirm the file has no React, Zustand, DOM, or browser globals.
- Ensure imports are only from shared packages or standard libs.
- If a type is app-specific, make the core API generic or define a minimal shared type.

## Move Steps

1) Create or reuse a shared package (for example: `packages/shared/<name>-core`).
2) Move pure files into the shared package (keep names and exports stable).
3) Update internal imports to shared types (for example: `@pixsim7/shared.types`).
4) Add a dependency in the consuming app package.json.
5) Add a thin re-export wrapper at the old path to preserve compatibility.

## Import Policy

- Add `no-restricted-imports` rules for legacy paths so new code uses the shared package.
- Keep re-exports explicit (no `export *`) to avoid surface-area creep.

## Post-checks

- Run typecheck or lint for the moved package.
- Verify no app-only modules are referenced from the shared package.
- Update docs or ADRs if the package scope changes.

## Exit Criteria

- New package builds on its own.
- Call sites use shared imports (or are covered by a re-export bridge).
- No behavior changes from the move.
