"""Meta contract conformance gate tests.

These checks keep the machine-readable contract surfaces executable:
- declared endpoint paths/methods must exist in registered routers
- pre-authoring contract references must resolve
- examples must validate against declared schemas
- deprecation behavior text must match runtime response status
"""
from __future__ import annotations

import importlib
import re
from types import SimpleNamespace
from typing import Any, Dict, Iterable, List, Optional, Sequence, Set, Tuple
from uuid import uuid4

import pytest
from fastapi import HTTPException
from jsonschema import Draft202012Validator

from pixsim7.backend.main.api.v1.meta_contracts import list_contract_endpoints
from pixsim7.backend.main.api.v1.prompts import families as prompt_families
from pixsim7.backend.main.api.v1.prompts.meta import (
    get_prompt_analysis_contract,
    get_prompt_authoring_contract,
)
from pixsim7.backend.main.api.v1.prompts.schemas import CreatePromptVersionRequest

_ROUTE_MANIFEST_MODULE_BY_PATH_PREFIX: Sequence[Tuple[str, str]] = (
    ("/api/v1/assets", "pixsim7.backend.main.routes.assets.manifest"),
    ("/api/v1/block-templates", "pixsim7.backend.main.routes.block_templates.manifest"),
    ("/api/v1/characters", "pixsim7.backend.main.routes.characters.manifest"),
    ("/api/v1/dev/plans", "pixsim7.backend.main.routes.dev_plans.manifest"),
    ("/api/v1/dev/ontology", "pixsim7.backend.main.routes.dev_ontology.manifest"),
    ("/api/v1/devtools/codegen", "pixsim7.backend.main.routes.codegen.manifest"),
    ("/api/v1/game/meta", "pixsim7.backend.main.routes.game_meta.manifest"),
    ("/api/v1/game/scenes", "pixsim7.backend.main.routes.game_scenes.manifest"),
    ("/api/v1/generations", "pixsim7.backend.main.routes.generations.manifest"),
    ("/api/v1/meta/ui", "pixsim7.backend.main.routes.meta_ui.manifest"),
    ("/api/v1/meta", "pixsim7.backend.main.routes.meta_contracts.manifest"),
    ("/api/v1/notifications", "pixsim7.backend.main.routes.notifications.manifest"),
    ("/api/v1/prompts", "pixsim7.backend.main.routes.prompts.manifest"),
)

_AUTHORING_REQUEST_SCHEMA_BY_ENDPOINT_ID: Dict[str, str] = {
    "prompts.create_family": "create_family_request_schema",
    "prompts.create_version": "create_version_request_schema",
    "prompts.apply_edit": "apply_edit_request_schema",
    "prompts.analyze": "analyze_request_schema",
}

_DEPRECATION_FIELD_PROMPT_ANALYSIS = "provider_hints.prompt_analysis"
_HTTP_STATUS_RE = re.compile(r"HTTP\s+(\d{3})")


def _user_with_defaults(default_ids: Optional[List[str]] = None) -> SimpleNamespace:
    return SimpleNamespace(
        id=42,
        username="contract-gate",
        preferences={"analyzer": {"prompt_default_ids": default_ids or []}},
    )


def _normalize_path(path: str) -> str:
    normalized = path.strip()
    if not normalized.startswith("/"):
        normalized = f"/{normalized}"
    if normalized != "/" and normalized.endswith("/"):
        normalized = normalized[:-1]
    return normalized


def _join_paths(prefix: str, path: str) -> str:
    if not prefix:
        return path
    if prefix.endswith("/") and path.startswith("/"):
        return f"{prefix[:-1]}{path}"
    if not prefix.endswith("/") and not path.startswith("/"):
        return f"{prefix}/{path}"
    return f"{prefix}{path}"


def _resolve_manifest_module_for_path(path: str) -> str:
    normalized = _normalize_path(path)
    for prefix, module_name in _ROUTE_MANIFEST_MODULE_BY_PATH_PREFIX:
        if normalized.startswith(prefix):
            return module_name
    raise AssertionError(
        f"No route-manifest mapping for declared endpoint path: {normalized}. "
        "Add a prefix mapping in _ROUTE_MANIFEST_MODULE_BY_PATH_PREFIX."
    )


def _effective_prefix(manifest: Any) -> str:
    prefix = manifest.prefix
    if not manifest.prefix_raw and (not prefix or prefix == ""):
        return "/api/v1"
    return prefix or ""


