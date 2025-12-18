#!/usr/bin/env python3
"""
Validation script for the action blocks v2 architecture.

Tests:
1. ActionBlock validation (single_state vs transition requirements)
2. ID canonicalization
3. OntologyService loading
4. BlockRegistry operations
5. BlockSelector chain selection
6. Ontology-driven scoring

Run from project root with the project's virtual environment:
    # With pip
    pip install -e . && python scripts/validate_action_blocks.py

    # Or with uv/rye/etc
    uv run python scripts/validate_action_blocks.py

Requires: pydantic, pyyaml, sqlalchemy (for entity_ref imports)
"""

import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))


def test_action_block_validation():
    """Test ActionBlock validation for kind-specific fields."""
    from pixsim7.backend.main.domain.narrative.action_blocks import (
        ActionBlock,
        ReferenceImage,
        TransitionEndpoint,
    )
    from pydantic import ValidationError

    print("Testing ActionBlock validation...")

    # Valid single_state block
    try:
        block = ActionBlock(
            id="test_single_state",
            kind="single_state",
            referenceImage=ReferenceImage(url="http://example.com/img.jpg"),
            prompt="Test prompt",
            startPose="standing_neutral",  # Should be canonicalized
            endPose="standing_neutral",
        )
        assert block.startPose == "pose:standing_neutral", f"Expected canonicalized pose, got {block.startPose}"
        print("  ✓ Valid single_state block created")
    except Exception as e:
        print(f"  ✗ Failed to create valid single_state block: {e}")
        return False

    # Invalid single_state (missing referenceImage)
    try:
        ActionBlock(
            id="test_invalid",
            kind="single_state",
            prompt="Test prompt",
        )
        print("  ✗ Should have rejected single_state without referenceImage")
        return False
    except ValidationError as e:
        print("  ✓ Correctly rejected single_state without referenceImage")

    # Invalid single_state (has from_/to)
    try:
        ActionBlock(
            id="test_invalid",
            kind="single_state",
            referenceImage=ReferenceImage(url="http://example.com/img.jpg"),
            prompt="Test prompt",
            from_=TransitionEndpoint(
                referenceImage=ReferenceImage(url="http://example.com/from.jpg"),
                pose="standing",
            ),
        )
        print("  ✗ Should have rejected single_state with from_ field")
        return False
    except ValidationError as e:
        print("  ✓ Correctly rejected single_state with from_ field")

    # Valid transition block
    try:
        block = ActionBlock(
            id="test_transition",
            kind="transition",
            from_=TransitionEndpoint(
                referenceImage=ReferenceImage(url="http://example.com/from.jpg"),
                pose="standing_neutral",
            ),
            to=TransitionEndpoint(
                referenceImage=ReferenceImage(url="http://example.com/to.jpg"),
                pose="sitting_neutral",
            ),
            prompt="Transition prompt",
        )
        assert block.from_.pose == "pose:standing_neutral", f"Expected canonicalized from pose, got {block.from_.pose}"
        assert block.to.pose == "pose:sitting_neutral", f"Expected canonicalized to pose, got {block.to.pose}"
        print("  ✓ Valid transition block created")
    except Exception as e:
        print(f"  ✗ Failed to create valid transition block: {e}")
        return False

    # Invalid transition (missing to)
    try:
        ActionBlock(
            id="test_invalid",
            kind="transition",
            from_=TransitionEndpoint(
                referenceImage=ReferenceImage(url="http://example.com/from.jpg"),
                pose="standing",
            ),
            prompt="Test prompt",
        )
        print("  ✗ Should have rejected transition without 'to' field")
        return False
    except ValidationError as e:
        print("  ✓ Correctly rejected transition without 'to' field")

    return True


