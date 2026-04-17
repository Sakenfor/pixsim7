# Duration Constraints Update Summary

**Date**: 2025-10-22
**Status**: ✅ Complete

---

## Changes Made

### 1. Fixed Duration Validation

**Regular Videos** (`GenerationOptions`):
- **Before**: `duration: int = Field(default=5, ge=1, le=60)`
- **After**: `duration: Literal[4, 5, 8] = Field(default=5)`
- **Reason**: Pixverse API only accepts 4, 5, or 8 seconds

**Transition Videos** (`TransitionOptions`):
- **Before**: `durations: str = Field(default="5")`
- **After**: `durations: Union[int, List[int]] = Field(default=5)` with validator
- **Reason**: Each segment must be 1-5 seconds, proper type safety

### 2. Updated Transition Implementation

**API Client** (`pixverse/api/client.py`):
- ✅ Validates 2-7 images
- ✅ Validates N-1 prompts for N images
- ✅ Validates N-1 durations for N images
- ✅ Each duration validated to be 1-5 seconds
- ✅ Uses correct endpoint: `/creative_platform/video/transition`
- ✅ Uses correct field: `customer_img_urls` (not `image_urls`)
- ✅ Requires JWT token (Web API only)

### 3. Added Comprehensive Documentation

**New Files**:
- `DURATION_AND_TRANSITIONS.md` - Complete guide with examples
- `DURATION_UPDATE_SUMMARY.md` - This file

**Updated Files**:
- `README.md` - Added duration constraints section
- `pixverse/models.py` - Updated with proper validation

---

## What Users Need to Know

### Regular Videos

```python
# ✅ Valid durations
video = client.create(prompt="...", duration=4)
video = client.create(prompt="...", duration=5)  # Default
video = client.create(prompt="...", duration=8)

# ❌ Invalid - will raise ValidationError
video = client.create(prompt="...", duration=6)
video = client.create(prompt="...", duration=10)
```

### Transition Videos

```python
# ✅ Correct usage
transition = client.transition(
    image_urls=["img1.jpg", "img2.jpg", "img3.jpg"],  # 3 images
    prompts=["transition 1", "transition 2"],          # 2 prompts (N-1)
    durations=[3, 4]                                   # 2 durations (N-1)
)

# ✅ Single duration for all segments
transition = client.transition(
    image_urls=["img1.jpg", "img2.jpg"],
    prompts=["fade"],
    durations=5  # Same duration for all
)

# ❌ Wrong number of prompts
transition = client.transition(
    image_urls=["img1.jpg", "img2.jpg", "img3.jpg"],  # 3 images
    prompts=["only one"]                               # Need 2!
)  # Error: Expected 2 prompts for 3 images, got 1

# ❌ Duration out of range
transition = client.transition(
    image_urls=["img1.jpg", "img2.jpg"],
    prompts=["fade"],
    durations=10  # Must be 1-5!
)  # Error: Duration must be between 1 and 5 seconds
```

---

## Files Modified

1. **pixverse/models.py**
   - `GenerationOptions.duration`: Changed to `Literal[4, 5, 8]`
   - `TransitionOptions.durations`: Changed to `Union[int, List[int]]` with validator
   - Added `field_validator` for transition durations

2. **pixverse/api/client.py**
   - `create_transition()`: Complete rewrite
   - Added validation for image count (2-7)
   - Added validation for prompt count (N-1)
   - Added validation for duration count (N-1)
   - Added duration list preparation
   - Fixed endpoint and field names

3. **README.md**
   - Added "Duration Constraints" section
   - Updated transition example
   - Added notes about N-1 requirement

4. **New Documentation**
   - `DURATION_AND_TRANSITIONS.md` - Comprehensive guide
   - `DURATION_UPDATE_SUMMARY.md` - This file

---

## Breaking Changes

### If You Were Using:

**Flexible durations (1-60s)**:
```python
# Before (worked but shouldn't have)
video = client.create(prompt="...", duration=10)

# After (will raise error)
video = client.create(prompt="...", duration=10)
# ValidationError: duration must be 4, 5, or 8

# Fix: Use valid duration
video = client.create(prompt="...", duration=8)
```

**String durations for transitions**:
```python
# Before
transition = client.transition(..., durations="3,4,5")

# After (will raise error)
# Fix: Use list
transition = client.transition(..., durations=[3, 4, 5])
```

---

## Testing Checklist

- [x] Regular video with duration=4
- [x] Regular video with duration=5 (default)
- [x] Regular video with duration=8
- [ ] Regular video with invalid duration (should error)
- [ ] Transition with 2 images, 1 prompt, 1 duration
- [ ] Transition with 3 images, 2 prompts, 2 durations
- [ ] Transition with single duration (int)
- [ ] Transition with duration list
- [ ] Transition with wrong number of prompts (should error)
- [ ] Transition with invalid duration (should error)
- [ ] Transition with API key (should error - needs JWT)

---

## Benefits

1. **Type Safety** ✅
   - Pydantic validates at creation time
   - Clear error messages
   - IDE autocomplete shows valid values

2. **Matches API Reality** ✅
   - No guessing if duration will work
   - Prevents API errors from invalid durations
   - Documented constraints

3. **Better UX** ✅
   - Errors happen early (Python validation)
   - Not after slow API call
   - Clear error messages with hints

4. **Correct Transitions** ✅
   - Proper validation of N-1 relationship
   - Type-safe duration handling
   - Matches PixSim3 implementation exactly

---

## Summary

| Aspect | Status |
|--------|--------|
| Duration validation | ✅ Complete |
| Transition validation | ✅ Complete |
| Documentation | ✅ Complete |
| API implementation | ✅ Complete |
| Examples updated | ✅ Complete |
| Testing ready | ✅ Ready |

**All duration constraints now properly enforced!** 🎯
