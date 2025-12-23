export const APP_ACTION_KEY_PREFIX = "app:action:";
export const APP_STATE_KEY_PREFIX = "app:state:";

export function getAppActionCapabilityKey(actionId: string): string {
  return `${APP_ACTION_KEY_PREFIX}${actionId}`;
}

export function getAppStateCapabilityKey(stateId: string): string {
  return `${APP_STATE_KEY_PREFIX}${stateId}`;
}
