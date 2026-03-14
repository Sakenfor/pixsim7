"""
Authoring Workflow Registry.

Stores named prompt-authoring workflows (step sequences) that both AI agents
and the UI use to discover how to create/edit prompts.  Built-in workflows
are seeded on init; plugins can register additional workflows via the hook
system.

Each workflow declares an `audience` list so consumers can filter:
  - "agent"  — programmatic / AI-agent consumers
  - "user"   — human-facing UI wizards / guided flows
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set

from pixsim7.backend.main.lib.registry.simple import SimpleRegistry


@dataclass
class WorkflowStep:
    step: int
    endpoint_id: str
    required: bool = True
    precondition: Optional[str] = None
    outputs: List[str] = field(default_factory=list)
    consumes: List[str] = field(default_factory=list)
    note: Optional[str] = None


AUDIENCE_AGENT = "agent"
AUDIENCE_USER = "user"
ALL_AUDIENCES = [AUDIENCE_AGENT, AUDIENCE_USER]


@dataclass
class AuthoringWorkflow:
    id: str
    label: str
    description: str
    steps: List[WorkflowStep]
    audience: List[str] = field(default_factory=lambda: list(ALL_AUDIENCES))
    source_plugin_id: Optional[str] = None


# ---------------------------------------------------------------------------
# Built-in workflow definitions
# ---------------------------------------------------------------------------

_BUILTIN_WORKFLOWS: List[AuthoringWorkflow] = [
    AuthoringWorkflow(
        id="quick_draft",
        label="Quick Draft",
        description="Minimal flow: create family then version. No analysis step.",
        steps=[
            WorkflowStep(
                step=1,
                endpoint_id="prompts.create_family",
                outputs=["family_id"],
                note="Returns family_id for step 2.",
            ),
            WorkflowStep(
                step=2,
                endpoint_id="prompts.create_version",
                consumes=["family_id"],
                outputs=["version_id"],
            ),
        ],
    ),
    AuthoringWorkflow(
        id="analyzed_authoring",
        label="Analyzed Authoring",
        description="Full flow: create family, analyze prompt, then persist version with analysis.",
        steps=[
            WorkflowStep(
                step=1,
                endpoint_id="prompts.create_family",
                outputs=["family_id"],
            ),
            WorkflowStep(
                step=2,
                endpoint_id="prompts.analyze",
                outputs=["prompt_analysis"],
                note="Preview analysis; embed result in step 3 prompt_analysis field.",
            ),
            WorkflowStep(
                step=3,
                endpoint_id="prompts.create_version",
                consumes=["family_id", "prompt_analysis"],
                outputs=["version_id"],
            ),
        ],
    ),
    AuthoringWorkflow(
        id="continuation",
        label="Add Continuation",
        description="Create a continuation version under an existing family.",
        steps=[
            WorkflowStep(
                step=1,
                endpoint_id="prompts.list_families",
                outputs=["family_id"],
                note="Find the target family. Skip if family_id already known.",
            ),
            WorkflowStep(
                step=2,
                endpoint_id="prompts.create_version",
                consumes=["family_id"],
                outputs=["version_id"],
                precondition="Requires parent_version_id from prior version in the family.",
                note="Set parent_version_id and sequence:continuation tag.",
            ),
        ],
    ),
    AuthoringWorkflow(
        id="iterative_edit",
        label="Iterative Edit",
        description="Apply structured edits to an existing version, creating a child.",
        steps=[
            WorkflowStep(
                step=1,
                endpoint_id="prompts.apply_edit",
                consumes=["version_id"],
                outputs=["version_id"],
                precondition="Requires an existing version_id to edit.",
            ),
        ],
    ),
]


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------


class AuthoringWorkflowRegistry(SimpleRegistry[str, AuthoringWorkflow]):
    """Plugin-aware registry for prompt authoring workflows."""

    def __init__(self) -> None:
        super().__init__(
            name="AuthoringWorkflowRegistry",
            allow_overwrite=True,
            seed_on_init=True,
            plugin_aware=True,
        )
        self._by_plugin: Dict[str, Set[str]] = {}

    def _get_item_key(self, item: AuthoringWorkflow) -> str:
        return item.id

    def _seed_defaults(self) -> None:
        for wf in _BUILTIN_WORKFLOWS:
            self.register(wf.id, wf)

    # -- Plugin helpers ----------------------------------------------------

    def register_plugin_workflow(
        self, plugin_id: str, workflow: AuthoringWorkflow
    ) -> None:
        workflow.source_plugin_id = plugin_id
        self.register(workflow.id, workflow)
        self._by_plugin.setdefault(plugin_id, set()).add(workflow.id)

    def register_plugin_workflows(
        self, plugin_id: str, workflows: List[AuthoringWorkflow]
    ) -> None:
        for wf in workflows:
            self.register_plugin_workflow(plugin_id, wf)

    def list_for_audience(self, audience: Optional[str] = None) -> List[AuthoringWorkflow]:
        """Return workflows filtered by audience. None = all workflows."""
        if audience is None:
            return self.values()
        return [wf for wf in self.values() if audience in wf.audience]

    def list_by_plugin(self, plugin_id: str) -> List[AuthoringWorkflow]:
        return [
            self._items[wf_id]
            for wf_id in self._by_plugin.get(plugin_id, set())
            if wf_id in self._items
        ]

    def unregister_by_plugin(self, plugin_id: str) -> int:
        wf_ids = list(self._by_plugin.pop(plugin_id, set()))
        for wf_id in wf_ids:
            self.unregister(wf_id)
        return len(wf_ids)


# Global singleton
authoring_workflow_registry = AuthoringWorkflowRegistry()
