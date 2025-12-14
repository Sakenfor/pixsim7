# TimescaleDB Setup for Log Ingestion

**Separate, optimized database for high-performance log storage**

## 🎯 Why TimescaleDB?

TimescaleDB is a PostgreSQL extension optimized for time-series data (like logs):

- ✅ **10x better compression** - Saves disk space
- ✅ **Faster time-range queries** - Optimized for log queries
- ✅ **Automatic partitioning** - By time (day/week/month)
- ✅ **Automatic retention** - Auto-delete old logs
- ✅ **PostgreSQL compatible** - Same SQL, same tools
- ✅ **Performance isolation** - Log writes don't affect app queries

## 🚀 Quick Start

### **Option 1: Docker Compose (Recommended)**

```bash
# 1. Start databases (PostgreSQL + TimescaleDB)
docker-compose -f docker-compose.db-only.yml up -d

# 2. Set environment variables
export DATABASE_URL=postgresql://pixsim:pixsim123@localhost:5435/pixsim7
export LOG_DATABASE_URL=postgresql://pixsim:pixsim123@localhost:5436/pixsim7_logs

# 3. Run migrations
PYTHONPATH=. alembic upgrade head

# 4. Start API
PYTHONPATH=. python -m uvicorn pixsim7.backend.main.main:app --port 8001
```

**That's it!** Logs now go to TimescaleDB automatically.

---

### **Option 2: Use Same Database (Development)**

If you don't set `LOG_DATABASE_URL`, it falls back to the main database:

```bash
# Only set main database URL
export DATABASE_URL=postgresql://pixsim:pixsim123@localhost:5435/pixsim7
# LOG_DATABASE_URL not set → uses DATABASE_URL

# Run migrations
PYTHONPATH=. alembic upgrade head

# Start API
PYTHONPATH=. python -m uvicorn pixsim7.backend.main.main:app --port 8001
```

**Works for dev/small deployments!**

---

## 📦 What's Running?

After `docker-compose up`:

| Service | Port | Database | Purpose |
|---------|------|----------|---------|
| **postgres** | 5435 | `pixsim7` | Application data (jobs, users, assets) |
| **timescaledb** | 5436 | `pixsim7_logs` | Log storage (optimized for time-series) |
| **redis** | 6380 | - | Cache + job queue |

---

## 🔧 Configuration

### Environment Variables

```bash
# Application database
DATABASE_URL=postgresql://pixsim:pixsim123@localhost:5435/pixsim7

# Logs database (optional - falls back to DATABASE_URL if not set)
LOG_DATABASE_URL=postgresql://pixsim:pixsim123@localhost:5436/pixsim7_logs

# Redis
REDIS_URL=redis://localhost:6380/0
```

### .env Example

```bash
# Application Database
DATABASE_URL=postgresql://pixsim:pixsim123@localhost:5435/pixsim7

# Logs Database (TimescaleDB)
LOG_DATABASE_URL=postgresql://pixsim:pixsim123@localhost:5436/pixsim7_logs

# Redis
REDIS_URL=redis://localhost:6380/0

# Optional: Auto-forward logs to ingestion endpoint
PIXSIM_LOG_INGESTION_URL=http://localhost:8001/api/v1/logs/ingest/batch
```

---

## 📊 TimescaleDB Features

### Automatic Retention

Old logs are automatically deleted after 90 days:

```sql
-- Configured automatically by migration
SELECT add_retention_policy('log_entries', INTERVAL '90 days');
```

### Automatic Compression

Logs older than 7 days are compressed (10x smaller):

```sql
-- Configured automatically by migration
ALTER TABLE log_entries SET (timescaledb.compress);
SELECT add_compression_policy('log_entries', INTERVAL '7 days');
```

### Time-Based Partitioning

Data is automatically partitioned by time for faster queries:

