"""Shared policy validation engine and cross-domain registry."""

from __future__ import annotations

import copy
from typing import Any, Callable, Dict, List, Optional, Sequence, Set


ConstraintValidator = Callable[
    [Any, str, Dict[str, Any], Dict[str, Any], Any, Dict[str, Any]],
    List[str],
]
PrincipalTypeResolver = Callable[[Any], str]


def _normalize_principal_types(values: Any) -> List[str]:
    out: List[str] = []
    seen: Set[str] = set()
    for item in values if isinstance(values, list) else []:
        text = str(item).strip().lower()
        if not text or text in seen:
            continue
        seen.add(text)
        out.append(text)
    return out


def _get_payload_field(payload: Any, field_name: str) -> Any:
    if isinstance(payload, dict):
        return payload.get(field_name)
    return getattr(payload, field_name, None)


def _payload_has_field(payload: Any, field_name: str) -> bool:
    if isinstance(payload, dict):
        return field_name in payload
    return getattr(payload, field_name, None) is not None


class PolicyEngine:
    def __init__(
        self,
        *,
        contract_version: str,
        schema_version: str,
        domain: str,
        contract_endpoint: str,
        summary: str,
        rules: Sequence[Dict[str, Any]],
        constraint_validators: Dict[str, ConstraintValidator],
        principal_type_resolver: Optional[PrincipalTypeResolver] = None,
        logger: Any = None,
    ) -> None:
        self.contract_version = contract_version
        self.schema_version = schema_version
        self.domain = domain
        self.contract_endpoint = contract_endpoint
        self.summary = summary
        self._rules = [copy.deepcopy(rule) for rule in rules]
        self._constraint_validators = dict(constraint_validators)
        self._principal_type_resolver = principal_type_resolver
        self._logger = logger

    def _normalize_rule_applies_to(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        raw = rule.get("applies_to")
        if not isinstance(raw, dict):
            raw = {}
        principal_types = _normalize_principal_types(
            raw.get("principal_types")
            if isinstance(raw.get("principal_types"), list)
            else rule.get("applies_to_principal_types")
        )
        conditions = [c for c in (raw.get("conditions") or []) if isinstance(c, dict)]
        return {
            "principal_types": principal_types,
            "conditions": conditions,
        }

    def _rule_with_defaults(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        normalized = copy.deepcopy(rule)
        level = str(normalized.get("level") or "suggested").strip().lower()
        normalized.setdefault("severity", "error" if level == "required" else "warning")
        normalized.setdefault("since_version", self.contract_version)
        normalized.setdefault("deprecated_at", None)
        applies_to = self._normalize_rule_applies_to(normalized)
        normalized["applies_to"] = applies_to
        normalized["applies_to_principal_types"] = applies_to["principal_types"]
        return normalized

    def _resolve_principal_type(self, principal: Any) -> str:
        if self._principal_type_resolver is not None:
            resolved = str(self._principal_type_resolver(principal) or "").strip().lower()
            if resolved:
                return resolved

        ptype = getattr(principal, "principal_type", None)
        if isinstance(ptype, str) and ptype.strip():
            return ptype.strip().lower()
        source = getattr(principal, "source", None)
        if isinstance(source, str):
            if source.startswith("agent:"):
                return "agent"
            if source.startswith("service:"):
                return "service"
        return "user"

    def _evaluate_rule_condition(
        self,
        condition: Dict[str, Any],
        payload: Any,
        principal_type: str,
    ) -> bool:
        condition_type = str(condition.get("type") or "").strip().lower()
        if condition_type == "field_present":
            field = str(condition.get("field") or "").strip()
            return bool(field) and _payload_has_field(payload, field)
        if condition_type == "field_equals":
            field = str(condition.get("field") or "").strip()
            return bool(field) and _get_payload_field(payload, field) == condition.get("value")
        if condition_type == "principal_type_in":
            values = _normalize_principal_types(condition.get("values"))
            return principal_type in values

        if condition_type and self._logger is not None:
            self._logger.warning(
                "policy_engine_unknown_condition",
                domain=self.domain,
                condition_type=condition_type,
                condition=condition,
            )
        return False

    def _rule_applies(self, rule: Dict[str, Any], payload: Any, principal_type: str) -> bool:
        applies_to = rule.get("applies_to")
        if not isinstance(applies_to, dict):
            applies_to = self._normalize_rule_applies_to(rule)

        principal_types = _normalize_principal_types(applies_to.get("principal_types"))
        if principal_types and principal_type not in principal_types:
            return False

        conditions = [c for c in (applies_to.get("conditions") or []) if isinstance(c, dict)]
        for condition in conditions:
            if not self._evaluate_rule_condition(condition, payload, principal_type):
                return False
        return True

    def get_rules(self) -> List[Dict[str, Any]]:
        return [self._rule_with_defaults(rule) for rule in self._rules]

    def get_contract(self) -> Dict[str, Any]:
        return {
            "version": self.contract_version,
            "schema_version": self.schema_version,
            "domain": self.domain,
            "endpoint": self.contract_endpoint,
            "summary": self.summary,
            "rules": self.get_rules(),
        }

    def validate(
        self,
        endpoint_id: str,
        payload: Any,
        principal: Any,
        *,
        levels: Optional[Set[str]] = None,
        constraint_context: Optional[Dict[str, Any]] = None,
        partial: bool = False,
    ) -> tuple[List[str], List[str]]:
        endpoint_key = str(endpoint_id or "").strip()
        if not endpoint_key:
            return [], []

        principal_type = self._resolve_principal_type(principal)
        violations: List[str] = []
        warnings: List[str] = []
        active_levels = {
            str(level).strip().lower()
            for level in (levels or {"required", "suggested"})
        }
        context = dict(constraint_context or {})

        for rule in self.get_rules():
            if str(rule.get("endpoint_id") or "").strip() != endpoint_key:
                continue

            level = str(rule.get("level") or "").strip().lower()
            if level not in active_levels:
                continue

            if not self._rule_applies(rule, payload, principal_type):
                continue

            field_name = str(rule.get("field") or "").strip()
            if not field_name:
                continue
            if partial and isinstance(payload, dict) and field_name not in payload:
                continue

            value = _get_payload_field(payload, field_name)
            constraint = rule.get("constraint") or {}
            constraint_type = str(constraint.get("type") or "").strip()
            validator = self._constraint_validators.get(constraint_type)
            if validator is None:
                continue

            messages = validator(
                value,
                field_name,
                rule,
                constraint,
                payload,
                context,
            )
            if not messages:
                continue

            severity = str(rule.get("severity") or "").strip().lower()
            if severity == "warning" or level == "suggested":
                warnings.extend(messages)
            else:
                violations.extend(messages)

        return violations, warnings


class PolicyRegistry:
    def __init__(self) -> None:
        self._engines: Dict[str, PolicyEngine] = {}

    def register(self, domain: str, engine: PolicyEngine) -> PolicyEngine:
        key = str(domain or "").strip().lower()
        if not key:
            raise ValueError("domain is required")
        self._engines[key] = engine
        return engine

    def get(self, domain: str) -> Optional[PolicyEngine]:
        return self._engines.get(str(domain or "").strip().lower())

    def require(self, domain: str) -> PolicyEngine:
        key = str(domain or "").strip().lower()
        engine = self._engines.get(key)
        if engine is None:
            raise KeyError(f"No policy engine registered for domain '{key}'.")
        return engine

    def list_domains(self) -> List[str]:
        return sorted(self._engines.keys())

    def list_contracts(self) -> List[Dict[str, Any]]:
        return [self._engines[key].get_contract() for key in self.list_domains()]


DOMAIN_POLICY_REGISTRY = PolicyRegistry()

