"""
Backend-side codegen service helpers.

Codegen task discovery + execution lives in the shared module
`pixsim7.codegen`. This package keeps backend-only concerns:
  - migration health introspection
  - devtools test runner

Re-exports the shared codegen pieces so existing imports
(`from pixsim7.backend.main.services.codegen import CodegenTask, ...`)
keep working.
"""

from pixsim7.codegen import (
    CodegenRunResult,
    CodegenTask,
    load_codegen_tasks,
    run_codegen_task,
)

from .migration_health import MigrationHealthService
from .test_runner import (
    DevtoolsTestRunResult,
    run_test_profile,
)

__all__ = [
    "CodegenTask",
    "CodegenRunResult",
    "load_codegen_tasks",
    "run_codegen_task",
    "MigrationHealthService",
    "DevtoolsTestRunResult",
    "run_test_profile",
]
