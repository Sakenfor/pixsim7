"""Block Templates API — split into sub-modules for maintainability.

Re-exports the assembled router and symbols imported by tests/external code.
"""
from .router import router  # noqa: F401

# Re-export helpers imported by tests
from .helpers_matrix import (  # noqa: F401
    _build_block_matrix_drift_report,
    _resolve_block_matrix_value,
    _extend_axis_values_from_canonical_dictionary,
)

# Re-export _slot_tag_constraint_groups (used by test_resolver_workbench_endpoints)
from pixsim7.backend.main.services.prompt.block.compiler_core import (  # noqa: F401
    slot_tag_constraint_groups as _slot_tag_constraint_groups,
)

# Re-export BlockTemplateService at package level so existing mock patches
# targeting "pixsim7.backend.main.api.v1.block_templates.BlockTemplateService" continue to work.
from pixsim7.backend.main.services.prompt.block.template_service import BlockTemplateService  # noqa: F401