def test_ontology_service():
    """Test OntologyService loading and queries."""
    from pixsim7.backend.main.domain.narrative.action_blocks import (
        OntologyService,
        get_ontology,
    )

    print("\nTesting OntologyService...")

    # Load ontology
    ontology = get_ontology(reload=True)

    # Test pose lookup
    pose = ontology.get_pose("standing_neutral")
    if pose:
        print(f"  ✓ Found pose: {pose.id} ({pose.category})")
    else:
        print("  ✗ Failed to find pose:standing_neutral")
        return False

    # Test pose canonicalization
    pose2 = ontology.get_pose("pose:standing_neutral")
    if pose2 and pose2.id == pose.id:
        print("  ✓ Pose lookup works with and without prefix")
    else:
        print("  ✗ Pose lookup inconsistent with prefix")
        return False

    # Test pose similarity
    score = ontology.pose_similarity_score("standing_neutral", "standing_neutral")
    if score == 1.0:
        print("  ✓ Same pose similarity = 1.0")
    else:
        print(f"  ✗ Same pose similarity should be 1.0, got {score}")
        return False

    score = ontology.pose_similarity_score("standing_neutral", "standing_near")
    if score > 0.5:  # Should get same_category credit
        print(f"  ✓ Same category similarity = {score}")
    else:
        print(f"  ✗ Same category similarity too low: {score}")
        return False

    # Test intimacy levels
    level = ontology.get_intimacy_level("light_flirt")
    if level:
        print(f"  ✓ Found intimacy level: {level.id} (order: {level.level})")
    else:
        print("  ✗ Failed to find intimacy:light_flirt")
        return False

    # Test intimacy distance
    dist = ontology.intimacy_distance("light_flirt", "deep_flirt")
    if dist == 1:
        print("  ✓ Intimacy distance light_flirt → deep_flirt = 1")
    else:
        print(f"  ✗ Expected distance 1, got {dist}")
        return False

    # Test ratings
    allowed = ontology.is_rating_allowed("suggestive", "intimate")
    if allowed:
        print("  ✓ Rating 'suggestive' allowed when max is 'intimate'")
    else:
        print("  ✗ Rating check failed")
        return False

    # Test scoring config
    weights = ontology.weights
    if abs(sum([
        weights.chain_compatibility,
        weights.location_match,
        weights.pose_match,
        weights.intimacy_match,
        weights.mood_match,
        weights.branch_intent,
    ]) - 1.0) < 0.01:
        print("  ✓ Scoring weights sum to ~1.0")
    else:
        print("  ✗ Scoring weights don't sum to 1.0")
        return False

    return True


def test_block_registry():
    """Test BlockRegistry operations."""
    from pixsim7.backend.main.domain.narrative.action_blocks import (
        BlockRegistry,
        ActionBlock,
        ReferenceImage,
        ActionBlockTags,
    )

    print("\nTesting BlockRegistry...")

    registry = BlockRegistry()

    # Add blocks
    block1 = ActionBlock(
        id="registry_test_1",
        kind="single_state",
        referenceImage=ReferenceImage(url="http://example.com/1.jpg"),
        prompt="Test 1",
        tags=ActionBlockTags(location="bench_park"),
    )

    block2 = ActionBlock(
        id="registry_test_2",
        kind="single_state",
        referenceImage=ReferenceImage(url="http://example.com/2.jpg"),
        prompt="Test 2",
        tags=ActionBlockTags(location="bench_park"),
    )

    registry.add(block1)
    registry.add(block2)

    if registry.count() == 2:
        print("  ✓ Added 2 blocks")
    else:
        print(f"  ✗ Expected 2 blocks, got {registry.count()}")
        return False

    # Query by location
    bench_blocks = registry.by_location("location:bench_park")
    if len(bench_blocks) == 2:
        print("  ✓ Found 2 blocks for location:bench_park")
    else:
        print(f"  ✗ Expected 2 blocks for location, got {len(bench_blocks)}")
        return False

    # Query by kind
    single_state = registry.by_kind("single_state")
    if len(single_state) == 2:
        print("  ✓ Found 2 single_state blocks")
    else:
        print(f"  ✗ Expected 2 single_state blocks, got {len(single_state)}")
        return False

    # Remove block
    registry.remove("registry_test_1")
    if registry.count() == 1:
        print("  ✓ Removed block, now 1 remaining")
    else:
        print(f"  ✗ Expected 1 block after removal, got {registry.count()}")
        return False

    return True


def test_block_selector():
    """Test BlockSelector with chain selection."""
    from pixsim7.backend.main.domain.narrative.action_blocks import (
        BlockRegistry,
        BlockSelector,
        ActionBlock,
        ActionSelectionContext,
        ReferenceImage,
        ActionBlockTags,
        get_ontology,
    )

    print("\nTesting BlockSelector...")

    # Create registry with test blocks
    registry = BlockRegistry()

    # Add some blocks with different characteristics
    blocks = [
        ActionBlock(
            id="selector_test_1",
            kind="single_state",
            referenceImage=ReferenceImage(url="http://example.com/1.jpg"),
            prompt="Park bench scene 1",
            durationSec=5.0,
            tags=ActionBlockTags(
                location="bench_park",
                intimacy_level="light_flirt",
                pose="sitting_neutral",
            ),
            startPose="sitting_neutral",
            endPose="sitting_close",
            compatibleNext=["selector_test_2"],
        ),
        ActionBlock(
            id="selector_test_2",
            kind="single_state",
            referenceImage=ReferenceImage(url="http://example.com/2.jpg"),
            prompt="Park bench scene 2",
            durationSec=6.0,
            tags=ActionBlockTags(
                location="bench_park",
                intimacy_level="deep_flirt",
                pose="sitting_close",
            ),
            startPose="sitting_close",
            endPose="sitting_leaning",
            compatiblePrev=["selector_test_1"],
        ),
        ActionBlock(
            id="selector_test_3",
            kind="single_state",
            referenceImage=ReferenceImage(url="http://example.com/3.jpg"),
            prompt="Generic block",
            durationSec=4.0,
            tags=ActionBlockTags(),  # Generic, no specific tags
        ),
    ]

    for block in blocks:
        registry.add(block)

    # Create selector
    ontology = get_ontology()
    selector = BlockSelector(registry, ontology=ontology)

    # Test selection with context
    context = ActionSelectionContext(
        locationTag="bench_park",
        intimacy_level="light_flirt",
    )

    results = selector.select(context, limit=5)
    if results:
        print(f"  ✓ Selected {len(results)} blocks")
        for block, score in results:
            print(f"    - {block.id}: {score:.2f}")
    else:
        print("  ✗ No blocks selected")
        return False

    # Test chain selection
    chain_result = selector.select_chain(context, target_duration=15.0)
    if chain_result.blocks:
        print(f"  ✓ Chain selected {len(chain_result.blocks)} blocks, total {chain_result.totalDuration}s")
        for block in chain_result.blocks:
            print(f"    - {block.id} ({block.durationSec}s)")
    else:
        print("  ✗ No chain selected")
        return False

    # Test explain_selection
    explanation = selector.explain_selection(blocks[0], context)
    if "score_breakdown" in explanation:
        print(f"  ✓ Explanation available: total_score = {explanation['total_score']:.2f}")
    else:
        print("  ✗ Explanation missing score breakdown")
        return False

    return True


