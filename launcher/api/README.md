# PixSim7 Launcher API

Production REST API for managing PixSim7 services.

Built on `launcher_core` with dependency injection and event bus for clean, maintainable architecture.

---

## Features

✅ **Service Management** - Start, stop, restart services via HTTP
✅ **Real-time Events** - WebSocket for live updates
✅ **Log Management** - Query and stream service logs
✅ **Health Monitoring** - Service health checks
✅ **Statistics** - System and service metrics
✅ **OpenAPI Docs** - Interactive API documentation

---

## Quick Start

### Start the API Server

**Linux/Mac:**
```bash
./start-api.sh
```

**Windows:**
```bash
start-api.bat
```

**Or directly:**
```bash
python -m uvicorn launcher_api.main:app --host 0.0.0.0 --port 8100 --reload
```

### Access the API

- **API Base:** http://localhost:8100
- **Interactive Docs:** http://localhost:8100/docs
- **Alternative Docs:** http://localhost:8100/redoc
- **WebSocket:** ws://localhost:8100/events/ws

---

## API Endpoints

### Service Management

#### List all services
```http
GET /services
```

**Response:**
```json
{
  "services": [
    {
      "key": "backend",
      "title": "Backend API",
      "status": "running",
      "health": "healthy",
      "pid": 12345
    }
  ],
  "total": 7
}
```

#### Get service status
```http
GET /services/{service_key}
```

#### Start a service
```http
POST /services/{service_key}/start
```

#### Stop a service
```http
POST /services/{service_key}/stop
```

**Request body (optional):**
```json
{
  "graceful": true
}
```

#### Restart a service
```http
POST /services/{service_key}/restart
```

#### Start all services
```http
POST /services/start-all
```

#### Stop all services
```http
POST /services/stop-all
```

### Logs

#### Get service logs
```http
GET /logs/{service_key}?tail=100&filter_text=error&filter_level=ERROR
```

**Query parameters:**
- `tail` (1-10000): Number of lines to return
- `filter_text`: Text filter (case-insensitive)
- `filter_level`: Log level filter (ERROR, WARNING, INFO, DEBUG)

**Response:**
```json
{
  "service_key": "backend",
  "lines": ["[12:34:56] [INFO] Server started", "..."],
  "total_lines": 100,
  "filtered": true
}
```

#### Clear service logs
```http
DELETE /logs/{service_key}
```

#### Clear all logs
```http
DELETE /logs
```

### Health & Stats

#### API health check
```http
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "version": "0.2.0",
  "managers": {
    "process_manager": true,
    "health_manager": true,
    "log_manager": true
  },
  "event_bus": {
    "event_count": 1234,
    "subscriber_count": 5
  }
}
```

#### System statistics
```http
GET /stats
```

**Response:**
```json
{
  "services_total": 7,
  "services_running": 5,
  "services_healthy": 4,
  "services_unhealthy": 1,
  "uptime_seconds": 3600.5
}
```

### Events (WebSocket)

#### Connect to event stream
```
ws://localhost:8100/events/ws
```

**Received events:**
```json
{
  "event_type": "process.started",
  "source": "ProcessManager",
  "timestamp": 1234567890.123,
  "data": {
    "service_key": "backend",
    "event_type": "started",
    "data": {"pid": 12345}
  }
}
```

**Event types:**
- `process.started` - Service started
- `process.stopped` - Service stopped
- `process.failed` - Service failed to start
- `health.update` - Health status changed
- `log.line` - New log line

**Get event bus stats:**
```http
GET /events/stats
```

---

## Examples

### cURL Examples

**Start backend service:**
```bash
curl -X POST http://localhost:8100/services/backend/start
```

**Get backend status:**
```bash
curl http://localhost:8100/services/backend
```

**Get recent error logs:**
```bash
curl "http://localhost:8100/logs/backend?tail=50&filter_level=ERROR"
```

**Stop all services:**
```bash
curl -X POST http://localhost:8100/services/stop-all
```

### Python Example

```python
import requests

# Start a service
response = requests.post('http://localhost:8100/services/backend/start')
print(response.json())

# Get service status
status = requests.get('http://localhost:8100/services/backend').json()
print(f"Backend: {status['status']} / {status['health']}")

# Get logs
logs = requests.get('http://localhost:8100/logs/backend?tail=20').json()
for line in logs['lines']:
    print(line)
```

### WebSocket Example (Python)

```python
import asyncio
import websockets
import json

async def stream_events():
    uri = "ws://localhost:8100/events/ws"
    async with websockets.connect(uri) as websocket:
        while True:
            event = await websocket.recv()
            data = json.loads(event)
            print(f"[{data['event_type']}] {data['data']}")

asyncio.run(stream_events())
```

