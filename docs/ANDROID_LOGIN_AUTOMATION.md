# Android Device Login Automation with Account Passwords

**Status**: Design Complete ✅ | Implementation Needed ⚠️
**Implementation Date**: 2025-11-17
**Related**: [PASSWORD_SUPPORT_FOR_AUTO_REFRESH.md](./PASSWORD_SUPPORT_FOR_AUTO_REFRESH.md)

## Overview

Enables Android devices to automatically log into provider apps using stored account credentials. Uses the same password storage system implemented for JWT auto-refresh in the browser extension.

## Problem

Currently, Android automation can execute actions on devices, but has no way to automatically log in using account credentials:
1. Devices are assigned to accounts via `AndroidDevice.assigned_account_id`
2. Accounts now have `password` field (from password support implementation)
3. Action executor supports variable substitution (`{variable_name}`)
4. **Missing**: Auto-injection of account credentials into execution context

## Solution

Auto-inject account credentials as variables when executing automation presets, allowing login flows to reference `{email}` and `{password}`.

## Current Architecture

### Data Flow

```
AutomationExecution
  ├─ account_id (FK to ProviderAccount)
  ├─ preset_id (FK to AppActionPreset)
  ├─ device_id (FK to AndroidDevice)
  └─ execution_context (JSON dict) → becomes variables in ExecutionContext

Worker: process_automation()
  ├─ Fetches AutomationExecution
  ├─ Creates ExecutionContext with variables=execution.execution_context
  └─ Executor.execute() substitutes {variables} in action params
```

### Key Files

**Domain Models:**
- `pixsim7_backend/domain/automation/execution.py:27` - `AutomationExecution.account_id`
- `pixsim7_backend/domain/automation/execution.py:55` - `AutomationExecution.execution_context`
- `pixsim7_backend/domain/automation/device.py:60` - `AndroidDevice.assigned_account_id`
- `pixsim7_backend/domain/account.py` - `ProviderAccount.password` (newly added)

**Execution Logic:**
- `pixsim7_backend/workers/automation.py:23-131` - `process_automation()` worker task
- `pixsim7_backend/workers/automation.py:73` - ExecutionContext creation with variables
- `pixsim7_backend/services/automation/action_executor.py:51-57` - Variable substitution logic
- `pixsim7_backend/services/automation/action_executor.py:117-249` - Action execution

**API Endpoints:**
- `pixsim7_backend/api/v1/automation.py:282-330` - `execute_preset_for_account()`
- `pixsim7_backend/api/v1/automation.py:339-408` - `execute_loop_for_account()`

## Implementation

### Phase 1: Auto-Inject Account Credentials

**File**: `pixsim7_backend/workers/automation.py:23-131`

**Modification**: After fetching execution (line 37), fetch the account and inject credentials into context.

```python
async def process_automation(execution_id: int) -> dict:
    """Process a single automation execution."""
    logger.info("automation_start", execution_id=execution_id)

    async for db in get_db():
        try:
            execution = await db.get(AutomationExecution, execution_id)
            if not execution:
                return {"status": "error", "error": "execution_not_found"}

            # ... existing status check ...

            # Fetch preset and device
            preset = await db.get(AppActionPreset, execution.preset_id)

            # NEW: Fetch account and inject credentials
            from pixsim7_backend.domain import ProviderAccount
            account = await db.get(ProviderAccount, execution.account_id) if execution.account_id else None

            # Build execution context with auto-injected credentials
            screenshots_dir = Path(settings.storage_base_path) / settings.automation_screenshots_dir / f"exec-{execution.id}"

            # Start with existing context or empty dict
            variables = dict(execution.execution_context or {})

            # NEW: Auto-inject account credentials if account exists
            if account:
                variables.update({
                    "email": account.email,
                    "password": account.password or "",
                    "provider_id": account.provider_id,
                    "account_id": str(account.id),
                })
                logger.info(
                    "credentials_injected",
                    execution_id=execution_id,
                    account_id=account.id,
                    email=account.email,
                    has_password=bool(account.password)
                )

            ctx = ExecutionContext(
                serial=device.adb_id,
                variables=variables,  # Now includes account credentials
                screenshots_dir=screenshots_dir
            )

            # Execute actions (unchanged)
            executor = ActionExecutor()
            await executor.execute(preset, ctx)

            # ... rest of implementation ...
```

