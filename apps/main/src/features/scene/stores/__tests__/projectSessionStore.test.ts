import { describe, it, expect, beforeEach } from 'vitest';

import { useProjectSessionStore } from '../projectSessionStore';

function getState() {
  return useProjectSessionStore.getState();
}

describe('projectSessionStore', () => {
  beforeEach(() => {
    getState().reset();
  });

  describe('setCurrentProject', () => {
    it('sets project metadata', () => {
      getState().setCurrentProject({
        projectId: 42,
        projectName: 'My Project',
        projectSourceWorldId: 1,
        projectUpdatedAt: '2026-01-01T00:00:00Z',
      });

      expect(getState().currentProjectId).toBe(42);
      expect(getState().currentProjectName).toBe('My Project');
      expect(getState().currentProjectSourceWorldId).toBe(1);
      expect(getState().currentProjectUpdatedAt).toBe('2026-01-01T00:00:00Z');
    });

    it('clears project when projectId is null', () => {
      getState().setCurrentProject({ projectId: 42, projectName: 'Test' });
      getState().setCurrentProject({ projectId: null });

      expect(getState().currentProjectId).toBeNull();
      expect(getState().currentProjectName).toBeNull();
    });

    it('rejects invalid projectId', () => {
      getState().setCurrentProject({ projectId: -1, projectName: 'Bad' });

      expect(getState().currentProjectId).toBeNull();
    });
  });

  describe('clearCurrentProject', () => {
    it('nullifies all current project fields', () => {
      getState().setCurrentProject({
        projectId: 42,
        projectName: 'Test',
        projectSourceWorldId: 1,
        projectUpdatedAt: '2026-01-01T00:00:00Z',
      });

      getState().clearCurrentProject();

      expect(getState().currentProjectId).toBeNull();
      expect(getState().currentProjectName).toBeNull();
      expect(getState().currentProjectSourceWorldId).toBeNull();
      expect(getState().currentProjectUpdatedAt).toBeNull();
    });
  });

  describe('recordImport', () => {
    it('sets import metadata and timestamp', () => {
      const before = Date.now();
      getState().recordImport({
        projectId: 10,
        projectName: 'Imported',
        schemaVersion: 1,
        extensionKeys: ['ext.a'],
        coreWarnings: ['warning1'],
      });

      expect(getState().currentProjectId).toBe(10);
      expect(getState().currentProjectName).toBe('Imported');
      expect(getState().schemaVersion).toBe(1);
      expect(getState().extensionKeys).toEqual(['ext.a']);
      expect(getState().coreWarnings).toEqual(['warning1']);
      expect(getState().lastOperation).toBe('import');
      expect(getState().lastImportedAt).toBeGreaterThanOrEqual(before);
      expect(getState().dirty).toBe(false);
    });
  });

  describe('recordExport', () => {
    it('sets export metadata and timestamp', () => {
      const before = Date.now();
      getState().recordExport({
        projectId: 20,
        projectName: 'Exported',
        schemaVersion: 1,
        extensionKeys: ['ext.b'],
      });

      expect(getState().currentProjectId).toBe(20);
      expect(getState().currentProjectName).toBe('Exported');
      expect(getState().lastOperation).toBe('export');
      expect(getState().lastExportedAt).toBeGreaterThanOrEqual(before);
    });
  });

  describe('setDirty', () => {
    it('toggles dirty state', () => {
      expect(getState().dirty).toBe(false);

      getState().setDirty(true);
      expect(getState().dirty).toBe(true);

      getState().setDirty(false);
      expect(getState().dirty).toBe(false);
    });

    it('returns same reference when value unchanged', () => {
      getState().setDirty(false);
      const before = getState();
      getState().setDirty(false);
      // Zustand returns same state reference when no change
      expect(getState()).toBe(before);
    });
  });

  describe('setLastAutosavedAt', () => {
    it('sets the autosave timestamp', () => {
      const now = Date.now();
      getState().setLastAutosavedAt(now);
      expect(getState().lastAutosavedAt).toBe(now);
    });
  });

  describe('reset', () => {
    it('restores all fields to initial state', () => {
      getState().recordImport({
        projectId: 10,
        projectName: 'Modified',
        schemaVersion: 2,
        extensionKeys: ['ext.x'],
      });
      getState().setDirty(true);

      getState().reset();

      expect(getState().currentProjectId).toBeNull();
      expect(getState().dirty).toBe(false);
      expect(getState().lastImportedAt).toBeNull();
      expect(getState().lastExportedAt).toBeNull();
      expect(getState().lastAutosavedAt).toBeNull();
      expect(getState().lastOperation).toBeNull();
    });
  });
});
