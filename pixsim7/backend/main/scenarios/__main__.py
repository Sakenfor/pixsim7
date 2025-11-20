"""
Entry point for running scenarios as a module

Usage:
    python -m pixsim7.backend.main.scenarios
"""
from .run_all import main
import asyncio
import sys

if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
