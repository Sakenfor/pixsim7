#!/usr/bin/env node

/**
 * PixSim7 Plugin Generator CLI
 *
 * Creates a new plugin with boilerplate code based on the plugin type.
 *
 * Usage:
 *   npx create-pixsim-plugin [options]
 *   node scripts/create-plugin/index.js [options]
 *
 * Options:
 *   --type <type>       Plugin type (node, interaction, renderer, helper)
 *   --name <name>       Plugin name (kebab-case)
 *   --output <dir>      Output directory (default: ./plugins)
 *   --no-interactive    Skip interactive prompts (requires --type and --name)
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// ===== Utility Functions =====

/**
 * Convert string to PascalCase
 */
function toPascalCase(str) {
  return str
    .split(/[-_\s]+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

/**
 * Convert string to camelCase
 */
function toCamelCase(str) {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

/**
 * Convert string to kebab-case
 */
function toKebabCase(str) {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
}

/**
 * Prompt user for input
 */
function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Prompt user with choices
 */
async function promptChoice(question, choices) {
  console.log(question);
  choices.forEach((choice, i) => {
    console.log(`  ${i + 1}. ${choice}`);
  });

  const answer = await prompt('Enter choice (1-' + choices.length + '): ');
  const index = parseInt(answer, 10) - 1;

  if (index >= 0 && index < choices.length) {
    return choices[index];
  }

  console.log('Invalid choice, please try again.');
  return promptChoice(question, choices);
}

/**
 * Replace template variables in content
 */
function replaceTemplateVars(content, vars) {
  let result = content;

  for (const [key, value] of Object.entries(vars)) {
    const regex = new RegExp(`{{${key}}}`, 'g');
    result = result.replace(regex, value);
  }

  // Handle conditional sections
  result = result.replace(/{{#if_(\w+)}}([\s\S]*?){{\/if_\1}}/g, (match, condition, content) => {
    if (vars[`IF_${condition.toUpperCase()}`]) {
      return content;
    }
    return '';
  });

  return result;
}

/**
 * Create directory if it doesn't exist
 */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Get template file path
 */
function getTemplatePath(type) {
  const templateMap = {
    interaction: 'interaction.template.ts',
    node: 'node.template.ts',
    renderer: 'renderer.template.tsx',
    helper: 'helper.template.ts',
  };

  const filename = templateMap[type];
  if (!filename) {
    throw new Error(`Unknown plugin type: ${type}`);
  }

  return path.join(__dirname, 'templates', filename);
}

/**
 * Get output file extension
 */
function getFileExtension(type) {
  return type === 'renderer' ? '.tsx' : '.ts';
}

/**
 * Generate plugin files
 */
function generatePlugin(type, name, outputDir, description = '') {
  const pluginId = toKebabCase(name);
  const pluginName = toPascalCase(name);
  const pluginNameCamel = toCamelCase(name);
  const pluginDisplayName = pluginName.replace(/([A-Z])/g, ' $1').trim();

  // Template variables
  const vars = {
    PLUGIN_ID: pluginId,
    PLUGIN_NAME: name,
    PLUGIN_NAME_PASCAL: pluginName,
    PLUGIN_NAME_CAMEL: pluginNameCamel,
    PLUGIN_DISPLAY_NAME: pluginDisplayName,
    PLUGIN_DESCRIPTION: description || `Custom ${type} plugin`,
    PLUGIN_TYPE: type,
    IF_INTERACTION: type === 'interaction',
    IF_NODE: type === 'node',
    IF_RENDERER: type === 'renderer',
    IF_HELPER: type === 'helper',
  };

  // Create output directory
  const pluginDir = path.join(outputDir, pluginId);
  ensureDir(pluginDir);

  // Read and process template
  const templatePath = getTemplatePath(type);
  const templateContent = fs.readFileSync(templatePath, 'utf8');
  const processedContent = replaceTemplateVars(templateContent, vars);

  // Write plugin file
  const ext = getFileExtension(type);
  const outputPath = path.join(pluginDir, `${pluginId}${ext}`);
  fs.writeFileSync(outputPath, processedContent);

  // Generate README
  const readmeTemplatePath = path.join(__dirname, 'templates', 'README.template.md');
  const readmeContent = fs.readFileSync(readmeTemplatePath, 'utf8');
  const processedReadme = replaceTemplateVars(readmeContent, vars);
  const readmePath = path.join(pluginDir, 'README.md');
  fs.writeFileSync(readmePath, processedReadme);

  // Generate example config file
  const configExample = generateConfigExample(type, vars);
  const configPath = path.join(pluginDir, 'example-config.json');
  fs.writeFileSync(configPath, configExample);

  return {
    pluginDir,
    mainFile: outputPath,
    readmeFile: readmePath,
    configFile: configPath,
  };
}

/**
 * Generate example config JSON
 */
function generateConfigExample(type, vars) {
  const configs = {
    interaction: {
      enabled: true,
      // Add custom config fields here
    },
    node: {
      nodeType: vars.PLUGIN_ID,
      // Add custom node data here
    },
    renderer: {
      nodeType: vars.PLUGIN_ID,
      customHeader: false,
    },
    helper: {
      // Helper-specific config
    },
  };

  return JSON.stringify(configs[type] || {}, null, 2);
}

/**
 * Display success message with next steps
 */
function displaySuccessMessage(type, files) {
  console.log('\n✅ Plugin created successfully!\n');
  console.log('📁 Files created:');
  console.log(`   - ${files.mainFile}`);
  console.log(`   - ${files.readmeFile}`);
  console.log(`   - ${files.configFile}`);
  console.log('\n📝 Next steps:\n');

  const registryMap = {
    interaction: 'interactionRegistry',
    node: 'nodeTypeRegistry',
    renderer: 'nodeRendererRegistry',
    helper: 'SessionHelpers',
  };

  console.log('1. Implement your plugin logic in the generated file');
  console.log('2. Register your plugin:\n');

  if (type === 'helper') {
    console.log('   import { MyHelper } from \'./plugins/my-plugin\';');
    console.log('   // Use MyHelper methods in your code\n');
  } else {
    const pluginNameCamel = toCamelCase(path.basename(files.pluginDir));
    const pluginNamePascal = toPascalCase(path.basename(files.pluginDir));
    const ext = type === 'renderer' ? 'tsx' : 'ts';

    console.log(`   import { ${pluginNameCamel}${type === 'node' ? 'NodeType' : type === 'renderer' ? 'Renderer' : 'Plugin'} } from './plugins/${path.basename(files.pluginDir)}/${path.basename(files.pluginDir)}.${ext}';`);
    console.log(`   import { ${registryMap[type]} } from '@pixsim7/types';`);
    console.log(`   ${registryMap[type]}.register(${pluginNameCamel}${type === 'node' ? 'NodeType' : type === 'renderer' ? 'Renderer' : 'Plugin'});\n`);
  }

  console.log('3. Test your plugin');
  console.log('4. Update the README with usage examples\n');

  console.log('📚 Documentation:');
  console.log('   See README.md in the plugin directory for more details\n');
}

// ===== CLI Logic =====

async function main() {
  console.log('🔌 PixSim7 Plugin Generator\n');

  // Parse command-line arguments
  const args = process.argv.slice(2);
  const getArg = (flag) => {
    const index = args.indexOf(flag);
    return index !== -1 && args[index + 1] ? args[index + 1] : null;
  };

  const hasFlag = (flag) => args.includes(flag);
  const interactive = !hasFlag('--no-interactive');

  let type = getArg('--type');
  let name = getArg('--name');
  let outputDir = getArg('--output') || './plugins';
  let description = getArg('--description') || '';

  // Interactive mode
  if (interactive) {
    if (!type) {
      type = await promptChoice(
        'What type of plugin do you want to create?',
        ['interaction', 'node', 'renderer', 'helper']
      );
    }

    if (!name) {
      name = await prompt('Plugin name (kebab-case): ');
    }

    if (!description) {
      description = await prompt('Short description (optional): ');
    }

    const customOutput = await prompt(`Output directory (default: ${outputDir}): `);
    if (customOutput) {
      outputDir = customOutput;
    }
  }

  // Validate inputs
  if (!type || !name) {
    console.error('❌ Error: --type and --name are required\n');
    console.log('Usage:');
    console.log('  npx create-pixsim-plugin --type <type> --name <name> [options]\n');
    console.log('Options:');
    console.log('  --type <type>       Plugin type (node, interaction, renderer, helper)');
    console.log('  --name <name>       Plugin name (kebab-case)');
    console.log('  --output <dir>      Output directory (default: ./plugins)');
    console.log('  --description <desc> Plugin description');
    console.log('  --no-interactive    Skip interactive prompts\n');
    process.exit(1);
  }

  const validTypes = ['interaction', 'node', 'renderer', 'helper'];
  if (!validTypes.includes(type)) {
    console.error(`❌ Error: Invalid plugin type "${type}"`);
    console.error(`   Valid types: ${validTypes.join(', ')}\n`);
    process.exit(1);
  }

  // Generate plugin
  try {
    const files = generatePlugin(type, name, outputDir, description);
    displaySuccessMessage(type, files);
  } catch (error) {
    console.error('❌ Error generating plugin:', error.message);
    process.exit(1);
  }
}

// Run CLI
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  });
}

module.exports = { generatePlugin, toPascalCase, toCamelCase, toKebabCase };
