import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const enforce = process.argv.includes('--enforce');
const expected = Array.from(
  { length: 111 },
  (_, index) => `FIT-${String(index + 1).padStart(3, '0')}`,
);
const discovered = new Map(expected.map((id) => [id, []]));

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
    else if (/\.(?:js|ts|svelte)$/.test(entry.name)) {
      const source = await readFile(entryPath, 'utf8');
      for (const id of source.match(/FIT-\d{3}/g) ?? []) {
        if (discovered.has(id)) discovered.get(id).push(entryPath);
      }
    }
  }
}

await visit('src');
await visit('tests');

const report = {
  generatedAt: new Date().toISOString(),
  criteria: Object.fromEntries(
    [...discovered].map(([id, files]) => [
      id,
      { discovered: files.length > 0, files: [...new Set(files)] },
    ]),
  ),
};
await mkdir('reports', { recursive: true });
await writeFile(
  'reports/fit-traceability.json',
  `${JSON.stringify(report, null, 2)}\n`,
);

const missing = [...discovered]
  .filter(([, files]) => files.length === 0)
  .map(([id]) => id);
console.log(
  `FIT traceability: ${expected.length - missing.length}/${expected.length} criteria discovered.`,
);
if (enforce && missing.length > 0) {
  console.error(`Missing automated scenario references: ${missing.join(', ')}`);
  process.exitCode = 1;
}
