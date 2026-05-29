"""
Codegen task discovery for launcher tools.

This module is now a thin re-export of `pixsim7.codegen` — the shared module
that backs both the launcher API (port 8100) and the main backend's devtools
codegen API (port 8000). Keeping it as a re-export so existing callers that
import from `launcher.core.codegen` keep working.

If you're adding a new codegen field, edit `pixsim7/codegen/manifest.py` —
both surfaces will pick it up automatically.
"""

from pixsim7.codegen import (
    CodegenRunResult,
    CodegenTask,
    load_codegen_tasks,
    run_codegen_task,
)

__all__ = [
    "CodegenTask",
    "CodegenRunResult",
    "load_codegen_tasks",
    "run_codegen_task",
]