def test_ontology_scoring():
    """Test that scoring uses ontology data."""
    from pixsim7.backend.main.domain.narrative.action_blocks import (
        get_ontology,
        BlockRegistry,
        ActionBlock,
        ActionSelectionContext,
        ReferenceImage,
        ActionBlockTags,
    )
    from pixsim7.backend.main.domain.narrative.action_blocks.scorers import (
        PoseScorer,
        IntimacyScorer,
    )

    print("\nTesting ontology-driven scoring...")

    ontology = get_ontology()

    # Test PoseScorer with ontology
    pose_scorer = PoseScorer(weight=1.0, ontology=ontology)

    block = ActionBlock(
        id="pose_score_test",
        kind="single_state",
        referenceImage=ReferenceImage(url="http://example.com/test.jpg"),
        prompt="Test",
        startPose="sitting_neutral",
    )

    # Same pose
    context = ActionSelectionContext(pose="sitting_neutral")
    score = pose_scorer.score(block, context)
    if score == 1.0:
        print("  ✓ PoseScorer: exact match = 1.0")
    else:
        print(f"  ✗ PoseScorer: expected 1.0 for exact match, got {score}")
        return False

    # Same category
    context = ActionSelectionContext(pose="sitting_close")
    score = pose_scorer.score(block, context)
    if 0.5 < score < 1.0:
        print(f"  ✓ PoseScorer: same category = {score}")
    else:
        print(f"  ✗ PoseScorer: expected partial credit for same category, got {score}")
        return False

    # Test IntimacyScorer with ontology
    intimacy_scorer = IntimacyScorer(weight=1.0, ontology=ontology)

    block_with_intimacy = ActionBlock(
        id="intimacy_score_test",
        kind="single_state",
        referenceImage=ReferenceImage(url="http://example.com/test.jpg"),
        prompt="Test",
        tags=ActionBlockTags(intimacy_level="light_flirt"),
    )

    # Exact match
    context = ActionSelectionContext(intimacy_level="light_flirt")
    score = intimacy_scorer.score(block_with_intimacy, context)
    if score == 1.0:
        print("  ✓ IntimacyScorer: exact match = 1.0")
    else:
        print(f"  ✗ IntimacyScorer: expected 1.0 for exact match, got {score}")
        return False

    # Adjacent level
    context = ActionSelectionContext(intimacy_level="deep_flirt")
    score = intimacy_scorer.score(block_with_intimacy, context)
    if 0.5 < score < 1.0:
        print(f"  ✓ IntimacyScorer: adjacent level = {score}")
    else:
        print(f"  ✗ IntimacyScorer: expected partial credit for adjacent level, got {score}")
        return False

    return True


def main():
    """Run all validation tests."""
    print("=" * 60)
    print("Action Blocks v2 Validation")
    print("=" * 60)

    tests = [
        ("ActionBlock Validation", test_action_block_validation),
        ("OntologyService", test_ontology_service),
        ("BlockRegistry", test_block_registry),
        ("BlockSelector", test_block_selector),
        ("Ontology-driven Scoring", test_ontology_scoring),
    ]

    results = []
    for name, test_fn in tests:
        try:
            passed = test_fn()
            results.append((name, passed))
        except Exception as e:
            print(f"\n✗ {name} FAILED with exception: {e}")
            import traceback
            traceback.print_exc()
            results.append((name, False))

    # Summary
    print("\n" + "=" * 60)
    print("Summary")
    print("=" * 60)

    passed = sum(1 for _, p in results if p)
    total = len(results)

    for name, p in results:
        status = "✓ PASSED" if p else "✗ FAILED"
        print(f"  {status}: {name}")

    print(f"\n{passed}/{total} tests passed")

    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())