def _build_route_index_for_paths(paths: Iterable[str]) -> Set[Tuple[str, str]]:
    module_names = {_resolve_manifest_module_for_path(path) for path in paths}
    route_index: Set[Tuple[str, str]] = set()

    for module_name in module_names:
        module = importlib.import_module(module_name)
        manifest = module.manifest
        router = module.router
        prefix = _effective_prefix(manifest)

        for route in getattr(router, "routes", []):
            methods = getattr(route, "methods", None)
            route_path = getattr(route, "path", None)
            if not methods or not isinstance(route_path, str):
                continue

            full_path = _normalize_path(_join_paths(prefix, route_path))
            for method in methods:
                route_index.add((method.upper(), full_path))

    return route_index


def _validation_errors(instance: Any, schema: Dict[str, Any]) -> List[str]:
    validator = Draft202012Validator(schema)
    errors = []
    for err in validator.iter_errors(instance):
        location = ".".join([str(p) for p in err.path]) or "$"
        errors.append(f"{location}: {err.message}")
    return errors


def _extract_deprecation_status_codes(
    deprecations: List[Dict[str, Any]],
    *,
    field: str,
) -> Set[int]:
    codes: Set[int] = set()
    for item in deprecations:
        if item.get("field") != field:
            continue
        behavior = str(item.get("behavior") or "")
        match = _HTTP_STATUS_RE.search(behavior)
        if match:
            codes.add(int(match.group(1)))
    return codes


@pytest.mark.asyncio
async def test_meta_contract_declared_endpoints_exist_in_routes() -> None:
    contracts_index = await list_contract_endpoints()
    analysis_contract = await get_prompt_analysis_contract(current_user=_user_with_defaults())
    authoring_contract = await get_prompt_authoring_contract(current_user=_user_with_defaults())

    declared_path_only: List[Tuple[str, str]] = []
    declared_method_paths: List[Tuple[str, str, str]] = []

    for contract in contracts_index.contracts:
        if contract.endpoint:
            declared_path_only.append((f"{contract.id}.endpoint", contract.endpoint))
        for sub in contract.sub_endpoints:
            if not sub.path.startswith("/api/"):
                continue
            declared_method_paths.append(
                (f"{contract.id}.{sub.id}", sub.method.upper(), sub.path)
            )

    declared_path_only.append(("prompts.analysis.analyze_endpoint", analysis_contract.endpoint))

    for endpoint in authoring_contract.endpoints:
        declared_method_paths.append(
            (f"prompts.authoring.{endpoint.id}", endpoint.method.upper(), endpoint.path)
        )
    for check in authoring_contract.pre_authoring_checks:
        declared_method_paths.append(
            (
                f"prompts.authoring.precheck.{check.id}",
                check.endpoint.method.upper(),
                check.endpoint.path,
            )
        )

    all_declared_paths = [
        _normalize_path(path) for _, path in declared_path_only
    ] + [
        _normalize_path(path) for _, _, path in declared_method_paths
    ]
    route_index = _build_route_index_for_paths(all_declared_paths)
    indexed_paths = {path for _, path in route_index}

    missing_paths = [
        (label, _normalize_path(path))
        for label, path in declared_path_only
        if _normalize_path(path) not in indexed_paths
    ]
    missing_method_paths = [
        (label, method, _normalize_path(path))
        for label, method, path in declared_method_paths
        if (method, _normalize_path(path)) not in route_index
    ]

    assert not missing_paths, f"Declared contract paths missing in routes: {missing_paths}"
    assert (
        not missing_method_paths
    ), f"Declared contract method/path endpoints missing in routes: {missing_method_paths}"


@pytest.mark.asyncio
async def test_prompt_authoring_precheck_contract_refs_resolve() -> None:
    contracts_index = await list_contract_endpoints()
    authoring_contract = await get_prompt_authoring_contract(current_user=_user_with_defaults())

    contracts_by_id = {contract.id: contract for contract in contracts_index.contracts}
    authoring_endpoints_by_id = {endpoint.id: endpoint for endpoint in authoring_contract.endpoints}

    for check in authoring_contract.pre_authoring_checks:
        if not check.contract_ref:
            continue

        assert (
            check.contract_ref in contracts_by_id
        ), f"pre_authoring_check '{check.id}' references missing contract '{check.contract_ref}'"

        if check.contract_ref == "prompts.authoring":
            endpoint = authoring_endpoints_by_id.get(check.endpoint.id)
            assert endpoint is not None, (
                f"pre_authoring_check '{check.id}' references missing authoring endpoint id "
                f"'{check.endpoint.id}'"
            )
            assert endpoint.method == check.endpoint.method
            assert endpoint.path == check.endpoint.path
            continue

        contract = contracts_by_id[check.contract_ref]
        sub_endpoints_by_id = {endpoint.id: endpoint for endpoint in contract.sub_endpoints}
        endpoint = sub_endpoints_by_id.get(check.endpoint.id)
        assert endpoint is not None, (
            f"pre_authoring_check '{check.id}' references endpoint id '{check.endpoint.id}' "
            f"that is not exposed by contract '{check.contract_ref}'"
        )
        assert endpoint.method == check.endpoint.method
        assert endpoint.path == check.endpoint.path


