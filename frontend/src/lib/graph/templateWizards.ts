import type { GraphTemplate } from './graphTemplates';
import type { DraftSceneNode, DraftEdge } from '../../modules/scene-builder';

/**
 * Phase 7: Template Wizard System
 *
 * Wizards provide guided flows for creating common scene patterns.
 * They collect inputs from the user and generate pre-configured templates.
 */

/**
 * Wizard input field types
 */
export type WizardFieldType = 'text' | 'number' | 'select' | 'checkbox';

/**
 * Wizard input field definition
 */
export interface WizardField {
  id: string;
  label: string;
  type: WizardFieldType;
  defaultValue?: string | number | boolean;
  placeholder?: string;
  description?: string;
  required?: boolean;
  options?: Array<{ value: string; label: string }>; // For select fields
  validation?: {
    min?: number;
    max?: number;
    pattern?: RegExp;
  };
}

/**
 * Wizard input values
 */
export type WizardValues = Record<string, string | number | boolean>;

/**
 * Template wizard definition
 */
export interface TemplateWizard {
  id: string;
  name: string;
  description: string;
  category: string;
  icon?: string;
  fields: WizardField[];

  /**
   * Generate template nodes and edges based on user inputs
   */
  generateTemplate: (values: WizardValues) => {
    nodes: DraftSceneNode[];
    edges: DraftEdge[];
  };
}

/**
 * Built-in template wizards
 */

// Wizard 1: Quest Introduction with Success/Fail Branches
export const questIntroWizard: TemplateWizard = {
  id: 'quest_intro',
  name: 'Quest Introduction',
  description: 'Creates a quest intro with success and failure branches',
  category: 'Quest Flow',
  icon: '🎯',
  fields: [
    {
      id: 'questName',
      label: 'Quest Name',
      type: 'text',
      placeholder: 'e.g., "Rescue Mission"',
      required: true,
    },
    {
      id: 'npcName',
      label: 'NPC Name',
      type: 'text',
      placeholder: 'e.g., "Village Elder"',
      required: true,
    },
    {
      id: 'successMessage',
      label: 'Success Message',
      type: 'text',
      defaultValue: 'Quest completed!',
    },
    {
      id: 'failureMessage',
      label: 'Failure Message',
      type: 'text',
      defaultValue: 'Quest failed...',
    },
  ],
  generateTemplate: (values) => {
    const timestamp = Date.now();
    const questName = values.questName as string;
    const npcName = values.npcName as string;

    const nodes: DraftSceneNode[] = [
      {
        id: `quest_intro_${timestamp}`,
        type: 'video',
        assetIds: [],
        metadata: {
          label: `${questName} - Intro`,
          position: { x: 200, y: 100 },
          description: `${npcName} introduces the quest`,
        },
      },
      {
        id: `quest_condition_${timestamp}`,
        type: 'condition',
        condition: { type: 'true' },
        metadata: {
          label: 'Check Success',
          position: { x: 200, y: 250 },
          description: 'Check if quest objective is met',
        },
      },
      {
        id: `quest_success_${timestamp}`,
        type: 'video',
        assetIds: [],
        metadata: {
          label: values.successMessage as string,
          position: { x: 100, y: 400 },
        },
      },
      {
        id: `quest_failure_${timestamp}`,
        type: 'video',
        assetIds: [],
        metadata: {
          label: values.failureMessage as string,
          position: { x: 300, y: 400 },
        },
      },
      {
        id: `quest_end_${timestamp}`,
        type: 'end',
        metadata: {
          label: 'Quest Complete',
          position: { x: 200, y: 550 },
        },
      },
    ];

    const edges: DraftEdge[] = [
      {
        id: `edge_intro_condition_${timestamp}`,
        from: `quest_intro_${timestamp}`,
        to: `quest_condition_${timestamp}`,
        meta: { fromPort: 'default', toPort: 'input' },
      },
      {
        id: `edge_condition_success_${timestamp}`,
        from: `quest_condition_${timestamp}`,
        to: `quest_success_${timestamp}`,
        meta: { fromPort: 'true', toPort: 'input' },
      },
      {
        id: `edge_condition_failure_${timestamp}`,
        from: `quest_condition_${timestamp}`,
        to: `quest_failure_${timestamp}`,
        meta: { fromPort: 'false', toPort: 'input' },
      },
      {
        id: `edge_success_end_${timestamp}`,
        from: `quest_success_${timestamp}`,
        to: `quest_end_${timestamp}`,
        meta: { fromPort: 'default', toPort: 'input' },
      },
      {
        id: `edge_failure_end_${timestamp}`,
        from: `quest_failure_${timestamp}`,
        to: `quest_end_${timestamp}`,
        meta: { fromPort: 'default', toPort: 'input' },
      },
    ];

    return { nodes, edges };
  },
};

