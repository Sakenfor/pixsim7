import { componentRegistry } from "@features/componentSettings";

import {
  QUICKGEN_PROMPT_COMPONENT_ID,
  QUICKGEN_SETTINGS_COMPONENT_ID,
  QUICKGEN_PROMPT_DEFAULTS,
  QUICKGEN_SETTINGS_DEFAULTS,
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
              label: "Show input sets",
              description: "Save and load prompt + inputs + settings as named sets",
              type: "toggle",
              defaultValue: QUICKGEN_SETTINGS_DEFAULTS.showInputSets,
            },
          ],
        },
      ],
    },
  });
}
