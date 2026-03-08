"""Link-backed reference binding for prompt block op metadata.

This adapter is intentionally small: it enriches compiled resolver candidates
with bound op refs and prunes candidates that cannot satisfy required refs.
It reuses existing link services instead of introducing a parallel resolver
stack.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.composition.role_resolver import resolve_role
from pixsim7.backend.main.services.links.object_link_resolver import ObjectLinkResolver
from pixsim7.backend.main.services.prompt.block.resolution_core.types import (
    CandidateBlock,
    ResolutionRequest,
)
from pixsim7.backend.main.shared.entity_refs import parse_entity_ref


@dataclass(slots=True)
class RefBindingStats:
    mode: str = "required"
    candidates_checked: int = 0
    candidates_pruned: int = 0
    required_refs_missing: int = 0
    optional_refs_missing: int = 0
    resolved_ref_count: int = 0
    warnings: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "mode": self.mode,
            "candidates_checked": self.candidates_checked,
            "candidates_pruned": self.candidates_pruned,
            "required_refs_missing": self.required_refs_missing,
            "optional_refs_missing": self.optional_refs_missing,
            "resolved_ref_count": self.resolved_ref_count,
            "warnings": list(self.warnings),
        }


class LinkBackedRefBinder:
    """Bind candidate op refs from explicit inputs and link lookups."""

    def __init__(
        self,
        db: AsyncSession,
        *,
        link_resolver: Optional[ObjectLinkResolver] = None,
    ) -> None:
        self._link_resolver = link_resolver or ObjectLinkResolver(db)

    async def bind_request(
        self,
        request: ResolutionRequest,
        *,
        context: Optional[Dict[str, Any]] = None,
        mode: str = "required",
    ) -> RefBindingStats:
        normalized_mode = self._normalize_mode(mode)
        context_map = context if isinstance(context, dict) else {}
        available_refs = self._normalize_ref_map(context_map.get("available_refs"))
        stats = RefBindingStats(mode=normalized_mode)

        if normalized_mode == "off":
            context_payload = dict(request.context or {})
            context_payload["ref_binding"] = stats.to_dict()
            request.context = context_payload
            return stats

        for target_key, candidates in list(request.candidates_by_target.items()):
            kept: List[CandidateBlock] = []
            for candidate in candidates:
                stats.candidates_checked += 1
                keep = await self._bind_candidate(
                    candidate=candidate,
                    available_refs=available_refs,
                    context=context_map,
                    mode=normalized_mode,
                    stats=stats,
                )
                if keep:
                    kept.append(candidate)
                else:
                    stats.candidates_pruned += 1
            request.candidates_by_target[target_key] = kept

        context_payload = dict(request.context or {})
        context_payload["ref_binding"] = stats.to_dict()
        request.context = context_payload
        return stats

    async def _bind_candidate(
        self,
        *,
        candidate: CandidateBlock,
        available_refs: Dict[str, List[Any]],
        context: Dict[str, Any],
        mode: str,
        stats: RefBindingStats,
    ) -> bool:
        metadata = candidate.metadata if isinstance(candidate.metadata, dict) else {}
        op_payload = metadata.get("op")
        if not isinstance(op_payload, dict):
            return True

        refs = op_payload.get("refs")
        if not isinstance(refs, list) or not refs:
            refs = []

        params = op_payload.get("params")
        if not isinstance(params, list) or not params:
            params = []
        op_args = op_payload.get("args")
        if not isinstance(op_args, dict):
            op_args = {}

        ref_bindings_raw = op_payload.get("ref_bindings")
        ref_bindings = ref_bindings_raw if isinstance(ref_bindings_raw, dict) else {}

        resolved_refs: Dict[str, Any] = {}
        resolved_params: Dict[str, Any] = {}
        missing_required = 0

        for raw_ref in refs:
            if not isinstance(raw_ref, dict):
                continue

            ref_key = str(raw_ref.get("key") or "").strip()
            capability = str(raw_ref.get("capability") or "").strip()
            required = bool(raw_ref.get("required", False))
            many = bool(raw_ref.get("many", False))
            if not ref_key:
                continue

            resolved = await self._resolve_ref(
                ref_key=ref_key,
                capability=capability,
                ref_bindings=ref_bindings,
                available_refs=available_refs,
                context=context,
                many=many,
                stats=stats,
            )
            if resolved is None:
                if required:
                    missing_required += 1
                else:
                    stats.optional_refs_missing += 1
                continue
            resolved_refs[ref_key] = resolved
            if isinstance(resolved, list):
                stats.resolved_ref_count += len(resolved)
            else:
                stats.resolved_ref_count += 1

        for raw_param in params:
            if not isinstance(raw_param, dict):
                continue
            param_type = str(raw_param.get("type") or "").strip().lower()
            if param_type != "ref":
                continue

            param_key = str(raw_param.get("key") or "").strip()
            if not param_key:
                continue
            capability = str(raw_param.get("ref_capability") or "").strip()
            required = bool(raw_param.get("required", False))
            many = bool(raw_param.get("many", False))
            explicit_values = self._as_tokens(op_args.get(param_key))

            resolved_param = await self._resolve_ref(
                ref_key=param_key,
                capability=capability,
                ref_bindings={},
                available_refs=available_refs,
                context=context,
                explicit_values=explicit_values,
                many=many,
                stats=stats,
            )
            if resolved_param is None:
                if required:
                    missing_required += 1
                else:
                    stats.optional_refs_missing += 1
                continue
            resolved_params[param_key] = resolved_param
            if isinstance(resolved_param, list):
                stats.resolved_ref_count += len(resolved_param)
            else:
                stats.resolved_ref_count += 1

        if missing_required > 0:
            stats.required_refs_missing += missing_required
            if mode == "required":
                return False
            stats.warnings.append(
                f"candidate '{candidate.block_id}' missing {missing_required} required ref bindings in advisory mode"
            )

        if resolved_refs or resolved_params:
            op_copy = dict(op_payload)
            if resolved_refs:
                op_copy["resolved_refs"] = resolved_refs
            if resolved_params:
                op_copy["resolved_params"] = resolved_params
            metadata_copy = dict(metadata)
            metadata_copy["op"] = op_copy
            candidate.metadata = metadata_copy

        return True

    async def _resolve_ref(
        self,
        *,
        ref_key: str,
        capability: str,
        ref_bindings: Dict[str, Any],
        available_refs: Dict[str, List[Any]],
        context: Dict[str, Any],
        explicit_values: Optional[List[Any]] = None,
        many: bool = False,
        stats: RefBindingStats,
    ) -> Optional[Any]:
        tokens: List[Any] = []

        if explicit_values:
            tokens.extend(self._as_tokens(explicit_values))
        if ref_key in ref_bindings:
            tokens.extend(self._as_tokens(ref_bindings.get(ref_key)))
        if capability:
            tokens.extend(available_refs.get(capability, []))
        tokens.extend(available_refs.get(ref_key, []))

        character_bindings = context.get("character_bindings")
        if isinstance(character_bindings, dict):
            if capability:
                tokens.extend(self._as_tokens(character_bindings.get(capability)))
            tokens.extend(self._as_tokens(character_bindings.get(ref_key)))

        resolved_many: List[Dict[str, Any]] = []
        resolved_seen: set[str] = set()
        seen: set[str] = set()
        for token in tokens:
            identity = repr(token)
            if identity in seen:
                continue
            seen.add(identity)
            resolved = await self._resolve_token(token=token, context=context, stats=stats)
            if resolved is not None:
                if not many:
                    return resolved
                resolved_identity = self._resolved_identity(resolved)
                if resolved_identity in resolved_seen:
                    continue
                resolved_seen.add(resolved_identity)
                resolved_many.append(resolved)

        if many:
            return resolved_many or None
        return None

    async def _resolve_token(
        self,
        *,
        token: Any,
        context: Dict[str, Any],
        stats: RefBindingStats,
    ) -> Optional[Dict[str, Any]]:
        if token is None:
            return None

        if isinstance(token, dict):
            # Direct entity reference object.
            ref_value = token.get("entity_ref", token.get("ref"))
            if ref_value is not None:
                entity_ref = parse_entity_ref(ref_value)
                if entity_ref is not None:
                    return {"kind": "entity", "value": entity_ref.to_string(), "source": "direct"}

            # Resolve through link system from template anchor.
            template_kind = token.get("template_kind")
            template_id = token.get("template_id")
            if template_kind and template_id is not None:
                link_context = context.get("link_context")
                if not isinstance(link_context, dict):
                    link_context = None
                try:
                    resolved = await self._link_resolver.resolve_template_to_runtime(
                        str(template_kind),
                        str(template_id),
                        context=link_context,
                    )
                except Exception as exc:  # pragma: no cover - defensive path
                    stats.warnings.append(
                        f"link lookup failed for {template_kind}:{template_id}: {exc}"
                    )
                    resolved = None
                if resolved is not None:
                    return {
                        "kind": "entity",
                        "value": f"{resolved.kind}:{resolved.entity_id}",
                        "source": "link",
                    }

            # Explicit role concept input.
            role_value = token.get("role")
            if role_value is not None:
                role_ref = resolve_role(str(role_value))
                if role_ref is not None:
                    return {
                        "kind": "concept",
                        "value": role_ref.to_canonical(),
                        "source": "role",
                    }

            symbol_value = token.get("symbol")
            if isinstance(symbol_value, str) and symbol_value.strip():
                return {"kind": "symbol", "value": symbol_value.strip(), "source": "symbol"}
            return None

        if isinstance(token, str):
            text = token.strip()
            if not text:
                return None

            entity_ref = parse_entity_ref(text)
            if entity_ref is not None:
                return {"kind": "entity", "value": entity_ref.to_string(), "source": "direct"}

            if text.startswith("role:"):
                role_ref = resolve_role(text)
                if role_ref is not None:
                    return {
                        "kind": "concept",
                        "value": role_ref.to_canonical(),
                        "source": "role",
                    }

            if text.startswith("symbol:"):
                symbol = text.split(":", 1)[1].strip()
                if symbol:
                    return {"kind": "symbol", "value": symbol, "source": "symbol"}

        return None

    @staticmethod
    def _as_tokens(value: Any) -> List[Any]:
        if value is None:
            return []
        if isinstance(value, (list, tuple, set)):
            tokens: List[Any] = []
            for item in value:
                if item is None:
                    continue
                tokens.append(item)
            return tokens
        return [value]

    @staticmethod
    def _normalize_ref_map(value: Any) -> Dict[str, List[Any]]:
        if not isinstance(value, dict):
            return {}
        normalized: Dict[str, List[Any]] = {}
        for raw_key, raw_value in value.items():
            key = str(raw_key or "").strip()
            if not key:
                continue
            tokens = LinkBackedRefBinder._as_tokens(raw_value)
            if tokens:
                normalized[key] = tokens
        return normalized

    @staticmethod
    def _normalize_mode(value: Any) -> str:
        text = str(value or "").strip().lower()
        if text in {"off", "advisory", "required"}:
            return text
        return "required"

    @staticmethod
    def _resolved_identity(value: Dict[str, Any]) -> str:
        kind = str(value.get("kind") or "")
        ref_value = str(value.get("value") or "")
        return f"{kind}:{ref_value}"
