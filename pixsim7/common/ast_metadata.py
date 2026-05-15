"""Static (no-import) extraction of module-level metadata via AST.

Several registries across the codebase need to read a Python source file
and pull a top-level ``NAME = {literal}`` declaration WITHOUT importing
the module — importing arbitrary user code at discovery time is unsafe
(side effects, missing deps, partial environments). This module is the
single canonical implementation of that pattern.

Used by:

* :mod:`testing.discovery` — extracts ``TEST_SUITE`` blocks
* :mod:`scripts.tests.infer_covers` — finds the AST node for
  ``TEST_SUITE`` so it can rewrite the ``covers`` list in place

The functions are pure stdlib (just :mod:`ast` + :mod:`pathlib`) so they
can be imported from anywhere — scripts, the backend, repo-level tools.
"""
from __future__ import annotations

import ast
from pathlib import Path
from typing import Any


def find_top_level_assign(tree: ast.Module, name: str) -> ast.Assign | None:
    """Return the AST node for ``NAME = <expr>`` at module scope, or None.

    Only matches single-target assignments (``NAME = …``, not
    ``NAME, OTHER = …`` or augmented assigns). Returns the raw
    :class:`ast.Assign` so callers that need source positions (e.g. for
    in-place rewriting) can read ``node.value.lineno`` etc.
    """
    for node in ast.iter_child_nodes(tree):
        if not isinstance(node, ast.Assign):
            continue
        if len(node.targets) != 1:
            continue
        target = node.targets[0]
        if isinstance(target, ast.Name) and target.id == name:
            return node
    return None


def extract_module_metadata(
    path: Path,
    *names: str,
) -> tuple[dict[str, Any], str | None]:
    """Parse a Python file and pull out top-level literals + docstring.

    Single AST walk: reads the file, locates each requested top-level
    ``NAME = {literal}`` assignment, runs :func:`ast.literal_eval` on
    its value, and also returns the module-level docstring.

    Returns ``(literals, docstring)`` where ``literals`` is a dict
    mapping requested ``name`` → parsed value (entries missing from the
    file are omitted, as are values that aren't valid Python literals).
    On parse failure (syntax error, encoding error, missing file) returns
    ``({}, None)`` rather than raising — discovery loops want to skip
    bad files, not abort the whole scan.
    """
    try:
        source = path.read_text(encoding="utf-8-sig")
        tree = ast.parse(source, filename=str(path))
    except (OSError, SyntaxError, UnicodeDecodeError):
        return {}, None

    docstring = ast.get_docstring(tree)

    if not names:
        return {}, docstring

    wanted = set(names)
    literals: dict[str, Any] = {}
    for node in ast.iter_child_nodes(tree):
        if not isinstance(node, ast.Assign):
            continue
        if len(node.targets) != 1:
            continue
        target = node.targets[0]
        if not isinstance(target, ast.Name) or target.id not in wanted:
            continue
        try:
            literals[target.id] = ast.literal_eval(node.value)
        except (ValueError, TypeError):
            # Not a parseable literal (e.g. references a variable or
            # function call). Skip — caller treats this the same as
            # absent.
            pass
    return literals, docstring
