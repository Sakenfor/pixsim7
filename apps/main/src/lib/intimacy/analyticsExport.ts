/**
 * Analytics Export Utilities
 *
 * Export analytics data to various formats (CSV, JSON) for external analysis.
 *
 * @see apps/main/src/lib/intimacy/analytics.ts
 */

import type { SceneAnalyticsSummary, ArcAnalyticsSummary } from './analytics';
import { getSceneAnalyticsSummary, getArcAnalyticsSummary, getSceneEvents, getArcEvents } from './analytics';

/**
 * Export scene analytics to CSV
 */
export function exportSceneAnalyticsToCSV(): string {
  const summary = getSceneAnalyticsSummary();

  // Header
  let csv = 'Scene Analytics Summary\n\n';
  csv += `Total Scenes,${summary.totalScenes}\n`;
  csv += `Total Attempts,${summary.totalAttempts}\n`;
  csv += `Completion Rate,${summary.completionRate.toFixed(2)}%\n\n`;

  // Most used scenes
  csv += 'Most Used Scenes\n';
  csv += 'Scene ID,Scene Name,Scene Type,Attempts\n';
  for (const scene of summary.mostUsedScenes) {
    csv += `${scene.sceneId},${scene.sceneName},${scene.sceneType},${scene.attempts}\n`;
  }

  csv += '\n';

  // Gate blockages
  csv += 'Gate Blockages\n';
  csv += 'Scene ID,Scene Name,Gate ID,Gate Name,Block Count\n';
  for (const gate of summary.gateBlockages) {
    csv += `${gate.sceneId},${gate.sceneName},${gate.gateId},${gate.gateName},${gate.blockCount}\n`;
  }

  csv += '\n';

  // Scene type distribution
  csv += 'Scene Type Distribution\n';
  csv += 'Scene Type,Count,Percentage\n';
  for (const [type, count] of Object.entries(summary.sceneTypeDistribution)) {
    const percentage = ((count / summary.totalAttempts) * 100).toFixed(2);
    csv += `${type},${count},${percentage}%\n`;
  }

  return csv;
}

/**
 * Export arc analytics to CSV
 */
export function exportArcAnalyticsToCSV(): string {
  const summary = getArcAnalyticsSummary();

  // Header
  let csv = 'Arc Analytics Summary\n\n';
  csv += `Total Arcs,${summary.totalArcs}\n`;
  csv += `Total Stage Entries,${summary.totalStageEntries}\n`;
  csv += `Completion Rate,${summary.completionRate.toFixed(2)}%\n`;
  csv += `Avg Stages Completed,${summary.averageStagesCompleted.toFixed(2)}\n\n`;

  // Most completed arcs
  csv += 'Most Completed Arcs\n';
  csv += 'Arc ID,Arc Name,Completions\n';
  for (const arc of summary.mostCompletedArcs) {
    csv += `${arc.arcId},${arc.arcName},${arc.completions}\n`;
  }

  csv += '\n';

  // Stage completion rates
  csv += 'Stage Completion Rates\n';
  csv += 'Stage Name,Attempts,Completions,Completion Rate\n';
  for (const stage of summary.stageCompletionRates) {
    csv += `${stage.stageName},${stage.attempts},${stage.completions},${stage.completionRate.toFixed(2)}%\n`;
  }

  csv += '\n';

  // Abandonment points
  csv += 'Abandonment Points\n';
  csv += 'Arc ID,Arc Name,Stage ID,Stage Name,Abandonments\n';
  for (const point of summary.abandonmentPoints) {
    csv += `${point.arcId},${point.arcName},${point.stageId},${point.stageName},${point.abandonments}\n`;
  }

  return csv;
}

/**
 * Export raw scene events to CSV
 */
export function exportSceneEventsToCSV(): string {
  const events = getSceneEvents();

  let csv = 'Scene Events\n';
  csv += 'Timestamp,Scene ID,Scene Name,Scene Type,NPC ID,Event Type,Affinity,Trust,Chemistry,Tension\n';

  for (const event of events) {
    const metrics = event.playerMetrics;
    csv += `${event.timestamp.toISOString()},`;
    csv += `${event.sceneId},${event.sceneName},${event.sceneType},${event.npcId},${event.eventType},`;
    csv += `${metrics?.affinity || ''},${metrics?.trust || ''},${metrics?.chemistry || ''},${metrics?.tension || ''}\n`;
  }

  return csv;
}

/**
 * Export raw arc events to CSV
 */
export function exportArcEventsToCSV(): string {
  const events = getArcEvents();

  let csv = 'Arc Events\n';
  csv += 'Timestamp,Arc ID,Arc Name,Stage ID,Stage Name,NPC ID,Event Type,Affinity,Trust,Chemistry,Tension\n';

  for (const event of events) {
    const metrics = event.playerMetrics;
    csv += `${event.timestamp.toISOString()},`;
    csv += `${event.arcId},${event.arcName},${event.stageId},${event.stageName},${event.npcId},${event.eventType},`;
    csv += `${metrics?.affinity || ''},${metrics?.trust || ''},${metrics?.chemistry || ''},${metrics?.tension || ''}\n`;
  }

  return csv;
}

/**
 * Download CSV file
 */
export function downloadCSV(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Download scene analytics as CSV
 */
export function downloadSceneAnalyticsCSV(): void {
  const csv = exportSceneAnalyticsToCSV();
  downloadCSV(csv, `scene_analytics_${Date.now()}.csv`);
}

/**
 * Download arc analytics as CSV
 */
export function downloadArcAnalyticsCSV(): void {
  const csv = exportArcAnalyticsToCSV();
  downloadCSV(csv, `arc_analytics_${Date.now()}.csv`);
}

/**
 * Download scene events as CSV
 */
export function downloadSceneEventsCSV(): void {
  const csv = exportSceneEventsToCSV();
  downloadCSV(csv, `scene_events_${Date.now()}.csv`);
}

/**
 * Download arc events as CSV
 */
export function downloadArcEventsCSV(): void {
  const csv = exportArcEventsToCSV();
  downloadCSV(csv, `arc_events_${Date.now()}.csv`);
}
