import { ActionType } from '../types';

interface ActionTypeSelectProps {
  value: ActionType;
  onChange: (value: ActionType) => void;
  disabled?: boolean;
}

const actionGroups = [
  {
    label: 'Input Actions',
    actions: [
      { type: ActionType.CLICK_COORDS, label: 'Click Coordinates', description: 'Tap at specific X,Y position' },
      { type: ActionType.TYPE_TEXT, label: 'Type Text', description: 'Enter text input' },
      { type: ActionType.SWIPE, label: 'Swipe', description: 'Swipe gesture' },
      { type: ActionType.PRESS_BACK, label: 'Back Button', description: 'Press back button' },
      { type: ActionType.PRESS_HOME, label: 'Home Button', description: 'Press home button' },
    ],
  },
  {
    label: 'App Control',
    actions: [
      { type: ActionType.LAUNCH_APP, label: 'Launch App', description: 'Start an application' },
      { type: ActionType.EXIT_APP, label: 'Exit App', description: 'Close an application' },
    ],
  },
  {
    label: 'Element Actions',
    actions: [
      { type: ActionType.WAIT_FOR_ELEMENT, label: 'Wait for Element', description: 'Wait until element appears' },
      { type: ActionType.CLICK_ELEMENT, label: 'Click Element', description: 'Click UI element by selector' },
    ],
  },
  {
    label: 'Control Flow',
    actions: [
      { type: ActionType.WAIT, label: 'Wait', description: 'Pause for duration' },
      { type: ActionType.REPEAT, label: 'Repeat', description: 'Loop actions' },
      { type: ActionType.IF_ELEMENT_EXISTS, label: 'If Element Exists', description: 'Conditional execution' },
      { type: ActionType.IF_ELEMENT_NOT_EXISTS, label: 'If Element Not Exists', description: 'Conditional execution' },
    ],
  },
  {
    label: 'Capture',
    actions: [
      { type: ActionType.SCREENSHOT, label: 'Screenshot', description: 'Capture screen' },
    ],
  },
];

export function ActionTypeSelect({ value, onChange, disabled }: ActionTypeSelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as ActionType)}
      disabled={disabled}
      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
    >
      {actionGroups.map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.actions.map((action) => (
            <option key={action.type} value={action.type}>
              {action.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

export { actionGroups };
