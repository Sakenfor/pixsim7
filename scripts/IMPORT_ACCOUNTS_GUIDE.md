# Import Accounts from PixSim6

## Prerequisites

**Yes, both databases need to be running:**
- PixSim6 database on port 5432
- PixSim7 database on port 5433

## Quick Start

1. **Start databases** (if not running):
```powershell
# In pixsim7 directory
docker-compose up -d
```

2. **Preview import** (dry run - won't change anything):
```powershell
python scripts/import_accounts_from_pixsim6.py --username sakenfor --dry-run
```

3. **Actually import**:
```powershell
python scripts/import_accounts_from_pixsim6.py --username sakenfor
```

## Options

**Import only specific provider:**
```powershell
python scripts/import_accounts_from_pixsim6.py --username sakenfor --provider pixverse
```

**Preview what would be imported:**
```powershell
python scripts/import_accounts_from_pixsim6.py --username sakenfor --dry-run
```

## What Gets Imported

From each PixSim6 account:
- ✅ Email, nickname, provider info
- ✅ Authentication (JWT, API keys, cookies)
- ✅ Credits (both regular and OpenAPI)
- ✅ Usage stats (videos generated, success rate)
- ✅ Status and settings
- ✅ Rate limiting info

Accounts are imported as **private** (only you can use them).

## Database Configuration

The script uses these defaults (edit `scripts/import_accounts_from_pixsim6.py` if different):

**PixSim6:**
- URL: `postgresql://pixsim:pixsim123@localhost:5432/pixsim`

**PixSim7:**
- URL: `postgresql://pixsim7:pixsim7_secure_2024@localhost:5433/pixsim7`

## Troubleshooting

**User not found:**
```powershell
# Create user first
python create_admin.py
# Enter username: sakenfor
```

**Database not running:**
```powershell
# Start both databases
docker-compose up -d
```

**Port conflicts:**
- PixSim6 should be on port 5432
- PixSim7 should be on port 5433
- Edit docker-compose.yml if needed
