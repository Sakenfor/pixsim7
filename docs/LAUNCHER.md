# Quick Launch Guide

## Single Command Start

### Windows

```bash
# Just double-click or run:
launch.bat
```

This will:
1. ✅ Start PostgreSQL & Redis (Docker)
2. ✅ Create database if needed
3. ✅ Start admin panel (http://localhost:8002)
4. ✅ Open browser automatically

**From the admin panel you can:**
- Start/stop backend & worker
- View real-time service status
- Monitor logs with advanced filtering
- Check system metrics
- Manage all services from one place

## What the Launcher Does

```
launch.bat
  ↓
  1. Checks .env exists (creates from .env.example if not)
  2. Creates data directories
  3. Starts Docker databases (postgres, redis)
  4. Creates pixsim7 database if needed
  5. Installs npm deps (first time only)
  6. Starts admin panel on port 8002
  7. Opens http://localhost:8002 in browser
```

## Service Management from Web UI

Once the admin panel is running, navigate to:

**http://localhost:8002/services**

From there you can:

### Control Individual Services
- **PostgreSQL** - Start/Stop/Restart
- **Redis** - Start/Stop/Restart
- **Backend API** - Start/Stop/Restart
- **Worker** - Start/Stop/Restart

### Quick Actions
- "Start Databases" - Starts Postgres + Redis
- "Start Backend & Worker" - Starts both at once
- "Stop Backend & Worker" - Stops both at once

### Monitor Processes
- Real-time process list
- CPU and memory usage
- Process IDs (PIDs)
- Process status

## No More Command Line Management!

**Before:**
```bash
# Terminal 1
docker-compose up -d postgres redis

# Terminal 2
set PYTHONPATH=...
python pixsim7_backend\main.py

# Terminal 3
set PYTHONPATH=...
arq pixsim7_backend.workers...

# Lost track? Zombie processes!
```

**After:**
```bash
# Just this:
launch.bat

# Then use web UI to manage everything!
```

## Access Points

Once launched:

- **Admin Panel**: http://localhost:8002
  - Dashboard: http://localhost:8002/
  - Services: http://localhost:8002/services
  - Logs: http://localhost:8002/logs

- **API** (after starting from web UI): http://localhost:8001/docs

- **Via ZeroTier**:
  - Admin: http://10.243.48.125:8002
  - API: http://10.243.48.125:8001/docs

## Stopping Everything

**Option 1: From Web UI**
1. Go to http://localhost:8002/services
2. Click "Stop Backend & Worker"
3. Close admin panel terminal (Ctrl+C)
4. Stop databases: `docker-compose -f docker-compose.db-only.yml down`

**Option 2: Quick Stop**
```bash
# Stop admin panel (Ctrl+C in terminal)
# Stop databases
docker-compose -f docker-compose.db-only.yml down
```

## First Time Setup

The launcher handles everything automatically, but if you need to do it manually:

1. **Install Node.js** (if not installed)
2. **Install Docker** (if not installed)
3. **Copy .env**: `copy .env.example .env`
4. **Run launcher**: `launch.bat`

That's it!

## Troubleshooting

### "npm not found"
- Install Node.js from https://nodejs.org

### "docker not found"
- Install Docker Desktop from https://docker.com

### Port 8002 already in use
- Edit `admin/vite.config.ts` and change port
- Or stop whatever is using port 8002

### Can't start backend from web UI
- Check backend logs in admin panel
- Ensure databases are running (green status)
- Try restarting from web UI

### Services show as "stopped" but they're running
- Refresh the page
- Check process list at bottom of Services page
- PIDs shown = services are actually running

## Tips

1. **Bookmark the admin panel**: http://localhost:8002
2. **Use Services page for everything**: No need for command line
3. **Check Logs page** for troubleshooting
4. **Auto-refresh is ON** by default - status updates every 5 seconds

## What Gets Started Automatically

| Service | Auto-Start | Why |
|---------|-----------|-----|
| PostgreSQL | ✅ Yes | Required for admin panel to work |
| Redis | ✅ Yes | Required for admin panel to work |
| Admin Panel | ✅ Yes | That's what the launcher is for! |
| Backend API | ❌ No | Start from web UI when needed |
| Worker | ❌ No | Start from web UI when needed |

**Why backend/worker aren't auto-started:**
- You might be developing/debugging them
- Prevents zombie processes
- More control over when they run
- Can start/stop from web UI

## Advanced: Full Docker Mode

If you want everything in Docker instead:

```bash
# Don't use launch.bat, use this instead:
scripts\start-all.bat
```

This starts everything (databases + backend + worker) in Docker.

But you lose the ability to manage them from the web UI.

---

**TL;DR**: Just run `launch.bat` and manage everything from http://localhost:8002/services
