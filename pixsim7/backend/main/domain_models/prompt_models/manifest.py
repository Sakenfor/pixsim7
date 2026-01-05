"""
Prompt Versioning Domain Models Package

Registers prompt versioning models with SQLModel:
- PromptFamily: Groups related prompt versions
- PromptVersion: Individual versioned prompts (Git-like)
- PromptVariantFeedback: Ratings and feedback per variant
"""

from pixsim7.backend.main.infrastructure.domain_registry import DomainModelManifest

# Manifest
manifest = DomainModelManifest(
    id="prompt_models",
    name="Prompt Versioning Models",
    description="Git-like prompt versioning with feedback tracking",
    models=[],
    source_modules=[
        "pixsim7.backend.main.domain.prompt",
        "pixsim7.backend.main.domain.semantic_pack",
    ],
    auto_discover=True,
    enabled=True,
    dependencies=["core_models"],  # Depends on User, Asset, GenerationArtifact
)
