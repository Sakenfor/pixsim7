/**
 * Content Source Definitions
 *
 * Registers all known content sources with the content source registry.
 * Each source defines how to fetch its summary from existing API endpoints.
 */

import { pixsimClient } from '@lib/api';
import {
  getContentPackInventory,
  listContentPackManifests,
  listBlockPackages,
} from '@lib/api/blockTemplates';
import { getPlugins } from '@lib/api/plugins';

import {
  registerContentSource,
  type ContentSourceSummary,
} from './contentSourceRegistry';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function okSummary(
  total: number,
  breakdown: Record<string, number>,
): ContentSourceSummary {
  return { totalEntities: total, breakdown, status: 'healthy' };
}

function errorSummary(err: unknown): ContentSourceSummary {
  return {
    totalEntities: 0,
    breakdown: {},
    status: 'error',
    statusDetail: err instanceof Error ? err.message : String(err),
  };
}

// ---------------------------------------------------------------------------
// Content Pack sources (prompt blocks)
// ---------------------------------------------------------------------------

registerContentSource({
  id: 'prompt-content-packs',
  label: 'Prompt Content Packs',
  description: 'Block schemas, templates, and characters loaded from YAML packs',
  icon: 'package',
  category: 'content-pack',
  entityTypes: ['blocks', 'templates', 'characters'],
  diskPath: 'content_packs/prompt/',
  apiEndpoint: '/block-templates/meta/content-packs/inventory',
  drillDownPanelId: 'prompt-library-inspector',
  tags: ['blocks', 'templates', 'characters', 'yaml'],
  async fetchSummary() {
    try {
      const inv = await getContentPackInventory();
      const breakdown: Record<string, number> = {
        packs: inv.summary.total_packs,
        blocks: 0,
        templates: 0,
        characters: 0,
      };
      for (const pack of Object.values(inv.packs)) {
        breakdown.blocks += pack.blocks;
        breakdown.templates += pack.templates;
        breakdown.characters += pack.characters;
      }
      const total = breakdown.blocks + breakdown.templates + breakdown.characters;
      const status = inv.summary.orphaned_packs > 0 ? 'degraded' as const : 'healthy' as const;
      return {
        totalEntities: total,
        breakdown,
        status,
        statusDetail: inv.summary.orphaned_packs > 0
          ? `${inv.summary.orphaned_packs} orphaned pack(s)`
          : undefined,
      };
    } catch (err) {
      return errorSummary(err);
    }
  },
});

// ---------------------------------------------------------------------------
// Content Pack Manifests (matrix presets)
// ---------------------------------------------------------------------------

registerContentSource({
  id: 'content-pack-manifests',
  label: 'Pack Manifests',
  description: 'Matrix query presets defined in content pack manifest.yaml files',
  icon: 'fileCode',
  category: 'content-pack',
  entityTypes: ['matrix-presets'],
  diskPath: 'content_packs/*/manifest.yaml',
  apiEndpoint: '/block-templates/meta/content-packs/manifests',
  drillDownPanelId: 'block-matrix',
  tags: ['manifests', 'matrix', 'presets'],
  async fetchSummary() {
    try {
      const manifests = await listContentPackManifests();
      const presetCount = manifests.reduce(
        (sum, m) => sum + (m.matrix_presets?.length ?? 0),
        0,
      );
      return okSummary(manifests.length, {
        manifests: manifests.length,
        'matrix presets': presetCount,
      });
    } catch (err) {
      return errorSummary(err);
    }
  },
});

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

registerContentSource({
  id: 'block-primitives',
  label: 'Block Primitives',
  description: 'Scene foundation, genre, and style primitives from the blocks DB',
  icon: 'layers',
  category: 'primitives',
  entityTypes: ['primitives'],
  diskPath: 'content_packs/primitives/',
  apiEndpoint: '/block-templates/blocks?source=primitives',
  drillDownPanelId: 'block-explorer',
  tags: ['primitives', 'scene', 'camera', 'light', 'environment'],
  async fetchSummary() {
    try {
      // Use block packages to count primitives — primitive packs show up as packages
      const packages = await listBlockPackages();
      // Primitive packs live under content_packs/primitives/ — we can identify them
      // by convention (they appear in the packages list but not in prompt pack inventory)
      const inv = await getContentPackInventory();
      const promptPackNames = new Set(Object.keys(inv.packs));
      const primitivePacks = packages.filter((p) => !promptPackNames.has(p));
      return okSummary(primitivePacks.length, {
        packs: primitivePacks.length,
      });
    } catch (err) {
      return errorSummary(err);
    }
  },
});

