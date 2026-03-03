# AI Command Provider Design

## Overview

Add a command-based AI provider that executes backend commands and parses stdout, enabling:
- In-game NPC dialogue generation
- UI prompt categorization into blocks
- Other AI-assisted tasks

This provider works alongside existing API-based providers (OpenAI, Anthropic, etc.).

## Architecture

### 1. Provider Types

```
┌─────────────────────────────────────────┐
│         AI Provider System              │
├─────────────────────────────────────────┤
│                                         │
│  ┌──────────────┐  ┌──────────────┐   │
│  │ API Provider │  │ Cmd Provider │   │
│  │  (HTTP/WS)   │  │   (stdout)   │   │
│  └──────────────┘  └──────────────┘   │
│         │                  │           │
│         └──────┬───────────┘           │
│                │                       │
│         ┌──────▼──────┐               │
│         │ AI Service  │               │
│         │  Interface  │               │
│         └─────────────┘               │
└─────────────────────────────────────────┘
```

### 2. Communication Protocol (JSON-RPC over stdout)

#### Request Format
```json
{
  "jsonrpc": "2.0",
  "id": "unique-request-id",
  "method": "ai.generate",
  "params": {
    "task": "chat" | "categorize_prompt" | "npc_dialogue",
    "user_id": "optional-user-id",  // For future per-user customization
    "context": {
      "message": "User's freeform text (e.g., 'Improve this prompt')",
      "prompt": "User input text (for structured tasks)",
      "blocks": [],  // Existing prompt blocks (if available)
      "metadata": {}
    }
  }
}
```

**Task Types:**
- `chat` - Freeform AI chat (non-contract, flexible)
  - Examples: "Improve this prompt", "Make it more dramatic", "Add a twist"
  - Scope: Restricted to prompt editing/improvement for now
- `categorize_prompt` - Structured prompt categorization into blocks
- `npc_dialogue` - NPC responses (future, keep interface open)

**Dev/Testing Phase:**
- Per-user commands not required yet (use `user_id` for logging only)
- Focus on `chat` task for flexible prompt improvement
- Keep NPCs minimal/placeholder for now

#### Response Format
```json
{
  "jsonrpc": "2.0",
  "id": "unique-request-id",
  "result": {
    "output": "Generated text or categorization",
    "metadata": {
      "model": "model-name",
      "tokens": 150,
      "confidence": 0.95
    }
  }
}
```

#### Error Format
```json
{
  "jsonrpc": "2.0",
  "id": "unique-request-id",
  "error": {
    "code": -32000,
    "message": "Error description",
    "data": {}
  }
}
```

### 3. Backend Implementation

#### Command Provider Service
```python
# pixsim7/backend/main/services/ai/command_provider.py

import asyncio
import json
from typing import Optional, Dict, Any
from uuid import uuid4
from enum import Enum

class AiTaskScope(Enum):
    """Scope restrictions for AI tasks"""
    PROMPT_IMPROVEMENT = "prompt_improvement"  # Only prompt editing
    CATEGORIZATION = "categorization"  # Block categorization
    UNRESTRICTED = "unrestricted"  # Future: full capabilities

class CommandBasedAiProvider:
    """
    AI provider that executes commands and parses JSON from stdout.
    Supports various AI tasks via a unified command interface.
    """

    def __init__(
        self,
        command: str,
        timeout: int = 30,
        max_retries: int = 3
    ):
        self.command = command
        self.timeout = timeout
        self.max_retries = max_retries

    async def execute(
        self,
        task: str,
        context: Dict[str, Any],
        user_id: Optional[str] = None,
        request_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Execute AI task via command and parse stdout.

        Args:
            task: Task type (npc_dialogue, categorize_prompt, etc.)
            context: Task-specific context data
            request_id: Optional request ID for tracking

        Returns:
            Parsed JSON response from command stdout

        Raises:
            CommandExecutionError: If command fails
            ResponseParseError: If stdout isn't valid JSON
        """
        request_id = request_id or str(uuid4())

        request_payload = {
            "jsonrpc": "2.0",
            "id": request_id,
            "method": "ai.generate",
            "params": {
                "task": task,
                "user_id": user_id,  # For logging, future per-user config
                "context": context
            }
        }

        # Execute command with stdin
        process = await asyncio.create_subprocess_exec(
            *self.command.split(),
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )

        # Send request as JSON to stdin
        stdout, stderr = await asyncio.wait_for(
            process.communicate(json.dumps(request_payload).encode()),
            timeout=self.timeout
        )

        # Parse response from stdout
        try:
            response = json.loads(stdout.decode())

            # Validate JSON-RPC response
            if response.get("id") != request_id:
                raise ValueError("Response ID mismatch")

            if "error" in response:
                raise CommandExecutionError(
                    response["error"]["message"],
                    code=response["error"]["code"]
                )

            return response["result"]

        except json.JSONDecodeError as e:
            raise ResponseParseError(
                f"Invalid JSON in stdout: {e}",
                raw_output=stdout.decode()
            )


class CommandExecutionError(Exception):
    """Command execution failed"""
    def __init__(self, message: str, code: int = -1):
        super().__init__(message)
        self.code = code


class ResponseParseError(Exception):
    """Failed to parse command output"""
    def __init__(self, message: str, raw_output: str = ""):
        super().__init__(message)
        self.raw_output = raw_output
```

