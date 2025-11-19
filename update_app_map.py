#!/usr/bin/env python3
"""Update APP_MAP.md with new agent-friendly intro section."""

import re

# Read the original file
with open("docs/APP_MAP.md", "r", encoding="utf-8") as f:
    content = f.read()

# Read the new intro
with open("docs/APP_MAP_NEW_INTRO.md", "r", encoding="utf-8") as f:
    new_intro = f.read()

# Pattern to match the old intro section (from title to ## Overview)
old_intro_pattern = r'(# App Map & Architecture Index\n\n\*\*Last Updated:\*\* 2025-11-19\n\n).*?(##  Overview)'

# Replacement text
replacement = r'\1---\n\n' + new_intro + r'\n\n---\n\n\2'

# Perform the replacement
updated_content = re.sub(old_intro_pattern, replacement, content, flags=re.DOTALL)

# Write the updated content
with open("docs/APP_MAP.md", "w", encoding="utf-8") as f:
    f.write(updated_content)

print("APP_MAP.md updated successfully!")
