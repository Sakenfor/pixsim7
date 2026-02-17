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
- `tools/codegen/run-plugin-codegen.ts`

### OpenAPI Generator Notes

- The OpenAPI generator uses Orval to produce split output: `packages/shared/api/client/src/generated/openapi`
- You can use a local spec file instead of a live backend:
  - `pnpm openapi:gen -- --input ./path/to/openapi.json`
  - or `OPENAPI_INPUT=./path/to/openapi.json`

## Notes

- Devtools/backend admin codegen controls use this manifest as the task source of truth.
- Add new generators by editing the manifest and placing the script in this folder.
