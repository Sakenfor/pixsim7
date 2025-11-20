"""
Test script for template generation and prompt recreation.

This demonstrates:
1. How to recreate the original werewolf prompt from templates
2. How to generate new variations
3. How to test similarity/accuracy
"""

import json
from generation_templates import (
    TemplateGenerator,
    test_prompt_recreation,
    TEMPLATES
)


# The original prompt you provided
ORIGINAL_WEREWOLF_PROMPT = """She maintains her position throughout in her original pose,body language deliberately provocative.Testing how far she can push him while aware she's being watched.Stays exactly where she started.

The werewolf creature - 3D realistic render,photorealistic with subtle cartoon expressiveness - appears behind her pressed close.Bulky muscular build covered in dense charcoal fur,powerful shoulders and chest.Lupine features showing elongated muzzle with somewhat sly cunning expression,sharp yellow eyes with blown pupils,alert pointed ears,large clawed hands.Frame trembles violently.Struggling to maintain control.Camera begins slow rotation around them.

His hands grip her buttocks possessively - fingers spreading wide then squeezing,kneading rhythmically.Palms pressing in deeply then dragging across soft curves.Alternating pressure,constant motion.Muzzle lowers to her lower back,sniffing along her skin.Yellow eyes impossibly wide,focused entirely on her.Tongue lolling out,saliva dripping.Continuous low whining.

She glances toward camera with challenging expression as it rotates past - turning only her head,keeping her position."Watch this" energy.Then deliberately arches harder while staying in place.His muzzle follows,sniffing along her spine.Nose trailing across her skin.Hands knead frantically - gripping,releasing,gripping harder.Frame shudders violently.She rolls her hips slowly without changing orientation.His muzzle pressed closer,inhaling desperately.Hands squeezing compulsively.Tongue hanging,saliva dripping steadily.

She shifts weight back against him - maintaining pose.His face buried against her lower back,sniffing compulsively.Hands kneading urgently,fingers digging in.Yellow eyes half-closed,completely focused on her.

Camera completes rotation.She stays in original position.His muzzle pressed close,sniffing constantly.Hands gripping rhythmically.Her appearance and lighting remain consistent throughout."""


def test_werewolf_recreation():
    """Test recreating the werewolf prompt."""
    print("=" * 60)
    print("TESTING WEREWOLF PROMPT RECREATION")
    print("=" * 60)

    # Generate using template
    generated_block = TemplateGenerator.generate_werewolf_recreation()

    print("\nGenerated Action Block ID:", generated_block["id"])
    print("\nCamera Movement:", json.dumps(generated_block["cameraMovement"], indent=2))
    print("\nConsistency Flags:", json.dumps(generated_block["consistency"], indent=2))
    print("\nIntensity Progression:", json.dumps(generated_block["intensityProgression"], indent=2))

    print("\n" + "-" * 40)
    print("GENERATED PROMPT:")
    print("-" * 40)
    print(generated_block["prompt"])

    print("\n" + "-" * 40)
    print("SIMILARITY ANALYSIS:")
    print("-" * 40)

    # Test similarity
    similarity = test_prompt_recreation(ORIGINAL_WEREWOLF_PROMPT)
    print(f"Similarity Score: {similarity:.2%}")

    # Check key elements
    key_elements = [
        "maintains her position throughout",
        "slow rotation",
        "gripping rhythmically",
        "sniffing constantly",
        "lighting remain consistent"
    ]

    print("\nKey Element Presence:")
    for element in key_elements:
        present = element.lower() in generated_block["prompt"].lower()
        print(f"  - {element}: {'YES' if present else 'NO'}")

    return generated_block