#### Task-Specific Services

```python
# pixsim7/backend/main/services/ai/chat_service.py

class AiChatService:
    """
    Freeform AI chat for prompt improvement and assistance.
    Restricted scope during dev/testing phase.
    """

    def __init__(self, provider: CommandBasedAiProvider):
        self.provider = provider

    async def chat(
        self,
        message: str,
        prompt_context: Optional[str] = None,
        blocks_context: Optional[list] = None,
        user_id: Optional[str] = None
    ) -> str:
        """
        Send freeform message to AI (e.g., "Improve this prompt").

        Args:
            message: User's freeform request
            prompt_context: Current prompt being worked on
            blocks_context: Current prompt blocks (if available)
            user_id: Optional user ID for logging/future per-user config

        Returns:
            AI's response text

        Example:
            >>> await chat_service.chat(
            ...     message="Make this more dramatic",
            ...     prompt_context="A happy character in a forest",
            ...     blocks_context=[{"type": "character", "content": "happy character"}]
            ... )
            "A jubilant character dancing through an enchanted forest"
        """
        context = {
            "message": message,
            "prompt": prompt_context,
            "blocks": blocks_context or [],
            "scope": "prompt_improvement"  # Restricted scope
        }

        result = await self.provider.execute(
            task="chat",
            context=context,
            user_id=user_id
        )

        return result["output"]


# pixsim7/backend/main/services/ai/prompt_categorizer_service.py

class PromptCategorizerService:
    """Categorize prompts into blocks using command-based AI provider"""

    def __init__(self, provider: CommandBasedAiProvider):
        self.provider = provider

    async def categorize_prompt(
        self,
        prompt: str,
        available_blocks: list[str]
    ) -> Dict[str, Any]:
        """
        Categorize a prompt into action blocks.

        Args:
            prompt: User's input prompt
            available_blocks: List of available block types

        Returns:
            Categorization result with blocks and confidence
        """
        context = {
            "prompt": prompt,
            "available_blocks": available_blocks
        }

        result = await self.provider.execute(
            task="categorize_prompt",
            context=context
        )

        return {
            "blocks": result["output"]["blocks"],
            "confidence": result["metadata"].get("confidence", 1.0)
        }
```

### 4. Frontend Integration

#### Provider Configuration

```typescript
// apps/main/src/features/providers/lib/core/commandProvider.ts

export interface CommandProviderConfig {
  provider_id: string;
  name: string;
  command: string;
  timeout_ms: number;
  capabilities: {
    tasks: CommandProviderTask[];
  };
}

export type CommandProviderTask =
  | 'chat'              // Freeform AI chat (non-contract)
  | 'categorize_prompt' // Structured categorization
  | 'npc_dialogue';     // Future: NPC responses (placeholder for now)

export interface CommandProviderRequest {
  task: CommandProviderTask;
  context: Record<string, any>;
}

export interface CommandProviderResponse<T = any> {
  output: T;
  metadata: {
    model?: string;
    tokens?: number;
    confidence?: number;
  };
}

/**
 * Command-based AI provider client
 * Communicates with backend command provider service
 */
export class CommandAiProviderClient {
  constructor(
    private providerId: string,
    private apiEndpoint: string = '/api/v1/ai/command'
  ) {}

  async execute<T = any>(
    request: CommandProviderRequest,
    userId?: string
  ): Promise<CommandProviderResponse<T>> {
    const response = await apiClient.post(
      `${this.apiEndpoint}/${this.providerId}`,
      {
        ...request,
        user_id: userId  // For logging/future per-user config
      }
    );

    return response.data;
  }

  // Convenience methods for specific tasks

  /**
   * Freeform AI chat for prompt improvement
   * Examples: "Improve this prompt", "Make it more dramatic", "Add details"
   */
  async chat(params: {
    message: string;
    prompt?: string;
    blocks?: any[];
    userId?: string;
  }): Promise<string> {
    const response = await this.execute<string>({
      task: 'chat',
      context: {
        message: params.message,
        prompt: params.prompt,
        blocks: params.blocks || [],
        scope: 'prompt_improvement'  // Restricted for now
      }
    }, params.userId);

    return response.output;
  }

  /**
   * NPC dialogue (placeholder for future)
   * Kept minimal during dev/testing phase
   */
  async generateNpcDialogue(params: {
    npc_name: string;
    npc_context: string;
    player_message: string;
    scene_context?: Record<string, any>;
    userId?: string;
  }): Promise<string> {
    const response = await this.execute<string>({
      task: 'npc_dialogue',
      context: params
    }, params.userId);

    return response.output;
  }

  async categorizePrompt(params: {
    prompt: string;
    available_blocks: string[];
  }): Promise<{ blocks: string[]; confidence: number }> {
    const response = await this.execute<{
      blocks: string[];
    }>({
      task: 'categorize_prompt',
      context: params
    });

    return {
      blocks: response.output.blocks,
      confidence: response.metadata.confidence || 1.0
    };
  }
}
```

