# PixSim7 Admin Panel - Usage Guide

**Comprehensive log viewer with advanced filtering**

---

## Quick Start

### 1. Start Backend Services

**Option A: Docker (Recommended - No Zombie Processes)**
```bash
cd /g/code/pixsim7
docker-compose up -d
```

**Option B: Manual with Process Manager**
```bash
cd /g/code/pixsim7

# Use process manager to prevent zombies
chmod +x scripts/manage.sh
./scripts/manage.sh start

# Check status
./scripts/manage.sh status

# Stop cleanly
./scripts/manage.sh stop

# Clean up any zombie processes
./scripts/manage.sh cleanup
```

### 2. Start Admin Panel

```bash
cd /g/code/pixsim7/admin
npm run dev
```

**Access:**
- Local: http://localhost:8002
- ZeroTier: http://10.243.48.125:8002

---

## Log Viewer Features

### Color-Coded Log Levels

Logs are automatically color-coded by level:
- **CRITICAL** - Dark red, bold
- **ERROR** - Red
- **WARNING** - Yellow/Amber
- **INFO** - Blue
- **DEBUG** - Gray

Each log entry also has a colored background for easy scanning.

### Comprehensive Filtering

Filter logs by any combination of:

1. **Log Level** - DEBUG, INFO, WARNING, ERROR, CRITICAL
2. **Logger Name** - e.g., `main`, `auth_service`, `job_service`
3. **Search Text** - Full-text search in log messages
4. **User ID** - See all logs related to a specific user
5. **Job ID** - See all logs related to a specific job
6. **Time Range** - Start and end datetime filters

### Real-Time Monitoring

- **Auto-refresh** - Enable 5-second auto-refresh for live monitoring
- **Instant filtering** - Filters apply as you type
- **Pagination** - Navigate through large log sets (100 logs per page)

### Expandable Log Entries

Click any log entry to expand and see:
- Module name
- Function name and line number
- Full exception traceback (if present)
- Raw JSON data
- Associated metadata (user_id, job_id)

### Quick Metadata Badges

Each log entry shows badges for:
- **U:123** - User ID associated with log
- **J:456** - Job ID associated with log
- **!** - Exception present (click to expand)

---

## Dashboard

Real-time service status monitoring:

- **API Server** - Health, uptime, request count
- **Worker** - Health, uptime, jobs processed
- **PostgreSQL** - Health, connection status
- **Redis** - Health, memory usage

Auto-refreshes every 10 seconds.

---

## Example Use Cases

### Find All Errors for a User

1. Go to Logs page
2. Set **Log Level** = ERROR
3. Enter **User ID** = 123
4. Click "Apply Filters"

### Monitor Job Processing

1. Go to Logs page
2. Enter **Job ID** = 456
3. Enable **Auto-refresh**
4. Watch logs update in real-time

### Debug Authentication Issues

1. Go to Logs page
2. Set **Logger** = auth_service
3. Set **Log Level** = WARNING or ERROR
4. Set time range to last hour
5. Click "Apply Filters"

### Search for Specific Errors

1. Go to Logs page
2. Set **Log Level** = ERROR
3. Enter **Search** = "database connection"
4. Click "Apply Filters"

### Find Critical Issues in Last Hour

1. Go to Logs page
2. Set **Log Level** = CRITICAL
3. Set **Start Time** = 1 hour ago
4. Click "Apply Filters"

---

## Keyboard Shortcuts

- **Enter** in any filter field - Apply filters
- **Escape** - Clear search field
- **Click log entry** - Expand/collapse details

---

## Performance Tips

1. **Use specific filters** - Narrow your search for faster results
2. **Disable auto-refresh** - When analyzing specific logs
3. **Use pagination** - Don't load all logs at once
4. **Time range filters** - Limit to recent logs for faster loading

---

## Zombie Process Prevention

### Problem
When running backend manually with `python main.py &`, processes can accumulate if you restart multiple times.

### Solutions

**1. Use Docker (Best)**
```bash
docker-compose up -d backend worker
docker-compose restart backend worker  # Clean restart
```

