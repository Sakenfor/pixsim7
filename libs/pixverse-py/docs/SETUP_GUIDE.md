# pixverse-py Setup Guide

## 🎉 Project Created!

The complete `pixverse-py` standalone library structure has been created.

## 📁 Project Structure

```
pixverse-py/
├── pixverse/                  # Main package
│   ├── __init__.py           # Public API exports
│   ├── client.py             # PixverseClient (main interface)
│   ├── accounts.py           # Account & AccountPool (rotation)
│   ├── models.py             # Pydantic models (Video, Account, Options)
│   ├── exceptions.py         # Custom exceptions
│   │
│   ├── auth/                 # Authentication strategies
│   │   ├── __init__.py
│   │   ├── base.py           # BaseAuthStrategy, PixverseAuth
│   │   └── email_password.py # Email/password auth
│   │
│   └── api/                  # Low-level API client
│       ├── __init__.py
│       └── client.py         # PixverseAPI (HTTP client)
│
├── tests/                     # Test suite
│   ├── __init__.py
│   ├── test_client.py
│   └── test_accounts.py
│
├── examples/                  # Usage examples
│   ├── simple.py             # Single account example
│   ├── account_pool.py       # Multi-account rotation
│   └── all_operations.py     # All operations demo
│
├── docs/                      # Documentation (empty for now)
├── pyproject.toml            # Project metadata & dependencies
├── README.md                 # Main documentation
├── LICENSE                   # MIT License
├── CHANGELOG.md              # Version history
└── .gitignore                # Git ignore patterns
```

## 🚀 Next Steps

### 1. Extract Real Pixverse Code

Copy authentication and API code from PixSim3:

```bash
# Copy auth strategies
cp ../pixsim3_repo/pixsim3/plugins/providers/pixverse/auth/strategies/google_oauth.py \
   pixverse/auth/google_oauth.py

# Copy API implementation details
# Review: ../pixsim3_repo/pixsim3/plugins/providers/pixverse/api/client.py
# Extract relevant code to pixverse/api/client.py
```

### 2. Update API Endpoints

Currently using placeholder URLs. Update in:
- `pixverse/auth/email_password.py` - Line 15: `BASE_URL`
- `pixverse/api/client.py` - Line 12: `BASE_URL`

Get actual Pixverse API endpoints from PixSim3 plugin.

### 3. Test Locally

```bash
# Install in development mode
cd pixverse-py
pip install -e ".[dev]"

# Run tests
pytest

# Try examples
python examples/simple.py
```

### 4. Build & Publish

```bash
# Build package
python -m build

# Upload to PyPI (test first)
twine upload --repository testpypi dist/*

# Upload to production PyPI
twine upload dist/*
```

## 🔧 What's Implemented

### ✅ Complete

1. **Project Structure** - Full package layout
2. **Client Interface** - `PixverseClient` with all operations
3. **Account Management** - `Account` and `AccountPool` with rotation
4. **Models** - Type-safe Pydantic models
5. **Exceptions** - Custom error classes
6. **Documentation** - README with examples
7. **Tests** - Basic test suite
8. **Examples** - Usage examples
9. **Packaging** - pyproject.toml configured

### ⏳ Needs Real Implementation

1. **Auth Strategies** - Currently skeleton, need actual Pixverse auth
2. **API Client** - Placeholder endpoints, need real API calls
3. **Response Parsing** - Need actual Pixverse response format
4. **Additional Auth** - Google OAuth, session refresh, etc.

## 📝 Key Features

### Account Rotation

```python
from pixverse import PixverseClient, AccountPool

pool = AccountPool([
    {"email": "user1@gmail.com", "password": "pass1"},
    {"email": "user2@gmail.com", "password": "pass2"},
], strategy="round_robin")

client = PixverseClient(account_pool=pool)

# Automatically rotates accounts!
video = client.create(prompt="a cat")
```

### Strategies

- **round_robin**: Cycle through accounts in order
- **least_used**: Pick account with lowest usage
- **random**: Random selection
- **weighted**: Weighted by success rate

### Rate Limit Handling

```python
# Automatically retries with next account on rate limit
try:
    video = client.create(prompt="a cat")
except RateLimitError as e:
    print(f"All accounts rate limited! Retry after {e.retry_after}s")
```

## 🔍 Code Review Checklist

Before real implementation:

- [ ] Review PixSim3 pixverse plugin auth code
- [ ] Extract actual API endpoints
- [ ] Get real request/response formats
- [ ] Add Google OAuth strategy
- [ ] Add session persistence
- [ ] Implement polling for video status
- [ ] Add async version (optional)
- [ ] Complete test coverage
- [ ] Add integration tests

## 📦 Installation (After Publishing)

```bash
# From PyPI (once published)
pip install pixverse-py

# With async support
pip install pixverse-py[async]

# Development install
pip install pixverse-py[dev]
```

## 🎯 Usage

```python
from pixverse import PixverseClient

client = PixverseClient(email="...", password="...")
video = client.create(prompt="a cat dancing")
print(video.url)
```

## 📚 Documentation

- Main: `README.md`
- Changelog: `CHANGELOG.md`
- Examples: `examples/`
- Tests: `tests/`

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Make changes
4. Run tests: `pytest`
5. Submit pull request

## 📄 License

MIT License - See `LICENSE` file

---

**Status**: ✅ **Structure Complete**
**Next**: Extract real Pixverse API implementation from PixSim3