#### Usage Examples

```typescript
// Example 1: Freeform AI Chat for Prompt Improvement (PRIMARY USE CASE)

import { CommandAiProviderClient } from '@features/providers';

const aiAssistant = new CommandAiProviderClient('local-ai-agent');

// User types: "Make this more dramatic"
async function improvePrompt(
  userMessage: string,
  currentPrompt: string,
  currentBlocks?: any[]
) {
  const improved = await aiAssistant.chat({
    message: userMessage,  // Freeform: "Make it more dramatic", "Add details", etc.
    prompt: currentPrompt,
    blocks: currentBlocks,
    userId: getCurrentUserId() // Optional, for logging
  });

  return improved;
}

// Usage in prompt editor:
const result = await improvePrompt(
  "Make this more cinematic",
  "A happy character in a forest",
  [
    { type: "character", content: "happy character" },
    { type: "environment", content: "forest" }
  ]
);
// Result: "A jubilant protagonist striding through a sun-dappled, ancient forest..."


// Example 2: Prompt Categorization (Structured task)

async function categorizeUserPrompt(prompt: string) {
  const categorizer = new CommandAiProviderClient('local-ai-agent');

  const result = await categorizer.categorizePrompt({
    prompt,
    available_blocks: [
      'character_description',
      'environment',
      'action',
      'mood',
      'style'
    ]
  });

  return result; // { blocks: ['character_description', 'mood'], confidence: 0.92 }
}


// Example 3: NPC Dialogue (Future/Placeholder - not priority for dev phase)

async function handlePlayerInteraction(
  npcId: string,
  playerMessage: string
) {
  // Kept simple for now, can expand later
  const response = await aiAssistant.generateNpcDialogue({
    npc_name: "Shopkeeper",
    npc_context: "Grumpy merchant",
    player_message: playerMessage,
    userId: getCurrentUserId()
  });

  displayNpcDialogue(npcId, response);
}
```

### 5. Backend API Endpoints

```python
# pixsim7/backend/main/api/v1/ai_command.py

@router.post("/command/{provider_id}")
async def execute_command_provider(
    provider_id: str,
    request: CommandProviderRequest,
    user: User = Depends(get_current_user)
) -> CommandProviderResponse:
    """
    Execute AI task via command-based provider.

    Supports various tasks:
    - npc_dialogue: Generate NPC responses
    - categorize_prompt: Categorize prompts into blocks
    - custom: Custom AI tasks
    """
    # Get provider configuration
    provider_config = await get_command_provider_config(provider_id)
    if not provider_config:
        raise HTTPException(404, f"Provider {provider_id} not found")

    # Validate task is supported
    if request.task not in provider_config.capabilities.tasks:
        raise HTTPException(400, f"Task {request.task} not supported")

    # Execute command
    provider = CommandBasedAiProvider(
        command=provider_config.command,
        timeout=provider_config.timeout_ms // 1000
    )

    result = await provider.execute(
        task=request.task,
        context=request.context
    )

    # Log interaction (optional)
    await log_ai_interaction(
        user_id=user.id,
        provider_id=provider_id,
        task=request.task,
        result=result
    )

    return result
```

### 6. Example Command Implementation

