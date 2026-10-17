import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const roots = ['src', 'tests'];
const testFilePattern = /(?:\.test\.|\.spec\.)/;
const focusedPattern = /\b(?:describe|it|test)\.only\s*\(/;
const findings = [];

async function visit(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) await visit(entryPath);
    else if (testFilePattern.test(entry.name)) {
      const source = await readFile(entryPath, 'utf8');
      if (focusedPattern.test(source)) findings.push(entryPath);
    }
  }
}

for (const root of roots) await visit(root);

if (findings.length > 0) {
  console.error(`Focused tests are forbidden:\n${findings.join('\n')}`);
  process.exitCode = 1;
} else {
  console.log('No committed focused tests found.');
}
