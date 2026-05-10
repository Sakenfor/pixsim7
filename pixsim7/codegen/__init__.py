"""
Shared codegen task plumbing.

Single source of truth for parsing `tools/codegen/manifest.ts` and running
codegen tasks. Used by:

- `launcher/api/routes/codegen.py` — runs tasks on the local dev machine
  (subprocess on the developer's filesystem; no auth)
- `pixsim7/backend/main/api/v1/codegen.py` — runs tasks server-side on a
  running backend (subprocess on the backend's filesystem; permission-gated)

Both endpoints expose roughly the same task list to different audiences. They
MUST share this module so a manifest field added in one place is reflected in
both — historically the parsers had drifted (the launcher learned `check_only`
and `args` while the backend parser stayed stuck on the old shape, opening a
foot-gun where scoped openapi-* tasks could clobber the shared output dir).
"""

from .manifest import CodegenTask, load_codegen_tasks
from .output_stats import TASK_OUTPUT_PATHS, compute_task_output_stats
from .runner import CodegenRunResult, run_codegen_task

__all__ = [
    "CodegenTask",
    "CodegenRunResult",
    "load_codegen_tasks",
    "run_codegen_task",
    "TASK_OUTPUT_PATHS",
    "compute_task_output_stats",
]
