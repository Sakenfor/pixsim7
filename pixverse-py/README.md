# Pixverse Python SDK

A Python SDK for Pixverse AI video and image generation services.

## Installation

For local development:

```bash
pip install -e /path/to/pixverse-py
```

## Features

- **Video Models**: Support for v3.5, v4, v5, and v5.5 models
- **Image Models**: Standard, Pro, and Ultra image generation
- **Camera Movements**: Comprehensive camera movement presets for image-to-video
- **Generation Options**: Type-safe generation parameters with validation
- **UI Metadata**: Operation-specific field mappings for building dynamic UIs

## UI Metadata Contract

### Overview

The SDK provides UI metadata through `get_video_operation_fields()` and `VIDEO_OPERATION_FIELDS`. This is the **authoritative source** for which generation parameters apply to which video operations.

UI frameworks and backend adapters should **always** use this metadata rather than hardcoding parameter lists.

### Who Should Use This

- **Backend Adapters**: Use `get_video_operation_fields()` to map generic operations to provider-specific parameters
- **Frontend UI Frameworks**: Use operation field lists to determine which input controls to show for each operation type
- **Validation Logic**: Use `validate_operation_params()` to verify parameter dictionaries before API calls

### Basic Usage

```python
from pixverse import get_video_operation_fields, VideoModel, ImageModel, CameraMovement

# Get fields for a specific operation
text_to_video_fields = get_video_operation_fields("text_to_video")
# Returns: ["model", "quality", "duration", "aspect_ratio", "seed", ...]

image_to_video_fields = get_video_operation_fields("image_to_video")
# Returns: ["model", "quality", "duration", "seed", "camera_movement", ...]
# Note: NO "aspect_ratio" - follows source image

video_extend_fields = get_video_operation_fields("video_extend")
# Returns: ["model", "quality", "duration", "seed", "multi_shot", "audio", "off_peak"]
```

### Supported Operations

- **`text_to_video`**: Generate video from text prompt
  - Includes `aspect_ratio` (can be explicitly chosen)
  - Includes standard options plus `multi_shot`, `audio`, `off_peak`

- **`image_to_video`**: Animate an image into video
  - **No `aspect_ratio`** - follows source image dimensions
  - Includes `camera_movement` (exclusive to this operation)
  - Includes `multi_shot`, `audio`, `off_peak`

- **`video_extend`**: Extend an existing video
  - **No `aspect_ratio`** - follows source video
  - Includes `multi_shot`, `audio`, `off_peak`

### Key Differences Between Operations

| Field | text_to_video | image_to_video | video_extend |
|-------|---------------|----------------|--------------|
| `aspect_ratio` | ✅ Yes | ❌ No (follows image) | ❌ No (follows video) |
| `camera_movement` | ❌ No | ✅ Yes | ❌ No |
| `multi_shot` (v5.5+) | ✅ Yes | ✅ Yes | ✅ Yes |
| `audio` (v5.5+) | ✅ Yes | ✅ Yes | ✅ Yes |
| `off_peak` | ✅ Yes | ✅ Yes | ✅ Yes |

### Adding New Fields or Operations

When adding new features to the SDK:

1. **Add the field to `GenerationOptions`** in `models.py`
   ```python
   class GenerationOptions(BaseModel):
       # ... existing fields ...
       new_feature: Optional[bool] = Field(default=False, description="...")
   ```

2. **Update `VIDEO_OPERATION_FIELDS`** to include it in relevant operations
   ```python
   VIDEO_OPERATION_FIELDS = {
       "text_to_video": [
           # ... existing fields ...
           "new_feature",
       ],
       # ... other operations ...
   }
   ```

3. **Update backend adapters** to map the new field to API parameters
   - Add field spec in adapter's `video_field_specs` dictionary
   - The adapter's `_fields_for()` helper will automatically pick it up

4. **Frontend UIs** will automatically:
   - See the new field via `/api/v1/providers` endpoint
   - Render appropriate input controls based on field type (boolean → checkbox, etc.)

### Validation

```python
from pixverse import validate_operation_params

# Valid parameters
params = {"model": "v5", "quality": "720p", "duration": 5}
valid, error = validate_operation_params("text_to_video", params)
# Returns: (True, None)

# Invalid: aspect_ratio on image_to_video
params = {"aspect_ratio": "16:9", "camera_movement": "zoom_in"}
valid, error = validate_operation_params("image_to_video", params)
# Returns: (False, "Invalid fields for image_to_video: aspect_ratio")
```

### Model Capabilities