```python
#!/usr/bin/env python3
# scripts/ai_agent_cmd.py
"""
Example AI agent command that reads JSON from stdin and writes to stdout.
This can be replaced with any command that follows the JSON-RPC protocol.
"""

import sys
import json
from typing import Dict, Any

def handle_chat(context: Dict[str, Any]) -> str:
    """
    Handle freeform AI chat for prompt improvement.
    Scope restricted to prompt editing during dev/testing phase.
    """
    message = context["message"]
    prompt = context.get("prompt", "")
    blocks = context.get("blocks", [])
    scope = context.get("scope", "prompt_improvement")

    # Build context for AI model
    system_context = f"""You are a creative writing assistant helping improve image generation prompts.
Scope: {scope}
Current prompt: {prompt}
Current blocks: {json.dumps(blocks)}

User request: {message}

Provide an improved version of the prompt based on the user's request."""

    # TODO: Call real AI model (OpenAI, Anthropic, local LLM, etc.)
    # For now, simple placeholder
    if "dramatic" in message.lower():
        return f"{prompt} (enhanced with dramatic elements)"
    return f"{prompt} (improved based on: {message})"

def handle_npc_dialogue(context: Dict[str, Any]) -> str:
    """Generate NPC dialogue (placeholder - minimal for dev phase)"""
    npc = context.get("npc", {})
    player_msg = context.get("player_message", "")

    # TODO: Expand later, keep simple for now
    return f"[NPC placeholder response to: {player_msg}]"

def handle_categorize_prompt(context: Dict[str, Any]) -> Dict[str, Any]:
    """Categorize prompt into blocks (placeholder)"""
    prompt = context["prompt"]
    available_blocks = context["available_blocks"]

    # TODO: Call real AI model for categorization
    return {
        "blocks": available_blocks[:2],  # Placeholder
        "confidence": 0.85
    }

HANDLERS = {
    "chat": handle_chat,  # PRIMARY: Freeform prompt improvement
    "categorize_prompt": handle_categorize_prompt,
    "npc_dialogue": handle_npc_dialogue  # Placeholder for future
}

def main():
    # Read JSON-RPC request from stdin
    request_line = sys.stdin.readline()
    request = json.loads(request_line)

    try:
        # Extract task and context
        task = request["params"]["task"]
        context = request["params"]["context"]

        # Execute task
        if task not in HANDLERS:
            raise ValueError(f"Unknown task: {task}")

        output = HANDLERS[task](context)

        # Write JSON-RPC response to stdout
        response = {
            "jsonrpc": "2.0",
            "id": request["id"],
            "result": {
                "output": output,
                "metadata": {
                    "model": "local-agent-v1",
                    "tokens": 100
                }
            }
        }

        print(json.dumps(response), flush=True)

    except Exception as e:
        # Write error response
        error_response = {
            "jsonrpc": "2.0",
            "id": request["id"],
            "error": {
                "code": -32000,
                "message": str(e)
            }
        }
        print(json.dumps(error_response), flush=True)
        sys.exit(1)

if __name__ == "__main__":
    main()
```

## Implementation Steps

### Phase 1: Core Infrastructure
1. ✅ Create command provider service backend
2. ✅ Implement JSON-RPC protocol handler
3. ✅ Add command execution with timeout/retries
4. ✅ Create example command script

### Phase 2: Task-Specific Services
1. ✅ NPC dialogue service
2. ✅ Prompt categorization service
3. ✅ Add API endpoints

### Phase 3: Frontend Integration
1. ✅ Command provider client
2. ✅ Provider configuration UI
3. ✅ Usage in NPC system
4. ✅ Usage in prompt editor

### Phase 4: Testing & Polish
1. Error handling & retries
2. Logging & debugging
3. Performance monitoring
4. Documentation

## Configuration Example

```yaml
# config/ai_providers.yaml

command_providers:
  - provider_id: "local-ai-agent"
    name: "Local AI Agent"
    command: "python scripts/ai_agent_cmd.py"
    timeout_ms: 30000
    capabilities:
      tasks:
        - npc_dialogue
        - categorize_prompt

  - provider_id: "custom-llm"
    name: "Custom LLM"
    command: "/usr/local/bin/custom-ai-agent"
    timeout_ms: 60000
    capabilities:
      tasks:
        - npc_dialogue
        - categorize_prompt
        - custom
```

## Benefits

1. **Flexibility**: Any command-line AI tool can be integrated
2. **Isolation**: AI provider runs in separate process
3. **Portability**: Works across different deployment environments
4. **Extensibility**: Easy to add new task types
5. **Clear Contract**: JSON-RPC ensures consistent communication
6. **Debugging**: Can test commands independently via CLI

## Security Considerations

1. **Command Validation**: Whitelist allowed commands in config
2. **Input Sanitization**: Validate all context data before passing to command
3. **Timeout Protection**: Prevent hung processes
4. **Resource Limits**: Limit concurrent command executions
5. **Logging**: Audit all command executions

## Next Steps

Would you like me to:
1. Implement the backend command provider service?
2. Create the frontend client and integration?
3. Build an example AI agent command for testing?
4. Set up the API endpoints?
