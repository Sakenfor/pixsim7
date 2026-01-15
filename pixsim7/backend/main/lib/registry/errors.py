"""
Shared registry error types.
"""


class DuplicateKeyError(ValueError):
    """Raised when attempting to register a duplicate key."""

    def __init__(self, key: str, registry_name: str = "registry"):
        self.key = key
        self.registry_name = registry_name
        super().__init__(f"Duplicate key '{key}' in {registry_name}")


class KeyNotFoundError(KeyError):
    """Raised when a key is not found in the registry."""

    def __init__(self, key: str, registry_name: str = "registry"):
        self.key = key
        self.registry_name = registry_name
        super().__init__(f"Key '{key}' not found in {registry_name}")
