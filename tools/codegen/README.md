# Codegen Toolkit

This folder centralizes code generation tooling for the workspace.

## Entrypoints

- `tools/codegen/runner.ts`: unified runner for all codegen tasks
- `tools/codegen/manifest.ts`: task registry consumed by `pnpm codegen` and backend admin APIs

## Common Commands

- `pnpm codegen` (run all tasks)
- `pnpm codegen -- --only app-map`
- `pnpm codegen -- --group types`
- `pnpm codegen -- --check`

## Individual Generators

- `tools/codegen/generate-openapi-types.ts`
- `tools/codegen/generate-composition-roles.ts`
- `tools/codegen/generate-prompt-roles.ts`
- `tools/codegen/generate-branded-types.ts`
- `tools/codegen/generate-upload-context.ts`
- `tools/codegen/generate-prompt-pack-schemas.ts`
- `tools/codegen/generate-primitive-projection-corpus.ts`
- `tools/codegen/run-plugin-codegen.ts`

### OpenAPI Generator Notes

- The OpenAPI generator uses Orval to produce split output: `packages/shared/api/model/src/generated/openapi`
- By default, generation keeps only model DTO files (`OPENAPI_MODELS_ONLY=true` behavior in the generator).
- You can use a local spec file instead of a live backend:
  - `pnpm openapi:gen -- --input ./path/to/openapi.json`
  - or `OPENAPI_INPUT=./path/to/openapi.json`
- You can optionally filter paths by OpenAPI tags:
  - `pnpm openapi:gen -- --include-tags assets,game-worlds`
  - `pnpm openapi:gen -- --exclude-tags dev,admin`
- You can print a generation diff summary:
  - `pnpm openapi:gen -- --report`
  - or `OPENAPI_CHANGE_REPORT=true pnpm openapi:gen`

## Notes

- Devtools/backend admin codegen controls use this manifest as the task source of truth.
- Add new generators by editing the manifest and placing the script in this folder.
