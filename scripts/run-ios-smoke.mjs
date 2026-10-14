import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code ?? signal}`));
    });
  });
}

function capture(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    let stdout = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0
        ? resolve(stdout.trim())
        : reject(new Error(`${command} exited with ${code}`)),
    );
  });
}

const runtimes = JSON.parse(
  await capture('xcrun', ['simctl', 'list', 'runtimes', '--json']),
).runtimes;
const pinnedRuntimeVersion = '18.2';
const pinnedDeviceType = 'iPhone 16';
const runtime =
  runtimes.find(
    (item) =>
      item.isAvailable &&
      item.platform === 'iOS' &&
      item.version === pinnedRuntimeVersion,
  ) ??
  runtimes
    .filter((item) => item.isAvailable && item.platform === 'iOS')
    .sort((left, right) =>
      right.version.localeCompare(left.version, undefined, { numeric: true }),
    )[0];

if (!runtime)
  throw new Error(
    `No available iOS Simulator runtime was found (preferred ${pinnedRuntimeVersion}).`,
  );
if (runtime.version !== pinnedRuntimeVersion)
  console.warn(
    `Preferred iOS ${pinnedRuntimeVersion} runtime unavailable; using iOS ${runtime.version}.`,
  );

const deviceTypes = JSON.parse(
  await capture('xcrun', ['simctl', 'list', 'devicetypes', '--json']),
).devicetypes;
const deviceType = deviceTypes.find((item) => item.name === pinnedDeviceType);
if (!deviceType)
  throw new Error(
    `The pinned ${pinnedDeviceType} Simulator device type is unavailable.`,
  );

const name = `XQ-Fitness-Smoke-${process.pid}-${randomUUID().slice(0, 8)}`;
const udid = await capture('xcrun', [
  'simctl',
  'create',
  name,
  deviceType.identifier,
  runtime.identifier,
]);
const appiumHome = path.join(process.cwd(), '.appium', udid);

try {
  await run('xcrun', ['simctl', 'boot', udid]);
  await run('xcrun', ['simctl', 'bootstatus', udid, '-b']);
  await run(
    path.join(process.cwd(), 'node_modules', '.bin', 'appium'),
    [
      'driver',
      'install',
      '--source=local',
      path.join(process.cwd(), 'node_modules', 'appium-xcuitest-driver'),
    ],
    { env: { ...process.env, APPIUM_HOME: appiumHome } },
  );
  await run(
    path.join(process.cwd(), 'node_modules', '.bin', 'wdio'),
    ['run', './wdio.ios-smoke.conf.mjs'],
    {
      env: {
        ...process.env,
        APPIUM_HOME: appiumHome,
        XQ_IOS_PLATFORM_VERSION: runtime.version,
        XQ_IOS_SIMULATOR_UDID: udid,
      },
    },
  );
} finally {
  await run('xcrun', ['simctl', 'shutdown', udid]).catch(() => undefined);
  await run('xcrun', ['simctl', 'delete', udid]).catch(() => undefined);
}
