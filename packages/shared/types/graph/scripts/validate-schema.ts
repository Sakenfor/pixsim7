#!/usr/bin/env tsx
/**
 * Validates graph.schema.json itself and any test graphs
 */

import Ajv from 'ajv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, '../schema/graph.schema.json');

function validateSchema() {
  console.log('Validating graph.schema.json...');

  const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
  const schema = JSON.parse(schemaContent);

  // Validate that it's a valid JSON Schema
  const ajv = new Ajv({ strict: true, allErrors: true });

  try {
    ajv.addSchema(schema);
    console.log('✓ Schema is structurally valid');
  } catch (error) {
    console.error('✗ Schema validation failed:', error);
    process.exit(1);
  }

  // Validate test graphs if they exist
  const examplesDir = path.join(__dirname, '../examples');
  if (fs.existsSync(examplesDir)) {
    console.log('\nValidating example graphs...');
    const validator = ajv.compile(schema);

    const examples = fs.readdirSync(examplesDir).filter(f => f.endsWith('.json'));
    let passed = 0;
    let failed = 0;

    for (const file of examples) {
      const graphPath = path.join(examplesDir, file);
      const graphContent = fs.readFileSync(graphPath, 'utf-8');
      const graph = JSON.parse(graphContent);

      const valid = validator(graph);
      if (valid) {
        console.log(`  ✓ ${file}`);
        passed++;
      } else {
        console.error(`  ✗ ${file}`);
        console.error('    Errors:', validator.errors);
        failed++;
      }
    }

    console.log(`\n${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
  }

  console.log('\nAll validations passed!');
}

validateSchema();
