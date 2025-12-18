# Adding New Providers

This guide explains how to add a new video/image generation provider to PixSim7.
Adding a provider now requires **only implementing an adapter and manifest** - no changes
to workers, job processors, or core services.

## Overview

A provider consists of two files:
1. **Adapter** (`services/provider/adapters/<provider>.py`) - Implements the Provider interface
2. **Manifest** (`providers/<provider>/manifest.py`) - Defines metadata and registers the provider

The provider plugin system auto-discovers providers and registers them on startup.

## Quick Start

### 1. Create the Provider Directory

```bash
mkdir -p pixsim7/backend/main/providers/myprovider
touch pixsim7/backend/main/providers/myprovider/__init__.py
```

### 2. Create the Adapter

Create `pixsim7/backend/main/services/provider/adapters/myprovider.py`:

```python
"""
MyProvider adapter

Implements the Provider interface for MyProvider.ai
"""
from typing import Dict, Any, Optional
from pixsim7.backend.main.domain import OperationType, ProviderAccount, ProviderStatus, Generation
from pixsim7.backend.main.services.provider.base import (
    Provider,
    GenerationResult,
    ProviderStatusResult,
    ProviderError,
    AuthenticationError,
)


class MyProvider(Provider):
    """MyProvider implementation"""

    @property
    def provider_id(self) -> str:
        return "myprovider"

    @property
    def supported_operations(self) -> list[OperationType]:
        return [
            OperationType.TEXT_TO_VIDEO,
            OperationType.IMAGE_TO_VIDEO,
        ]

    def get_manifest(self):
        """Return provider manifest with domains and credit types."""
        from pixsim7.backend.main.domain.providers.schemas import ProviderManifest, ProviderKind
        return ProviderManifest(
            id="myprovider",
            name="My Provider",
            version="1.0.0",
            description="My custom provider",
            author="Your Name",
            kind=ProviderKind.VIDEO,
            domains=["myprovider.ai", "app.myprovider.ai"],
            credit_types=["web"],
            status_mapping_notes="1=completed, 2=processing, 3=failed",
        )

    def map_parameters(
        self,
        operation_type: OperationType,
        params: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Map generic parameters to provider-specific format."""
        mapped = {}
        if "prompt" in params:
            mapped["prompt"] = params["prompt"]
        if "quality" in params:
            mapped["quality"] = params["quality"]
        # Add your provider-specific mappings here
        return mapped

    async def execute(
        self,
        operation_type: OperationType,
        account: ProviderAccount,
        params: Dict[str, Any]
    ) -> GenerationResult:
        """Submit generation to provider."""
        # Implement your API call here
        # Return GenerationResult with provider_job_id

        response = await self._call_provider_api(account, params)

        return GenerationResult(
            provider_job_id=response["job_id"],
            status=ProviderStatus.PENDING,
        )

    async def check_status(
        self,
        account: ProviderAccount,
        provider_job_id: str,
        operation_type: Optional[OperationType] = None,
    ) -> ProviderStatusResult:
        """Check job status on provider."""
        # Implement status polling here

        response = await self._poll_status(account, provider_job_id)

        if response["status"] == "completed":
            return ProviderStatusResult(
                status=ProviderStatus.COMPLETED,
                video_url=response["output_url"],
            )
        elif response["status"] == "processing":
            return ProviderStatusResult(
                status=ProviderStatus.PROCESSING,
                progress=response.get("progress", 0.5),
            )
        else:
            return ProviderStatusResult(
                status=ProviderStatus.FAILED,
                error_message=response.get("error"),
            )

    async def extract_account_data(self, raw_data: dict, *, fallback_email: str = None) -> dict:
        """Parse auth data captured from browser."""
        cookies = raw_data.get("cookies") or {}
        token = cookies.get("auth_token") or raw_data.get("token")

        if not token:
            raise ValueError("MyProvider: token not found")

        email = raw_data.get("email") or fallback_email
        if not email:
            raise ValueError("MyProvider: email not found")

        return {
            "email": email,
            "jwt_token": token,
            "cookies": cookies,
        }
```

### 3. Create the Manifest

Create `pixsim7/backend/main/providers/myprovider/manifest.py`:

```python
"""
MyProvider Plugin

Auto-discovered and registered via provider plugin system.
"""
from pixsim7.backend.main.services.provider.adapters.myprovider import MyProvider
from pixsim7.backend.main.domain.providers.schemas import ProviderManifest, ProviderKind


manifest = ProviderManifest(
    id="myprovider",
    name="My Provider",
    version="1.0.0",
    description="My custom video generation provider",
    author="Your Name",
    kind=ProviderKind.VIDEO,
    enabled=True,
    requires_credentials=True,
    domains=["myprovider.ai", "app.myprovider.ai"],
    credit_types=["web"],
    status_mapping_notes="1=completed, 2=processing, 3=failed",
)


provider = MyProvider()


def on_register():
    from pixsim_logging import configure_logging
    logger = configure_logging("provider.myprovider")
    logger.info("MyProvider registered")
```

