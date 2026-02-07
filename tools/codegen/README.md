# Codegen Toolkit

This folder centralizes code generation tooling for the workspace.

## Entrypoints

- `tools/codegen/runner.ts`: unified runner for all codegen tasks
- `tools/codegen/manifest.ts`: task registry consumed by `pnpm codegen` and the launcher

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

## Notes

- The launcher UI reads `tools/codegen/manifest.ts` directly to list tasks.
- Add new generators by editing the manifest and placing the script in this folder.
