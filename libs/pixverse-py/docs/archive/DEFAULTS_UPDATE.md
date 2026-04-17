# Defaults Update

**Date**: 2025-10-22
**Change**: Updated default model and quality settings

---

## Changes Made

### GenerationOptions Defaults

**Before**:
- Model: `v5` ✅ (already correct)
- Quality: `540p` ❌
- Duration: `5` seconds ✅

**After**:
- Model: `v5` ✅
- Quality: `360p` ✅ (changed)
- Duration: `5` seconds ✅

### Rationale

- **360p quality** provides:
  - Faster generation times
  - Lower credit cost per video
  - Good quality for previews and testing
  - Users can easily upgrade to 540p, 720p, or 1080p when needed

- **v5 model** provides:
  - Latest Pixverse model with best quality
  - Best motion and coherence

---

## Files Updated

1. **pixverse/models.py**
   - `GenerationOptions.quality` default: `540p` → `360p`
   - `TransitionOptions.quality` default: `540p` → `360p`

2. **README.md**
   - Updated quick start example to use defaults
   - Added "Default Settings" section explaining defaults

3. **examples/simple.py**
   - Updated to use defaults (removed explicit quality parameter)

4. **examples/all_operations.py**
   - Updated text-to-video example to use defaults

5. **QUICK_START_TESTING.md**
   - Updated all test examples to show default behavior
   - Added comments explaining defaults

---

## Usage Examples

### Using Defaults
```python
from pixverse import PixverseClient

client = PixverseClient(session={"jwt_token": "..."})

# Uses: model="v5", quality="360p", duration=5
video = client.create(prompt="A cat dancing")
```

### Overriding Defaults
```python
# High quality for final render
video = client.create(
    prompt="A cat dancing",
    quality="1080p",  # Override default 360p
    duration=8         # Override default 5s
)

# Different model
video = client.create(
    prompt="A cat dancing",
    model="v4",        # Override default v5
    quality="720p"     # Override default 360p
)
```

### Available Options

**Quality Options**:
- `360p` - Default (fastest, lowest cost)
- `540p` - Medium quality
- `720p` - High quality
- `1080p` - Maximum quality (slowest, highest cost)

**Model Options**:
- `v5` - Default (latest, best quality)
- `v4` - Previous version
- `v3.5` - Older version

**Duration**:
- Default: `5` seconds
- Range: `1` to `60` seconds
- Common values: 4, 5, 8, 10

---

## Impact

### Positive
- ✅ Faster generation times by default
- ✅ Lower credit usage for testing/development
- ✅ More economical for bulk operations
- ✅ Easy to upgrade quality when needed

### Minimal
- Users who want higher quality need to specify it explicitly
- Existing code with explicit `quality="540p"` continues to work unchanged

---

## Migration Guide

### For Existing Users

If you were relying on the old default of `540p`, you can:

**Option 1**: Specify quality explicitly
```python
video = client.create(
    prompt="...",
    quality="540p"  # Explicitly request old default
)
```

**Option 2**: Create wrapper function
```python
def create_hq(prompt, **kwargs):
    """Create video with 540p quality by default"""
    kwargs.setdefault('quality', '540p')
    return client.create(prompt, **kwargs)

video = create_hq("A cat dancing")
```

**Option 3**: Subclass GenerationOptions
```python
from pixverse.models import GenerationOptions

class MyGenerationOptions(GenerationOptions):
    quality: str = Field(default="540p")

# Use custom options class...
```

---

## Testing

All examples and documentation have been updated to reflect the new defaults. The library will now:

1. Generate videos at 360p by default
2. Use v5 model by default
3. Use 5-second duration by default

Users can override any of these at call time.

---

**Status**: Complete ✅
