#!/usr/bin/env python3
"""
Test script for Semantic Packs feature

Demonstrates:
1. Creating a semantic pack with parser hints
2. Using parser hints to extend parser vocabulary
3. Parsing prompts with custom keywords
"""

import asyncio
from pixsim7.backend.main.services.prompt.parser.simple import SimplePromptParser
from pixsim7.backend.main.services.prompt.parser.hints import ParserHintProvider
from pixsim7.backend.main.domain.semantic_pack import SemanticPackDB


async def test_parser_with_hints():
    """Test the parser with custom semantic pack hints"""

    print("=" * 60)
    print("Semantic Packs & Parser Hints Test")
    print("=" * 60)

    # ===== Test 1: Create a sample semantic pack =====
    print("\n1. Creating sample 'Minotaur City' semantic pack...")

    minotaur_pack = SemanticPackDB(
        id="minotaur_city_pack",
        version="0.1.0",
        label="Minotaur City - Core",
        description="Core semantic pack for Minotaur City setting",
        author="Test Author",
        tags=["fantasy", "minotaur", "urban"],
        parser_hints={
            "role:character": [
                "minotaur",
                "werecow",
                "bull-man",
                "horned warrior"
            ],
            "setting": [
                "labyrinth",
                "maze district",
                "bull temple",
                "arena"
            ],
            "action": [
                "charges",
                "bellows",
                "stomps"
            ],
            "phys:size:large": [
                "towering",
                "massive",
                "hulking"
            ],
        },
        action_block_ids=["minotaur_approach", "minotaur_charge"],
        prompt_family_slugs=["minotaur-encounters"],
        status="published",
    )

    print(f"   Pack ID: {minotaur_pack.id}")
    print(f"   Version: {minotaur_pack.version}")
    print(f"   Label: {minotaur_pack.label}")
    print(f"   Parser hints: {len(minotaur_pack.parser_hints)} categories")

    # ===== Test 2: Build hint map =====
    print("\n2. Building hint map from pack...")

    hints = ParserHintProvider.build_role_keyword_map([minotaur_pack])
    print(f"   Merged hints: {len(hints)} categories")
    for category, keywords in hints.items():
        print(f"   - {category}: {keywords[:3]}{'...' if len(keywords) > 3 else ''}")

    # ===== Test 3: Parse without hints (baseline) =====
    print("\n3. Parsing test prompt WITHOUT custom hints...")

    test_prompt = "A towering minotaur charges through the maze district. The bull-man bellows loudly."

    parser_default = SimplePromptParser()
    result_default = await parser_default.parse(test_prompt)

    print(f"   Prompt: '{test_prompt}'")
    print(f"   Blocks found: {len(result_default.blocks)}")
    for i, block in enumerate(result_default.blocks):
        print(f"   [{i+1}] Role: {block.role:12} | Text: {block.text}")
        if block.metadata:
            print(f"       Metadata: {block.metadata}")

    # ===== Test 4: Parse with hints =====
    print("\n4. Parsing test prompt WITH custom hints from pack...")

    parser_custom = SimplePromptParser(hints=hints)
    result_custom = await parser_custom.parse(test_prompt)

    print(f"   Prompt: '{test_prompt}'")
    print(f"   Blocks found: {len(result_custom.blocks)}")
    for i, block in enumerate(result_custom.blocks):
        print(f"   [{i+1}] Role: {block.role:12} | Text: {block.text}")
        if block.metadata:
            print(f"       Metadata: {block.metadata}")

    # ===== Test 5: Compare results =====
    print("\n5. Comparison:")
    print("   WITHOUT hints:")
    for block in result_default.blocks:
        print(f"   - {block.role}: {block.text[:50]}...")

    print("\n   WITH hints:")
    for block in result_custom.blocks:
        print(f"   - {block.role}: {block.text[:50]}...")

    # ===== Test 6: Demonstrate hint extraction =====
    print("\n6. Testing hint extraction for specific roles...")

    character_hints = ParserHintProvider.extract_role_hints(hints, "character")
    print(f"   Character role hints: {character_hints}")

    setting_hints = ParserHintProvider.extract_role_hints(hints, "setting")
    print(f"   Setting hints: {setting_hints}")

    # ===== Test 7: Pack manifest conversion =====
    print("\n7. Converting pack to manifest...")

    manifest = minotaur_pack.to_manifest()
    print(f"   Manifest ID: {manifest.id}")
    print(f"   Manifest version: {manifest.version}")
    print(f"   Manifest status: {manifest.status}")
    print(f"   Parser hints categories: {len(manifest.parser_hints)}")

    print("\n" + "=" * 60)
    print("All tests completed successfully!")
    print("=" * 60)

    return True


if __name__ == "__main__":
    asyncio.run(test_parser_with_hints())