// Wizard 2: Dialogue Branch with Player Choice
export const dialogueBranchWizard: TemplateWizard = {
  id: 'dialogue_branch',
  name: 'Dialogue Branch',
  description: 'Creates a dialogue with player choice and branching outcomes',
  category: 'Dialogue',
  icon: '💬',
  fields: [
    {
      id: 'npcName',
      label: 'NPC Name',
      type: 'text',
      placeholder: 'e.g., "Merchant"',
      required: true,
    },
    {
      id: 'dialogueText',
      label: 'Dialogue Prompt',
      type: 'text',
      placeholder: 'e.g., "What brings you here?"',
      required: true,
    },
    {
      id: 'option1',
      label: 'Option 1',
      type: 'text',
      defaultValue: 'Be friendly',
      required: true,
    },
    {
      id: 'option2',
      label: 'Option 2',
      type: 'text',
      defaultValue: 'Be assertive',
      required: true,
    },
  ],
  generateTemplate: (values) => {
    const timestamp = Date.now();

    const nodes: DraftSceneNode[] = [
      {
        id: `dialogue_start_${timestamp}`,
        type: 'video',
        assetIds: [],
        metadata: {
          label: `${values.npcName} speaks`,
          position: { x: 200, y: 100 },
          description: values.dialogueText as string,
        },
      },
      {
        id: `dialogue_choice_${timestamp}`,
        type: 'choice',
        choices: [
          { id: 'opt1', text: values.option1 as string },
          { id: 'opt2', text: values.option2 as string },
        ],
        metadata: {
          label: 'Player Choice',
          position: { x: 200, y: 250 },
        },
      },
      {
        id: `dialogue_result1_${timestamp}`,
        type: 'video',
        assetIds: [],
        metadata: {
          label: 'Response to Option 1',
          position: { x: 100, y: 400 },
        },
      },
      {
        id: `dialogue_result2_${timestamp}`,
        type: 'video',
        assetIds: [],
        metadata: {
          label: 'Response to Option 2',
          position: { x: 300, y: 400 },
        },
      },
    ];

    const edges: DraftEdge[] = [
      {
        id: `edge_start_choice_${timestamp}`,
        from: `dialogue_start_${timestamp}`,
        to: `dialogue_choice_${timestamp}`,
        meta: { fromPort: 'default', toPort: 'input' },
      },
      {
        id: `edge_choice_opt1_${timestamp}`,
        from: `dialogue_choice_${timestamp}`,
        to: `dialogue_result1_${timestamp}`,
        meta: { fromPort: 'opt1', toPort: 'input' },
      },
      {
        id: `edge_choice_opt2_${timestamp}`,
        from: `dialogue_choice_${timestamp}`,
        to: `dialogue_result2_${timestamp}`,
        meta: { fromPort: 'opt2', toPort: 'input' },
      },
    ];

    return { nodes, edges };
  },
};

