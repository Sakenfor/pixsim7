"""
Touch Tools Plugin - Standalone tool pack

Provides direct touch interaction tools for romance gameplay:
- hand-3d: Realistic 3D hand for natural touch
- caress: Gentle, sensual stroking
- silk: Smooth, luxurious fabric touch
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest

# =============================================================================
# Plugin Manifest
# =============================================================================

manifest = PluginManifest(
    id="touch-tools",
    name="Touch Tools",
    version="1.0.0",
    description="Direct touch interaction tools - hands-on tools for romance gameplay",
    author="PixSim Team",
    kind="tools",  # Frontend-only, no backend routes
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
        "pluginId": "touch-tools",
        "pluginName": "Touch Tools",
        "version": "1.0.0",
        "icon": "✋",
        "description": "Direct touch variants - hands-on interaction tools",

        # Tools in this pack
        "tools": [
            {
                "id": "hand-3d",
                "type": "touch",
                "name": "3D Hand",
                "description": "Realistic hand for natural touch interaction",
                "unlockLevel": 0,
                "visual": {
                    "model": "hand",
                    "baseColor": "rgba(255, 220, 190, 0.9)",
                    "activeColor": "rgba(255, 150, 180, 1.0)",
                    "glow": True,
                    "trail": True,
                    "particles": {
                        "type": "hearts",
                        "density": 0.5,
                        "color": "#FFB6C1",
                        "size": 10,
                        "lifetime": 1500
                    }
                },
                "physics": {
                    "pressure": 0.5,
                    "speed": 0.5,
                    "pattern": "circular",
                    "elasticity": 0.7
                },
                "feedback": {
                    "haptic": {
                        "type": "pulse",
                        "intensity": 0.5,
                        "duration": 120
                    },
                    "npcReaction": {
                        "expression": "pleasure",
                        "vocalization": "sigh",
                        "intensity": 0.6
                    },
                    "impact": {
                        "type": "squish",
                        "intensity": 0.3,
                        "ripples": True
                    }
                }
            },
            {
                "id": "caress",
                "type": "caress",
                "name": "Caress",
                "description": "Gentle, sensual stroking",
                "unlockLevel": 10,
                "visual": {
                    "model": "hand",
                    "baseColor": "rgba(255, 180, 200, 0.6)",
                    "activeColor": "rgba(255, 100, 150, 0.9)",
                    "glow": True,
                    "trail": True,
                    "particles": {
                        "type": "hearts",
                        "density": 0.7,
                        "color": "#FF69B4",
                        "size": 12,
                        "lifetime": 2000,
                        "velocity": {"x": 0, "y": -2, "z": 0}
                    }
                },
                "physics": {
                    "pressure": 0.4,
                    "speed": 0.3,
                    "pattern": "circular"
                },
                "feedback": {
                    "haptic": {
                        "type": "wave",
                        "intensity": 0.4,
                        "duration": 150,
                        "frequency": 2
                    },
                    "npcReaction": {
                        "expression": "pleasure",
                        "vocalization": "sigh",
                        "intensity": 0.6
                    },
                    "trail": {
                        "type": "sparkle",
                        "color": "rgba(255, 150, 200, 0.5)",
                        "width": 15,
                        "lifetime": 2500
                    }
                }
            },
            {
                "id": "silk",
                "type": "caress",
                "name": "Silk",
                "description": "Smooth, luxurious touch with silk fabric",
                "unlockLevel": 40,
                "visual": {
                    "model": "silk",
                    "baseColor": "rgba(200, 150, 255, 0.7)",
                    "activeColor": "rgba(255, 100, 255, 0.9)",
                    "glow": True,
                    "trail": True,
                    "particles": {
                        "type": "petals",
                        "density": 0.6,
                        "color": "#DDA0DD",
                        "size": 10,
                        "lifetime": 2500
                    },
                    "distortion": False
                },
                "physics": {
                    "pressure": 0.35,
                    "speed": 0.4,
                    "pattern": "linear",
                    "viscosity": 0.3
                },
                "feedback": {
                    "haptic": {
                        "type": "wave",
                        "intensity": 0.5,
                        "duration": 200,
                        "frequency": 1.5
                    },
                    "npcReaction": {
                        "expression": "satisfaction",
                        "vocalization": "sigh",
                        "intensity": 0.7
                    },
                    "trail": {
                        "type": "fade",
                        "color": "rgba(200, 150, 255, 0.6)",
                        "width": 20,
                        "lifetime": 3000
                    }
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
    logger = configure_logging("plugin.touch-tools")
    logger.info("Touch Tools plugin loaded - 3 tools: hand-3d, caress, silk")


async def on_enable():
    """Called when plugin is enabled"""
    from pixsim_logging import configure_logging
    logger = configure_logging("plugin.touch-tools")
    logger.info("Touch Tools plugin enabled")


async def on_disable():
    """Called when plugin is disabled"""
    from pixsim_logging import configure_logging
    logger = configure_logging("plugin.touch-tools")
    logger.info("Touch Tools plugin disabled")
