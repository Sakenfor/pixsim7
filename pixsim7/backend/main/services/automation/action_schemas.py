"""
Action schema definitions for UI automation

Provides structured metadata for all action types to enable:
- Dynamic UI generation (drag-and-drop action builder)
- Parameter validation
- Documentation and tooltips
- Categorization and filtering
"""
from typing import List, Dict, Any, Optional, Literal
from pydantic import BaseModel, Field


class ActionParameter(BaseModel):
    """Definition of a single action parameter"""
    name: str
    type: Literal["string", "integer", "float", "boolean", "nested_actions"]
    required: bool = False
    default: Optional[Any] = None
    description: str = ""
    min: Optional[float] = None
    max: Optional[float] = None
    options: Optional[List[str]] = None  # For enum/select fields
    placeholder: Optional[str] = None


class ActionSchema(BaseModel):
    """Complete schema for an action type"""
    type: str
    display_name: str
    description: str
    category: Literal["basic", "interaction", "element", "control_flow", "timing", "advanced"]
    icon: Optional[str] = None  # Icon name/identifier for UI
    parameters: List[ActionParameter] = Field(default_factory=list)
    supports_nesting: bool = False
    examples: List[Dict[str, Any]] = Field(default_factory=list)


# Define all action schemas
ACTION_SCHEMAS: List[ActionSchema] = [
    # === BASIC ACTIONS ===
    ActionSchema(
        type="wait",
        display_name="Wait",
        description="Pause execution for a specified duration",
        category="timing",
        icon="clock",
        parameters=[
            ActionParameter(
                name="seconds",
                type="float",
                required=True,
                default=1.0,
                description="Number of seconds to wait",
                min=0.1,
                max=60.0,
                placeholder="1.0"
            )
        ],
        examples=[
            {"type": "wait", "params": {"seconds": 2.0}}
        ]
    ),

    ActionSchema(
        type="launch_app",
        display_name="Launch App",
        description="Launch an application by package name",
        category="basic",
        icon="rocket",
        parameters=[
            ActionParameter(
                name="package",
                type="string",
                required=False,
                description="App package name (uses preset default if not specified)",
                placeholder="com.example.app"
            )
        ],
        examples=[
            {"type": "launch_app", "params": {"package": "ai.pixverse.pixverse"}}
        ]
    ),

    ActionSchema(
        type="open_deeplink",
        display_name="Open Deep Link",
        description="Open a deep link URI to navigate directly to a specific screen in an app",
        category="basic",
        icon="link",
        parameters=[
            ActionParameter(
                name="uri",
                type="string",
                required=True,
                description="Deep link URI (e.g., myapp://login, https://app.com/screen)",
                placeholder="myapp://settings/account"
            )
        ],
        examples=[
            {"type": "open_deeplink", "params": {"uri": "myapp://login"}},
            {"type": "open_deeplink", "params": {"uri": "https://example.com/app/settings"}}
        ]
    ),

    ActionSchema(
        type="start_activity",
        display_name="Start Activity",
        description="Start a specific Android activity by component name",
        category="basic",
        icon="play",
        parameters=[
            ActionParameter(
                name="component",
                type="string",
                required=True,
                description="Component name: package/.ActivityName or package/package.ActivityName",
                placeholder="com.example.app/.LoginActivity"
            )
        ],
        examples=[
            {"type": "start_activity", "params": {"component": "com.example.app/.LoginActivity"}},
            {"type": "start_activity", "params": {"component": "com.example.app/com.example.app.SettingsActivity"}}
        ]
    ),

    ActionSchema(
        type="screenshot",
        display_name="Take Screenshot",
        description="Capture a screenshot of the current screen",
        category="basic",
        icon="camera",
        parameters=[],
        examples=[
            {"type": "screenshot", "params": {}}
        ]
    ),

    # === INTERACTION ACTIONS ===
    ActionSchema(
        type="click_coords",
        display_name="Click Coordinates",
        description="Click at specific screen coordinates. Use decimals 0-1 for percentage (0.5 = 50% of screen), or integers for pixels.",
        category="interaction",
        icon="cursor-click",
        parameters=[
            ActionParameter(
                name="x",
                type="float",
                required=True,
                description="X coordinate: 0-1 for percentage, or pixels (e.g., 0.5 = center, 540 = 540px)",
                min=0,
                placeholder="0.5"
            ),
            ActionParameter(
                name="y",
                type="float",
                required=True,
                description="Y coordinate: 0-1 for percentage, or pixels (e.g., 0.5 = center, 960 = 960px)",
                min=0,
                placeholder="0.5"
            )
        ],
        examples=[
            {"type": "click_coords", "params": {"x": 0.5, "y": 0.5}},
            {"type": "click_coords", "params": {"x": 540, "y": 960}}
        ]
    ),

    ActionSchema(
        type="type_text",
        display_name="Type Text",
        description="Type text into the focused input field",
        category="interaction",
        icon="keyboard",
        parameters=[
            ActionParameter(
                name="text",
                type="string",
                required=True,
                description="Text to type",
                placeholder="Hello World"
            )
        ],
        examples=[
            {"type": "type_text", "params": {"text": "example@email.com"}}
        ]
    ),

    ActionSchema(
        type="swipe",
        display_name="Swipe",
        description="Perform a swipe gesture. Use decimals 0-1 for percentage, or integers for pixels.",
        category="interaction",
        icon="arrows-expand",
        parameters=[
            ActionParameter(name="x1", type="float", required=True, description="Start X (0-1 for %, or pixels)", min=0, placeholder="0.5"),
            ActionParameter(name="y1", type="float", required=True, description="Start Y (0-1 for %, or pixels)", min=0, placeholder="0.7"),
            ActionParameter(name="x2", type="float", required=True, description="End X (0-1 for %, or pixels)", min=0, placeholder="0.5"),
            ActionParameter(name="y2", type="float", required=True, description="End Y (0-1 for %, or pixels)", min=0, placeholder="0.3"),
            ActionParameter(
                name="duration_ms",
                type="integer",
                required=False,
                default=300,
                description="Swipe duration in milliseconds",
                min=50,
                max=2000,
                placeholder="300"
            )
        ],
        examples=[
            {"type": "swipe", "params": {"x1": 540, "y1": 1500, "x2": 540, "y2": 500, "duration_ms": 300}}
        ]
    ),

    ActionSchema(
        type="press_back",
        display_name="Press Back",
        description="Press the Android back button",
        category="interaction",
        icon="arrow-left",
        parameters=[],
        examples=[
            {"type": "press_back", "params": {}}
        ]
    ),

    ActionSchema(
        type="emulator_back",
        display_name="Emulator Back",
        description="Soft back button navigation (same as press_back)",
        category="interaction",
        icon="arrow-left-circle",
        parameters=[],
        examples=[
            {"type": "emulator_back", "params": {}}
        ]
    ),

    ActionSchema(
        type="press_home",
        display_name="Press Home",
        description="Press the Android home button",
        category="interaction",
        icon="home",
        parameters=[],
        examples=[
            {"type": "press_home", "params": {}}
        ]
    ),

    # === ELEMENT ACTIONS ===
    ActionSchema(
        type="click_element",
        display_name="Click Element",
        description="Click a UI element by resource ID, text, or content description",
        category="element",
        icon="hand-pointer",
        parameters=[
            ActionParameter(
                name="resource_id",
                type="string",
                required=False,
                description="Element resource ID",
                placeholder="com.example:id/button"
            ),
            ActionParameter(
                name="text",
                type="string",
                required=False,
                description="Element text content",
                placeholder="Submit"
            ),
            ActionParameter(
                name="content_desc",
                type="string",
                required=False,
                description="Element content description",
                placeholder="Submit button"
            ),
            ActionParameter(
                name="continue_on_error",
                type="boolean",
                required=False,
                default=False,
                description="Continue execution if element not found"
            )
        ],
        examples=[
            {"type": "click_element", "params": {"resource_id": "com.example:id/login_button"}},
            {"type": "click_element", "params": {"text": "Login"}},
            {"type": "click_element", "params": {"text": "Optional Button", "continue_on_error": True}}
        ]
    ),

    ActionSchema(
        type="wait_for_element",
        display_name="Wait For Element",
        description="Wait until a specific element appears on screen",
        category="element",
        icon="clock-check",
        parameters=[
            ActionParameter(
                name="resource_id",
                type="string",
                required=False,
                description="Element resource ID",
                placeholder="com.example:id/button"
            ),
            ActionParameter(
                name="text",
                type="string",
                required=False,
                description="Element text content"
            ),
            ActionParameter(
                name="content_desc",
                type="string",
                required=False,
                description="Element content description"
            ),
            ActionParameter(
                name="timeout",
                type="float",
                required=False,
                default=10.0,
                description="Maximum seconds to wait",
                min=0.5,
                max=60.0,
                placeholder="10.0"
            ),
            ActionParameter(
                name="interval",
                type="float",
                required=False,
                default=0.5,
                description="Check interval in seconds",
                min=0.1,
                max=5.0,
                placeholder="0.5"
            ),
            ActionParameter(
                name="continue_on_timeout",
                type="boolean",
                required=False,
                default=False,
                description="Continue execution if element not found"
            )
        ],
        examples=[
            {"type": "wait_for_element", "params": {"resource_id": "com.example:id/welcome", "timeout": 15.0}}
        ]
    ),

    # === CONTROL FLOW ACTIONS ===
    ActionSchema(
        type="if_element_exists",
        display_name="If Element Exists",
        description="Execute nested actions only if a specific element exists",
        category="control_flow",
        icon="code-branch",
        supports_nesting=True,
        parameters=[
            ActionParameter(
                name="resource_id",
                type="string",
                required=False,
                description="Element resource ID to check"
            ),
            ActionParameter(
                name="text",
                type="string",
                required=False,
                description="Element text to check"
            ),
            ActionParameter(
                name="content_desc",
                type="string",
                required=False,
                description="Element content description to check"
            ),
            ActionParameter(
                name="actions",
                type="nested_actions",
                required=True,
                description="Actions to execute if element exists"
            )
        ],
        examples=[
            {
                "type": "if_element_exists",
                "params": {
                    "text": "Accept",
                    "actions": [
                        {"type": "click_element", "params": {"text": "Accept"}},
                        {"type": "wait", "params": {"seconds": 1.0}}
                    ]
                }
            }
        ]
    ),

    ActionSchema(
        type="if_element_not_exists",
        display_name="If Element Not Exists",
        description="Execute nested actions only if a specific element does NOT exist",
        category="control_flow",
        icon="code-branch-alt",
        supports_nesting=True,
        parameters=[
            ActionParameter(
                name="resource_id",
                type="string",
                required=False,
                description="Element resource ID to check"
            ),
            ActionParameter(
                name="text",
                type="string",
                required=False,
                description="Element text to check"
            ),
            ActionParameter(
                name="content_desc",
                type="string",
                required=False,
                description="Element content description to check"
            ),
            ActionParameter(
                name="actions",
                type="nested_actions",
                required=True,
                description="Actions to execute if element does not exist"
            )
        ],
        examples=[
            {
                "type": "if_element_not_exists",
                "params": {
                    "text": "Logged In",
                    "actions": [
                        {"type": "click_element", "params": {"text": "Login"}},
                        {"type": "wait", "params": {"seconds": 2.0}}
                    ]
                }
            }
        ]
    ),

    ActionSchema(
        type="repeat",
        display_name="Repeat",
        description="Repeat nested actions multiple times",
        category="control_flow",
        icon="refresh",
        supports_nesting=True,
        parameters=[
            ActionParameter(
                name="count",
                type="integer",
                required=True,
                description="Number of times to repeat",
                min=1,
                max=100,
                default=1,
                placeholder="3"
            ),
            ActionParameter(
                name="delay_between",
                type="float",
                required=False,
                description="Delay in seconds between iterations",
                min=0.0,
                max=10.0,
                placeholder="0.5"
            ),
            ActionParameter(
                name="max_iterations",
                type="integer",
                required=False,
                default=100,
                description="Safety limit for maximum iterations",
                min=1,
                max=1000
            ),
            ActionParameter(
                name="actions",
                type="nested_actions",
                required=True,
                description="Actions to repeat"
            )
        ],
        examples=[
            {
                "type": "repeat",
                "params": {
                    "count": 3,
                    "delay_between": 1.0,
                    "actions": [
                        {"type": "click_coords", "params": {"x": 540, "y": 960}},
                        {"type": "wait", "params": {"seconds": 0.5}}
                    ]
                }
            }
        ]
    ),

    ActionSchema(
        type="call_preset",
        display_name="Call Preset",
        description="Execute another preset's actions inline. Useful for reusing common action sequences across multiple presets.",
        category="control_flow",
        icon="external-link",
        supports_nesting=True,
        parameters=[
            ActionParameter(
                name="preset_id",
                type="integer",
                required=True,
                description="ID of the preset to execute",
                placeholder="123"
            ),
            ActionParameter(
                name="inherit_variables",
                type="boolean",
                required=False,
                default=True,
                description="Pass current variables to the called preset"
            )
        ],
        examples=[
            {
                "type": "call_preset",
                "params": {
                    "preset_id": 123,
                    "inherit_variables": True
                }
            }
        ]
    ),
]


def get_action_schemas() -> List[ActionSchema]:
    """Get all action schemas"""
    return ACTION_SCHEMAS


def get_action_schema(action_type: str) -> Optional[ActionSchema]:
    """Get schema for a specific action type"""
    for schema in ACTION_SCHEMAS:
        if schema.type == action_type:
            return schema
    return None


def get_action_schemas_by_category() -> Dict[str, List[ActionSchema]]:
    """Get action schemas grouped by category"""
    by_category: Dict[str, List[ActionSchema]] = {}
    for schema in ACTION_SCHEMAS:
        if schema.category not in by_category:
            by_category[schema.category] = []
        by_category[schema.category].append(schema)
    return by_category