// Wizard 3: Conditional Relationship Check
export const relationshipCheckWizard: TemplateWizard = {
  id: 'relationship_check',
  name: 'Relationship Check',
  description: 'Creates a branching flow based on relationship level',
  category: 'Relationship',
  icon: '💕',
  fields: [
    {
      id: 'characterName',
      label: 'Character Name',
      type: 'text',
      placeholder: 'e.g., "Alex"',
      required: true,
    },
    {
      id: 'relationshipThreshold',
      label: 'Relationship Threshold',
      type: 'select',
      defaultValue: 'friendly',
      options: [
        { value: 'stranger', label: 'Stranger (0)' },
        { value: 'acquaintance', label: 'Acquaintance (25)' },
        { value: 'friendly', label: 'Friendly (50)' },
        { value: 'close', label: 'Close (75)' },
        { value: 'romantic', label: 'Romantic (100)' },
      ],
    },
    {
      id: 'highRelationshipResponse',
      label: 'High Relationship Response',
      type: 'text',
      defaultValue: 'Warm greeting',
    },
    {
      id: 'lowRelationshipResponse',
      label: 'Low Relationship Response',
      type: 'text',
      defaultValue: 'Neutral greeting',
    },
  ],
  generateTemplate: (values) => {
    const timestamp = Date.now();

    const nodes: DraftSceneNode[] = [
      {
        id: `rel_greeting_${timestamp}`,
        type: 'video',
        assetIds: [],
        metadata: {
          label: `${values.characterName} approaches`,
          position: { x: 200, y: 100 },
        },
      },
      {
        id: `rel_check_${timestamp}`,
        type: 'condition',
        condition: { type: 'true' },
        metadata: {
          label: `Check ${values.relationshipThreshold} relationship`,
          position: { x: 200, y: 250 },
          description: `Check if relationship >= ${values.relationshipThreshold}`,
        },
      },
      {
        id: `rel_high_${timestamp}`,
        type: 'video',
        assetIds: [],
        metadata: {
          label: values.highRelationshipResponse as string,
          position: { x: 100, y: 400 },
        },
      },
      {
        id: `rel_low_${timestamp}`,
        type: 'video',
        assetIds: [],
        metadata: {
          label: values.lowRelationshipResponse as string,
          position: { x: 300, y: 400 },
        },
      },
    ];

    const edges: DraftEdge[] = [
      {
        id: `edge_greeting_check_${timestamp}`,
        from: `rel_greeting_${timestamp}`,
        to: `rel_check_${timestamp}`,
        meta: { fromPort: 'default', toPort: 'input' },
      },
      {
        id: `edge_check_high_${timestamp}`,
        from: `rel_check_${timestamp}`,
        to: `rel_high_${timestamp}`,
        meta: { fromPort: 'true', toPort: 'input' },
      },
      {
        id: `edge_check_low_${timestamp}`,
        from: `rel_check_${timestamp}`,
        to: `rel_low_${timestamp}`,
        meta: { fromPort: 'false', toPort: 'input' },
      },
    ];

    return { nodes, edges };
  },
};

// Wizard 4: Flirt Attempt with Success/Fail
export const flirtWizard: TemplateWizard = {
  id: 'flirt_attempt',
  name: 'Flirt Attempt',
  description: 'Creates a flirtation scene with success and failure outcomes',
  category: 'Relationship',
  icon: '😘',
  fields: [
    {
      id: 'targetName',
      label: 'Target Character',
      type: 'text',
      placeholder: 'e.g., "Jordan"',
      required: true,
    },
    {
      id: 'flirtLine',
      label: 'Flirt Line',
      type: 'text',
      placeholder: 'e.g., "You look amazing today"',
      required: true,
    },
    {
      id: 'successResponse',
      label: 'Success Response',
      type: 'text',
      defaultValue: 'Blushes and smiles',
    },
    {
      id: 'failureResponse',
      label: 'Failure Response',
      type: 'text',
      defaultValue: 'Awkward laugh',
    },
  ],
  generateTemplate: (values) => {
    const timestamp = Date.now();

    const nodes: DraftSceneNode[] = [
      {
        id: `flirt_setup_${timestamp}`,
        type: 'video',
        assetIds: [],
        metadata: {
          label: 'Setup Scene',
          position: { x: 200, y: 100 },
          description: `Conversation with ${values.targetName}`,
        },
      },
      {
        id: `flirt_choice_${timestamp}`,
        type: 'choice',
        choices: [
          { id: 'flirt', text: values.flirtLine as string },
          { id: 'friendly', text: 'Just chat normally' },
        ],
        metadata: {
          label: 'Choose Approach',
          position: { x: 200, y: 250 },
        },
      },
      {
        id: `flirt_check_${timestamp}`,
        type: 'condition',
        condition: { type: 'true' },
        metadata: {
          label: 'Flirt Success Check',
          position: { x: 100, y: 400 },
          description: 'Check relationship and charisma',
        },
      },
      {
        id: `flirt_success_${timestamp}`,
        type: 'video',
        assetIds: [],
        metadata: {
          label: values.successResponse as string,
          position: { x: 50, y: 550 },
        },
      },
      {
        id: `flirt_failure_${timestamp}`,
        type: 'video',
        assetIds: [],
        metadata: {
          label: values.failureResponse as string,
          position: { x: 150, y: 550 },
        },
      },
      {
        id: `friendly_response_${timestamp}`,
        type: 'video',
        assetIds: [],
        metadata: {
          label: 'Normal Conversation',
          position: { x: 300, y: 400 },
        },
      },
    ];

    const edges: DraftEdge[] = [
      {
        id: `edge_setup_choice_${timestamp}`,
        from: `flirt_setup_${timestamp}`,
        to: `flirt_choice_${timestamp}`,
        meta: { fromPort: 'default', toPort: 'input' },
      },
      {
        id: `edge_choice_flirt_${timestamp}`,
        from: `flirt_choice_${timestamp}`,
        to: `flirt_check_${timestamp}`,
        meta: { fromPort: 'flirt', toPort: 'input' },
      },
      {
        id: `edge_choice_friendly_${timestamp}`,
        from: `flirt_choice_${timestamp}`,
        to: `friendly_response_${timestamp}`,
        meta: { fromPort: 'friendly', toPort: 'input' },
      },
      {
        id: `edge_check_success_${timestamp}`,
        from: `flirt_check_${timestamp}`,
        to: `flirt_success_${timestamp}`,
        meta: { fromPort: 'true', toPort: 'input' },
      },
      {
        id: `edge_check_failure_${timestamp}`,
        from: `flirt_check_${timestamp}`,
        to: `flirt_failure_${timestamp}`,
        meta: { fromPort: 'false', toPort: 'input' },
      },
    ];

    return { nodes, edges };
  },
};

