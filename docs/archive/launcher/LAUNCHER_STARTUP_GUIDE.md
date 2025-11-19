# PixSim7 Launcher Startup Guide

## Problem
When you close the terminal/cmd window that started the launcher, all services stop because they're child processes of that terminal.

## Solution - 3 New Startup Methods

### Method 1: Recommended - start-launcher.bat (Auto-detaching)
**Best for most users**

```batch
.\start-launcher.bat
```

**What it does:**
1. Tries to use `pythonw.exe` (no console window at all)
2. Falls back to `python.exe` with detached start
3. You can close the terminal immediately
4. Services keep running!

**Features:**
- ✅ Survives terminal closure
- ✅ Auto-detects Python location
- ✅ Shows confirmation message
- ⚠️ Launcher window still visible

### Method 2: Hidden Mode - start-launcher-hidden.vbs (Completely Background)
**For advanced users who want no windows at all**

```batch
start-launcher-hidden.vbs
```
Or double-click the file in Explorer.

**What it does:**
1. Runs launcher with `pythonw.exe` in completely hidden mode
2. NO console window, NO launcher window initially
3. Launcher runs in background
4. Find it in system tray or Task Manager

**Features:**
- ✅ Completely hidden startup
- ✅ No console windows
- ✅ Survives terminal closure
- ⚠️ Harder to see if it's running

### Method 3: Old Way (DON'T USE) - launch.bat option 8
**This is the problematic method that closes services when you close the terminal**

```batch
.\launch.bat
# Choose option 8
```

## Recommended Workflow

### First Time Setup:
1. Run `.\start-launcher.bat`
2. Launcher window appears
3. Close the cmd window you ran it from - **launcher stays open!**
4. Start your services from the launcher
5. Close launcher window when done (services will ask to stop)

### Daily Use:
1. Double-click `start-launcher-hidden.vbs` from Explorer
2. Launcher runs hidden
3. Look for launcher window or check system tray
4. Or just open browser to http://localhost:8001 (services auto-start)

## Auto-Start on Windows Login (Optional)

### Windows Startup Folder Method:
1. Press `Win+R`, type `shell:startup`, press Enter
2. Create shortcut to `start-launcher-hidden.vbs`
3. Launcher starts automatically when you log in!

### Task Scheduler Method (More Control):
1. Open Task Scheduler
2. Create Basic Task:
   - Name: "PixSim7 Launcher"
   - Trigger: "At log on"
   - Action: "Start a program"
   - Program: `C:\Windows\System32\wscript.exe`
   - Arguments: `"G:\code\pixsim7\start-launcher-hidden.vbs"`
3. Done! Launcher starts on login.

## Checking If Launcher Is Running

```batch
# PowerShell
Get-Process python* | Where-Object {$_.CommandLine -like "*launcher*"}

# CMD
tasklist | findstr python
```

## Stopping The Launcher

### Method 1: GUI (Recommended)
- Find the launcher window and close it
- Or find it in system tray and right-click > Exit

### Method 2: Task Manager
1. Open Task Manager (`Ctrl+Shift+Esc`)
2. Find "python.exe" or "pythonw.exe"
3. Right-click > End Task

### Method 3: Command Line
```batch
# Kill by window title
taskkill /F /FI "WINDOWTITLE eq *PixSim7 Launcher*"

# Or kill all python processes (nuclear option - kills ALL Python programs!)
# taskkill /F /IM python.exe
# taskkill /F /IM pythonw.exe
```

## Troubleshooting

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

## Files Created

- ✅ `start-launcher.bat` - Auto-detaching startup script
- ✅ `start-launcher-hidden.vbs` - Hidden background startup
- 📝 `docs/LAUNCHER_STARTUP_GUIDE.md` - This file

## Migration Guide

### If you currently use launch.bat option 8:
1. Stop the launcher (close window)
2. From now on, use `start-launcher.bat` instead
3. Your services will survive terminal closure!

### If you want auto-start on login:
1. Use the Windows Startup Folder method above
2. Or set up Task Scheduler for more control

---

**TL;DR:** Use `start-launcher.bat` or double-click `start-launcher-hidden.vbs` to start the launcher in a way that survives closing the terminal!
