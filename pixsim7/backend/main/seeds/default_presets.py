"""
Default automation presets for Pixverse Android app

These presets are automatically seeded into the database on first run.
"""
from typing import List, Dict, Any
from datetime import datetime, timezone

# Pixverse Android app details
PIXVERSE_PACKAGE = "com.pixverseai.pixverse"
PIXVERSE_ACTIVITY = "com.pixverseai.pixverse.MainActivity"


DEFAULT_PRESETS: List[Dict[str, Any]] = [
    # Smart Login/Logout preset with conditional logic
    {
        "name": "Smart Login (with Auto-Logout)",
        "category": "account_login",
        "description": "Smart login with manual logout flow. Checks if logged in (Mine tab), logs out if needed, then logs in.",
        "app_package": PIXVERSE_PACKAGE,
        "requires_password": True,
        "actions": [
            # Step 0: Launch app
            {
                "type": "launch_app",
                "params": {
                    "package": PIXVERSE_PACKAGE,
                    "activity": PIXVERSE_ACTIVITY
                },
                "description": "Launch Pixverse app"
            },

            # Step 1: Wait for app to load
            {
                "type": "wait",
                "params": {"seconds": 2},
                "description": "Wait for app to load"
            },

            # Step 2: Check if logged in - if "Mine" tab exists, logout
            {
                "type": "if_element_exists",
                "selector": {
                    "description": "Mine",
                    "timeout": 2.0
                },
                "then_actions": [
                    {
                        "type": "click_element",
                        "params": {
                            "content_desc": "Mine",
                            "continue_on_error": True
                        },
                        "description": "Click Mine tab"
                    },
                    {
                        "type": "wait",
                        "params": {"seconds": 1},
                        "description": "Wait for Mine screen"
                    },
                    {
                        "type": "click_coords",
                        "params": {
                            "x": 39,
                            "y": 76
                        },
                        "description": "Click settings button (39, 76)"
                    },
                    {
                        "type": "wait",
                        "params": {"seconds": 1},
                        "description": "Wait for menu"
                    },
                    {
                        "type": "click_element",
                        "params": {
                            "content_desc": "Logout",
                            "continue_on_error": True
                        },
                        "description": "Click Logout"
                    },
                    {
                        "type": "wait",
                        "params": {"seconds": 1},
                        "description": "Wait for confirmation"
                    },
                    {
                        "type": "click_element",
                        "params": {
                            "content_desc": "Confirm",
                            "continue_on_error": True
                        },
                        "description": "Click Confirm"
                    },
                    {
                        "type": "wait",
                        "params": {"seconds": 2},
                        "description": "Wait for logout to complete"
                    }
                ],
                "description": "Logout if already logged in (Mine tab exists)"
            },

            # Step 3: Check for "Login & Rewards" and click if visible
            {
                "type": "if_element_exists",
                "selector": {
                    "description": "Login & Rewards",
                    "timeout": 2.0
                },
                "then_actions": [
                    {
                        "type": "click_element",
                        "params": {
                            "content_desc": "Login & Rewards",
                            "continue_on_error": True
                        },
                        "description": "Click Login & Rewards"
                    },
                    {
                        "type": "wait",
                        "params": {"seconds": 1},
                        "description": "Wait after clicking"
                    }
                ],
                "description": "Click Login & Rewards if visible"
            },

            # Step 5: Click "Login with Email" button
            {
                "type": "click_element",
                "params": {
                    "content_desc": "Login with Email",
                    "continue_on_error": True
                },
                "description": "Click Login with Email button"
            },

            # Step 5: Wait for login form to appear
            {
                "type": "wait",
                "params": {"seconds": 2},
                "description": "Wait for login form"
            },

            # Step 6: Click username field at (437, 358)
            {
                "type": "click_coords",
                "params": {
                    "x": 437,
                    "y": 358
                },
                "description": "Click username field (437, 358)"
            },

            # Step 7: Type username/email
            {
                "type": "type_text",
                "params": {
                    "text": "{email}"
                },
                "description": "Type username/email"
            },

            # Step 8: Click password field at (473, 463)
            {
                "type": "click_coords",
                "params": {
                    "x": 473,
                    "y": 463
                },
                "description": "Click password field (473, 463)"
            },

            # Step 10: Type password
            {
                "type": "type_text",
                "params": {
                    "text": "{password}"
                },
                "description": "Type password"
            },

            # Step 11: Hide keyboard
            {
                "type": "press_back",
                "params": {},
                "description": "Hide keyboard"
            },

            # Step 12: Wait for keyboard to hide
            {
                "type": "wait",
                "params": {"seconds": 2},
                "description": "Wait for keyboard to hide"
            },

            # Step 13: Wait for Continue button to be available
            {
                "type": "wait_for_element",
                "params": {
                    "content_desc": "Continue",
                    "timeout": 5.0
                },
                "description": "Wait for Continue button"
            },

            # Step 14: Click Continue button
            {
                "type": "click_element",
                "params": {
                    "content_desc": "Continue"
                },
                "description": "Click Continue button"
            },

            # Step 14: Wait for login to complete
            {
                "type": "wait",
                "params": {"seconds": 8},
                "description": "Wait for login to complete"
            },

            # Step 14: Take screenshot
            {
                "type": "screenshot",
                "params": {},
                "description": "Capture final screenshot"
            }
        ]
    },

    # Daily rewards preset
    {
        "name": "Claim Pixverse Daily Rewards",
        "category": "rewards",
        "description": "Watch daily ads and claim rewards in Pixverse app (ad count is read dynamically).",
        "app_package": PIXVERSE_PACKAGE,
        "actions": [
            # Step 0: Ensure app is running
            {
                "type": "launch_app",
                "params": {
                    "package": PIXVERSE_PACKAGE,
                    "activity": PIXVERSE_ACTIVITY
                },
                "description": "Launch Pixverse app"
            },

            # Step 1: Wait for app
            {
                "type": "wait",
                "params": {"seconds": 3},
                "description": "Wait for app to load"
            },

            # Step 2: Click rewards entry button (top-left icon)
            {
                "type": "click_coords",
                "params": {
                    "x": 100,
                    "y": 200
                },
                "description": "Click rewards entry button"
            },

            # Step 3: Wait for rewards screen
            {
                "type": "wait",
                "params": {"seconds": 3},
                "description": "Wait for rewards screen to load"
            },

            # Step 4: Watch daily ads (count injected dynamically from ad task status)
            {
                "type": "repeat",
                "params": {
                    "count": "{pixverse_ad_total_counts}",
                    # Fallback if ad task status couldn't be fetched (historically 2).
                    "fallback_count": 2,
                    "delay_between": 1,
                    "actions": [
                        {
                            "type": "click_coords",
                            "params": {"x": 540, "y": 800},
                            "description": "Click ad button"
                        },
                        {
                            "type": "wait",
                            "params": {"seconds": 40},
                            "description": "Wait for ad to complete"
                        },
                    ],
                },
                "description": "Watch daily reward ads"
            },

            # Step 5: Take screenshot
            {
                "type": "screenshot",
                "params": {},
                "description": "Capture post-rewards screenshot"
            },

            # Step 6: Go back to main screen
            {
                "type": "press_back",
                "params": {},
                "description": "Return to main screen"
            }
        ]
    }
]