// Wizard 5: Sequential Dialogue Chain
export const dialogueChainWizard: TemplateWizard = {
  id: 'dialogue_chain',
  name: 'Sequential Dialogue',
  description: 'Creates a chain of dialogue nodes for storytelling',
  category: 'Dialogue',
  icon: '📖',
  fields: [
    {
      id: 'sceneTitle',
      label: 'Scene Title',
      type: 'text',
      placeholder: 'e.g., "Morning Conversation"',
      required: true,
    },
    {
      id: 'numSegments',
      label: 'Number of Dialogue Segments',
      type: 'select',
      defaultValue: '3',
      options: [
        { value: '2', label: '2 segments' },
        { value: '3', label: '3 segments' },
        { value: '4', label: '4 segments' },
        { value: '5', label: '5 segments' },
      ],
    },
  ],
  generateTemplate: (values) => {
    const timestamp = Date.now();
    const numSegments = parseInt(values.numSegments as string);
    const nodes: DraftSceneNode[] = [];
    const edges: DraftEdge[] = [];

    // Create dialogue nodes
    for (let i = 0; i < numSegments; i++) {
      nodes.push({
        id: `dialogue_${i}_${timestamp}`,
        type: 'video',
        assetIds: [],
        metadata: {
          label: `${values.sceneTitle} - Part ${i + 1}`,
          position: { x: 200, y: 100 + i * 150 },
        },
      });

      // Connect to previous node
      if (i > 0) {
        edges.push({
          id: `edge_${i - 1}_${i}_${timestamp}`,
          from: `dialogue_${i - 1}_${timestamp}`,
          to: `dialogue_${i}_${timestamp}`,
          meta: { fromPort: 'default', toPort: 'input' },
        });
      }
    }

    // Add end node
    nodes.push({
      id: `dialogue_end_${timestamp}`,
      type: 'end',
      metadata: {
        label: 'End Scene',
        position: { x: 200, y: 100 + numSegments * 150 },
      },
    });

    // Connect last dialogue to end
    edges.push({
      id: `edge_last_end_${timestamp}`,
      from: `dialogue_${numSegments - 1}_${timestamp}`,
      to: `dialogue_end_${timestamp}`,
      meta: { fromPort: 'default', toPort: 'input' },
    });

    return { nodes, edges };
  },
};

/**
 * All available template wizards
 */
export const builtinWizards: TemplateWizard[] = [
  questIntroWizard,
  dialogueBranchWizard,
  relationshipCheckWizard,
  flirtWizard,
  dialogueChainWizard,
];

/**
 * Get wizard by ID
 */
export function getWizardById(id: string): TemplateWizard | undefined {
  return builtinWizards.find((w) => w.id === id);
}

/**
 * Get wizards by category
 */
export function getWizardsByCategory(category: string): TemplateWizard[] {
  return builtinWizards.filter((w) => w.category === category);
}
