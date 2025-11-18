"""
Field metadata discovery and inference for dynamic log filtering.
Handles API-based metadata discovery with intelligent fallback to pattern-based inference.
"""
import re
import requests


def get_field_metadata(fields, service, api_url, timeout=2):
    """
    Get field metadata from API or infer it intelligently.

    Args:
        fields: List of available field names
        service: Service name
        api_url: Base API URL
        timeout: Request timeout in seconds

    Returns:
        dict with 'primary', 'contextual', and 'relationships' keys
    """
    # Try to get metadata from API first
    try:
        resp = requests.get(
            f"{api_url}/api/v1/logs/field-metadata",
            params={"service": service},
            timeout=timeout
        )
        if resp.status_code == 200:
            data = resp.json()
            # Backend provides full metadata
            return {
                'primary': data.get('primary', []),
                'contextual': data.get('contextual', []),
                'relationships': data.get('relationships', {})
            }
    except Exception:
        pass  # Fall back to inference

    # Intelligent inference based on field patterns
    return infer_field_metadata(fields, service)


def infer_field_metadata(fields, service):
    """
    Intelligently infer field categories and relationships from field names.

    Uses heuristics and patterns to classify fields and determine relationships.

    Args:
        fields: List of field names
        service: Service name (for context)

    Returns:
        dict with 'primary', 'contextual', and 'relationships' keys
    """
    primary = []
    contextual = []
    relationships = {}

    # Heuristics for identifying primary fields (identifiers)
    primary_patterns = [
        r'_id$',  # Ends with _id (job_id, user_id, etc.)
        r'^id$',  # Exactly 'id'
    ]

    # Heuristics for contextual fields (details/attributes)
    contextual_patterns = [
        r'^attempt$', r'^retry', r'^status$', r'^stage$',
        r'^operation_type$', r'^method$', r'^state$'
    ]

    # Classify fields
    for field in fields:
        # Check if it's a primary field
        is_primary = any(re.search(pattern, field) for pattern in primary_patterns)
        # Check if it's a contextual field
        is_contextual = any(re.search(pattern, field) for pattern in contextual_patterns)

        if is_primary:
            primary.append(field)
        elif is_contextual:
            contextual.append(field)
        else:
            # If uncertain, default to contextual
            contextual.append(field)

    # Infer relationships based on field semantics
    relationships = infer_field_relationships(primary, contextual)

    return {
        'primary': primary,
        'contextual': contextual,
        'relationships': relationships
    }


def infer_field_relationships(primary_fields, contextual_fields):
    """
    Infer which contextual fields should appear when primary fields are filled.

    Args:
        primary_fields: List of primary field names
        contextual_fields: List of contextual field names

    Returns:
        dict mapping primary field names to lists of related contextual fields
    """
    relationships = {}

    # Common contextual fields
    common_contextual = ['stage', 'status', 'operation_type']

    for pfield in primary_fields:
        related = []

        # Job-related IDs show job details
        if 'job' in pfield:
            related.extend([f for f in contextual_fields
                          if f in ['attempt', 'stage', 'operation_type', 'status', 'retry_count']])

        # Artifact-related IDs show artifact details
        elif 'artifact' in pfield:
            related.extend([f for f in contextual_fields
                          if f in ['retry_count', 'status', 'operation_type']])

        # Asset-related IDs show asset details
        elif 'asset' in pfield:
            related.extend([f for f in contextual_fields
                          if f in ['operation_type', 'status', 'stage']])

        # Request-related IDs show request details
        elif 'request' in pfield:
            related.extend([f for f in contextual_fields
                          if f in ['stage', 'operation_type', 'status', 'method']])

        # Provider-related IDs show provider details
        elif 'provider' in pfield:
            related.extend([f for f in contextual_fields
                          if f in ['attempt', 'stage', 'operation_type', 'status']])

        # User-related IDs might show user activity details
        elif 'user' in pfield:
            related.extend([f for f in contextual_fields
                          if f in ['operation_type', 'status', 'method']])

        # Default: show common contextual fields
        if not related:
            related.extend([f for f in contextual_fields if f in common_contextual])

        if related:
            relationships[pfield] = list(set(related))  # Remove duplicates

    return relationships


def discover_fields(service_name, api_url, cache, timeout=2):
    """
    Auto-discover fields for a service by requesting /api/v1/logs/fields.
    Falls back to static mapping if request fails. Results are cached.

    Args:
        service_name: Name of the service
        api_url: Base API URL
        cache: Dictionary to cache results
        timeout: Request timeout in seconds

    Returns:
        List of field names
    """
    # Check cache first
    if service_name in cache:
        return cache[service_name]

    try:
        resp = requests.get(
            f"{api_url}/api/v1/logs/fields",
            params={"service": service_name},
            timeout=timeout
        )
        if resp.status_code == 200:
            data = resp.json()
            fields = data.get('fields', [])
            # Remove base fields that aren't useful for filtering
            base_skip = {"id", "timestamp", "level", "service", "env", "msg", "error", "error_type", "created_at"}
            result = [f for f in fields if f not in base_skip]
            cache[service_name] = result  # Cache the result
            return result
    except Exception:
        pass

    # Fallback to static mapping
    result = get_service_fields_fallback().get(service_name, [])
    cache[service_name] = result  # Cache fallback too
    return result


def get_service_fields_fallback():
    """Fallback static field mapping when API is unavailable."""
    return {
        'api': ['request_id', 'user_id', 'provider_id', 'stage', 'operation_type'],
        'worker': ['job_id', 'provider_job_id', 'attempt', 'stage'],
        'game': ['stage', 'operation_type'],
        'test': ['stage'],
    }
