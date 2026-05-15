"""Path/identifier naming primitives shared across registries.

Multiple discovery + registry systems in the repo derive stable
identifiers from filesystem layout:

* test-suite discovery (:mod:`testing.discovery`) — ``test_agent_errors.py``
  under ``client/`` becomes ``client-agent-errors``
* frontend test discovery — same shape, kebab-cased from camelCase stems
* future registries that key on path (content packs, plugin manifests,
  capability bindings) will all want the same kebab/humanize logic

This module is the single source for those helpers so the pattern stays
consistent. Pure stdlib (just :mod:`re`) — no project dependencies.
"""
from __future__ import annotations

import re

_KEBAB_BOUNDARY_RE = re.compile(r"([a-z0-9])([A-Z])")


def kebab(text: str) -> str:
    """Convert ``camelCase`` / ``PascalCase`` / ``snake_case`` → ``kebab-case``.

    >>> kebab("quickGenerateLogic")
    'quick-generate-logic'
    >>> kebab("AgentErrors")
    'agent-errors'
    >>> kebab("agent_errors")
    'agent-errors'
    """
    return _KEBAB_BOUNDARY_RE.sub(r"\1-\2", text).lower().replace("_", "-")


def humanize_label(slug: str) -> str:
    """Convert a kebab/snake slug to human Title Case (no suffix).

    >>> humanize_label("client-agent-errors")
    'Client Agent Errors'
    >>> humanize_label("api_chat_session")
    'Api Chat Session'

    Callers that want a suffix (e.g. ``" Tests"`` for test-suite labels)
    should append it themselves — keeping this helper suffix-free so it
    works for non-test registries too.
    """
    return slug.replace("-", " ").replace("_", " ").title()


def path_after_anchor(rel_path: str, *anchors: str) -> list[str]:
    """Return path segments after the first matching anchor folder.

    Splits ``rel_path`` on ``/`` and ``\\``, then searches for ``anchors``
    in the order given — the first one found wins. Returns the segments
    *after* the matched anchor. If no anchor matches, returns all parts.

    >>> path_after_anchor("pixsim7/backend/tests/client/test_x.py", "tests")
    ['client', 'test_x.py']
    >>> path_after_anchor("scripts/tests/test_y.py", "scripts", "tests")
    ['tests', 'test_y.py']

    Anchor ordering matters when one anchor folder nests inside another
    (e.g. ``scripts/tests/`` — pass ``("scripts", "tests")`` so the
    outer scan root wins).
    """
    parts = rel_path.replace("\\", "/").split("/")
    for anchor in anchors:
        if anchor in parts:
            idx = parts.index(anchor)
            return parts[idx + 1 :]
    return parts
