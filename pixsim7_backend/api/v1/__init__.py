"""
API v1 routers
"""
from . import auth, users, assets, admin, services, accounts, automation, prompts, generations

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
]
