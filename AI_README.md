# PixSim7 - AI Assistant Guide

**⚠️ READ THIS FIRST BEFORE MAKING ANY CODE CHANGES**

This guide helps AI assistants understand what's already implemented, where things are, and what NOT to reinvent.

---

## 🎯 Project Overview

**What this is:** Video generation platform with cross-provider support (Pixverse, Sora, etc.), asset management, branching narratives for games, and structured logging.

**Tech Stack:**
- **Backend:** Python 3.11+, FastAPI, SQLAlchemy, PostgreSQL + pgvector, Redis, ARQ workers
- **Frontend:** React 19, TypeScript, Vite, Zustand, TailwindCSS
- **Admin:** SvelteKit, TailwindCSS
- **Game Frontend:** React, TypeScript, Vite

**Architecture:** Monorepo with clear separation of concerns

---

## 📁 Repository Structure

```
pixsim7/
├── pixsim7/backend/main/          # FastAPI backend (PORT 8001 ⚠️ NOT 8000!)
│   ├── api/v1/               # REST API endpoints
│   ├── domain/               # SQLAlchemy models (Asset, Job, User, etc.)
│   ├── services/             # Business logic layer
│   │   ├── asset/            # Asset management & cross-provider uploads
│   │   ├── provider/         # Provider adapters (Pixverse, Sora)
│   │   ├── submission/       # Job submission pipeline
│   │   ├── upload/           # User upload service
│   │   ├── user/             # User & auth service
│   │   └── account/          # Provider account management
│   ├── infrastructure/       # Database, logging, queue
│   ├── shared/               # Shared utilities, config, schemas
│   └── workers/              # ARQ background workers
│
├── frontend/                 # Main React frontend (PORT 5173)
│   └── src/
│       ├── components/       # UI components
│       │   ├── control/      # Control Center dock (generation UI)
│       │   ├── layout/       # DockLayout, PanelChrome, ResizableSplit
│       │   ├── media/        # MediaCard (asset display)
│       │   ├── nodes/        # Scene graph nodes
│       │   └── inspector/    # Node property editors
│       ├── modules/          # Feature modules (modular service layer)
│       ├── routes/           # Page components
│       ├── stores/           # Zustand state management
│       └── lib/              # API client, auth, utilities
│
├── admin/                    # SvelteKit admin panel (PORT 8002)
│   └── src/                  # Log viewer, service management
│
├── apps/game/                # Game player (React app)
│   └── src/components/
│       ├── ScenePlayer.tsx   # Video playback engine
│       └── minigames/        # Mini-game components
│
├── packages/                 # Shared packages (monorepo)
│   ├── types/                # TypeScript types (@pixsim7/types)
│   ├── ui/                   # Shared UI components (@pixsim7/ui)
│   └── config-tailwind/      # Tailwind preset
│
├── pixsim_logging/           # Structured logging package
├── chrome-extension/         # Browser extension for media capture
├── scripts/                  # Utility scripts, launcher GUI
├── tests/                    # Test files
├── docs/                     # Documentation
└── data/                     # Runtime data (logs, uploads, cache)
```

---

## ✅ What's Already Implemented (DON'T RECREATE)

### Backend (100% Complete)

#### Core Services
- ✅ **AssetService** - Asset CRUD, cross-provider uploads, lineage tracking
  - Location: `pixsim7/backend/main/services/asset/asset_service.py`
  - Features: `get_asset_for_provider()` - automatic upload/cache for cross-provider operations
  - Database: Asset, Asset3DMetadata, AssetAudioMetadata, AssetTemporalSegment, AssetAdultMetadata
  - Branching: AssetLineage, AssetBranch, AssetBranchVariant, AssetClip

- ✅ **ProviderService** - Provider adapter system
  - Location: `pixsim7/backend/main/services/provider/`
  - Adapters: Pixverse (845 lines - `adapters/pixverse.py`)
  - Interface: `base.py` defines upload_asset(), execute(), check_status()

- ✅ **SubmissionPipeline** - Job submission with structured logging
  - Location: `pixsim7/backend/main/services/submission/pipeline.py`
  - Stages: pipeline:start → pipeline:artifact → provider:submit → provider:status → provider:complete

- ✅ **UploadService** - User file uploads with provider acceptance checks
  - Location: `pixsim7/backend/main/services/upload/upload_service.py`
  - Features: Image validation, provider-specific preparation, metadata extraction

- ✅ **UserService** - Auth, JWT, user management
  - Location: `pixsim7/backend/main/services/user/`

- ✅ **AccountService** - Provider account pooling, concurrency management
  - Location: `pixsim7/backend/main/services/account/`