@pytest.mark.asyncio
async def test_prompt_contract_examples_validate_against_schemas() -> None:
    analysis_contract = await get_prompt_analysis_contract(current_user=_user_with_defaults())
    authoring_contract = await get_prompt_authoring_contract(current_user=_user_with_defaults())

    authoring_endpoints_by_method_path = {
        (endpoint.method.upper(), _normalize_path(endpoint.path)): endpoint
        for endpoint in authoring_contract.endpoints
    }

    for example in authoring_contract.examples:
        request = example.get("request")
        assert isinstance(request, dict), f"Authoring example missing request object: {example}"

        method = request.get("method")
        path = request.get("path")
        assert isinstance(method, str) and method.strip(), f"Missing method in example: {example}"
        assert isinstance(path, str) and path.strip(), f"Missing path in example: {example}"

        endpoint = authoring_endpoints_by_method_path.get((method.upper(), _normalize_path(path)))
        assert endpoint is not None, (
            f"Authoring example references unknown endpoint method/path: "
            f"{method} {path}"
        )

        schema_attr = _AUTHORING_REQUEST_SCHEMA_BY_ENDPOINT_ID.get(endpoint.id)
        if not schema_attr:
            continue

        body = request.get("body")
        assert isinstance(body, dict), (
            f"Authoring example for '{endpoint.id}' must include request.body object"
        )

        schema = getattr(authoring_contract, schema_attr)
        errors = _validation_errors(body, schema)
        assert not errors, (
            f"Authoring example '{example.get('name', '<unnamed>')}' does not match "
            f"{schema_attr}: {errors}"
        )

    candidate_schemas = [
        ("analysis.request_schema", analysis_contract.request_schema),
        ("authoring.create_version_request_schema", authoring_contract.create_version_request_schema),
    ]
    for example in analysis_contract.examples:
        request = example.get("request")
        assert isinstance(request, dict), f"Analysis example missing request object: {example}"

        first_errors: List[str] = []
        valid = False
        for schema_name, schema in candidate_schemas:
            errors = _validation_errors(request, schema)
            if not errors:
                valid = True
                break
            first_errors.append(f"{schema_name}: {errors[0]}")

        assert valid, (
            f"Analysis example '{example.get('name', '<unnamed>')}' does not validate "
            f"against any declared request schema. First errors: {first_errors}"
        )


@pytest.mark.asyncio
async def test_prompt_deprecation_status_matches_runtime() -> None:
    analysis_contract = await get_prompt_analysis_contract(current_user=_user_with_defaults())
    authoring_contract = await get_prompt_authoring_contract(current_user=_user_with_defaults())

    analysis_codes = _extract_deprecation_status_codes(
        analysis_contract.deprecations,
        field=_DEPRECATION_FIELD_PROMPT_ANALYSIS,
    )
    authoring_codes = _extract_deprecation_status_codes(
        authoring_contract.deprecations,
        field=_DEPRECATION_FIELD_PROMPT_ANALYSIS,
    )

    assert analysis_codes, "No HTTP status code declared in analysis deprecation behavior."
    assert authoring_codes, "No HTTP status code declared in authoring deprecation behavior."
    assert analysis_codes == authoring_codes, (
        f"Deprecation HTTP status mismatch across contracts: "
        f"analysis={analysis_codes}, authoring={authoring_codes}"
    )
    expected_status = next(iter(authoring_codes))

    class _ServiceStub:
        async def get_family(self, _family_id: Any) -> object:
            return object()

        async def create_version(self, **_kwargs: Any) -> object:
            raise AssertionError("create_version should not be reached for deprecated payloads")

    original_service = prompt_families.PromptVersionService
    prompt_families.PromptVersionService = lambda _db: _ServiceStub()
    try:
        request = CreatePromptVersionRequest(
            prompt_text="A prompt with deprecated provider hint usage",
            provider_hints={"prompt_analysis": {"legacy": True}},
        )
        with pytest.raises(HTTPException) as exc:
            await prompt_families.create_version(
                family_id=uuid4(),
                request=request,
                db=object(),
                user=SimpleNamespace(email="meta-contract@test.local"),
            )
    finally:
        prompt_families.PromptVersionService = original_service

    assert exc.value.status_code == expected_status