**Security Considerations:**
- Passwords logged as boolean (`has_password`) not actual value
- Variables only exist in memory during execution
- Screenshots don't capture password fields (ActionExecutor responsibility)

### Phase 2: Create Login Preset Template

**Purpose**: Reusable login preset that works across different provider apps.

**Example**: Pixverse Login Preset

```json
{
  "name": "Pixverse Login",
  "app_package": "ai.pixverse.pixverse",
  "description": "Login to Pixverse using account credentials",
  "tags": ["login", "pixverse"],
  "actions": [
    {
      "type": "launch_app",
      "params": {}
    },
    {
      "type": "wait",
      "params": {"seconds": 3.0}
    },
    {
      "type": "if_element_exists",
      "params": {
        "text": "Log in",
        "actions": [
          {
            "type": "click_element",
            "params": {"text": "Log in"}
          },
          {
            "type": "wait",
            "params": {"seconds": 1.0}
          }
        ]
      }
    },
    {
      "type": "wait_for_element",
      "params": {
        "resource_id": "ai.pixverse.pixverse:id/email_input",
        "timeout": 10.0
      }
    },
    {
      "type": "click_element",
      "params": {"resource_id": "ai.pixverse.pixverse:id/email_input"}
    },
    {
      "type": "type_text",
      "params": {"text": "{email}"}
    },
    {
      "type": "click_element",
      "params": {"resource_id": "ai.pixverse.pixverse:id/password_input"}
    },
    {
      "type": "type_text",
      "params": {"text": "{password}"}
    },
    {
      "type": "click_element",
      "params": {"resource_id": "ai.pixverse.pixverse:id/login_button"}
    },
    {
      "type": "wait",
      "params": {"seconds": 3.0}
    },
    {
      "type": "wait_for_element",
      "params": {
        "text": "Home",
        "timeout": 15.0,
        "continue_on_timeout": false
      }
    }
  ]
}
```

**Usage:**
1. Create preset via API: `POST /api/v1/automation/presets`
2. Execute for account: `POST /api/v1/automation/execute-preset`
   ```json
   {
     "preset_id": 123,
     "account_id": 456,
     "priority": 1
   }
   ```
3. System automatically injects `{email}` and `{password}` from account 456
4. Preset executes login flow on assigned device

### Phase 3: Device-Account Assignment UI

**Frontend Enhancement** (Optional)

Add UI to assign devices to accounts:
- Device list shows assigned account
- Account list shows assigned device
- One-click assignment button
- Auto-login button that triggers login preset

**API Endpoints** (Already exist):
- `GET /api/v1/automation/devices` - List devices with `assigned_account_id`
- `PATCH /api/v1/automation/devices/{device_id}` - Update `assigned_account_id`

## Testing

### Manual Test Flow

**1. Ensure account has password:**
```python
# Check if holyfruit12 has password
from pixsim7_backend.infrastructure.database.session import get_async_session
from pixsim7_backend.domain import ProviderAccount
from sqlalchemy import select

async with get_async_session() as db:
    result = await db.execute(
        select(ProviderAccount).where(
            ProviderAccount.email == "holyfruit12@hotmail.com"
        )
    )
    account = result.scalar_one()
    print(f"Email: {account.email}")
    print(f"Has password: {bool(account.password)}")

    # Set password if needed
    if not account.password:
        account.password = "YOUR_PASSWORD_HERE"
        await db.commit()
```

**2. Create login preset:**
```bash
curl -X POST http://localhost:8000/api/v1/automation/presets \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Pixverse Login",
    "app_package": "ai.pixverse.pixverse",
    "description": "Login using account credentials",
    "tags": ["login", "pixverse"],
    "actions": [
      {"type": "launch_app", "params": {}},
      {"type": "wait", "params": {"seconds": 2.0}},
      {
        "type": "type_text",
        "params": {"text": "{email}"}
      }
    ]
  }'
```

