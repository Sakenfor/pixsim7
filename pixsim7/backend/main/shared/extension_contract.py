"""
Shared extension contract helpers.

This module defines a canonical identity format and lifecycle states for
cross-domain "extensions" (plugins, analyzers, semantic packs, block packs).

Canonical identity format:
    <kind>:<scope>.<owner>/<name>[@<version>]

Examples:
    plugin:user.stefan/camera-toolkit@0.1.0
    analyzer:core.pixsim/object-detection
    semantic-pack:org.acme/urban-fantasy@1.2.3

Legacy IDs are still supported in parse mode to aid migration.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
import re


_CANONICAL_EXTENSION_ID_RE = re.compile(
    r"^(?P<kind>[a-z][a-z0-9_-]*)"
    r":(?P<scope>[a-z][a-z0-9_-]*)"
    r"\.(?P<owner>[a-z0-9][a-z0-9._-]{0,63})"
    r"/(?P<name>[a-z0-9][a-z0-9._-]{0,127})"
    r"(?:@(?P<version>[0-9]+\.[0-9]+\.[0-9]+(?:[-+][A-Za-z0-9.-]+)?))?$"
)


class ExtensionKind(str, Enum):
    PLUGIN = "plugin"
    ANALYZER = "analyzer"
    SEMANTIC_PACK = "semantic-pack"
    BLOCK_PACK = "block-pack"


class ExtensionScope(str, Enum):
    CORE = "core"
    ORG = "org"
    USER = "user"
    LEGACY = "legacy"


class ExtensionLifecycleStatus(str, Enum):
    DRAFT = "draft"
    SUBMITTED = "submitted"
    APPROVED = "approved"
    REJECTED = "rejected"
    PUBLISHED = "published"
    DEPRECATED = "deprecated"


@dataclass(frozen=True)
class ExtensionIdentity:
    """
    Parsed extension identity.

    Fields are intentionally string-based to allow gradual migration from legacy
    IDs without forcing enum coercion at every boundary.
    """

    kind: str
    scope: str
    owner: str
    name: str
    version: str | None = None
    canonical: bool = True
    raw: str | None = None

    @property
    def key(self) -> str:
        """Stable identity key without version."""
        return f"{self.kind}:{self.scope}.{self.owner}/{self.name}"

    def with_version(self, version: str | None) -> "ExtensionIdentity":
        """Return a copy with a new version value."""
        return ExtensionIdentity(
            kind=self.kind,
            scope=self.scope,
            owner=self.owner,
            name=self.name,
            version=version,
            canonical=self.canonical,
            raw=self.raw,
        )


def is_canonical_extension_id(value: str) -> bool:
    """Return True if value matches canonical extension identity format."""
    candidate = str(value or "").strip()
    return bool(_CANONICAL_EXTENSION_ID_RE.match(candidate))


def parse_extension_identity(
    value: str,
    *,
    expected_kind: str | None = None,
    allow_legacy: bool = True,
) -> ExtensionIdentity:
    """
    Parse canonical extension ID, with optional legacy fallback.

    If `allow_legacy=True` and `value` is not canonical, this returns a legacy
    identity marker that preserves the raw value for migration tooling.
    """
    raw = str(value or "").strip()
    if not raw:
        raise ValueError("Extension ID cannot be empty")

    match = _CANONICAL_EXTENSION_ID_RE.match(raw)
    if match:
        groups = match.groupdict()
        kind = groups["kind"]
        if expected_kind and kind != expected_kind:
            raise ValueError(
                f"Extension kind mismatch: expected '{expected_kind}', got '{kind}'"
            )
        return ExtensionIdentity(
            kind=kind,
            scope=groups["scope"],
            owner=groups["owner"],
            name=groups["name"],
            version=groups.get("version"),
            canonical=True,
            raw=raw,
        )

    if not allow_legacy:
        raise ValueError(
            f"Invalid extension ID '{raw}'. Expected "
            "<kind>:<scope>.<owner>/<name>[@<version>]"
        )

    inferred_kind = expected_kind or _infer_legacy_kind(raw)
    name = _strip_kind_prefix_if_present(raw, inferred_kind)
    return ExtensionIdentity(
        kind=inferred_kind,
        scope=ExtensionScope.LEGACY.value,
        owner=ExtensionScope.LEGACY.value,
        name=name,
        version=None,
        canonical=False,
        raw=raw,
    )


def build_extension_identity(identity: ExtensionIdentity) -> str:
    """
    Build an extension ID string from identity data.

    For legacy identities, returns `raw` when available.
    """
    if not identity.canonical:
        if identity.raw:
            return identity.raw
        return f"{identity.kind}:{identity.name}"

    base = f"{identity.kind}:{identity.scope}.{identity.owner}/{identity.name}"
    if identity.version:
        return f"{base}@{identity.version}"
    return base


def is_editable_lifecycle(status: str | ExtensionLifecycleStatus) -> bool:
    """Editable states for draft workflows."""
    value = _status_value(status)
    return value in {
        ExtensionLifecycleStatus.DRAFT.value,
        ExtensionLifecycleStatus.REJECTED.value,
    }


def can_submit_lifecycle(status: str | ExtensionLifecycleStatus) -> bool:
    """Submission allowed from draft/rejected states."""
    return is_editable_lifecycle(status)


def can_approve_lifecycle(status: str | ExtensionLifecycleStatus) -> bool:
    """Approval allowed only from submitted state."""
    return _status_value(status) == ExtensionLifecycleStatus.SUBMITTED.value


def can_publish_lifecycle(status: str | ExtensionLifecycleStatus) -> bool:
    """Publish allowed only from approved state."""
    return _status_value(status) == ExtensionLifecycleStatus.APPROVED.value


def _infer_legacy_kind(raw: str) -> str:
    prefix = raw.split(":", 1)[0]
    known = {
        ExtensionKind.PLUGIN.value,
        ExtensionKind.ANALYZER.value,
        ExtensionKind.SEMANTIC_PACK.value,
        ExtensionKind.BLOCK_PACK.value,
    }
    if prefix in known:
        return prefix
    return "unknown"


def _strip_kind_prefix_if_present(raw: str, kind: str) -> str:
    marker = f"{kind}:"
    if kind != "unknown" and raw.startswith(marker):
        remainder = raw[len(marker) :].strip()
        return remainder or raw
    return raw


def _status_value(status: str | ExtensionLifecycleStatus) -> str:
    if isinstance(status, ExtensionLifecycleStatus):
        return status.value
    return str(status or "").strip().lower()
