# Pixverse Python SDK

Official Python SDK for Pixverse AI video generation.

[![PyPI version](https://badge.fury.io/py/pixverse-py.svg)](https://badge.fury.io/py/pixverse-py)
[![Python 3.9+](https://img.shields.io/badge/python-3.9+-blue.svg)](https://www.python.org/downloads/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- ✨ **Simple API** - Easy-to-use interface for video generation
- 🔄 **Account Rotation** - Built-in support for multiple accounts with automatic rotation
- 🚀 **Rate Limit Handling** - Automatic retry with account switching on rate limits
- 🔐 **Multiple Auth Methods** - Email/password, Google OAuth, session refresh
- ⚡ **Fast Session Refresh** - JWT validation without browser (falls back to Playwright)
- 🌐 **Playwright Support** - Browser automation for Google OAuth (optional)
- 🎯 **Type Safe** - Full type hints and Pydantic models
- 📝 **Well Documented** - Comprehensive documentation and examples

## Installation

```bash
# Basic installation
pip install pixverse-py

# With Playwright support (for Google OAuth, browser-based auth)
pip install pixverse-py[playwright]

# Full installation (all features)
pip install pixverse-py[full]
```

After installing with playwright:
```bash
playwright install chromium
```

## Quick Start

### Single Account

```python
from pixverse import PixverseClient

# Initialize client
client = PixverseClient(
    email="your.email@gmail.com",
    password="your_password"
)

# Generate video (defaults: model="v5", quality="360p")
video = client.create(
    prompt="a cat dancing in the rain",
    duration=5
)

print(f"Video URL: {video.url}")

# Wait for completion
completed = client.wait_for_completion(video, timeout=300)
print(f"Completed: {completed.url}")
```

### Multiple Accounts with Rotation

```python
from pixverse import PixverseClient, AccountPool

# Create account pool
pool = AccountPool(
    accounts=[
        {"email": "account1@gmail.com", "password": "pass1"},
        {"email": "account2@gmail.com", "password": "pass2"},
        {"email": "account3@gmail.com", "password": "pass3"},
    ],
    strategy="round_robin"  # or "least_used", "random", "weighted"
)

# Initialize client with pool
client = PixverseClient(account_pool=pool)

# Generate videos - automatically rotates accounts!
for i in range(10):
    video = client.create(prompt=f"video {i}")
    print(f"Video {i}: {video.url}")

# Check pool statistics
stats = client.get_pool_stats()
print(f"Total usage: {stats['total_usage']}")
print(f"Success rate: {stats['success_rate']:.2%}")
```

## Default Settings

The library uses these defaults for all operations:
- **Model**: `v5` (latest model)
- **Quality**: `360p` (fast generation, lower cost)
- **Duration**: `5` seconds

### Duration Constraints

**Regular videos** (text-to-video, image-to-video):
- Must be **4, 5, or 8 seconds** (Pixverse API constraint)
- Default: 5 seconds

**Transition videos**:
- Each segment: **1-5 seconds**
- Requires N-1 durations for N images
- Default: 5 seconds per segment

See `DURATION_AND_TRANSITIONS.md` for details.

## Operations

### Text-to-Video

```python
# Use defaults (model="v5", quality="360p", duration=5)
video = client.create(
    prompt="a peaceful mountain landscape"
)

# Or customize (duration must be 4, 5, or 8)
video = client.create(
    prompt="a beautiful sunset over the ocean",
    model="v5",
    quality="720p",
    duration=8  # 4, 5, or 8 only
)
```

### Image-to-Video

```python
video = client.image_to_video(
    image_url="https://example.com/image.jpg",
    prompt="the scene starts moving, waves crashing",
    duration=5
)
```

### Extend Video

```python
extended = client.extend(
    video_url="https://pixverse.ai/videos/abc123",
    prompt="the camera zooms out to reveal mountains",
    duration=5
)
```

### Transition

**Note**: Transitions require N-1 prompts and N-1 durations for N images. Each segment: 1-5 seconds.

```python
# 3 images → 2 prompts → 2 transitions
transition = client.transition(
    image_urls=[
        "https://example.com/img1.jpg",
        "https://example.com/img2.jpg",
        "https://example.com/img3.jpg"
    ],
    prompts=["smooth morph", "gentle fade"],  # N-1 prompts for N images
    durations=[3, 3]  # N-1 durations, 1-5 seconds each (or single int for all)
)
```

## Account Rotation Strategies

### Round Robin
Cycles through accounts in order:
```python
pool = AccountPool(accounts, strategy="round_robin")
```

### Least Used
Picks account with lowest usage count:
```python
pool = AccountPool(accounts, strategy="least_used")
```

### Random
Picks random account:
```python
pool = AccountPool(accounts, strategy="random")
```

### Weighted
Weighted random based on success rate:
```python
pool = AccountPool(accounts, strategy="weighted")
```

## Session Management

```python
# Login and save session
client = PixverseClient(email="...", password="...")
session = client.auth.login("email", "password")

# Save session to file
import json
with open("session.json", "w") as f:
    json.dump(session, f)

# Later: restore session
with open("session.json") as f:
    session = json.load(f)

client = PixverseClient(session=session)
```

## Error Handling

```python
from pixverse import (
    PixverseClient,
    RateLimitError,
    AuthenticationError,
    GenerationError
)

client = PixverseClient(email="...", password="...")

try:
    video = client.create(prompt="a cat")
except RateLimitError as e:
    print(f"Rate limited! Retry after {e.retry_after}s")
except AuthenticationError as e:
    print(f"Auth failed: {e}")
except GenerationError as e:
    print(f"Generation failed: {e}")
```

## Advanced Usage

### UI metadata helpers

The SDK exposes lightweight helpers so adapters and UI frameworks can stay in
sync with Pixverse options without hard-coding per-operation logic:

```python
from pixverse import (
    get_video_operation_fields,
    get_model_capabilities,
    VideoModel,
    ImageModel,
    CameraMovement,
)

# Which GenerationOptions fields apply to each operation?
text_to_video_fields = get_video_operation_fields("text_to_video")
image_to_video_fields = get_video_operation_fields("image_to_video")
video_extend_fields = get_video_operation_fields("video_extend")

# Model-level capabilities (v5.5 vs v5, etc.)
caps_v5_5 = get_model_capabilities(VideoModel.V5_5)
caps_v5 = get_model_capabilities(VideoModel.V5)

print("v5.5 supports multi_shot:", caps_v5_5["multi_shot"])
print("v5 supports multi_shot:", caps_v5["multi_shot"])
```

This metadata is what PixSim7 uses to:
- Decide which fields to expose for `text_to_video` vs `image_to_video` vs `video_extend`.
- Hide `aspect_ratio` for image-to-video / extend (framing follows the source).
- Show advanced toggles like `multi_shot`, `audio`, and `off_peak` only when meaningful.

### Custom Retry Logic

```python
from pixverse import PixverseClient, AccountPool

pool = AccountPool([...])
client = PixverseClient(account_pool=pool)

# Pool automatically handles retries across accounts
# If all accounts are rate limited, raises RateLimitError
```

### Pool Statistics

```python
stats = client.get_pool_stats()
print(f"Total accounts: {stats['total_accounts']}")
print(f"Active accounts: {stats['active_accounts']}")
print(f"Rate limited: {stats['rate_limited_accounts']}")
print(f"Total usage: {stats['total_usage']}")
print(f"Success rate: {stats['success_rate']:.2%}")
```

## Development

### Install for Development

```bash
git clone https://github.com/pixsim/pixverse-py
cd pixverse-py
pip install -e ".[dev]"
```

### Run Tests

```bash
pytest
```

### Format Code

```bash
black pixverse/
ruff check pixverse/
```

## Requirements

- Python 3.9+
- requests
- pydantic

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Architecture

The SDK is organized into modular components for better maintainability:

```
pixverse/
├── api/
│   ├── client.py     # Core HTTP client (542 lines)
│   ├── video.py      # Video operations (create, extend, transition, get, list)
│   ├── credits.py    # Credits & account info
│   ├── upload.py     # Media upload
│   └── fusion.py     # Fusion video operations
├── auth/             # Authentication strategies
├── models.py         # Pydantic models
└── client.py         # High-level user-facing client
```

**Benefits of modular structure:**
- Easy to navigate and find specific functionality
- Simpler to add new endpoints
- Better testability (test each module independently)
- Reduced cognitive load (smaller, focused files)

## Documentation

- 📖 [API Reference](docs/PIXVERSE_API_REFERENCE.md) - Complete API documentation
- 🚀 [Setup Guide](docs/SETUP_GUIDE.md) - Installation and configuration
- 📝 [TODO](TODO.md) - Roadmap and upcoming features
- 📜 [Changelog](CHANGELOG.md) - Version history

## Support

- 🐛 [Issue Tracker](https://github.com/Sakenfor/pixverse-py/issues)
- 💬 [Discussions](https://github.com/Sakenfor/pixverse-py/discussions)
