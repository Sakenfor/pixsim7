# Database & Logging

Documentation for database setup, migrations, and structured logging.

## Database Management

- **[DATABASE.md](./DATABASE.md)** - Database migrations guide for Alembic
  - Migration basics
  - Running migrations
  - Creating new migrations

- **[TIMESCALEDB_SETUP.md](./TIMESCALEDB_SETUP.md)** - TimescaleDB setup for time-series log storage
  - TimescaleDB installation
  - Configuration
  - Time-series optimization

## Logging & Monitoring

- **[LOGGING_STRUCTURE.md](./LOGGING_STRUCTURE.md)** - Unified structured logging across services
  - Logging architecture
  - Log structure
  - Service integration

- **[LOG_FILTERING_AND_SETTINGS.md](./LOG_FILTERING_AND_SETTINGS.md)** - Log filtering configuration and dynamic settings
  - Filtering configuration
  - Dynamic settings
  - Runtime adjustments

- **[LOG_VIEWER_FIELD_METADATA_API.md](./LOG_VIEWER_FIELD_METADATA_API.md)** - Log viewer field metadata and inference system
  - Field metadata
  - Log viewer API
  - Field type inference

---

**Related:** See [../infrastructure/](../infrastructure/) for backend architecture and deployment information.
