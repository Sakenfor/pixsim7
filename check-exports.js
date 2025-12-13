#!/usr/bin/env node
/**
 * Export Validation Script
 *
 * Checks if all exports referenced in barrel files (index.ts) actually exist
 * in the source files they're importing from.
 */

const fs = require('fs');
const path = require('path');

const FEATURES_DIR = path.join(__dirname, 'apps/main/src/features');
const LIB_DIR = path.join(__dirname, 'apps/main/src/lib');

// Parse import/export statements from an index file
function parseIndexExports(content) {
  const exports = [];

  // Match: export { name1, name2 } from './path'
  const namedExportRegex = /export\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g;
  let match;

  while ((match = namedExportRegex.exec(content)) !== null) {
    const names = match[1]
      .split(',')
      .map(n => n.trim())
      .map(n => {
        // Handle "type Name" exports
        const typeMatch = n.match(/^type\s+(\w+)/);
        if (typeMatch) return { name: typeMatch[1], isType: true };

        // Handle "Name as Alias"
        const aliasMatch = n.match(/^(\w+)\s+as\s+(\w+)/);
        if (aliasMatch) return { name: aliasMatch[1], alias: aliasMatch[2] };

        // Handle "default as Name"
        const defaultMatch = n.match(/^default\s+as\s+(\w+)/);
        if (defaultMatch) return { name: 'default', alias: defaultMatch[1] };

        return { name: n };
      })
      .filter(n => n.name);

    const sourcePath = match[2];
    exports.push({ names, sourcePath });
  }

  return exports;
}

// Parse exports from a source file
function parseSourceExports(content) {
  const exports = new Set();

  // Match various export patterns
  const patterns = [
    /export\s+(?:const|let|var|function|class|interface|type|enum)\s+(\w+)/g,
    /export\s+\{([^}]+)\}/g,
    /export\s+default\s+(?:function|class)?\s*(\w+)?/g,
  ];

  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      if (match[1]) {
        // For export { a, b, c }
        if (match[0].includes('{')) {
          match[1].split(',').forEach(name => {
            const cleaned = name.trim().replace(/^type\s+/, '');
            exports.add(cleaned);
          });
        } else {
          exports.add(match[1]);
        }
      } else if (match[0].includes('default')) {
        exports.add('default');
      }
    }
  });

  return exports;
}

// Resolve relative path to absolute
function resolveSourcePath(indexDir, sourcePath) {
  // Remove .ts/.tsx extension for checking
  const cleanPath = sourcePath.replace(/\.(ts|tsx)$/, '');

  // Try with different extensions
  const possiblePaths = [
    path.join(indexDir, `${cleanPath}.ts`),
    path.join(indexDir, `${cleanPath}.tsx`),
    path.join(indexDir, cleanPath, 'index.ts'),
    path.join(indexDir, cleanPath, 'index.tsx'),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  return null;
}

// Check a single index file
function checkIndexFile(indexPath) {
  const content = fs.readFileSync(indexPath, 'utf-8');
  const indexDir = path.dirname(indexPath);
  const exports = parseIndexExports(content);
  const errors = [];

  exports.forEach(({ names, sourcePath }) => {
    const sourceFilePath = resolveSourcePath(indexDir, sourcePath);

    if (!sourceFilePath) {
      errors.push({
        indexPath,
        sourcePath,
        error: `Source file not found: ${sourcePath}`,
      });
      return;
    }

    const sourceContent = fs.readFileSync(sourceFilePath, 'utf-8');
    const sourceExports = parseSourceExports(sourceContent);

    names.forEach(({ name, alias, isType }) => {
      if (!sourceExports.has(name)) {
        errors.push({
          indexPath,
          sourcePath,
          exportName: alias || name,
          actualName: name,
          isType,
          error: `Export "${name}" not found in ${path.basename(sourceFilePath)}`,
        });
      }
    });
  });

  return errors;
}

// Find all index.ts files
function findIndexFiles(dir) {
  const indexFiles = [];

  function walk(currentDir) {
    if (!fs.existsSync(currentDir)) return;

    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    entries.forEach(entry => {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        walk(fullPath);
      } else if (entry.name === 'index.ts' || entry.name === 'index.tsx') {
        indexFiles.push(fullPath);
      }
    });
  }

  walk(dir);
  return indexFiles;
}

// Main
console.log('🔍 Checking export consistency...\n');

const indexFiles = [
  ...findIndexFiles(FEATURES_DIR),
  ...findIndexFiles(LIB_DIR),
];

let totalErrors = 0;
const errorsByFile = {};

indexFiles.forEach(indexPath => {
  const errors = checkIndexFile(indexPath);
  if (errors.length > 0) {
    totalErrors += errors.length;
    errorsByFile[indexPath] = errors;
  }
});

if (totalErrors === 0) {
  console.log('✅ All exports are valid!');
} else {
  console.log(`❌ Found ${totalErrors} export mismatches:\n`);

  Object.entries(errorsByFile).forEach(([indexPath, errors]) => {
    const relativePath = path.relative(process.cwd(), indexPath);
    console.log(`📄 ${relativePath}`);
    errors.forEach(err => {
      if (err.exportName) {
        console.log(`   ❌ ${err.error}`);
      } else {
        console.log(`   ⚠️  ${err.error}`);
      }
    });
    console.log('');
  });

  process.exit(1);
}