**3. Execute preset for account:**
```bash
curl -X POST http://localhost:8000/api/v1/automation/execute-preset \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "preset_id": 1,
    "account_id": 123,
    "priority": 1
  }'
```

**4. Monitor execution:**
```bash
# Get execution status
curl http://localhost:8000/api/v1/automation/executions/{execution_id} \
  -H "Authorization: Bearer <token>"

# Check worker logs
tail -f logs/worker.log | grep credentials_injected
```

**Expected Log Output:**
```
2025-11-17T10:30:00 [INFO] credentials_injected execution_id=1 account_id=123 email=holyfruit12@hotmail.com has_password=True
```

### Automated Tests

**File**: `tests/test_automation_credentials.py` (to be created)

```python
import pytest
from pixsim7_backend.workers.automation import process_automation
from pixsim7_backend.domain import ProviderAccount, AutomationExecution, AppActionPreset

@pytest.mark.asyncio
async def test_credentials_injected_into_execution_context(db_session):
    """Verify account credentials are auto-injected as variables"""

    # Create account with password
    account = ProviderAccount(
        user_id=1,
        email="test@example.com",
        password="test_password",
        provider_id="pixverse"
    )
    db_session.add(account)
    await db_session.commit()

    # Create preset with {email} variable
    preset = AppActionPreset(
        name="Test Login",
        app_package="test.app",
        actions=[
            {"type": "type_text", "params": {"text": "{email}"}},
            {"type": "type_text", "params": {"text": "{password}"}}
        ]
    )
    db_session.add(preset)
    await db_session.commit()

    # Create execution
    execution = AutomationExecution(
        user_id=1,
        preset_id=preset.id,
        account_id=account.id,
        execution_context={}  # Empty context
    )
    db_session.add(execution)
    await db_session.commit()

    # TODO: Mock device and executor, then verify variables contain credentials
    # This requires more test infrastructure setup
```

## Security Considerations

### Current Implementation

**Passwords in Memory:**
- Stored in `variables` dict during execution only
- Not persisted to `execution_context` field
- Cleared when execution completes

**Logging:**
- Email logged (useful for debugging)
- Password logged as boolean only (`has_password=True/False`)
- Never log actual password value

**Screenshots:**
- Action executor can capture screenshots
- Risk: Password fields visible in screenshots
- Mitigation: Avoid screenshots during sensitive actions

### Recommended Improvements

**1. Exclude passwords from screenshots:**
```python
# In action_executor.py, modify screenshot action
elif a_type == "screenshot":
    # Check if we're in a sensitive context (typing password)
    if ctx.variables.get("_sensitive_mode", False):
        logger.info("screenshot_skipped", reason="sensitive_mode")
        return

    ts = datetime.utcnow().strftime("%Y%m%d-%H%M%S-%f")
    dest = ctx.screenshots_dir / f"shot-{ts}.png"
    await self.adb.screenshot(ctx.serial, dest)
```

**2. Mark password fields as sensitive:**
```json
{
  "type": "type_text",
  "params": {
    "text": "{password}",
    "sensitive": true
  }
}
```

Then in executor, set `ctx.variables["_sensitive_mode"] = True` before/after typing.

**3. Encrypt passwords at rest** (future):
- Use Fernet encryption for `ProviderAccount.password`
- Decrypt only when needed for execution
- See [PASSWORD_SUPPORT_FOR_AUTO_REFRESH.md](./PASSWORD_SUPPORT_FOR_AUTO_REFRESH.md) for details

## Integration with Existing Systems

### Browser Extension Password Import

**Flow:**
1. User imports cookies via extension
2. Extension prompts for password (skip for Google accounts)
3. Backend saves password to `ProviderAccount.password`
4. Password now available for both:
   - JWT auto-refresh (browser)
   - Android device login (automation)

**Same password, dual usage!**

### Execution Loops

Automation loops can now include login presets:

