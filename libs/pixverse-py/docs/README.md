# Pixverse Python SDK Documentation

Documentation for the Pixverse Python SDK.

## 📚 Documentation Index

### Getting Started
- **[Main README](../README.md)** - Quick start guide and basic usage
- **[Setup Guide](SETUP_GUIDE.md)** - Installation and configuration
- **[Changelog](../CHANGELOG.md)** - Version history and release notes

### Technical Reference
- **[API Reference](PIXVERSE_API_REFERENCE.md)** - Complete Pixverse API documentation
  - Endpoints, request/response formats
  - Authentication methods
  - Status codes and error handling

### Development
- **[TODO](../TODO.md)** - Roadmap and upcoming features
- **[Contributing](../README.md#contributing)** - How to contribute

## 📁 Archive

Historical session notes and feature summaries are archived in [`archive/`](archive/):
- Session summaries from development
- Feature implementation notes
- Integration plans

These files are kept for reference but are not actively maintained.

## 🏗️ Project Structure

```
pixverse-py/
├── README.md                 # Main documentation
├── TODO.md                   # Roadmap
├── CHANGELOG.md              # Version history
├── docs/
│   ├── README.md             # This file
│   ├── PIXVERSE_API_REFERENCE.md
│   ├── SETUP_GUIDE.md
│   └── archive/              # Historical docs
├── pixverse/                 # Source code
│   ├── api/                  # API modules
│   │   ├── client.py         # Core HTTP client
│   │   ├── video.py          # Video operations
│   │   ├── credits.py        # Credits & account
│   │   ├── upload.py         # Media upload
│   │   └── fusion.py         # Fusion operations
│   ├── auth/                 # Authentication
│   ├── models.py             # Data models
│   └── client.py             # High-level client
├── tests/                    # Test suite
└── examples/                 # Usage examples
```

## 🔗 Quick Links

- **GitHub Repository**: https://github.com/Sakenfor/pixverse-py
- **Issue Tracker**: https://github.com/Sakenfor/pixverse-py/issues
- **Discussions**: https://github.com/Sakenfor/pixverse-py/discussions

## 📝 Notes

### Recent Updates (2025-11-16)
- Refactored API client from 1220 lines to modular structure (542 lines main + 4 modules)
- Reorganized documentation (archived old session notes)
- Improved README with architecture section
- Updated TODO with current priorities

### Code Organization Philosophy
The SDK follows a modular architecture where each module has a single responsibility:
- **Separation of concerns**: Video, credits, upload, and fusion operations are in separate files
- **Maintainability**: Smaller files are easier to understand and modify
- **Testability**: Each module can be tested independently
- **Extensibility**: New features can be added to appropriate modules without affecting others
