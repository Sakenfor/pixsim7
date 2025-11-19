"""
API v1 routers
"""
from . import auth, users, jobs, assets, admin, services, accounts, automation, prompts, generations

__all__ = [
	"auth",
	"users",
	"jobs",
	"generations",
	"assets",
	"admin",
	"services",
	"accounts",
	"automation",
	"prompts",
]
