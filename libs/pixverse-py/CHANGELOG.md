# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2024-10-22

### Added
- Initial release of pixverse-py
- PixverseClient for video generation
- Support for text-to-video, image-to-video, extend, and transition operations
- AccountPool for multi-account rotation
- Multiple rotation strategies (round_robin, least_used, random, weighted)
- Automatic rate limit handling with account switching
- Type-safe models using Pydantic
- Comprehensive error handling
- Session management and persistence
- Full documentation and examples

### Features
- Simple API for video generation
- Built-in account rotation
- Automatic retry with backoff
- Type hints throughout
- Pydantic models for validation
- Multiple authentication strategies (email/password supported)

[1.0.0]: https://github.com/pixsim/pixverse-py/releases/tag/v1.0.0