**2. Use Process Manager**
```bash
./scripts/manage.sh start   # Starts with PID tracking
./scripts/manage.sh restart # Kills old, starts new
./scripts/manage.sh cleanup # Kills all zombies
```

**3. Manual Cleanup**
```bash
# Find pixsim7 processes
ps aux | grep pixsim7

# Kill by name
pkill -f pixsim7.backend.main

# Kill by PID
kill <PID>
```

### Checking for Zombies

```bash
# Show all pixsim7 processes
./scripts/manage.sh status

# Or manually
ps aux | grep -E "pixsim7|arq.*pixsim" | grep -v grep
```

---

## Configuration

### API URL

Edit `admin/.env.local`:
```env
# Local development
VITE_API_URL=http://localhost:8001/api/v1

# ZeroTier access
VITE_API_URL=http://10.243.48.125:8001/api/v1
```

### Port Configuration

Edit `admin/vite.config.ts`:
```typescript
export default defineConfig({
  server: {
    port: 8002,  // Change admin panel port
    host: '0.0.0.0'
  }
});
```

---

## Troubleshooting

### Can't See Logs

**Problem:** Log viewer shows "No logs found"

**Solutions:**
1. Check backend is running: `curl http://localhost:8001/health`
2. Check API URL in `.env.local`
3. Try clearing all filters
4. Check browser console for errors

### CORS Errors

**Problem:** Browser console shows CORS errors

**Solution:**
1. Check backend `.env` has correct CORS_ORIGINS
2. Restart backend after changing CORS settings
3. For local dev, add to backend `.env`:
   ```env
   CORS_ORIGINS=http://localhost:8002,http://localhost:5173
   ```

### Auto-Refresh Not Working

**Problem:** Logs don't update automatically

**Solutions:**
1. Check auto-refresh checkbox is enabled
2. Check backend is responding: `curl http://localhost:8001/api/v1/admin/logs`
3. Check browser console for errors
4. Try disabling/re-enabling auto-refresh

### Filters Not Working

**Problem:** Filters don't seem to apply

**Solutions:**
1. Click "Apply Filters" button
2. Check backend logs for errors
3. Try clearing all filters and applying one at a time
4. Check backend is actually generating logs (create a test job)

---

## Development

### Project Structure

```
admin/
├── src/
│   ├── routes/
│   │   ├── +page.svelte           # Dashboard
│   │   ├── +layout.svelte         # Navigation
│   │   └── logs/
│   │       └── +page.svelte       # Logs page
│   ├── lib/
│   │   ├── api/
│   │   │   └── client.ts          # API client
│   │   └── components/
│   │       └── LogViewer.svelte   # Log viewer component
│   ├── app.html                   # HTML template
│   └── app.css                    # Global styles
├── .env.local                     # Environment config
├── package.json                   # Dependencies
└── vite.config.ts                 # Vite config
```

### Adding New Features

1. **New API endpoint:**
   - Add method to `src/lib/api/client.ts`
   - Create TypeScript interfaces for request/response

2. **New page:**
   - Create `src/routes/your-page/+page.svelte`
   - Add link to `src/routes/+layout.svelte`

3. **New component:**
   - Create `src/lib/components/YourComponent.svelte`
   - Import and use in pages

### Building for Production

```bash
cd admin
npm run build
npm run preview  # Test production build
```

---

## Next Steps

1. **Metrics Page** - Add system metrics charts (CPU, memory, disk)
2. **Job Monitoring** - Real-time job status updates
3. **User Management** - Create/edit users
4. **Settings Page** - Configure system settings
5. **WebSocket Logs** - True real-time log streaming

---

## Support

- Backend API: http://localhost:8001/docs
- Admin Panel: http://localhost:8002
- Logs: http://localhost:8002/logs

**Questions?** Check:
- `FINAL_SETUP_SUMMARY.md` - Complete system overview
- `ZEROTIER_SETUP.md` - Remote access setup
- `REDIS_AND_WORKERS_SETUP.md` - Worker configuration