```json
{
  "name": "Daily Credit Check Loop",
  "preset_execution_mode": "SHARED_LIST",
  "shared_preset_ids": [
    123,  // Login preset (uses {email}/{password})
    124,  // Navigate to credits page
    125   // Screenshot credits
  ],
  "interval_minutes": 1440,
  "accounts": [456, 789]  // Execute for multiple accounts
}
```

Loop automatically rotates through accounts, each execution gets correct credentials.

## Common Use Cases

### 1. Daily Auto-Login
Keep devices logged in by running login preset daily:
```json
{
  "loop_name": "Daily Auto-Login",
  "preset_id": 123,  // Login preset
  "accounts": [456, 789, 101],
  "interval_minutes": 1440,  // 24 hours
  "status": "active"
}
```

### 2. Multi-Account Credit Farming
Rotate through accounts to collect daily credits:
```json
{
  "loop_name": "Credit Farming",
  "shared_preset_ids": [
    123,  // Login
    124,  // Claim daily credits
    125,  // Watch ad (if available)
    126   // Screenshot results
  ],
  "accounts": [101, 102, 103, 104, 105],
  "interval_minutes": 30,  // Every 30 mins
  "status": "active"
}
```

### 3. Account Recovery After Logout
Detect logout and auto-login:
```json
{
  "name": "Recovery Login",
  "actions": [
    {
      "type": "if_element_exists",
      "params": {
        "text": "Log in",
        "actions": [
          // Full login flow using {email}/{password}
        ]
      }
    }
  ]
}
```

## Migration Guide

### For Existing Accounts

**Option 1**: Use extension password import (recommended)
1. User re-imports account via extension
2. Extension prompts for password
3. Backend updates `password` field
4. Ready for automation

**Option 2**: Bulk password update script
```python
async def add_passwords_bulk():
    accounts_with_passwords = {
        "holyfruit12@hotmail.com": "password123",
        # ... more accounts
    }

    async with get_async_session() as db:
        for email, pwd in accounts_with_passwords.items():
            result = await db.execute(
                select(ProviderAccount).where(ProviderAccount.email == email)
            )
            account = result.scalar_one_or_none()
            if account:
                account.password = pwd
        await db.commit()
```

**Option 3**: Manual via database
```sql
UPDATE provider_accounts
SET password = 'your_password_here'
WHERE email = 'holyfruit12@hotmail.com';
```

## Future Enhancements

### Phase 4: Smart Login Detection
- Detect if already logged in before running login preset
- Skip login actions if session valid
- Use element detection: `if_element_not_exists("Home")`

### Phase 5: Multi-Factor Authentication
- Support TOTP codes
- SMS verification handling
- Email verification handling

### Phase 6: Login Analytics
- Track login success/failure rates per account
- Detect CAPTCHA challenges
- Alert on repeated failures (password changed?)

### Phase 7: Headless Login Service
- Dedicated service for account login
- REST API: `POST /api/v1/automation/login-account`
- Returns: Session cookies, JWT tokens
- Integrates with both browser extension and Android automation

## Summary

### What's Working Now ✅
- Backend stores passwords per account
- Action executor supports variable substitution
- Automation executions linked to accounts
- Device assignment to accounts

### What Needs Implementation ⚠️
- Auto-inject credentials in `process_automation()` worker
- Create login preset templates per provider
- Add security measures for screenshots
- Update documentation for preset creation

### What's Next 🔮
- Test with holyfruit12 account on Android device
- Create login presets for all providers
- Build UI for device-account assignment
- Implement smart login detection
- Add login analytics and monitoring

---

**Last Updated**: 2025-11-17
**Related Files**:
- `pixsim7_backend/workers/automation.py` (process_automation)
- `pixsim7_backend/services/automation/action_executor.py` (variable substitution)
- `pixsim7_backend/domain/automation/execution.py` (AutomationExecution model)
- `pixsim7_backend/domain/automation/device.py` (AndroidDevice model)
- `pixsim7_backend/api/v1/automation.py` (automation endpoints)
- `docs/PASSWORD_SUPPORT_FOR_AUTO_REFRESH.md` (password storage implementation)
