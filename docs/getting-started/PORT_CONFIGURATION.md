# Port Configuration Guide

## ⚠️ CRITICAL FOR AI ASSISTANTS & DEVELOPERS

**The backend API runs on port 8001, NOT 8000!**

This document clarifies all port configuration to avoid confusion.

---

## Port Overview

| Service | Port | Environment Variable | Where Used |
|---------|------|---------------------|------------|
| **Backend API** | **8001** | `PORT=8001` | `pixsim7/backend/main/shared/config.py` |
| **Admin Panel** | **8002** | `ADMIN_PORT=8002` | Admin SvelteKit dev server |
| PostgreSQL | 5434 | `POSTGRES_PORT=5434` | Docker compose |
| Redis | 6380 | `REDIS_PORT=6380` | Docker compose |

---

## Backend Port Configuration

### The Correct Variable: `PORT`

The backend reads **`PORT`** from `.env` (not `BACKEND_PORT`):

```env
# ✅ CORRECT - Backend uses this
PORT=8001

# ❌ WRONG - This doesn't exist in config.py
BACKEND_PORT=8001
```

### Why 8001?

- **Port 8000** - Used by PixSim6 (our old version)
- **Port 8001** - Used by PixSim7 (to avoid conflicts)
- **Port 8002** - Admin panel dev server

### Code Reference

In `pixsim7/backend/main/shared/config.py`:

```python
class Settings(BaseSettings):
    # This field reads the PORT environment variable
    port: int = Field(
        default=8001,
        description="Port to bind to"
    )
```

Pydantic automatically maps the field name `port` to the environment variable `PORT` (case-insensitive).

---

## Common Mistakes to Avoid

### ❌ Hardcoding Port 8000

```python
# WRONG
API_BASE = 'http://localhost:8000/api'
```

```python
# CORRECT
from lib.config import ADMIN_API_BASE
API_BASE = ADMIN_API_BASE  # Uses environment variable
```

### ❌ Using BACKEND_PORT Variable

```env
# WRONG - This variable doesn't exist in Settings
BACKEND_PORT=8001
```

```env
# CORRECT - Backend actually reads this
PORT=8001
```

### ❌ Forgetting CORS Configuration

If you add a new frontend port, update CORS in `.env`:

```env
CORS_ORIGINS=http://localhost:5173,http://localhost:8001,http://localhost:8002
```

---

## Admin Panel API Configuration

The admin panel should use the centralized config:

### File: `admin/src/lib/config.ts`

```typescript
// Backend API base URL
export const API_BASE_URL = 'http://localhost:8001';
export const ADMIN_API_BASE = `${API_BASE_URL}/api`;
```

### Environment Variable

In `admin/.env`:

```env
VITE_API_URL=http://localhost:8001/api/v1
```

---

## Testing

### Quick Port Check

```bash
# Check if backend is running
curl http://localhost:8001/health

# Check admin panel
curl http://localhost:8002

# Check all listening ports
netstat -ano | findstr "LISTENING"
```

### Expected Output

```
TCP    0.0.0.0:5434     ...    LISTENING    # PostgreSQL
TCP    0.0.0.0:6380     ...    LISTENING    # Redis
TCP    0.0.0.0:8001     ...    LISTENING    # Backend (if running)
TCP    0.0.0.0:8002     ...    LISTENING    # Admin panel (if running)
```

---

## Docker Configuration

### Internal vs External Ports

When running in Docker, there are TWO port concepts:

```yaml
# docker-compose.yml
services:
  backend:
    ports:
      - "8001:8000"  # external:internal
```

- **External (8001)**: What you access from your host machine
- **Internal (8000)**: What the container listens on internally

```env
# .env
PORT=8001                      # Used when running outside Docker
BACKEND_INTERNAL_PORT=8000     # Used inside Docker container
```

---

## Troubleshooting

### "Failed to fetch" Errors

1. Check backend is actually running:
   ```bash
   curl http://localhost:8001/health
   ```

2. Check the admin panel is using the correct API URL:
   ```bash
   cat admin/.env
   # Should show: VITE_API_URL=http://localhost:8001/api/v1
   ```

3. Verify no port conflicts:
   ```bash
   netstat -ano | findstr "8001"
   ```

### Backend Won't Start (Port in Use)

```bash
# Find what's using port 8001
netstat -ano | findstr "8001"

# Kill the process (replace PID)
taskkill /PID 12345 /F
```

---

## Summary for AI Assistants

When writing code or configuration:

1. **Backend API port is 8001**, not 8000
2. Use `PORT=8001` in `.env`, not `BACKEND_PORT`
3. Use `ADMIN_API_BASE` from `lib/config.ts` instead of hardcoding
4. Backend config is in `pixsim7/backend/main/shared/config.py`
5. Admin panel config is in `admin/src/lib/config.ts`

**Never hardcode `http://localhost:8000` anywhere in the codebase!**