#### Database Models (domain/)
- ✅ User, UserProfile
- ✅ Job, JobStatus enum
- ✅ Asset + 4 metadata tables (3D, Audio, Temporal, Adult)
- ✅ AssetLineage, AssetBranch, AssetBranchVariant, AssetClip
- ✅ GenerationArtifact, ProviderSubmission
- ✅ ProviderAccount
- ✅ Scene, SceneAsset, SceneConnection (for game narratives)

#### API Endpoints (api/v1/)
- ✅ `/auth/register`, `/auth/login`
- ✅ `/users/me`
- ✅ `/jobs` - Create, list, get status
- ✅ `/assets` - List, get, upload (POST with file)
- ✅ `/providers` - List available providers
- ✅ `/accounts` - Provider account management
- ✅ `/logs` - Log ingestion endpoint

#### Background Workers (workers/)
- ✅ ARQ job processor - Processes jobs asynchronously
- ✅ Status poller - Polls provider status
- ✅ Structured logging with stages (pipeline:start, provider:submit, etc.)

#### Logging System
- ✅ **pixsim_logging/** - Unified structured logging package
  - JSON output for production, human-readable for dev
  - Field catalog: timestamp, level, service, job_id, provider_id, stage, etc.
  - Stage taxonomy: pipeline:start, pipeline:artifact, provider:submit, provider:status, etc.
  - Automatic sensitive data redaction (api_key, password, jwt_token)
  - Configurable sampling for high-volume events
  - Implementation complete in main.py, job_processor.py, pipeline.py, pixverse.py

### Frontend (Main App)

#### Architecture
- ✅ **Modular Service Layer** - Each feature is a self-contained module
  - Location: `apps/main/src/modules/`
  - Pattern: Module interface → Registry → Service API
  - Modules: gallery (placeholder), scene-builder (active)

#### Components (apps/main/src/components/)
- ✅ **ControlCenterDock** - Bottom dock for generation controls
  - Location: `control/ControlCenterDock.tsx`
  - Features: Prompt input, provider/preset selection, dynamic parameter forms, job status
  - Status: ✅ Complete per recent commits (feat/control-center-dock branch)

- ✅ **DockLayout** - Flexible panel layout system
  - Location: `layout/DockLayout.tsx`
  - Features: Resizable panels, presets (workspace, galleryLeft, etc.)
  - Components: PanelChrome, ResizableSplit

- ✅ **MediaCard** - Asset display card
  - Location: `media/MediaCard.tsx`
  - Features: Hover scrub, status badge, metadata display

- ✅ **FiltersBar** - Asset filtering (inline in Assets.tsx)
  - Features: Search, provider select, sort, URL sync, sessionStorage persistence

- ✅ **Tabs** - Navigation tabs component
  - Location: `navigation/Tabs.tsx`

- ✅ **MasonryGrid** - Responsive masonry layout
  - Location: `layout/MasonryGrid.tsx`

- ✅ **Node Editor Components**
  - NodePalette - Node type palette
  - SceneNode - Graph node component
  - InspectorPanel - Property inspector
  - Type-specific editors: VideoNodeEditor, ChoiceNodeEditor, ConditionNodeEditor, MiniGameNodeEditor, EndNodeEditor

#### Routes (apps/main/src/routes/)
- ✅ Home, Login, Register, ProtectedRoute
- ✅ Assets - Gallery with filters, tabs, masonry grid, local folders panel
- ✅ Workspace - Layout presets, dock management
- ✅ Graph - Scene graph editor (placeholder)

#### State Management
- ✅ **authStore** - Zustand store for auth state
- ✅ **layoutStore** - Panel layout state
- ✅ **controlCenterStore** - Generation control state
- ✅ **toastStore** - Toast notifications

### Game Frontend (Separate App)

#### Scene Player (game-apps/main/src/components/ScenePlayer.tsx)
- ✅ Real `<video>` playback with loop segment support
- ✅ Segment selection (ordered, random, pool with tag filtering)
- ✅ Progression system (multi-step playback within a node)
- ✅ Edge conditions evaluation (flag checks, comparisons)
- ✅ Effects application (set flags, inc/dec counters, push to arrays)
- ✅ Mini-game integration
- ✅ Segment indicator UI with tags and step highlighting
- ✅ Play/Pause controls, loading states, error handling

#### Mini-Games (game-apps/main/src/components/minigames/)
- ✅ **ReflexMiniGame** - Reflex challenge with scoring
  - Centered layout, success/fail states, detailed scoring
  - onResult callback with success boolean and score

### Admin Panel (admin/)
- ✅ Log viewer with filtering, search, pagination
- ✅ Service management (start/stop services)
- ✅ System metrics display
- ✅ Port: 8002

### Chrome Extension (chrome-extension/)
- ✅ Architecture and features documented
- ✅ Sora support documented

---

## ❌ What's NOT Implemented (OK to Build)

### Frontend - Minor Missing Pieces

1. **State Components** for Gallery
   - ❌ GridSkeleton component (loading state)
   - ❌ EmptyState component (no results)
   - ❌ ErrorState component (error with retry)
   - Location: Should be `apps/main/src/components/states/`

2. **LineageGraph Component**
   - ❌ Presentational graph component (use React Flow)
   - Location: Should be `apps/main/src/components/graph/LineageGraph.tsx`

3. **Scene Builder Form in Workspace**
   - ❌ Basic node editing form (Node ID, Label, Selection strategy, etc.)
   - ❌ Save-to-Draft button
   - ❌ Preview in Game button
   - Location: Should enhance `apps/main/src/routes/Workspace.tsx`

### Backend - Future Work

1. **Vision Model Integration**
   - ❌ Auto-tagging for assets
   - ❌ CLIP embeddings (populate Asset.embedding field)
   - ❌ Temporal segment analysis

2. **LRU Cache Eviction**
   - ❌ Background job to evict old downloaded assets
   - Based on Asset.last_accessed_at

3. **Additional Providers**
   - ❌ Sora adapter (partial)
   - ❌ Runway adapter
   - ❌ Pika adapter

---

## 🚫 Common Mistakes to Avoid

### Port Numbers
- ⚠️ **Backend is PORT 8001, NOT 8000!**
- ⚠️ **Admin is PORT 8002**
- ⚠️ **PostgreSQL is PORT 5434** (not default 5432)
- ⚠️ **Redis is PORT 6380** (not default 6379)
- See `docs/PORT_CONFIGURATION.md` for details

### Don't Recreate These
- ❌ Don't create a new asset upload system - use `UploadService.upload()` in `services/upload/upload_service.py`
- ❌ Don't create a new cross-provider upload system - use `AssetService.get_asset_for_provider()`
- ❌ Don't create a new logging system - use `pixsim_logging` package
- ❌ Don't create a new module system - use existing pattern in `apps/main/src/modules/`
- ❌ Don't create a new layout system - use `DockLayout` from `apps/main/src/components/layout/`
- ❌ Don't create a new video player - use `ScenePlayer` from `game-apps/main/src/components/ScenePlayer.tsx`

### Database
- ❌ Don't add migrations without using Alembic
- ❌ Don't modify domain models without generating migrations
- ✅ Use: `PYTHONPATH=G:/code/pixsim7 alembic revision --autogenerate -m "description"`

### API
- ❌ Don't create endpoints that return port 8000 - use 8001
- ❌ Don't skip authentication on protected endpoints
- ✅ Use: `current_user: User = Depends(get_current_user)` in endpoint signatures

### Frontend
- ❌ Don't use global state for module-specific features - use module-internal state
- ❌ Don't create duplicate components - check `apps/main/src/components/` and `packages/ui/` first
- ✅ Use: Existing `MediaCard`, `Tabs`, `MasonryGrid`, etc.

---

## 🔑 Key Files Reference

### Must-Read Documentation
1. **MASTER_STATUS.md** - Complete project status (100% backend complete)
2. **CROSS_PROVIDER_ASSETS.md** - Asset system architecture
3. **LOGGING_STRUCTURE.md** - Logging spec and implementation
4. **frontend/README.md** - Frontend architecture guide
5. **docs/PORT_CONFIGURATION.md** - Port reference (critical!)

### Critical Backend Files
- `pixsim7/backend/main/services/asset/asset_service.py` - Asset management (lines 338-503: cross-provider logic)
- `pixsim7/backend/main/services/submission/pipeline.py` - Job submission pipeline
- `pixsim7/backend/main/services/provider/adapters/pixverse.py` - Pixverse adapter (845 lines)
- `pixsim7/backend/main/domain/asset.py` - Asset model with all fields
- `pixsim7/backend/main/shared/config.py` - Configuration

### Critical Frontend Files
- `apps/main/src/components/control/ControlCenterDock.tsx` - Generation controls
- `apps/main/src/components/layout/DockLayout.tsx` - Panel layout system
- `apps/main/src/modules/scene-builder/index.ts` - Scene builder module
- `apps/main/src/stores/layoutStore.ts` - Layout state management
- `game-apps/main/src/components/ScenePlayer.tsx` - Video playback engine

---

## 🔄 Development Workflow

### Adding a New Feature

1. **Check if it exists** - Search this file, check `apps/main/src/components/` and `pixsim7/backend/main/services/`
2. **Check the plan** - See `docs/NODE_EDITOR_DEVELOPMENT.md` or relevant task docs
3. **Follow patterns** - Use existing service layer, module system, component structure
4. **Test** - Add tests for new functionality
5. **Document** - Update this file if adding major features

### Adding a Provider Adapter

1. **Location:** `pixsim7/backend/main/services/provider/adapters/your_provider.py`
2. **Interface:** Extend `BaseProvider` from `base.py`
3. **Required Methods:**
   - `execute(operation_type, account, params)` - Submit job
   - `check_status(account, provider_job_id)` - Poll status
   - `upload_asset(account, file_path)` - Upload asset for cross-provider operations
4. **Reference:** See `pixverse.py` for complete implementation

### Adding a Frontend Module

1. **Location:** `apps/main/src/modules/your-module/`
2. **Structure:**
   ```
   your-module/
   ├── index.ts              # Service API (implements Module interface)
   ├── YourView.tsx          # Main UI component
   └── useYourModule.ts      # State hook (optional)
   ```
3. **Register:** Add to `apps/main/src/modules/index.ts`
4. **Reference:** See `scene-builder` module

---

## 🧪 Testing

### Backend Tests
```bash
# Location: tests/
pytest tests/test_structured_logging.py
pytest tests/test_submission_pipeline.py
```

### Frontend Tests
```bash
cd frontend
npm test
```

---

## 🚀 Running the System

### Quick Start
```bash
# Single launcher (Windows)
launch.bat

# Or use web UI
# Visit http://localhost:8002 and start services from there
```

### Manual Start
```bash
# Backend
PYTHONPATH=G:/code/pixsim7 uvicorn pixsim7.backend.main.main:app --host 0.0.0.0 --port 8001

# Worker
PYTHONPATH=G:/code/pixsim7 arq pixsim7.backend.main.workers.arq_worker.WorkerSettings

# Frontend
cd frontend && npm run dev

# Admin
cd admin && npm run dev
```

---

## 📊 Implementation Status Summary

| Component | Status | Notes |
|-----------|--------|-------|
| Backend API | ✅ 100% | All services complete |
| Asset System | ✅ 100% | Cross-provider uploads, lineage, branching |
| Logging | ✅ 100% | Structured logging fully implemented |
| Job Pipeline | ✅ 100% | Submission, polling, completion |
| Provider Adapters | 🟡 Partial | Pixverse complete, Sora partial |
| Frontend Core | ✅ 90% | Layout, controls, assets gallery |
| Scene Editor | 🟡 50% | Graph editor exists, inspector needs work |
| Game Player | ✅ 95% | Video playback, progression, mini-games |
| Admin Panel | ✅ 100% | Log viewer, service management |
| Chrome Extension | ✅ 100% | Documented and functional |

---

## 💡 Quick Tips for AI Assistants

1. **Always check this file first** before creating new components or services
2. **Port 8001** - Mention this explicitly when writing API client code
3. **Use existing types** from `packages/types/src/index.ts` - don't recreate
4. **Modular approach** - Each feature should be a self-contained module
5. **Structured logging** - Use `pixsim_logging.get_logger()` for all logging
6. **Cross-provider uploads** - Use `AssetService.get_asset_for_provider()` - it handles download/upload/cache automatically
7. **Check git history** - Recent commits show what's been completed (e.g., control-center refactor)

---

## 📚 Documentation Taxonomy for AI Assistants

Understanding the documentation structure helps you find information quickly and update the right docs.

### Document Types & When to Use Each

#### **1. Living Docs - Read First, Update Frequently**
These docs evolve with the system. Always check these before making changes:

- **`ARCHITECTURE.md`** - Complete system architecture
  - When to read: Before any significant architectural work
  - When to update: Major system changes, new layers/services

- **`AI_README.md`** (this file) - AI assistant guidance
  - When to read: Start of every session
  - When to update: New patterns, common mistakes, implementation status changes

- **`DEVELOPMENT_GUIDE.md`** - Setup and workflows
  - When to read: Setup issues, workflow questions
  - When to update: New workflows, setup steps, or troubleshooting

#### **2. Reference Docs - Check Before Recreating**
Look here before building new components:

- **`docs/backend/SERVICES.md`** - All backend services
- **`docs/frontend/COMPONENTS.md`** - All frontend components
- **`docs/APP_MAP.md`** - Application structure and routes
- **`GAMEPLAY_SYSTEMS.md`** - Game mechanics and session structure
- **API-specific docs** - Feature-specific implementation details

**Action:** Before creating any new service/component, check these first!

#### **3. Architecture Decision Records (ADRs) - Context for "Why"**
Located in `docs/decisions/`, these explain architectural choices:

- **When to read:**
  - Understanding why something was designed a certain way
  - Planning changes to extension surfaces
  - Before modifying plugin/registry systems

- **When to create:**
  - Major architectural decisions affecting extensibility
  - Changes to core game/session conventions
  - New provider/plugin architectures
  - Deprecating major APIs

- **Format:** Immutable after acceptance (create new ADR to supersede)
- **See:** `docs/decisions/README.md` for complete guidance

#### **4. Task Docs - Active Work Tracking**
Located in `claude-tasks/`:

- **Status:** Active work in progress
- **Lifecycle:** Archive when complete
- **Don't recreate:** Check existing tasks before starting new work

#### **5. Archived Docs - Historical Context**
Located in `docs/archive/`:

- **Purpose:** Historical reference, not active development
- **Don't update:** These are frozen for context only
- **Check before assuming:** Features may have evolved beyond archived docs

### Quick Decision Tree: Which Doc to Update?

```
Is this a major architectural decision affecting extensibility?
├─ YES → Create ADR in docs/decisions/
└─ NO ↓

Is this a new service, component, or API?
├─ YES → Update reference docs (SERVICES.md, COMPONENTS.md, etc.)
└─ NO ↓

Is this a workflow or setup change?
├─ YES → Update DEVELOPMENT_GUIDE.md
└─ NO ↓

Is this a system architecture change?
├─ YES → Update ARCHITECTURE.md
└─ NO ↓

Is this a pattern AI assistants should know?
├─ YES → Update AI_README.md
└─ NO → Probably doesn't need doc update (code comments sufficient)
```

### Documentation Maintenance Rules for AI Assistants

1. **Single Source of Truth**
   - Each concept has ONE canonical location
   - Link to it, never duplicate content
   - If you find duplicates, consolidate and update links

2. **Update Triggers You Should Watch For**
   ```
   Major architectural change → Update ARCHITECTURE.md + create ADR
   New service/component      → Update reference docs
   API endpoint change        → Update API docs + ARCHITECTURE.md if significant
   Workflow change            → Update DEVELOPMENT_GUIDE.md
   New pattern/gotcha         → Update AI_README.md
   Task completion            → Archive task doc, update DOCUMENTATION_CHANGELOG.md
   ```

3. **Archive, Don't Delete**
   - Move outdated docs to `docs/archive/` with explanation
   - Update archive README.md with why it was archived
   - Preserve context for future reference

4. **Document Your Changes**
   - Significant doc changes get entry in `DOCUMENTATION_CHANGELOG.md`
   - Include: motivation, what changed, impact
   - Update "Last Updated" date in modified docs

### Common Documentation Mistakes to Avoid

❌ **Don't recreate documentation** - Check existing docs first
❌ **Don't duplicate content** - Link to canonical source
❌ **Don't modify accepted ADRs** - Create new ADR to supersede
❌ **Don't ignore "Last Updated"** - Update the date when you modify docs
❌ **Don't skip DOCUMENTATION_CHANGELOG.md** - Log significant changes
✅ **Do check AI_README.md first** - Saves recreation of existing features
✅ **Do create ADRs for major decisions** - Captures "why" for future
✅ **Do update reference docs** - Keep SERVICES.md and COMPONENTS.md current
✅ **Do archive completed tasks** - Move to archive, don't delete

---

## 📞 Need Help?

### Primary Documentation
- **Start Here:** `README.md` (project overview and quick start)
- **Architecture:** `ARCHITECTURE.md` (complete system overview)
- **Setup:** `DEVELOPMENT_GUIDE.md` (setup, workflows, conventions)
- **Decisions:** `docs/decisions/*.md` (why things are the way they are)

### Reference Documentation
- **Backend Services:** `docs/backend/SERVICES.md`
- **Frontend Components:** `docs/frontend/COMPONENTS.md`
- **App Structure:** `docs/APP_MAP.md`
- **Game Systems:** `GAMEPLAY_SYSTEMS.md`
- **API Docs:** http://localhost:8001/docs (auto-generated Swagger)

### Documentation About Documentation
- **Lifecycle & Taxonomy:** `DOCUMENTATION_CHANGELOG.md` (top section)
- **ADR Process:** `docs/decisions/README.md`
- **Contribution Guide:** `DEVELOPMENT_GUIDE.md` → Contributing section

---

**Last Updated:** 2025-11-21
**Version:** 1.1.0
