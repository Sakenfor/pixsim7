"""
Entry point for the PixSim7 Launcher GUI.
Run this from the repo root: python scripts/launcher.py
"""
import sys
import os

# Add the repo root to the path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from scripts.launcher_gui.launcher import main

if __name__ == '__main__':
    main()
