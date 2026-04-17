# Duration and Transitions Guide

**Date**: 2025-10-22
**Important**: Pixverse has specific constraints on durations and transitions

---

## Video Duration Constraints

### Regular Videos (Text-to-Video, Image-to-Video)

**Allowed values**: `4`, `5`, or `8` seconds **only**

```python
from pixverse import PixverseClient

client = PixverseClient(session={"jwt_token": "..."})

# Valid durations
video = client.create(prompt="...", duration=4)   # ✅ OK
video = client.create(prompt="...", duration=5)   # ✅ OK (default)
video = client.create(prompt="...", duration=8)   # ✅ OK

# Invalid durations
video = client.create(prompt="...", duration=3)   # ❌ Error: must be 4, 5, or 8
video = client.create(prompt="...", duration=10)  # ❌ Error: must be 4, 5, or 8
```

**Default**: `5` seconds

**Why these values?**
- Pixverse API only accepts these specific durations
- Trying other values will result in validation errors

---

## Transition Videos

Transitions have different duration rules than regular videos.

### Transition Duration Constraints

**Each segment**: `1` to `5` seconds
**Total number of segments**: N-1 (for N images)

```python
from pixverse import PixverseClient

client = PixverseClient(session={"jwt_token": "..."})

# Example: 3 images → 2 transitions
images = [
    "https://media.pixverse.ai/img1.jpg",
    "https://media.pixverse.ai/img2.jpg",
    "https://media.pixverse.ai/img3.jpg"
]

prompts = [
    "smooth morph from beach to mountains",
    "gentle fade from mountains to forest"
]  # N-1 prompts for N images

# Option 1: Same duration for all segments
video = client.transition(
    image_urls=images,
    prompts=prompts,
    durations=5  # Each transition is 5 seconds
)

# Option 2: Different duration per segment
video = client.transition(
    image_urls=images,
    prompts=prompts,
    durations=[3, 4]  # First transition 3s, second 4s
)
```

### Transition Requirements

1. **Image Count**: 2-7 images
2. **Prompts**: N-1 prompts for N images
3. **Durations**: N-1 durations for N images
4. **Duration Range**: Each segment 1-5 seconds
5. **Auth**: Requires JWT token (Web API only, not available with API key)

### Examples

#### 2 Images (1 Transition)
```python
video = client.transition(
    image_urls=["img1.jpg", "img2.jpg"],
    prompts=["smooth transition"],
    durations=4  # or [4]
)
# Result: 1 transition of 4 seconds
```

#### 3 Images (2 Transitions)
```python
video = client.transition(
    image_urls=["img1.jpg", "img2.jpg", "img3.jpg"],
    prompts=["fade to next", "morph to final"],
    durations=[3, 5]  # First transition 3s, second 5s
)
# Result: 2 transitions, total ~8 seconds
```

#### 4 Images (3 Transitions)
```python
video = client.transition(
    image_urls=["img1.jpg", "img2.jpg", "img3.jpg", "img4.jpg"],
    prompts=["transition 1", "transition 2", "transition 3"],
    durations=5  # All transitions 5 seconds
)
# Result: 3 transitions, total ~15 seconds
```

---

## Validation Errors

### Regular Videos

```python
# ❌ Wrong duration
video = client.create(prompt="...", duration=6)
# Error: duration must be 4, 5, or 8
```

### Transitions

```python
# ❌ Too many images
video = client.transition(
    image_urls=[...],  # 8 images
    prompts=[...]
)
# Error: Transition requires 2-7 images, got 8

# ❌ Wrong number of prompts
video = client.transition(
    image_urls=["img1.jpg", "img2.jpg", "img3.jpg"],  # 3 images
    prompts=["only one prompt"]  # Need 2 prompts!
)
# Error: Expected 2 prompts for 3 images, got 1

# ❌ Duration out of range
video = client.transition(
    image_urls=["img1.jpg", "img2.jpg"],
    prompts=["transition"],
    durations=10  # Must be 1-5!
)
# Error: Duration must be between 1 and 5 seconds, got 10

# ❌ Using API key (not JWT)
client = PixverseClient(session={"api_key": "..."})
video = client.transition(...)
# Error: JWT token required for transition API
```

---

## Implementation Details

### GenerationOptions Model

```python
class GenerationOptions(BaseModel):
    model: str = "v5"
    quality: str = "360p"
    duration: Literal[4, 5, 8] = 5  # Only 4, 5, or 8 allowed
    seed: Optional[int] = None
    aspect_ratio: Optional[str] = None
```

### TransitionOptions Model

```python
class TransitionOptions(BaseModel):
    model: str = "v5"
    quality: str = "360p"
    durations: Union[int, List[int]] = 5

    @field_validator('durations')
    def validate_durations(cls, v):
        # Single int: must be 1-5
        # List: each must be 1-5
        ...
```

### API Endpoint

**Regular Videos**:
- `/creative_platform/video/i2v` (Web API)
- `/openapi/v2/video/img/generate` (OpenAPI)

**Transitions**:
- `/creative_platform/video/transition` (Web API only)
- Requires `customer_img_urls`, `prompts`, `durations` fields
- Not available via OpenAPI

---

## Migration from Old Code

### If you had flexible duration (1-60s)

**Before**:
```python
video = client.create(prompt="...", duration=10)  # Any value
```

**After**:
```python
video = client.create(prompt="...", duration=8)  # Must be 4, 5, or 8
```

### If you used string durations for transitions

**Before**:
```python
video = client.transition(
    ...,
    durations="3,4,5"  # String format
)
```

**After**:
```python
video = client.transition(
    ...,
    durations=[3, 4, 5]  # List of ints
)
```

---

## Best Practices

### For Regular Videos

1. **Use default (5s)** for most cases
2. **Use 4s** for quick previews
3. **Use 8s** for longer scenes

### For Transitions

1. **Start with default (5s)** for all segments
2. **Use shorter (2-3s)** for quick cuts
3. **Use longer (4-5s)** for smooth morphs
4. **Match duration to transition style**:
   - Fast cuts: 1-2s
   - Normal transitions: 3-4s
   - Slow morphs: 4-5s

---

## Summary

| Feature | Duration Constraint |
|---------|-------------------|
| Regular Video | 4, 5, or 8 seconds only |
| Transition Segment | 1-5 seconds per segment |
| Transition Total | Depends on number of segments |
| Default (Regular) | 5 seconds |
| Default (Transition) | 5 seconds per segment |

**Remember**:
- Regular videos: `duration in [4, 5, 8]`
- Transition segments: `1 <= duration <= 5`
- Transitions need: `(N images) → (N-1 prompts) → (N-1 durations)`
- Transitions require JWT token (Web API only)

---

**Status**: Complete ✅
**Library Version**: Enforces these constraints via Pydantic validation
