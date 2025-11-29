import { ActionType } from '@/types/automation';

interface ActionParamsEditorProps {
  actionType: ActionType;
  params: Record<string, any>;
  onChange: (params: Record<string, any>) => void;
}

export function ActionParamsEditor({ actionType, params, onChange }: ActionParamsEditorProps) {
  const updateParam = (key: string, value: any) => {
    onChange({ ...params, [key]: value });
  };

  const inputClass = "w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent";

  switch (actionType) {
    case ActionType.WAIT:
      return (
        <div>
          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
            Seconds
          </label>
          <input
            type="number"
            value={params.seconds ?? 1}
            onChange={(e) => updateParam('seconds', parseFloat(e.target.value))}
            step="0.1"
            min="0"
            className={inputClass}
          />
        </div>
      );

    case ActionType.LAUNCH_APP:
      return (
        <div>
          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
            Package Name (optional)
          </label>
          <input
            type="text"
            value={params.package ?? ''}
            onChange={(e) => updateParam('package', e.target.value)}
            placeholder="com.example.app"
            className={inputClass}
          />
        </div>
      );

    case ActionType.CLICK_COORDS:
      return (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">X</label>
            <input
              type="number"
              value={params.x ?? 0}
              onChange={(e) => updateParam('x', parseInt(e.target.value))}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Y</label>
            <input
              type="number"
              value={params.y ?? 0}
              onChange={(e) => updateParam('y', parseInt(e.target.value))}
              className={inputClass}
            />
          </div>
        </div>
      );

    case ActionType.TYPE_TEXT:
      return (
        <div>
          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
            Text
          </label>
          <input
            type="text"
            value={params.text ?? ''}
            onChange={(e) => updateParam('text', e.target.value)}
            placeholder="Text to type (supports {variables})"
            className={inputClass}
          />
        </div>
      );

    case ActionType.SWIPE:
      return (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">X1</label>
              <input
                type="number"
                value={params.x1 ?? 0}
                onChange={(e) => updateParam('x1', parseInt(e.target.value))}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Y1</label>
              <input
                type="number"
                value={params.y1 ?? 0}
                onChange={(e) => updateParam('y1', parseInt(e.target.value))}
                className={inputClass}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">X2</label>
              <input
                type="number"
                value={params.x2 ?? 0}
                onChange={(e) => updateParam('x2', parseInt(e.target.value))}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Y2</label>
              <input
                type="number"
                value={params.y2 ?? 0}
                onChange={(e) => updateParam('y2', parseInt(e.target.value))}
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
              Duration (ms)
            </label>
            <input
              type="number"
              value={params.duration_ms ?? 300}
              onChange={(e) => updateParam('duration_ms', parseInt(e.target.value))}
              className={inputClass}
            />
          </div>
        </div>
      );

    case ActionType.WAIT_FOR_ELEMENT:
      return (
        <div className="space-y-2">
          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
              Resource ID (optional)
            </label>
            <input
              type="text"
              value={params.resource_id ?? ''}
              onChange={(e) => updateParam('resource_id', e.target.value)}
              placeholder="com.example:id/button"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
              Text (optional)
            </label>
            <input
              type="text"
              value={params.text ?? ''}
              onChange={(e) => updateParam('text', e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
              Content Description (optional)
            </label>
            <input
              type="text"
              value={params.content_desc ?? ''}
              onChange={(e) => updateParam('content_desc', e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                Timeout (s)
              </label>
              <input
                type="number"
                value={params.timeout ?? 10}
                onChange={(e) => updateParam('timeout', parseInt(e.target.value))}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                Interval (s)
              </label>
              <input
                type="number"
                value={params.interval ?? 1}
                onChange={(e) => updateParam('interval', parseFloat(e.target.value))}
                step="0.1"
                className={inputClass}
              />
            </div>
          </div>
        </div>
      );

    case ActionType.CLICK_ELEMENT:
      return (
        <div className="space-y-2">
          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
              Resource ID (optional)
            </label>
            <input
              type="text"
              value={params.resource_id ?? ''}
              onChange={(e) => updateParam('resource_id', e.target.value)}
              placeholder="com.example:id/button"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
              Text (optional)
            </label>
            <input
              type="text"
              value={params.text ?? ''}
              onChange={(e) => updateParam('text', e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
              Content Description (optional)
            </label>
            <input
              type="text"
              value={params.content_desc ?? ''}
              onChange={(e) => updateParam('content_desc', e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
      );

    case ActionType.REPEAT:
      return (
        <div>
          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
            Count
          </label>
          <input
            type="number"
            value={params.count ?? 1}
            onChange={(e) => updateParam('count', parseInt(e.target.value))}
            min="1"
            className={inputClass}
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Note: Nested actions not editable in this view
          </p>
        </div>
      );

    case ActionType.PRESS_BACK:
    case ActionType.PRESS_HOME:
    case ActionType.EXIT_APP:
    case ActionType.SCREENSHOT:
      return (
        <div className="text-sm text-gray-500 dark:text-gray-400">
          This action has no parameters.
        </div>
      );

    case ActionType.IF_ELEMENT_EXISTS:
    case ActionType.IF_ELEMENT_NOT_EXISTS:
      return (
        <div className="space-y-2">
          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
              Resource ID (optional)
            </label>
            <input
              type="text"
              value={params.resource_id ?? ''}
              onChange={(e) => updateParam('resource_id', e.target.value)}
              placeholder="com.example:id/button"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
              Text (optional)
            </label>
            <input
              type="text"
              value={params.text ?? ''}
              onChange={(e) => updateParam('text', e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
              Content Description (optional)
            </label>
            <input
              type="text"
              value={params.content_desc ?? ''}
              onChange={(e) => updateParam('content_desc', e.target.value)}
              className={inputClass}
            />
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Note: Nested actions not editable in this view
          </p>
        </div>
      );

    default:
      return (
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Unknown action type
        </div>
      );
  }
}
