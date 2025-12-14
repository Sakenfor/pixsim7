# PixSim7 Launcher Guide

Complete guide to using the PixSim7 Launcher for service management.

---

## Quick Start

### Windows - Single Command

```bash
# Double-click or run:
launch.bat
```

This will:
1. ✅ Start PostgreSQL & Redis (Docker)
2. ✅ Create database if needed
3. ✅ Start admin panel (http://localhost:8002)
4. ✅ Open browser automatically

---

## Startup Methods

The launcher can be started in different modes depending on your needs.

### Method 1: Auto-Detaching (Recommended)

**Best for most users** - Survives terminal closure

```batch
.\start-launcher.bat
```

**Features:**
- ✅ Survives terminal closure
- ✅ Auto-detects Python location
- ✅ Shows confirmation message
- ⚠️ Launcher window still visible

**How it works:**
1. Tries to use `pythonw.exe` (no console window)
2. Falls back to `python.exe` with detached start
3. You can close the terminal immediately
4. Services keep running!

### Method 2: Hidden Mode (Advanced)

**For users who want no windows at all**

```batch
start-launcher-hidden.vbs
```

Or double-click the file in Explorer.

**Features:**
- ✅ Completely hidden startup
- ✅ No console windows
- ✅ Survives terminal closure
- ⚠️ Harder to see if it's running

**How it works:**
1. Runs launcher with `pythonw.exe` in completely hidden mode
2. NO console window, NO launcher window initially
3. Launcher runs in background
4. Find it in system tray or Task Manager

### Method 3: Interactive (Quick Testing)

**For testing/debugging - DON'T USE for daily use**

```batch
.\launch.bat
# Choose option 8
```

⚠️ **Warning**: Services stop when you close the terminal!

---

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

---

## Service Management from Web UI

Once the admin panel is running, navigate to:

**http://localhost:8002/services**

### UI Organization

**Left Panel**: Service cards + main controls
- ▶ Start All / ■ Stop All / ↻ Restart All / 🗄 Stop DBs

**Right Panel**: Tabbed interface

#### 📊 Console Tab
- Live service console output
- Level filtering (DEBUG, INFO, WARNING, ERROR, CRITICAL)
- Search functionality
- Auto-scroll toggle

#### 🗄 Database Logs Tab
- Structured database logging
- Advanced filtering
- Service-specific views
- Time range queries

#### 🔧 Tools Tab

**Database Tools:**
- 🗃 Migrations - Database migration manager

**Development Tools:**
- 🔀 Git Tools - Structured commit helper
- 📋 Log Management - Archive and export console logs

#### ⚙ Settings Tab

**Configuration:**
- 🔌 Edit Ports - Service port configuration
- 🔧 Edit Environment Variables - .env editor

**Application Settings:**
- ⚙ General Settings - Launcher preferences

### Control Individual Services

From the Services page you can:

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

---

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

---

## Auto-Start on Windows Login (Optional)

### Windows Startup Folder Method

1. Press `Win+R`, type `shell:startup`, press Enter
2. Create shortcut to `start-launcher-hidden.vbs`
3. Launcher starts automatically when you log in!

### Task Scheduler Method (More Control)

1. Open Task Scheduler
2. Create Basic Task:
   - Name: "PixSim7 Launcher"
   - Trigger: "At log on"
   - Action: "Start a program"
   - Program: `C:\Windows\System32\wscript.exe`
   - Arguments: `"G:\code\pixsim7\start-launcher-hidden.vbs"`
3. Done! Launcher starts on login.

---

## Stopping Everything

### Option 1: From Web UI (Recommended)

1. Go to http://localhost:8002/services
2. Click "Stop Backend & Worker"
3. Close admin panel terminal (Ctrl+C)
4. Stop databases: `docker-compose -f docker-compose.db-only.yml down`

### Option 2: Quick Stop

```bash
# Stop admin panel (Ctrl+C in terminal)
# Stop databases
docker-compose -f docker-compose.db-only.yml down
```

### Option 3: Stop the Launcher Process

**GUI Method:**
- Find the launcher window and close it
- Or find it in system tray and right-click > Exit

**Task Manager:**
1. Open Task Manager (`Ctrl+Shift+Esc`)
2. Find "python.exe" or "pythonw.exe"
3. Right-click > End Task

**Command Line:**
```batch
# Kill by window title
taskkill /F /FI "WINDOWTITLE eq *PixSim7 Launcher*"

# Or kill all python processes (nuclear option!)
# taskkill /F /IM python.exe
# taskkill /F /IM pythonw.exe
```

---

## First Time Setup

The launcher handles everything automatically, but if needed manually:

1. **Install Node.js** (if not installed)
2. **Install Docker** (if not installed)
3. **Copy .env**: `copy .env.example .env`
4. **Run launcher**: `launch.bat`

That's it!

---

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

---

## Checking If Launcher Is Running

```batch
# PowerShell
Get-Process python* | Where-Object {$_.CommandLine -like "*launcher*"}

# CMD
tasklist | findstr python
```

---

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

### "Launcher won't start"
- Check Python is installed: `python --version`
- Check venv exists: `dir .venv\Scripts\python.exe`
- Try running directly: `python scripts\launcher.py`

### "Can't find launcher window"
- Check Task Manager for python/pythonw process
- Try Method 1 instead of Method 2
- Check system tray (bottom-right corner)

### "Services stop when I close terminal"
- You're using the old method (launch.bat option 8)
- Use `start-launcher.bat` or `start-launcher-hidden.vbs` instead

### "Launcher crashes on startup"
- Check `data/logs/launcher` for error logs
- Try running in debug mode: `python scripts\launcher.py`
- Check database is running: `docker ps`

---

## Tips

1. **Bookmark the admin panel**: http://localhost:8002
2. **Use Services page for everything**: No need for command line
3. **Check Logs page** for troubleshooting
4. **Auto-refresh is ON** by default - status updates every 5 seconds

---

## Advanced: Full Docker Mode

If you want everything in Docker instead:

```bash
# Don't use launch.bat, use this instead:
scripts\start-all.bat
```

This starts everything (databases + backend + worker) in Docker.

But you lose the ability to manage them from the web UI.

---

## No More Command Line Management!

**Before:**
```bash
# Terminal 1
docker-compose up -d postgres redis

# Terminal 2
set PYTHONPATH=...
python pixsim7\backend\main\main.py

# Terminal 3
set PYTHONPATH=...
arq pixsim7.backend.main.workers...

# Lost track? Zombie processes!
```

**After:**
```bash
# Just this:
launch.bat

# Then use web UI to manage everything!
```

---

**TL;DR**:
- Use `start-launcher.bat` for daily use
- Use `start-launcher-hidden.vbs` for background mode
- Manage everything from http://localhost:8002/services
