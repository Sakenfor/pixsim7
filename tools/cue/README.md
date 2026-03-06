# CUE Prompt Pack Sources

CUE is the **canonical authoring source** for `core_*` prompt block packs.
Runtime still consumes the generated `schema.yaml` files — never edit those by hand.

## Setup

Install CUE locally (one-time):

```bash
# Linux / macOS / WSL
bash tools/cue/ensure-cue.sh

# Windows PowerShell
powershell tools/cue/ensure-cue.ps1
```

The scripts install CUE into `tools/cue/bin/` (gitignored).
Override with `CUE_BIN` env var to use a different binary.

## Commands

```bash
# Generate all schema.yaml from CUE sources
pnpm prompt-packs:gen

# Check that generated YAML matches CUE sources (CI uses this)
pnpm prompt-packs:check
```

## How it works

1. The generator auto-discovers every `*.cue` file in `tools/cue/prompt_packs/` (excluding `schema_v1.cue`).
2. Each file is exported with `cue export ... -e pack --out yaml`.
3. Output subdir defaults to `pack.package_name`; override with `meta.output_subdir` in the CUE file.
4. YAML is written to `pixsim7/backend/main/content_packs/prompt/<subdir>/schema.yaml`.

## Adding a new pack

1. Create `tools/cue/prompt_packs/<pack_name>.cue` using `schema_v1.cue` types.
2. Run `pnpm prompt-packs:gen` to generate the YAML.
3. Verify with `pnpm prompt-packs:check`.
4. Commit both the `.cue` source and the generated `schema.yaml`.

## Rules

- **Do not hand-edit** generated `schema.yaml` files — changes will be overwritten.
- Edit the `.cue` source, then regenerate.
- CI enforces drift via `prompt-packs:check`; stale YAML fails the build.
