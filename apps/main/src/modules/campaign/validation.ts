import type { Campaign } from './types';
import type { ValidationIssue } from '../validation/types';

/**
 * Validate campaign structure
 */
export function validateCampaign(
  campaign: Campaign,
  arcGraphIds: Set<string>,
  options?: {
    allCampaigns?: Campaign[];
  }
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Check for missing arc graph references
  for (const arc of campaign.arcs) {
    if (!arcGraphIds.has(arc.arcGraphId)) {
      issues.push({
        type: 'broken-arc-reference',
        severity: 'error',
        message: `Campaign "${campaign.title}" references non-existent arc graph: ${arc.arcGraphId}`,
        details: `Arc at order ${arc.order}`,
      });
    }
  }

  // Check for duplicate arc references
  const seenArcs = new Set<string>();
  for (const arc of campaign.arcs) {
    if (seenArcs.has(arc.arcGraphId)) {
      issues.push({
        type: 'invalid-requirements',
        severity: 'warning',
        message: `Campaign "${campaign.title}" contains duplicate arc graph: ${arc.arcGraphId}`,
      });
    }
    seenArcs.add(arc.arcGraphId);
  }

  // Check for circular prerequisite dependencies
  if (options?.allCampaigns && campaign.metadata.prerequisite_campaigns) {
    const visited = new Set<string>([campaign.id]);
    const checkCircular = (prereqIds: string[]) => {
      for (const prereqId of prereqIds) {
        if (visited.has(prereqId)) {
          issues.push({
            type: 'cycle',
            severity: 'error',
            message: `Circular prerequisite dependency detected in campaign "${campaign.title}"`,
            details: `Campaign ${prereqId} creates a cycle`,
          });
          return;
        }
        visited.add(prereqId);
        const prereqCampaign = options.allCampaigns!.find(c => c.id === prereqId);
        if (prereqCampaign?.metadata.prerequisite_campaigns) {
          checkCircular(prereqCampaign.metadata.prerequisite_campaigns);
        }
      }
    };
    checkCircular(campaign.metadata.prerequisite_campaigns);
  }

  // Warn if campaign is empty
  if (campaign.arcs.length === 0) {
    issues.push({
      type: 'no-nodes',
      severity: 'warning',
      message: `Campaign "${campaign.title}" contains no arc graphs`,
    });
  }

  return issues;
}