```python
from pixverse import get_model_capabilities

# Check what features are available for a model
caps = get_model_capabilities("v5.5")
# Returns: {"multi_shot": True, "audio": True, "camera_movement": True, ...}

caps = get_model_capabilities("v5")
# Returns: {"multi_shot": False, "audio": False, "camera_movement": True, ...}
```

## Data Models

### VideoModel

```python
from pixverse import VideoModel

# Access all available models
models = VideoModel.ALL  # ["v3.5", "v4", "v5", "v5.5"]
default = VideoModel.DEFAULT  # "v5"

# Use constants
model = VideoModel.V5_5
```

### ImageModel

```python
from pixverse import ImageModel

# Access all available image models
models = ImageModel.ALL  # ["standard", "pro", "ultra"]

# Get supported qualities per model
qualities = ImageModel.QUALITIES
# {
#   "standard": ["360p", "540p", "720p"],
#   "pro": ["540p", "720p", "1080p"],
#   "ultra": ["720p", "1080p"]
# }

# Get supported aspect ratios
aspects = ImageModel.ASPECT_RATIOS  # ["16:9", "9:16", "1:1"]
```

### CameraMovement

```python
from pixverse import CameraMovement

# All available camera movements (for image_to_video)
movements = CameraMovement.ALL
# ["zoom_in", "zoom_out", "pan_left", "pan_right", ...]

# Use constants
movement = CameraMovement.ZOOM_IN
```

### GenerationOptions

```python
from pixverse import GenerationOptions

# Create generation options
options = GenerationOptions(
    model="v5.5",
    quality="1080p",
    duration=10,
    aspect_ratio="16:9",
    multi_shot=True,  # v5.5+ only
    audio=True,       # v5.5+ only
    off_peak=False,
)

# Use with validation
from pydantic import ValidationError
try:
    options = GenerationOptions(duration=25)  # Invalid: max is 20
except ValidationError as e:
    print(e)
```

## Backend Adapter Integration

Example of using the SDK in a backend adapter:

```python
from pixverse import get_video_operation_fields, VideoModel, ImageModel, CameraMovement

def get_operation_parameter_spec(self) -> dict:
    """Build parameter specs dynamically from SDK metadata"""

    # Get available models from SDK
    video_models = list(VideoModel.ALL)
    default_model = VideoModel.DEFAULT

    # Define field specs (map GenerationOptions fields to UI metadata)
    video_field_specs = {
        "model": {
            "name": "model",
            "type": "enum",
            "enum": video_models,
            "default": default_model,
            "description": "Video model version",
        },
        "quality": {...},
        "duration": {...},
        # ... other field specs ...
    }

    # Build operation specs using SDK metadata
    def _fields_for(operation: str, fallback: list[str]) -> list[dict]:
        try:
            field_names = get_video_operation_fields(operation)
        except Exception:
            field_names = fallback

        return [video_field_specs[name] for name in field_names
                if name in video_field_specs]

    return {
        "text_to_video": {
            "parameters": [prompt_spec] + _fields_for("text_to_video", [])
        },
        "image_to_video": {
            "parameters": [prompt_spec, image_url_spec] + _fields_for("image_to_video", [])
        },
        # ...
    }
```

## Frontend UI Integration

Example of using parameter specs in a React component:

```typescript
// Fetch provider specs from backend
const specs = await fetch('/api/v1/providers').then(r => r.json());

// Extract parameters for current operation
const operationSpec = specs.pixverse.operations.text_to_video;
const params = operationSpec.parameters;

// Filter out prompt/source fields
const settingParams = params.filter(p =>
  !['prompt', 'image_url', 'video_url'].includes(p.name)
);

// Split into primary (inline) and advanced (popover)
const PRIMARY_PARAMS = ['model', 'quality', 'duration', 'aspect_ratio'];
const primaryParams = settingParams.filter(p => PRIMARY_PARAMS.includes(p.name));
const advancedParams = settingParams.filter(p => !PRIMARY_PARAMS.includes(p.name));

// Render controls
{primaryParams.map(param => (
  param.type === 'enum' ?
    <Select options={param.enum} value={params[param.name]} /> :
    <Input type={param.type} value={params[param.name]} />
))}

// Advanced toggles (multi_shot, audio, off_peak, etc.)
{advancedParams.map(param => (
  param.type === 'boolean' ?
    <Checkbox checked={params[param.name]} label={param.description} /> :
    <Input type={param.type} value={params[param.name]} />
))}
```

## Contributing

When contributing to the SDK:

1. Always update `VIDEO_OPERATION_FIELDS` when adding new fields to `GenerationOptions`
2. Update this README's tables and examples
3. Ensure backward compatibility by providing fallback values
4. Add validation logic to `validate_operation_params()` for new constraints

## License

MIT License