async def seed_default_presets(db):
    """
    Seed default presets into database if they don't exist

    Usage:
        from pixsim7.backend.main.seeds.default_presets import seed_default_presets
        await seed_default_presets(db)
    """
    from sqlalchemy import select
    from pixsim7.backend.main.domain.automation.preset import AppActionPreset

    for preset_data in DEFAULT_PRESETS:
        # Check if preset already exists
        result = await db.execute(
            select(AppActionPreset).where(AppActionPreset.name == preset_data["name"])
        )
        existing = result.scalar_one_or_none()

        if existing:
            # Update existing system preset with latest actions
            if existing.is_system:
                print(f"Preset '{preset_data['name']}' already exists, updating actions")
                existing.actions = preset_data["actions"]
                existing.description = preset_data.get("description", "")
                existing.app_package = preset_data.get("app_package", PIXVERSE_PACKAGE)
                existing.requires_password = preset_data.get("requires_password", False)
                existing.updated_at = datetime.now(timezone.utc)
                print(f"[OK] Updated preset: {preset_data['name']}")
            else:
                print(f"Preset '{preset_data['name']}' already exists (not system), skipping")
            continue

        # Create preset
        preset = AppActionPreset(
            name=preset_data["name"],
            category=preset_data["category"],
            description=preset_data.get("description", ""),
            app_package=preset_data.get("app_package", PIXVERSE_PACKAGE),
            actions=preset_data["actions"],
            requires_password=preset_data.get("requires_password", False),
            is_system=True,
            is_shared=True,
            owner_id=None,  # System presets have no owner
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )

        db.add(preset)
        print(f"[OK] Created preset: {preset_data['name']}")

    await db.commit()
    print(f"[OK] Seeded {len(DEFAULT_PRESETS)} default presets")
