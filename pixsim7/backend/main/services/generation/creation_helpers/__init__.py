"""
Helper modules for GenerationCreationService.

Splits the monolithic creation.py into focused modules:
- inputs: Asset/composition input parsing, lineage metadata, role mapping
- params: Parameter canonicalization, legacy warning, structured validation
- prompts: Prompt resolution, variable substitution
- rating: Content rating validation and clamping
- credits: Credit estimation and sufficiency checks
- cache: Cache key computation
"""
