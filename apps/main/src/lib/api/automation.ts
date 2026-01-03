/**
 * Automation API Client (web wrapper)
 *
 * Delegates to environment-neutral domain client in @pixsim7/api-client.
 */
import { pixsimClient } from './client';
import { createAutomationApi } from '@pixsim7/api-client/domains';

export type {
  AndroidDevice,
  AutomationExecution,
  ExecutionLoop,
  AppActionPreset,
  CompletePairingRequest,
  ExecutePresetRequest,
  TestActionsRequest,
  DeviceScanResponse,
  CompletePairingResponse,
  ExecutePresetResponse,
  TestActionsResponse,
  ClearExecutionsResponse,
  ListExecutionsQuery,
  ListLoopsQuery,
} from '@pixsim7/api-client/domains';

const automationApi = createAutomationApi(pixsimClient);

export const listDevices = automationApi.listDevices;
export const scanDevices = automationApi.scanDevices;
export const resetDevice = automationApi.resetDevice;
export const completePairing = automationApi.completePairing;
export const listPresets = automationApi.listPresets;
export const getPreset = automationApi.getPreset;
export const createPreset = automationApi.createPreset;
export const updatePreset = automationApi.updatePreset;
export const deletePreset = automationApi.deletePreset;
export const copyPreset = automationApi.copyPreset;
export const executePreset = automationApi.executePreset;
export const testActions = automationApi.testActions;
export const listExecutions = automationApi.listExecutions;
export const clearExecutions = automationApi.clearExecutions;
export const getExecution = automationApi.getExecution;
export const listLoops = automationApi.listLoops;
export const getLoop = automationApi.getLoop;
export const createLoop = automationApi.createLoop;
export const updateLoop = automationApi.updateLoop;
export const deleteLoop = automationApi.deleteLoop;
export const startLoop = automationApi.startLoop;
export const pauseLoop = automationApi.pauseLoop;
export const runLoopNow = automationApi.runLoopNow;

