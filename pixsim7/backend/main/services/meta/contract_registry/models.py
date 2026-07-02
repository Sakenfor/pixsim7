"""Meta-contract data models."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class MetaContractEndpoint:
    """An endpoint exposed by a meta contract."""

    id: str
    method: str
    path: str
    summary: str
    auth_required: Optional[bool] = None
    requires_admin: bool = False
    permissions: List[str] = field(default_factory=list)
    availability: Dict[str, Any] = field(
        default_factory=lambda: {
            "status": "available",
            "reason": None,
            "conditions": [],
        }
    )
    input_schema: Optional[Dict[str, Any]] = None
    output_schema: Optional[Dict[str, Any]] = None
    tags: List[str] = field(default_factory=list)


@dataclass
class MetaContract:
    """A registered meta contract surface."""

    id: str
    name: str
    version: str
    endpoint: Optional[str] = None
    auth_required: bool = True
    owner: str = ""
    summary: str = ""
    audience: List[str] = field(default_factory=lambda: ["user", "dev"])
    provides: List[str] = field(default_factory=list)
    relates_to: List[str] = field(default_factory=list)
    sub_endpoints: List[MetaContractEndpoint] = field(default_factory=list)
    source_plugin_id: Optional[str] = None
