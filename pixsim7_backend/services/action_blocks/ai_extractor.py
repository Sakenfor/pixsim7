"""AI-Powered Action Block Extractor

Uses Claude API to intelligently extract reusable action blocks from complex prompts.
Breaks down complex prompts (1000+ chars) into modular components that can be mixed and matched.
"""
import json
import os
from typing import List, Dict, Any, Optional
from uuid import UUID, uuid4
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession

try:
    import anthropic
    ANTHROPIC_AVAILABLE = True
except ImportError:
    ANTHROPIC_AVAILABLE = False

from pixsim7_backend.domain.action_block import ActionBlockDB
from pixsim7_backend.services.action_blocks.action_block_service import ActionBlockService


class AIActionBlockExtractor:
    """AI-powered extractor for creating ActionBlocks from complex prompts"""

    def __init__(self, db: AsyncSession, api_key: Optional[str] = None):
        self.db = db
        self.service = ActionBlockService(db)

        if not ANTHROPIC_AVAILABLE:
            raise ImportError("anthropic package not installed. Run: pip install anthropic")

        self.api_key = api_key or os.getenv("ANTHROPIC_API_KEY")
        if not self.api_key:
            raise ValueError("ANTHROPIC_API_KEY not set")

        self.client = anthropic.Anthropic(api_key=self.api_key)

    async def extract_blocks_from_prompt(
        self,
        prompt_text: str,
        extraction_mode: str = "auto",
        source_prompt_version_id: Optional[UUID] = None,
        created_by: Optional[str] = None
    ) -> Dict[str, Any]:
        """Extract reusable ActionBlocks from a complex prompt

        Args:
            prompt_text: The complex prompt to break down
            extraction_mode: "auto" (AI decides), "aggressive" (more blocks), "conservative" (fewer blocks)
            source_prompt_version_id: Link to source PromptVersion if available
            created_by: User who requested extraction

        Returns:
            Extraction result with created blocks and metadata
        """
        # Analyze prompt first
        analysis = self._analyze_prompt_structure(prompt_text)

        # If prompt is simple, no extraction needed
        if analysis['complexity_score'] < 5.0:
            return {
                "extraction_performed": False,
                "reason": "Prompt is already simple enough",
                "analysis": analysis,
                "blocks_created": []
            }

        # Call AI to extract blocks
        extracted_blocks_data = await self._call_ai_extractor(
            prompt_text,
            extraction_mode,
            analysis
        )

        # Create blocks in database
        created_blocks = []
        for block_data in extracted_blocks_data:
            try:
                block = await self._create_block_from_extraction(
                    block_data,
                    source_prompt_version_id,
                    created_by
                )
                created_blocks.append(block)
            except Exception as e:
                print(f"Error creating block {block_data.get('block_id')}: {e}")

        await self.db.commit()

        return {
            "extraction_performed": True,
            "analysis": analysis,
            "blocks_created": [
                {
                    "id": str(b.id),
                    "block_id": b.block_id,
                    "kind": b.kind,
                    "complexity_level": b.complexity_level,
                    "char_count": b.char_count,
                    "prompt_preview": b.prompt[:100] + "..."
                }
                for b in created_blocks
            ],
            "total_blocks": len(created_blocks),
            "composition_info": {
                "original_length": len(prompt_text),
                "blocks_total_length": sum(len(b.prompt) for b in created_blocks),
                "compression_ratio": len(prompt_text) / sum(len(b.prompt) for b in created_blocks) if created_blocks else 1.0
            }
        }

    def _analyze_prompt_structure(self, prompt_text: str) -> Dict[str, Any]:
        """Analyze prompt complexity and structure

        Returns:
            Analysis metadata
        """
        char_count = len(prompt_text)
        word_count = len(prompt_text.split())
        sentence_count = len([s for s in prompt_text.split('.') if s.strip()])

        # Calculate complexity score (1-10)
        complexity_score = 0.0

        # Length factor
        if char_count > 1000:
            complexity_score += 3.0
        elif char_count > 600:
            complexity_score += 2.0
        elif char_count > 300:
            complexity_score += 1.0

        # Structural complexity
        if sentence_count > 20:
            complexity_score += 2.0
        elif sentence_count > 10:
            complexity_score += 1.0

        # Keyword detection
        keywords = {
            'camera': ['camera', 'rotation', 'dolly', 'pan', 'zoom', 'trembling'],
            'continuity': ['maintain', 'consistent', 'throughout', 'preserve', 'keep'],
            'character': ['werewolf', 'creature', 'character', 'render', 'realistic'],
            'action': ['grip', 'touch', 'move', 'shift', 'press', 'knead'],
            'emotion': ['eager', 'desperate', 'provocative', 'intense', 'passionate']
        }

        detected_categories = {}
        for category, words in keywords.items():
            matches = [w for w in words if w.lower() in prompt_text.lower()]
            if matches:
                detected_categories[category] = matches
                complexity_score += 0.5

        return {
            "char_count": char_count,
            "word_count": word_count,
            "sentence_count": sentence_count,
            "complexity_score": min(complexity_score, 10.0),
            "detected_categories": detected_categories,
            "suitable_for_extraction": complexity_score >= 5.0
        }

    async def _call_ai_extractor(
        self,
        prompt_text: str,
        extraction_mode: str,
        analysis: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """Call Claude API to extract blocks

        Returns:
            List of block definitions
        """
        system_prompt = """You are an expert at analyzing complex image/video generation prompts
and breaking them down into reusable, modular components.

Your task is to extract ActionBlocks from a complex prompt. Each ActionBlock should be:
- A self-contained, reusable component (200-400 chars ideally, can be longer if needed)
- Have a clear purpose (character description, camera instruction, action choreography, etc)
- Compatible with other blocks (can be mixed and matched)

Common ActionBlock types:
- character_description: Physical appearance, species, style, render type
- pose_instruction: Body position, posture, orientation, stance
- camera_instruction: Camera movements, angles, framing, effects
- action_choreography: Physical actions, movements, gestures, interactions
- continuity_instruction: Technical requirements (lighting, consistency, preservation)
- reaction_description: Emotional reactions, expressions, eye contact
- environment_description: Setting, location, atmosphere, time of day
- style_instruction: Visual style, rendering approach, aesthetic

For each block you extract, provide a JSON object with:
{
  "block_id": "unique_snake_case_id",
  "kind": "single_state" or "transition",
  "block_type": "category from list above",
  "prompt": "the extracted prompt text",
  "tags": {
    "location": "...",
    "intensity": 1-10,
    "mood": "...",
    // other relevant tags
  },
  "complexity_level": "simple/moderate/complex/very_complex",
  "reusable": true/false,
  "variables": {
    // any {{variables}} that could be parametrized
  },
  "compatible_with": ["other_block_types"],
  "description": "What this block does"
}

Return ONLY a valid JSON array of block objects. No other text."""

        if extraction_mode == "aggressive":
            mode_instruction = "\n\nExtract as many granular blocks as possible. Break down into smallest reusable components."
        elif extraction_mode == "conservative":
            mode_instruction = "\n\nExtract only major, distinct components. Keep related content together."
        else:
            mode_instruction = "\n\nUse balanced extraction. Create 4-6 logical component blocks."

        user_prompt = f"""Extract reusable ActionBlocks from this prompt:

{prompt_text}

Complexity Analysis:
- Character count: {analysis['char_count']}
- Complexity score: {analysis['complexity_score']}/10
- Detected elements: {', '.join(analysis['detected_categories'].keys())}

{mode_instruction}

Return JSON array of block definitions."""

        # Call Claude API
        response = self.client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=4000,
            temperature=0.3,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}]
        )

        # Parse response
        response_text = response.content[0].text

        # Extract JSON (handle potential markdown formatting)
        if "```json" in response_text:
            json_start = response_text.find("```json") + 7
            json_end = response_text.find("```", json_start)
            response_text = response_text[json_start:json_end].strip()
        elif "```" in response_text:
            json_start = response_text.find("```") + 3
            json_end = response_text.find("```", json_start)
            response_text = response_text[json_start:json_end].strip()

        try:
            blocks_data = json.loads(response_text)
            return blocks_data
        except json.JSONDecodeError as e:
            print(f"Error parsing AI response: {e}")
            print(f"Response: {response_text}")
            return []

    async def _create_block_from_extraction(
        self,
        block_data: Dict[str, Any],
        source_prompt_version_id: Optional[UUID],
        created_by: Optional[str]
    ) -> ActionBlockDB:
        """Create ActionBlockDB from extracted block data

        Args:
            block_data: Extracted block definition from AI
            source_prompt_version_id: Source prompt version
            created_by: Creator

        Returns:
            Created ActionBlockDB
        """
        # Generate unique block_id if needed
        block_id = block_data.get('block_id')
        if not block_id:
            block_type = block_data.get('block_type', 'custom')
            block_id = f"extracted_{block_type}_{uuid4().hex[:8]}"

        # Ensure uniqueness
        existing = await self.service.get_block_by_block_id(block_id)
        if existing:
            block_id = f"{block_id}_{uuid4().hex[:4]}"

        # Create block
        db_block = ActionBlockDB(
            id=uuid4(),
            block_id=block_id,
            kind=block_data.get('kind', 'single_state'),
            prompt=block_data['prompt'],
            tags=block_data.get('tags', {}),
            complexity_level=block_data.get('complexity_level', 'moderate'),
            char_count=len(block_data['prompt']),
            word_count=len(block_data['prompt'].split()),
            source_type="ai_extracted",
            extracted_from_prompt_version=source_prompt_version_id,
            is_composite=False,
            package_name="extracted",
            description=block_data.get('description'),
            block_metadata={
                "block_type": block_data.get('block_type'),
                "extraction_method": "claude_ai",
                "reusable": block_data.get('reusable', True),
                "compatible_with": block_data.get('compatible_with', [])
            },
            created_by=created_by,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )

        self.db.add(db_block)
        return db_block

    async def suggest_variables_for_block(
        self,
        block_id: UUID
    ) -> Dict[str, Any]:
        """AI suggests which parts of a block could be variables

        Args:
            block_id: Block to analyze

        Returns:
            Variable suggestions
        """
        block = await self.service.get_block(block_id)
        if not block:
            return {"error": "Block not found"}

        system_prompt = """Analyze a prompt block and suggest which parts could be turned
into variables for reusability.

Return JSON with:
{
  "original_text": "...",
  "suggested_variables": {
    "variable_name": "current_value"
  },
  "rewritten_text": "text with {{variables}}",
  "variable_definitions": {
    "variable_name": {
      "type": "string/enum/int",
      "possible_values": [...],
      "description": "..."
    }
  }
}"""

        user_prompt = f"""Analyze this block and suggest variables:

{block.prompt}

Suggest which parts could be parametrized for reusability."""

        response = self.client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=2000,
            temperature=0.3,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}]
        )

        response_text = response.content[0].text

        # Parse JSON
        if "```json" in response_text:
            json_start = response_text.find("```json") + 7
            json_end = response_text.find("```", json_start)
            response_text = response_text[json_start:json_end].strip()

        try:
            return json.loads(response_text)
        except json.JSONDecodeError:
            return {"error": "Failed to parse AI response"}
