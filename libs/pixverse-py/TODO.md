# TODO - Next Tasks

Updated: 2025-11-16 (After code refactoring)

## ✅ Recently Completed

- **Code Refactoring** - Split `pixverse/api/client.py` from 1220 → 542 lines
  - Created modular structure: `video.py`, `credits.py`, `upload.py`, `fusion.py`
  - 55% reduction in main client file size
  - Tests passing (23/24)

- **Documentation Cleanup** - Reorganized docs
  - Archived old session summaries to `docs/archive/`
  - Moved API reference to `docs/`

---

## 🔴 High Priority

### 1. Add WebAPI Upload Support
**Why:** OpenAPI upload requires API key, WebAPI (JWT) works for everyone

**Current Status:**
- ✅ OpenAPI upload: `POST /openapi/v2/image/upload` (requires API key)
- ❌ WebAPI upload: Missing (uses JWT, browser-based)

**Research Needed:**
1. Check Pixverse web app network tab when uploading image
2. Find WebAPI upload endpoint (likely `/creative_platform/...`)
3. Implement in `pixverse/api/upload.py`

**Files to Update:**
- `pixverse/api/upload.py` - Add WebAPI upload method
- `pixverse/client.py` - Auto-select WebAPI first, fallback to OpenAPI

---

### 2. Improve Test Coverage
**Current:** 31% coverage, 23/24 tests passing

**Priority Tests:**
1. `tests/test_video_utils.py` ✅ (already comprehensive)
2. `tests/test_api_video.py` - Test video operations with mocks
3. `tests/test_api_credits.py` - Test credits endpoints with mocks
4. `tests/test_api_upload.py` - Test upload with mock files
5. `tests/test_client.py` - Fix failing auth test (needs mocking)

**Target:** >70% coverage

---

### 3. Update README
**Changes Needed:**

1. **Show refactored structure:**
   ```
   pixverse/
   ├── api/
   │   ├── client.py     # Core HTTP client
   │   ├── video.py      # Video operations
   │   ├── credits.py    # Credits & account info
   │   ├── upload.py     # Media upload
   │   └── fusion.py     # Fusion videos
   ```

2. **Add session-based auth example** (most common usage):
   ```python
   from pixverse import PixverseClient

   client = PixverseClient(
       email="user@email.com",
       session={
           "jwt_token": "eyJ...",     # From browser cookies
           "openapi_key": "px_...",   # From dashboard (optional)
       }
   )
   ```

3. **Add upload examples:**
   - OpenAPI upload (with API key)
   - WebAPI upload (with JWT) - once implemented

4. **Link to docs:**
   - API Reference: `docs/PIXVERSE_API_REFERENCE.md`
   - Setup Guide: `docs/SETUP_GUIDE.md`

---

## 🟡 Medium Priority

### 4. Version Bump
**Current:** v1.0.0
**Proposed:** v1.1.0

**What's New:**
- Modular API structure (easier to maintain)
- `upload_media()` method (OpenAPI)
- Video dimension utilities
- Better documentation

**Update:**
- `pixverse/__init__.py` - `__version__ = "1.1.0"`
- `pyproject.toml` - `version = "1.1.0"`
- `CHANGELOG.md` - Add v1.1.0 entry

**Tag:**
```bash
git tag v1.1.0
git push origin v1.1.0
```

---

### 5. Add Examples
**Missing Examples:**
- `examples/upload_and_generate.py` - Upload + i2v workflow
- `examples/fusion_video.py` - Fusion video example
- `examples/session_auth.py` - Session-based authentication
- `examples/account_rotation.py` - Multi-account usage

---

### 6. API Documentation
**Create:** `docs/API.md` with:
- Full method signatures
- Parameter descriptions
- Return types
- Error handling
- Code examples for each method

**Auto-generate from docstrings?**
- Use Sphinx or pdoc3
- Publish to ReadTheDocs

---

## 🟢 Nice to Have

### 7. Additional Features
- **Batch generation** - Create multiple videos at once
- **Video templates** - Support template-based generation
- **Style presets** - List available style presets (OpenAPI endpoint exists)
- **Async client** - Add async/await support with aiohttp
- **CLI tool** - `pixverse generate "prompt"` command

### 8. Code Quality
- **Type checking** - Run mypy
- **Linting** - Configure ruff/black
- **Pre-commit hooks** - Auto-format on commit
- **CI/CD** - GitHub Actions for tests

### 9. Performance
- **Connection pooling** - Reuse HTTP connections
- **Caching** - Cache video status responses
- **Rate limiting** - Better rate limit handling

---

## 📋 Maintenance

### Regular Tasks
- [ ] Update dependencies monthly
- [ ] Review and close stale issues
- [ ] Update CHANGELOG.md with each release
- [ ] Monitor Pixverse API changes

### Documentation
- [ ] Keep README in sync with code
- [ ] Update examples when API changes
- [ ] Archive old session notes

---

## 🎯 Next Session Recommendations

**Option A: Testing & Quality (Recommended)**
1. Fix failing test (mock auth)
2. Add API operation tests
3. Reach >70% coverage

**Option B: Feature Complete**
1. Implement WebAPI upload
2. Add comprehensive examples
3. Version bump to v1.1.0

**Option C: Documentation**
1. Update README with new structure
2. Create API.md
3. Add more examples

---

## 📝 Notes

**Recent Refactoring Benefits:**
- Easier to find code (organized by responsibility)
- Simpler to add new endpoints (just add to appropriate module)
- Better testability (can test each module independently)
- Reduced cognitive load (smaller files)

**Key Files After Refactoring:**
```
pixverse/api/
├── client.py       542 lines (was 1220) - Core HTTP
├── video.py        497 lines - Video operations
├── credits.py      215 lines - Credits & account
├── upload.py       133 lines - Upload
└── fusion.py       172 lines - Fusion videos
```

**Test Status:**
- 23/24 passing (96% pass rate)
- 31% code coverage
- 1 failing test needs auth mocking