### JavaScript Example

```javascript
// Connect to WebSocket
const ws = new WebSocket('ws://localhost:8100/events/ws');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(`[${data.event_type}]`, data.data);
};

// Start a service
fetch('http://localhost:8100/services/backend/start', {
  method: 'POST'
})
  .then(r => r.json())
  .then(data => console.log(data));
```

---

## Architecture

```
┌─────────────────────────────────────┐
│    FastAPI Application              │
│  ┌───────────────────────────────┐  │
│  │  Routes                       │  │
│  │  - /services (CRUD)           │  │
│  │  - /logs (query/stream)       │  │
│  │  - /events/ws (WebSocket)     │  │
│  │  - /health (status)           │  │
│  └────────────┬──────────────────┘  │
│               │                      │
│  ┌────────────▼──────────────────┐  │
│  │  Dependencies (DI)            │  │
│  │  - get_process_manager()      │  │
│  │  - get_health_manager()       │  │
│  │  - get_log_manager()          │  │
│  │  - get_event_bus()            │  │
│  └────────────┬──────────────────┘  │
└───────────────┼─────────────────────┘
                │
┌───────────────▼─────────────────────┐
│  LauncherContainer (DI)             │
│  ┌─────────────────────────────┐   │
│  │  ProcessManager             │   │
│  │  HealthManager              │   │
│  │  LogManager                 │   │
│  └─────────────────────────────┘   │
│                                     │
│  ┌─────────────────────────────┐   │
│  │  EventBus (pub/sub)         │   │
│  │  - Decouples managers       │   │
│  │  - WebSocket streaming      │   │
│  └─────────────────────────────┘   │
└─────────────────────────────────────┘
```

**Key Benefits:**
- Clean separation of concerns
- Dependency injection for testability
- Event-driven architecture
- Reuses `launcher_core` (same logic as Qt launcher!)

---

## Configuration

The API uses default configuration from `launcher_core`. To customize:

```python
# In main.py
_container = create_container(
    services_list,
    config_overrides={
        'health': {
            'base_interval': 1.0,  # Faster health checks
            'adaptive_enabled': True
        },
        'log': {
            'max_log_lines': 10000  # More log history
        }
    }
)
```

---

## Production Deployment

### Using uvicorn directly

```bash
uvicorn launcher_api.main:app \
  --host 0.0.0.0 \
  --port 8100 \
  --workers 4 \
  --log-level info
```

### Using gunicorn (Linux/Mac)

```bash
gunicorn launcher_api.main:app \
  -w 4 \
  -k uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:8100
```

### Docker

```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY . /app

RUN pip install fastapi uvicorn websockets pydantic

EXPOSE 8100

CMD ["uvicorn", "launcher_api.main:app", "--host", "0.0.0.0", "--port", "8100"]
```

### Environment Variables

```bash
export PIXSIM_API_PORT=8100
export PIXSIM_API_HOST=0.0.0.0
export PIXSIM_LOG_LEVEL=info
```

---

## Development

### Running with auto-reload

```bash
uvicorn launcher_api.main:app --reload
```

### Testing endpoints

Interactive docs at http://localhost:8100/docs let you test all endpoints directly in the browser.

### WebSocket testing

Use a WebSocket client like [websocat](https://github.com/vi/websocat):

```bash
websocat ws://localhost:8100/events/ws
```

---

## Troubleshooting

### Port already in use

Change the port in `start-api.sh` or `start-api.bat`:
```bash
--port 8101
```

### CORS errors

Update `main.py` to allow your origin:
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### Services not starting

Check:
1. Docker is running (for `db` service)
2. Required tools installed (pnpm, npm, python)
3. Ports not in use (8000, 3000, etc.)
4. Check API logs for errors

---

## Next Steps

- **Phase 6:** Build Svelte web UI that consumes this API
- **Authentication:** Add JWT or API key authentication
- **Rate Limiting:** Add rate limiting middleware
- **Monitoring:** Add Prometheus metrics endpoint

---

## Files Structure

```
launcher_api/
├── __init__.py           # Package init
├── main.py              # FastAPI app & lifespan
├── models.py            # Pydantic schemas
├── dependencies.py      # DI for routes
└── routes/
    ├── __init__.py
    ├── services.py      # Service endpoints
    ├── logs.py          # Log endpoints
    ├── events.py        # WebSocket
    └── health.py        # Health/stats
```

---

**Status:** Production-ready ✅
**Version:** 0.2.0
**Built with:** FastAPI, launcher_core, uvicorn
