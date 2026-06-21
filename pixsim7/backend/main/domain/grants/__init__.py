"""Generic resource-grant primitive.

One owner→recipient, scoped, capped, revocable grant model that backs sharing
of any resource type (provider generation slots today; bridges / review
delegation are reserved types ready to drop in).
"""
from .resource_grant import (
    ResourceGrant,
    ResourceGrantType,
    compute_scope_key,
)

__all__ = [
    "ResourceGrant",
    "ResourceGrantType",
    "compute_scope_key",
]
