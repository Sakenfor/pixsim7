import { sessionHelperRegistry, type HelperDefinition } from './helperRegistry';

export function generateHelperDocs(): string {
  const helpers = sessionHelperRegistry.getAll();

  // Group by category
  const byCategory = helpers.reduce(
    (acc, h) => {
      const cat = h.category ?? 'uncategorized';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(h);
      return acc;
    },
    {} as Record<string, HelperDefinition[]>
  );

  let md = '# Session Helpers Reference\n\n';
  md += '_Auto-generated from session helper registry_\n\n';

  for (const [category, helpers] of Object.entries(byCategory)) {
    md += `## ${category}\n\n`;

    for (const helper of helpers) {
      md += `### ${helper.name}\n\n`;
      if (helper.description) {
        md += `${helper.description}\n\n`;
      }

      // Parameters
      if (helper.params) {
        md += '**Parameters:**\n\n';
        for (const param of helper.params) {
          md += `- \`${param.name}\`: \`${param.type}\``;
          if (param.description) {
            md += ` - ${param.description}`;
          }
          md += '\n';
        }
        md += '\n';
      }

      // Returns
      if (helper.returns) {
        md += `**Returns:** \`${helper.returns}\`\n\n`;
      }

      md += '---\n\n';
    }
  }

  return md;
}

/**
 * Run this to generate docs:
 *
 * import { generateHelperDocs } from '@pixsim7/game.engine';
 * import fs from 'fs';
 *
 * const docs = generateHelperDocs();
 * fs.writeFileSync('HELPER_REFERENCE.md', docs);
 */