def generate_snake_variation():
    """Generate a snake coiling variation using templates."""
    print("\n" + "=" * 60)
    print("GENERATING SNAKE COILING VARIATION")
    print("=" * 60)

    template = TEMPLATES["snake_coiling"]

    # Generate snake version
    filled_prompt = template.fill(
        character="She",
        initial_position="stands in the chamber",
        character_mood="aware but unafraid",
        snake_description="A massive golden python",
        snake_origin="the shadows",
        snake_appearance="Scales shimmer with iridescent patterns, muscular body thick as her waist",
        coiling_pattern="slowly winding",
        body_areas="her waist and lower torso",
        texture_description="Cool, smooth scales",
        sensory_detail="distinctive pressure against her skin",
        reaction_description="breathing changes, visible shivers",
        camera_movement="begins slow rotation",
        tightness_progression="gradually tighten",
        movement_rhythm="in undulating waves",
        snake_behavior="Tongue flicking out, tasting the air around her",
        character_breathing="Breathing deepens",
        completion_state="completes its spiral",
        final_position="She remains standing, wrapped but not restrained",
        camera_final="completes its rotation",
        visual_emphasis="the complete coiling pattern",
        lighting_consistency="consistent throughout"
    )

    snake_block = {
        "id": "snake_coiling_intimate",
        "kind": "single_state",
        "tags": {
            "location": "chamber",
            "pose": "standing_wrapped",
            "intimacy_level": "intimate",
            "mood": "tension",
            "content_rating": "suggestive",
            "intensity": 7,
            "custom": ["creature", "snake", "coiling"]
        },
        "cameraMovement": {
            "type": "rotation",
            "speed": "slow",
            "path": "circular",
            "focus": "coiling_pattern"
        },
        "consistency": {
            "maintainPose": True,
            "preserveLighting": True,
            "preservePosition": True
        },
        "prompt": filled_prompt,
        "durationSec": 8.0
    }

    print("\nGenerated Snake Block:")
    print(json.dumps(snake_block, indent=2))

    return snake_block


def generate_new_creature_concept(creature_type: str, interaction_type: str):
    """Generate a completely new creature interaction."""
    print("\n" + "=" * 60)
    print(f"GENERATING NEW CONCEPT: {creature_type} - {interaction_type}")
    print("=" * 60)

    # Use the general template
    template = TEMPLATES["creature_interaction_maintained_position"]

    parameters = {
        "character": "She",
        "initial_pose": "her position",
        "character_state": "aware and responsive",
        "creature_description": f"The {creature_type}",
        "creature_position": "emerging from shadows",
        "primary_interaction": f"Beginning {interaction_type} pattern",
        "continuous_actions": f"Continuous {interaction_type} throughout",
        "camera_movement": "slowly rotates, capturing all angles",
        "character_reactions": "Visible responses through breathing and micro-expressions",
        "consistency_notes": "Position and lighting remain consistent"
    }

    filled_prompt = template.fill(**parameters)

    print("\nTemplate Parameters:")
    for key, value in parameters.items():
        print(f"  {key}: {value}")

    print("\nGenerated Prompt:")
    print(filled_prompt)

    return filled_prompt


def run_all_tests():
    """Run all generation tests."""
    # Test 1: Recreate werewolf
    werewolf_block = test_werewolf_recreation()

    # Test 2: Generate snake variation
    snake_block = generate_snake_variation()

    # Test 3: Generate new concepts
    print("\n" + "=" * 60)
    print("TESTING NEW CONCEPT GENERATION")
    print("=" * 60)

    new_concepts = [
        ("shadow entity", "enveloping"),
        ("tentacle creature", "exploring"),
        ("living vines", "restraining")
    ]

    for creature, interaction in new_concepts:
        generate_new_creature_concept(creature, interaction)
        print("-" * 40)

    print("\n" + "=" * 60)
    print("ALL TESTS COMPLETE")
    print("=" * 60)

    return {
        "werewolf": werewolf_block,
        "snake": snake_block
    }


if __name__ == "__main__":
    results = run_all_tests()

    # Save results for next session
    with open("generation_test_results.json", "w") as f:
        json.dump(results, f, indent=2)

    print("\nResults saved to generation_test_results.json")