```sql
-- Query logs for today (super fast!)
SELECT * FROM log_entries
WHERE timestamp >= NOW() - INTERVAL '1 day';
```

---

## 🧪 Verify Setup

### Check TimescaleDB is Running

```bash
docker exec pixsim7-logs-db psql -U pixsim -d pixsim7_logs -c "SELECT extname, extversion FROM pg_extension WHERE extname = 'timescaledb';"
```

Expected output:
```
   extname   | extversion
-------------+------------
 timescaledb | 2.13.0
```

### Check Hypertable

```bash
docker exec pixsim7-logs-db psql -U pixsim -d pixsim7_logs -c "SELECT hypertable_name, num_dimensions FROM timescaledb_information.hypertables;"
```

Expected output:
```
 hypertable_name | num_dimensions
-----------------+----------------
 log_entries     |              1
```

### Check Retention Policy

```bash
docker exec pixsim7-logs-db psql -U pixsim -d pixsim7_logs -c "SELECT * FROM timescaledb_information.jobs WHERE proc_name = 'policy_retention';"
```

Should show a retention job configured.

---

## 📈 Performance Comparison

### Same Database vs Separate TimescaleDB

| Metric | Same DB | TimescaleDB |
|--------|---------|-------------|
| **Disk Usage** | 1 GB/day | 100 MB/day (10x compression) |
| **Query Speed** | Slow for large ranges | Fast (partitioned) |
| **Write Impact** | Slows app queries | Zero impact |
| **Retention** | Manual deletion | Automatic cleanup |
| **Scalability** | Limited | Excellent |

---

## 🛠️ Management

### Connect to Logs Database

```bash
# Via Docker
docker exec -it pixsim7-logs-db psql -U pixsim -d pixsim7_logs

# Or direct connection
psql postgresql://pixsim:pixsim123@localhost:5436/pixsim7_logs
```

### Manual Cleanup (if needed)

```bash
# Delete logs older than 30 days
psql postgresql://pixsim:pixsim123@localhost:5436/pixsim7_logs -c "
  DELETE FROM log_entries WHERE timestamp < NOW() - INTERVAL '30 days';
"
```

### Check Database Size

```bash
docker exec pixsim7-logs-db psql -U pixsim -d pixsim7_logs -c "
  SELECT pg_size_pretty(pg_database_size('pixsim7_logs'));
"
```

### View Compression Stats

```bash
docker exec pixsim7-logs-db psql -U pixsim -d pixsim7_logs -c "
  SELECT * FROM timescaledb_information.compressed_chunk_stats;
"
```

---

## 🔄 Migration Between Setups

### From Same DB to Separate TimescaleDB

1. **Export existing logs:**
   ```bash
   pg_dump -t log_entries postgresql://localhost:5435/pixsim7 > logs.sql
   ```

2. **Import to TimescaleDB:**
   ```bash
   psql postgresql://localhost:5436/pixsim7_logs < logs.sql
   ```

3. **Update environment:**
   ```bash
   export LOG_DATABASE_URL=postgresql://pixsim:pixsim123@localhost:5436/pixsim7_logs
   ```

4. **Restart services**

### From Separate DB back to Same DB

1. **Remove LOG_DATABASE_URL:**
   ```bash
   unset LOG_DATABASE_URL
   ```

2. **Restart services** - Will use main database

---

## 📚 Additional Resources

- [TimescaleDB Documentation](https://docs.timescale.com/)
- [TimescaleDB Best Practices](https://docs.timescale.com/use-timescale/latest/best-practices/)
- [Compression Guide](https://docs.timescale.com/use-timescale/latest/compression/)

---

## 🎉 Summary

**For Development:**
- Skip LOG_DATABASE_URL → Uses main database
- Simple, works fine for low volume

**For Production:**
- Set LOG_DATABASE_URL → Uses separate TimescaleDB
- 10x compression, automatic retention, zero impact on app

**Configuration is automatic** - Just set the environment variable!
