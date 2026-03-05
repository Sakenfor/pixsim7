# CUE Prompt Pack Sources

This directory contains CUE source-of-truth definitions for prompt block packs.

Current packs:

- `prompt_packs/core_camera.cue`
- `prompt_packs/core_direction.cue`

Compile/export workflow:

- Preferred on Windows: place `cue.exe` at `tools/cue/cue.exe` (repo-local).
- Optional: install CUE globally (`cue` in PATH): https://cuelang.org/docs/install/
- Optional: set `CUE_BIN` to an explicit binary path.
- Generate YAML outputs: `pnpm prompt-packs:gen`
- Check outputs are current: `pnpm prompt-packs:check`

Generated files are emitted to:

- `pixsim7/backend/main/content_packs/prompt/<pack>/schema.yaml`
