# PixSim7 Admin Panel

Modern admin interface for managing PixSim7 backend.

## Features

- **📊 Dashboard** - System overview and service status
- **👤 Accounts** - Manage provider accounts and credits
- **⚙️ Jobs** - Monitor video generation queue
- **🎬 Assets** - Browse generated videos and images
- **🔧 Services** - Control backend services
- **📝 Logs** - View system logs

## Quick Start

### 1. Install Dependencies

```bash
cd G:/code/pixsim7/admin
npm install
```

### 2. Environment Variables

Create a `.env.local` (or copy from `.env.example`) with:

```
VITE_BACKEND_URL=http://localhost:8001
VITE_ADMIN_PORT=8002
```

Notes:
- `VITE_BACKEND_URL` points to the FastAPI backend root (no trailing slash, no /api/v1 prefix). All API helper calls build endpoints relative to this.
- `VITE_ADMIN_PORT` sets the dev server port; defaults to 5173 if omitted.

### 3. Start Dev Server

```bash
npm run dev
```

Open http://localhost:8002 (or configured port) in your browser.

### 3. Login

Use your PixSim7 admin credentials:
- Email: `stst1616@gmail.com`
- Password: `amanitamuscaria`

## Tech Stack

- **SvelteKit 2** - Framework
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **chart.js** - Charts
- **date-fns** - Date formatting

## Pages Built

All 6 pages are complete and functional!

## Backend / Admin Port Alignment

| Component | Default Port | Env Variable |
|-----------|--------------|--------------|
| FastAPI Backend | 8001 | (configured via backend run script) |
| Admin Dev UI | 8002 | `VITE_ADMIN_PORT` |

If ports change, update `VITE_BACKEND_URL` accordingly (e.g. `http://localhost:9000`).

## Debug / Development Notes

- Provider capabilities and operation specs are fetched from `${VITE_BACKEND_URL}/api/v1/providers`.
- The debug generation form auto-builds parameter inputs based on backend `operation_specs`.
- Asset listing & lineage graph endpoints now support future main frontend gallery and graph views.
- Thumbnail fallback: if backend returns `thumbnail_url` null, UI can safely use `remote_url`.

## Migration / Setup

After pulling new migrations:

```bash
alembic upgrade head
```

Ensure backend is running before opening the admin UI so provider and asset queries succeed.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Providers list empty | Wrong `VITE_BACKEND_URL` | Set to backend root (e.g. http://localhost:8001) |
| 404 on /api/v1/providers | Backend not running / port mismatch | Start backend, verify port |
| Dev UI still on 5173 | `VITE_ADMIN_PORT` missing | Add to env and restart `npm run dev` |
| Thumbnail broken | No thumbnail from provider | Backend falls back to remote_url automatically |

## Next Steps (Main Frontend Prep)

- Cursor-based asset pagination endpoint prepared (`/api/v1/assets`).
- Lineage graph endpoint available (`/api/v1/lineage/graph/{id}?depth=`).
- Reusable MediaCard component can rely on: id, media_type, provider_id, provider_asset_id, remote_url, thumbnail_url, width, height, duration_sec, tags, description, created_at.

