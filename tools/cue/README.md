# CUE Prompt Pack Sources

CUE is the canonical authoring source for `core_*` prompt block packs.
Runtime consumes generated `schema.yaml` and `manifest.yaml` files. Do not edit generated YAML by hand.

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
# Generate all schema.yaml + manifest.yaml from CUE sources (runs contract lint first)
pnpm prompt-packs:gen

# Check contract lint + YAML drift (CI uses this)
pnpm prompt-packs:check
```

## How it works

1. The generator auto-discovers every `*.cue` file in `tools/cue/prompt_packs/` (excluding `schema_v1.cue`).
2. Each file is exported with `cue export ... -e pack --out yaml` and `cue export ... -e manifest --out yaml`.
3. Output subdir defaults to `pack.package_name`; override with `meta.output_subdir` in the CUE file.
4. YAML is written to:
   - `pixsim7/backend/main/content_packs/prompt/<subdir>/schema.yaml`
   - `pixsim7/backend/main/content_packs/prompt/<subdir>/manifest.yaml`

## Adding a new pack

1. Create `tools/cue/prompt_packs/<pack_name>.cue` using `schema_v1.cue` types.
2. Define both top-level objects: `pack` and `manifest`.
3. In `pack`, define one or more `blocks[]` entries, each containing:
   - `id`
   - `block_schema`
4. Run `pnpm prompt-packs:gen` to generate YAML.
5. Verify with `pnpm prompt-packs:check`.
6. Commit the `.cue` source and generated YAML files.

## Rules

- Do not hand-edit generated `schema.yaml` / `manifest.yaml` files. Changes will be overwritten.
- Edit the `.cue` source, then regenerate.
- CI enforces drift via `prompt-packs:check`; stale YAML fails the build.
- Top-level `block_schema` in generated YAML is no longer supported. Use `blocks[].block_schema`.
- Generator lint enforces cross-field invariants (e.g. duplicate resolved block IDs, unknown op arg keys, invalid ref bindings).
- `block_schema.mode` controls contract enforcement (`surface`, `hybrid`, `op`).
  - `surface`: requires renderable text.
  - `hybrid`: requires renderable text + resolvable op id.
  - `op`: requires resolvable op id (text optional for future non-text runtimes).
- `block_schema.descriptors` and `variants[].descriptors` define semantic overlay state.
  - Loader merges `block_schema.descriptors` with per-variant overrides.
  - Merged descriptors are persisted in `block_metadata.descriptors`.
- `block_schema.op.signature_id` can opt into canonical op contract validation.
  - Unknown signatures fail pack loading.
  - Known signatures can enforce required params/refs and op id namespace rules.
