"""
Canonical namespaced identifier utilities.

Convention: ``namespace:name`` where namespace is the part before the
**first** colon and name is everything after it.  This means names
can contain colons (e.g., ``set:thief:01`` → namespace="set", name="thief:01").

This module is the single source of truth for parsing/building
colon-delimited identifiers across the backend codebase.
"""


def parse_namespaced_id(slug: str) -> tuple[str, str]:
    """
    Parse a ``namespace:name`` string by splitting on the first colon.

    Raises ``ValueError`` if the string has no colon or either part is empty.

    Examples::

        parse_namespaced_id("character:alice")   # ("character", "alice")
        parse_namespaced_id("set:thief:01")      # ("set", "thief:01")
        parse_namespaced_id("scene:game:123")    # ("scene", "game:123")
        parse_namespaced_id("bare-name")         # ValueError
        parse_namespaced_id(":oops")             # ValueError
    """
    colon_index = slug.find(":")
    if colon_index <= 0:
        raise ValueError(
            f"Invalid namespaced ID: {slug!r}. "
            "Expected 'namespace:name' with a non-empty namespace."
        )

    namespace = slug[:colon_index]
    name = slug[colon_index + 1:]
    if not name:
        raise ValueError(
            f"Invalid namespaced ID: {slug!r}. "
            "Name part (after colon) cannot be empty."
        )

    return namespace, name


def make_namespaced_id(namespace: str, name: str) -> str:
    """
    Build a ``namespace:name`` string from parts.

    Examples::

        make_namespaced_id("character", "alice")  # "character:alice"
        make_namespaced_id("set", "thief:01")     # "set:thief:01"
    """
    return f"{namespace}:{name}"


def get_namespace(slug: str) -> str | None:
    """
    Extract just the namespace from a ``namespace:name`` string.

    Returns ``None`` if the string has no colon or the namespace is empty.
    """
    colon_index = slug.find(":")
    if colon_index <= 0:
        return None
    return slug[:colon_index]
