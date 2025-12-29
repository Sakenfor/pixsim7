"""
Sensation Tools Plugin - Standalone tool pack

Provides indirect and heightened sensation tools for romance gameplay:
- feather: Teasing, ticklish touch
- pleasure: Advanced, intense stimulation
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest

# =============================================================================
# Plugin Manifest
# =============================================================================

manifest = PluginManifest(
    id="sensation-tools",
    name="Sensation Tools",
    version="1.0.0",
    description="Indirect and heightened sensation tools for romance gameplay",
    author="PixSim Team",
    kind="tools",
    prefix="/api/v1",
    tags=["tools", "romance", "gizmos"],
    dependencies=[],
    requires_db=False,
    requires_redis=False,
    enabled=True,

    # No special permissions needed - tools are frontend-only
    permissions=[],

    # Frontend manifest with tools
    frontend_manifest={
        "pluginId": "sensation-tools",
        "pluginName": "Sensation Tools",
        "version": "1.0.0",
        "icon": "🪶",
        "description": "Indirect and heightened sensation tools",

        # Tools in this pack
        "tools": [
            {
                "id": "feather",
                "type": "tease",
                "name": "Feather",
                "description": "Teasing, ticklish touch",
                "unlockLevel": 20,
                "visual": {
                    "model": "feather",
                    "baseColor": "rgba(255, 255, 255, 0.8)",
                    "activeColor": "rgba(200, 150, 255, 0.9)",
                    "glow": False,
                    "trail": True,
                    "particles": {
                        "type": "petals",
                        "density": 0.5,
                        "color": "#FFE4E1",
                        "size": 8,
                        "lifetime": 1800,
                        "velocity": {"x": 0, "y": -1, "z": 0}
                    }
                },
                "physics": {
                    "pressure": 0.2,
                    "speed": 0.6,
                    "pattern": "zigzag"
                },
                "feedback": {
                    "haptic": {
                        "type": "tickle",
                        "intensity": 0.3,
                        "duration": 80,
                        "frequency": 5
                    },
                    "npcReaction": {
                        "expression": "delight",
                        "vocalization": "giggle",
                        "intensity": 0.5
                    },
                    "trail": {
                        "type": "fade",
                        "color": "rgba(255, 255, 255, 0.4)",
                        "width": 10,
                        "lifetime": 1500
                    }
                },
                "constraints": {
                    "minPressure": 0.1,
                    "maxSpeed": 0.8
                }
            },
            {
                "id": "pleasure",
                "type": "pleasure",
                "name": "Pleasure",
                "description": "Advanced, intense stimulation",
                "unlockLevel": 80,
                "visual": {
                    "model": "electric",
                    "baseColor": "rgba(255, 50, 150, 0.7)",
                    "activeColor": "rgba(255, 0, 150, 1.0)",
                    "glow": True,
                    "trail": True,
                    "particles": {
                        "type": "hearts",
                        "density": 1.0,
                        "color": "#FF1493",
                        "size": 15,
                        "lifetime": 1500,
                        "velocity": {"x": 0, "y": -3, "z": 0}
                    },
                    "distortion": True
                },
                "physics": {
                    "pressure": 0.7,
                    "speed": 0.6,
                    "vibration": 0.8,
                    "pattern": "pulse"
                },
                "feedback": {
                    "haptic": {
                        "type": "vibrate",
                        "intensity": 0.8,
                        "duration": 250,
                        "frequency": 10
                    },
                    "audio": {
                        "sound": "pleasure_hum",
                        "volume": 0.4,
                        "pitch": 1.0,
                        "loop": True
                    },
                    "npcReaction": {
                        "expression": "pleasure",
                        "vocalization": "moan",
                        "intensity": 0.9
                    },
                    "trail": {
                        "type": "sparkle",
                        "color": "rgba(255, 0, 150, 0.7)",
                        "width": 25,
                        "lifetime": 2000
                    }
                },
                "constraints": {
                    "minPressure": 0.5,
                    "maxSpeed": 1.0,
                    "cooldown": 2000
                }
            }
        ]
    },
)


# =============================================================================
# Lifecycle Hooks
# =============================================================================

def on_load(app):
    """Called when plugin is loaded"""
    from pixsim_logging import configure_logging
    logger = configure_logging("plugin.sensation-tools")
    logger.info("Sensation Tools plugin loaded - 2 tools: feather, pleasure")


async def on_enable():
    """Called when plugin is enabled"""
    from pixsim_logging import configure_logging
    logger = configure_logging("plugin.sensation-tools")
    logger.info("Sensation Tools plugin enabled")


async def on_disable():
    """Called when plugin is disabled"""
    from pixsim_logging import configure_logging
    logger = configure_logging("plugin.sensation-tools")
    logger.info("Sensation Tools plugin disabled")
