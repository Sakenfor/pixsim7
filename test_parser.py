#!/usr/bin/env python3
"""
Quick test script for the new native prompt parser.
Tests basic functionality without requiring the full backend environment.
"""

import asyncio
import sys
import os

# Add the backend to the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "pixsim7", "backend"))

from main.services.prompt.parser import SimplePromptParser, parse_prompt_to_candidates, analyze_prompt


async def test_parser():
    """Test the native parser with a sample prompt."""

    print("=" * 60)
    print("Testing PixSim7 Native Prompt Parser")
    print("=" * 60)

    # Test case 1: Simple prompt
    test_prompts = [
        "A werewolf enters the forest.",
        "The woman kisses him tenderly in the moonlit bedroom.",
        "Camera pans across the castle as thunder rumbles.",
        "She feels anxious and afraid.",
    ]

    for i, prompt_text in enumerate(test_prompts, 1):
        print(f"\n--- Test {i} ---")
        print(f"Prompt: {prompt_text}")

        # Test SimplePromptParser directly
        parser = SimplePromptParser()
        parsed = await parser.parse(prompt_text)

        print(f"Segments found: {len(parsed.segments)}")
        for segment in parsed.segments:
            print(f"  - [{segment.role}] {segment.text}")
            if segment.metadata:
                print(f"    Metadata: {segment.metadata}")

        # Test adapter
        adapter_result = await parse_prompt_to_candidates(prompt_text)
        print(f"Adapter candidates: {adapter_result['candidates']}")

        # Test full analysis
        analysis = await analyze_prompt(prompt_text)
        print(f"Tags: {analysis['tags']}")

    print("\n" + "=" * 60)
    print("All tests completed successfully!")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(test_parser())