That's it! The provider will be auto-discovered on startup.

## Provider Interface Reference

### Required Methods

| Method | Description |
|--------|-------------|
| `provider_id` | Unique identifier (property) |
| `supported_operations` | List of OperationType values (property) |
| `map_parameters(operation_type, params)` | Convert generic params to provider format |
| `execute(operation_type, account, params)` | Submit generation, return GenerationResult |
| `check_status(account, job_id, operation_type?)` | Poll status, return ProviderStatusResult |

### Optional Methods

| Method | Description | When to Override |
|--------|-------------|------------------|
| `get_manifest()` | Return ProviderManifest | Always (for domains, credit types) |
| `prepare_execution_params(generation, params, resolve_fn)` | Resolve files for multipart | Providers needing local files |
| `requires_file_preparation()` | Return True if above is implemented | With prepare_execution_params |
| `extract_account_data(raw_data, fallback_email)` | Parse browser-captured auth | Web API providers |
| `get_operation_parameter_spec()` | Return UI form hints | For dynamic form generation |
| `estimate_credits(operation_type, params)` | Pre-submission credit estimate | Credit-aware providers |
| `compute_actual_credits(generation, duration)` | Post-completion credit calc | Credit-aware providers |
| `upload_asset(account, file_path)` | Upload media to provider | Cross-provider operations |
| `extract_embedded_assets(video_id, metadata)` | Extract source assets | For sync features |

## Status Mapping

Map your provider's status codes to `ProviderStatus`:

```python
from pixsim7.backend.main.domain import ProviderStatus

# In check_status():
if provider_code == 1:
    return ProviderStatusResult(status=ProviderStatus.COMPLETED, ...)
elif provider_code == 2:
    return ProviderStatusResult(status=ProviderStatus.PROCESSING, ...)
elif provider_code == 3:
    return ProviderStatusResult(status=ProviderStatus.FAILED, ...)
elif provider_code == 4:
    return ProviderStatusResult(status=ProviderStatus.FILTERED, ...)  # Content filtered
```

Document your status mapping in `manifest.status_mapping_notes`.

## File Preparation (Multipart Uploads)

For providers requiring local file uploads (like Remaker's inpainting):

```python
class MyProvider(Provider):
    def requires_file_preparation(self) -> bool:
        return True

    async def prepare_execution_params(
        self,
        generation: Generation,
        mapped_params: Dict[str, Any],
        resolve_source_fn,
    ) -> Dict[str, Any]:
        """Resolve URLs/asset refs to local file paths."""
        # resolve_source_fn signature:
        # async (source, user_id, default_suffix) -> (local_path, temp_paths)

        image_source = mapped_params.get("image_url")
        local_path, temp_paths = await resolve_source_fn(
            image_source,
            generation.user_id,
            ".jpg",
        )

        return {
            **mapped_params,
            "local_image_path": local_path,
            "_temp_paths": temp_paths,  # Will be cleaned up after execute()
        }
```

## Credit Types

Define credit types in your manifest:

```python
manifest = ProviderManifest(
    ...
    credit_types=["web", "premium", "api"],  # Provider-specific credit types
)
```

The billing system will use these to track credits properly.

## UI Parameter Specs

For dynamic form generation, implement `get_operation_parameter_spec()`:

```python
def get_operation_parameter_spec(self) -> dict:
    return {
        "text_to_video": {
            "parameters": [
                {"name": "prompt", "type": "string", "required": True, "group": "core"},
                {"name": "quality", "type": "string", "enum": ["360p", "720p", "1080p"], "default": "720p"},
                {"name": "duration", "type": "integer", "default": 5, "min": 1, "max": 60},
            ]
        },
        "image_to_video": {
            "parameters": [
                {"name": "prompt", "type": "string", "required": True},
                {"name": "image_url", "type": "string", "required": True},
            ]
        }
    }
```

## Checklist

Before deploying a new provider:

- [ ] Adapter implements all required methods
- [ ] Manifest includes domains for URL detection
- [ ] Manifest includes credit_types
- [ ] Status mapping is documented in status_mapping_notes
- [ ] `extract_account_data()` handles browser auth capture
- [ ] Error handling uses appropriate exceptions (AuthenticationError, QuotaExceededError, etc.)
- [ ] Test: Provider appears in `/api/v1/providers` response
- [ ] Test: URL detection works for provider domains
- [ ] Test: Generation lifecycle (submit → poll → complete) works

## Example Providers

Reference implementations:

- **Pixverse** (`adapters/pixverse.py`) - Full-featured SDK-based provider
- **Remaker** (`adapters/remaker.py`) - Web internal API with file uploads
- **Sora** (`adapters/sora.py`) - Polling-based video generation

## No Worker Changes Required

The provider system is designed so that:
- `job_processor.py` - Uses generic provider interface, no provider-specific code
- `status_poller.py` - Polls all providers uniformly via `check_status()`
- `provider_service.py` - Orchestrates execution via generic hooks

Adding a provider requires **no changes** to these files.
