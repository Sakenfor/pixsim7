
import { componentRegistry } from "@features/componentSettings";

import {
  QUICKGEN_PROMPT_COMPONENT_ID,
  QUICKGEN_SETTINGS_COMPONENT_ID,
  QUICKGEN_ASSET_COMPONENT_ID,
  QUICKGEN_PROMPT_DEFAULTS,
  QUICKGEN_SETTINGS_DEFAULTS,
  QUICKGEN_ASSET_DEFAULTS,
} from "./quickGenerateComponentSettings";

let registered = false;

export function registerQuickGenerateComponentSettings() {
  if (registered) return;
  registered = true;

  componentRegistry.register({
    id: QUICKGEN_PROMPT_COMPONENT_ID,
    title: "QuickGen Prompt",
    description: "Prompt input appearance and behavior.",
    defaultSettings: QUICKGEN_PROMPT_DEFAULTS,
    settingsForm: {
      groups: [
        {
          id: "prompt-input",
          title: "Prompt Input",
          fields: [
            {
              id: "variant",
              label: "Style",
              type: "select",
              options: [
                { value: "compact", label: "Compact" },
                { value: "default", label: "Default" },
              ],
              defaultValue: QUICKGEN_PROMPT_DEFAULTS.variant,
            },
            {
              id: "showCounter",
              label: "Show character counter",
              type: "toggle",
              defaultValue: QUICKGEN_PROMPT_DEFAULTS.showCounter,
            },
            {
              id: "resizable",
              label: "Resizable",
              type: "toggle",
              defaultValue: QUICKGEN_PROMPT_DEFAULTS.resizable,
            },
            {
              id: "minHeight",
              label: "Minimum height",
              type: "number",
              min: 60,
              max: 320,
              step: 10,
              defaultValue: QUICKGEN_PROMPT_DEFAULTS.minHeight,
            },
            {
              id: "autoPinPromptOnInsert",
              label: "Auto-pin inserted prompts to the current input",
              description:
                "When inserting a prompt while an input is selected in the carousel, pin it to that input instead of the shared default. Off pins only inputs already pinned.",
              type: "toggle",
              defaultValue: QUICKGEN_PROMPT_DEFAULTS.autoPinPromptOnInsert,
            },
          ],
        },
        {
          id: "prompt-moderation",
          title: "Render-moderation chip",
          fields: [
            {
              id: "showModerationChip",
              label: "Show render-moderation chip",
              description:
                "A pass-rate chip next to the char counter, showing how often this prompt clears the provider's render-time moderation.",
              type: "toggle",
              defaultValue: QUICKGEN_PROMPT_DEFAULTS.showModerationChip,
            },
            {
              id: "moderationGrain",
              label: "Stat scope",
              description:
                "Auto prefers the prompt + input-image track record; Prompt only always shows the broader prompt-only rate.",
              type: "select",
              options: [
                { value: "auto", label: "Auto (prompt + image)" },
                { value: "prompt", label: "Prompt only" },
              ],
              defaultValue: QUICKGEN_PROMPT_DEFAULTS.moderationGrain,
              showWhen: (values) => values.showModerationChip !== false,
            },
          ],
        },
        {
          id: "prompt-history",
          title: "History",
          fields: [
            {
              id: "historyDefaultTab",
              label: "Default view",
              description:
                "Which tab opens first when an input asset is selected (both views available).",
              type: "select",
              options: [
                { value: "input", label: "This input" },
                { value: "edits", label: "Edits" },
              ],
              defaultValue: QUICKGEN_PROMPT_DEFAULTS.historyDefaultTab,
            },
            {
              id: "inputHistoryMediaFilter",
              label: "This input — media type",
              description:
                "Restrict the 'This input' view to prompts that produced one media type.",
              type: "select",
              options: [
                { value: "all", label: "All" },
                { value: "image", label: "Images only" },
                { value: "video", label: "Videos only" },
              ],
              defaultValue: QUICKGEN_PROMPT_DEFAULTS.inputHistoryMediaFilter,
            },
            {
              id: "inputHistoryMaxResults",
              label: "This input — max prompts",
              description: "How many prior prompts to load for the selected input.",
              type: "number",
              min: 20,
              max: 100,
              step: 10,
              defaultValue: QUICKGEN_PROMPT_DEFAULTS.inputHistoryMaxResults,
            },
            {
              id: "historyScope",
              label: "Edits — history scope",
              description: "Choose where draft (edit) history is shared and restored.",
              type: "select",
              options: [
                { value: "provider-operation", label: "Provider + operation" },
                { value: "operation", label: "Operation only" },
                { value: "global", label: "Global" },
              ],
              defaultValue: QUICKGEN_PROMPT_DEFAULTS.historyScope,
            },
            {
              id: "historyMaxEntries",
              label: "Edits — max entries",
              type: "number",
              min: 20,
              max: 300,
              step: 10,
              defaultValue: QUICKGEN_PROMPT_DEFAULTS.historyMaxEntries,
            },
          ],
        },
      ],
    },
  });

  componentRegistry.register({
    id: QUICKGEN_SETTINGS_COMPONENT_ID,
    title: "QuickGen Settings",
    description: "Controls for operation and provider selectors.",
    defaultSettings: QUICKGEN_SETTINGS_DEFAULTS,
    settingsForm: {
      groups: [
        {
          id: "settings-visibility",
          title: "Visibility",
          fields: [
            {
              id: "showOperationType",
              label: "Show operation type",
              type: "toggle",
              defaultValue: QUICKGEN_SETTINGS_DEFAULTS.showOperationType,
            },
            {
              id: "showProvider",
              label: "Show provider selector",
              type: "toggle",
              defaultValue: QUICKGEN_SETTINGS_DEFAULTS.showProvider,
            },
            {
              id: "showInputSets",
              label: "Show generation presets",
              description: "Save and load prompt + inputs + settings as named presets",
              type: "toggle",
              defaultValue: QUICKGEN_SETTINGS_DEFAULTS.showInputSets,
            },
          ],
        },
      ],
    },
  });

  componentRegistry.register({
    id: QUICKGEN_ASSET_COMPONENT_ID,
    title: "QuickGen Asset",
    description: "Asset input preview behavior.",
    defaultSettings: QUICKGEN_ASSET_DEFAULTS,
    settingsForm: {
      groups: [
        {
          id: "asset-preview",
          title: "Preview",
          fields: [
            {
              id: "enableHoverPreview",
              label: "Hover preview",
              description: "Scrub video previews on hover.",
              type: "toggle",
              defaultValue: QUICKGEN_ASSET_DEFAULTS.enableHoverPreview,
            },
            {
              id: "showPlayOverlay",
              label: "Show play overlay",
              type: "toggle",
              defaultValue: QUICKGEN_ASSET_DEFAULTS.showPlayOverlay,
            },
            {
              id: "clickToPlay",
              label: "Click to play",
              description: "Toggle play/pause on click.",
              type: "toggle",
              defaultValue: QUICKGEN_ASSET_DEFAULTS.clickToPlay,
            },
          ],
        },
        {
          id: "asset-layout",
          title: "Layout",
          fields: [
            {
              id: "displayMode",
              label: "Multi-input display",
              type: "select",
              options: [
                { value: "strip", label: "Strip" },
                { value: "grid", label: "Grid" },
                { value: "carousel", label: "Carousel" },
              ],
              defaultValue: QUICKGEN_ASSET_DEFAULTS.displayMode,
            },
            {
              id: "gridColumns",
              label: "Grid columns",
              type: "number",
              min: 2,
              max: 6,
              step: 1,
              defaultValue: QUICKGEN_ASSET_DEFAULTS.gridColumns,
              showWhen: (values) => values.displayMode === "grid",
            },
            {
              id: "cardMinSize",
              label: "Card size",
              description: "Minimum card edge for the strip layout. Larger = fewer, bigger cards.",
              type: "range",
              min: 56,
              max: 160,
              step: 8,
              defaultValue: QUICKGEN_ASSET_DEFAULTS.cardMinSize,
              format: (v: number) => `${v}px`,
              showWhen: (values) => values.displayMode === "strip",
            },
          ],
        },
      ],
    },
  });
}