// ---------------------------------------------------------------------------
// Style Foundation
// ---------------------------------------------------------------------------

registerContentSource({
  id: 'style-foundation',
  label: 'Style Foundation',
  description: 'Rendering technique, form language, and aesthetic preset primitives',
  icon: 'palette',
  category: 'style',
  entityTypes: ['primitives'],
  diskPath: 'content_packs/primitives/style_foundation/',
  drillDownPanelId: 'block-explorer',
  tags: ['style', 'rendering', 'aesthetic', 'form-language'],
  async fetchSummary() {
    try {
      // Style foundation is a specific primitive pack
      const packages = await listBlockPackages();
      const hasStyle = packages.includes('style_foundation');
      return okSummary(hasStyle ? 1 : 0, {
        packs: hasStyle ? 1 : 0,
        categories: 3, // rendering_technique, form_language, aesthetic_preset
      });
    } catch (err) {
      return errorSummary(err);
    }
  },
});

// ---------------------------------------------------------------------------
// Vocabularies
// ---------------------------------------------------------------------------

registerContentSource({
  id: 'plugin-vocabularies',
  label: 'Plugin Vocabularies',
  description: 'Tag definitions, role vocabularies, and ontology YAML files from plugins',
  icon: 'library',
  category: 'vocabulary',
  entityTypes: ['vocabularies', 'tags'],
  diskPath: 'plugins/*/vocabularies/',
  drillDownPanelId: 'composition-roles',
  tags: ['tags', 'roles', 'ontology', 'vocabulary', 'yaml'],
  async fetchSummary() {
    try {
      // Use architecture graph to count vocabulary-bearing plugins
      const plugins = await getPlugins();
      // Vocabulary plugins typically have family "vocabulary" or provide tag definitions
      // Count all plugins that might have vocabularies
      const vocabPlugins = plugins.filter(
        (p) => p.tags?.some((t: string) => t.includes('vocab') || t.includes('role') || t.includes('ontology')),
      );
      return okSummary(vocabPlugins.length || plugins.length, {
        plugins: vocabPlugins.length || plugins.length,
      });
    } catch (err) {
      return errorSummary(err);
    }
  },
});

// ---------------------------------------------------------------------------
// Backend Plugins
// ---------------------------------------------------------------------------

registerContentSource({
  id: 'backend-plugins',
  label: 'Backend Plugins',
  description: 'Plugin manifests providing API routes, behaviors, stats, and content',
  icon: 'plug',
  category: 'plugin',
  entityTypes: ['plugins'],
  diskPath: 'plugins/',
  apiEndpoint: '/plugins/list',
  tags: ['plugins', 'manifests', 'api', 'features'],
  async fetchSummary() {
    try {
      const plugins = await getPlugins();
      const byFamily: Record<string, number> = {};
      for (const p of plugins) {
        const fam = p.family ?? 'unknown';
        byFamily[fam] = (byFamily[fam] ?? 0) + 1;
      }
      return okSummary(plugins.length, byFamily);
    } catch (err) {
      return errorSummary(err);
    }
  },
});

// ---------------------------------------------------------------------------
// Template Registry
// ---------------------------------------------------------------------------

registerContentSource({
  id: 'template-registry',
  label: 'Game Template Registry',
  description: 'Registered template types for scenes, locations, items, NPCs, and more',
  icon: 'fileCode',
  category: 'template-registry',
  entityTypes: ['template-types'],
  apiEndpoint: '/game/templates/registry',
  drillDownPanelId: 'template-library',
  tags: ['templates', 'scenes', 'locations', 'items', 'npcs', 'game'],
  async fetchSummary() {
    try {
      const data = await pixsimClient.get<{ template_types: { type_name: string }[] }>(
        '/game/templates/registry',
      );
      return okSummary(data.template_types.length, {
        'template types': data.template_types.length,
      });
    } catch (err) {
      return errorSummary(err);
    }
  },
});
