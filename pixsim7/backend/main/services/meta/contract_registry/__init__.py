"""Meta Contract Registry.

Central registry for machine-readable API contract surfaces. Each contract
declares what it provides and what other contracts it relates to, forming a
navigable discovery graph. Built-in contracts are seeded on init; plugins can
register additional contracts via the CONTRACTS_REGISTER hook.

Split from the former monolithic contract_registry.py: models / helpers /
registry live here, and the built-in contract factories are grouped by domain
under builtins/.
"""
from .models import MetaContract, MetaContractEndpoint
from .registry import MetaContractRegistry, meta_contract_registry

__all__ = [
    "MetaContract",
    "MetaContractEndpoint",
    "MetaContractRegistry",
    "meta_contract_registry",
]
