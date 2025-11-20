"""
API v1 routers
"""
from . import (
    auth, users, assets, admin, services, accounts, automation, prompts, generations, websocket,
    dialogue, actions, generation, npc_state, llm_cache, analytics, dev_architecture, dev_info
)

__all__ = [
	"auth",
	"users",
	"generations",
	"assets",
	"admin",
	"services",
	"accounts",
	"automation",
	"prompts",
	"websocket",
	# Narrative & NPC modules (split from game_dialogue)
	"dialogue",
	"actions",
	"generation",
	"npc_state",
	"llm_cache",
	"analytics",
	# Dev tools
	"dev_architecture",
	"dev_info",
]
