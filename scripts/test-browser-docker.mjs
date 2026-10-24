/**
 * Runs the Playwright browser suite inside the same environment CI uses:
 * the official Playwright `noble` (Ubuntu 24.04) image matching the
 * @playwright/test version pinned in package.json, with CI=true so the
 * webServer is always started fresh (never reused).
 *
 * This is the canonical environment for the browser lane. Font metrics and
 * rendering performance differ between macOS and Linux, so layout- and
 * timing-sensitive assertions can pass natively on a Mac yet fail in CI.
 * Always verify browser changes with this script before pushing.
 *
 * node_modules is shadowed by a tmpfs mount so the container installs and
 * uses Linux binaries without touching the host's install.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const playwrightVersion =
  pkg.devDependencies?.['@playwright/test'] ??
  pkg.dependencies?.['@playwright/test'];
if (!playwrightVersion) {
  console.error(
    'Could not read the @playwright/test version from package.json.',
  );
  process.exit(1);
}

// noble = Ubuntu 24.04, the same base as the ubuntu-24.04 CI runner.
const image = `mcr.microsoft.com/playwright:v${playwrightVersion}-noble`;

const run = (args) => {
  const result = spawnSync(args[0], args.slice(1), {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

if (spawnSync('docker', ['info'], { stdio: 'ignore' }).status !== 0) {
  console.error(
    'Docker is required for the canonical browser environment. ' +
      'Start Docker and retry, or fall back to `npx playwright test` ' +
      '(native — results may differ from CI).',
  );
  process.exit(1);
}

run(['docker', 'pull', image]);

// Extra CLI args pass through to `playwright test` (e.g. --grep, --project).
const passthrough = process.argv
  .slice(2)
  .map((arg) => `'${arg.replaceAll("'", `'\\''`)}'`);

const userArgs =
  typeof process.getuid === 'function'
    ? ['-u', `${process.getuid()}:${process.getgid()}`]
    : [];

run([
  'docker',
  'run',
  '--rm',
  '--ipc=host',
  ...userArgs,
  '-e',
  'CI=true',
  '-e',
  'HOME=/tmp',
  '-e',
  'npm_config_cache=/tmp/.npm',
  '-v',
  `${root}:/work`,
  '--tmpfs',
  '/work/node_modules:rw,exec',
  '-w',
  '/work',
  image,
  'bash',
  '-c',
  `npm ci --no-audit --no-fund && npm run build && npx playwright test ${passthrough.join(' ')}`,
]);
