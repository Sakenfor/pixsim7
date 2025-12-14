# Script Inventory

**Date:** 2025-11-21
**Related Task:** Task 33 - Phase 33.4 (Dead Script & Sample Data Triage)

## Active Scripts (Keep)

### Service Management
- **`scripts/manage.sh`** / **`scripts/manage.bat`**
  - Purpose: Start/stop/status for backend, workers, databases
  - Used by: SETUP.md, README.md, developers
  - Status: ✅ Active, recently updated (Task 34)

- **`scripts/start-dev.sh`** / **`scripts/start-dev.bat`**
  - Purpose: Quick dev environment startup
  - Used by: SETUP.md, developers
  - Status: ✅ Active, recently updated (Task 34)

- **`scripts/start-all.sh`** / **`scripts/start-all.bat`**
  - Purpose: Start all services at once
  - Used by: SETUP.md
  - Status: ✅ Active

### Testing
- **`scripts/run_scenarios.sh`** / **`scripts/run_scenarios.bat`**
  - Purpose: Run test scenarios
  - Used by: tests/scenarios/README.md
  - Status: ✅ Active, updated (Task 34)

### Launcher
- **`scripts/launcher.py`**
  - Purpose: Entry point for launcher GUI
  - Used by: launcher/gui/README.md
  - Status: ✅ Active

### Utilities
- **`scripts/import_accounts_from_pixsim6.py`**
  - Purpose: Migrate provider accounts from PixSim6 to PixSim7
  - Used by: launcher GUI, scripts/IMPORT_ACCOUNTS_GUIDE.md
  - Status: ✅ Active (migration tool)

- **`scripts/view_account_passwords.py`**
  - Purpose: Admin utility to decrypt and view stored passwords
  - Used by: Administrators
  - Status: ✅ Active (admin tool)

### Development/CI
- **`scripts/check_missing_imports.py`**
  - Purpose: Detect missing Python imports
  - Used by: Development/CI
  - Status: ✅ Active (dev tool)

- **`scripts/check_orphan_routers.py`**
  - Purpose: Detect API routers without plugin manifests
  - Created: 2025-11-21 (Task 31 related)
  - Used by: Development/CI
  - Status: ✅ Active (recent addition)

### Device Automation
- **`scripts/device_agent.py`**
  - Purpose: Lightweight agent for exposing local Android devices over network
  - Used by: Device automation system (pixsim7/backend/main/api/v1/device_agents.py)
  - Status: ✅ Active (part of automation infrastructure)
  - Features: ADB device discovery, server registration, command proxy
  - Backend: Has dedicated API endpoints, domain models, and database migrations
  - Documentation: scripts/DEVICE_AGENT_README.md

## Experimental/Legacy Scripts

None found - all current scripts are actively used.

## Script Organization Recommendations

### Current Structure (Good)
```
scripts/
├── manage.sh/bat          # Core service management
├── start-dev.sh/bat       # Development startup
├── start-all.sh/bat       # All services
├── run_scenarios.sh/bat   # Testing
├── launcher.py            # GUI entry point
├── import_accounts_from_pixsim6.py  # Migration
├── view_account_passwords.py        # Admin utility
├── check_missing_imports.py         # Dev tool
├── check_orphan_routers.py          # Dev tool
├── device_agent.py                  # Device automation agent
├── DEVICE_AGENT_README.md           # Device agent docs
└── IMPORT_ACCOUNTS_GUIDE.md         # Import accounts docs
```

### No Changes Needed
All scripts are actively used. No experimental or legacy directories needed at this time.

## Sample Data / Test Fixtures

### Current Test Data Locations
- `tests/scenarios/` - Test scenarios (✅ active)
- `.env.example` - Example environment configuration (✅ active)
- Any fixture files in `tests/` directories (needs review)

### Actions Needed
- [ ] Review `tests/` directories for unused fixtures
- [ ] Document purpose of each fixture file
- [ ] Remove or archive clearly obsolete test data

## Dead Code Detection

### Python Modules
- All modules in `pixsim7/backend/main/` are in active use (verified by Task 34)
- No obvious dead Python modules found in quick scan

### Frontend Components
- Phase 33.5 (Optional) - Unused Frontend Component & Hook Sweep
- Status: Deferred (large task, low priority)

## Decisions Made

1. **Keep All Current Scripts**: All scripts are actively used (no dead code found)
2. **No Reorganization Needed**: Current organization is appropriate
3. **Document Purposes**: This inventory serves as the documentation
4. **No Deletions**: Nothing to delete - all scripts serve active purposes

## Notes

- PixSim6 migration script (`import_accounts_from_pixsim6.py`) is still active and needed
- Broken `pixsim6` symlink has been removed (Phase 33.2)
- All service scripts updated to use canonical backend path (Phase 33.3)
