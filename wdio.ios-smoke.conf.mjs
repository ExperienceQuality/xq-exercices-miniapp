const udid = process.env.XQ_IOS_SIMULATOR_UDID;
const platformVersion = process.env.XQ_IOS_PLATFORM_VERSION;

if (!udid || !platformVersion) {
  throw new Error(
    'The owned iOS Simulator UDID and platform version are required.',
  );
}

export const config = {
  runner: 'local',
  framework: 'mocha',
  reporters: ['spec'],
  specs: ['./tests/ios-smoke/**/*.spec.{js,ts}'],
  maxInstances: 1,
  hostname: '127.0.0.1',
  port: 4723,
  path: '/',
  baseUrl: 'http://127.0.0.1:4173/xq-exercices-miniapp/',
  waitforTimeout: 15_000,
  connectionRetryTimeout: 180_000,
  connectionRetryCount: 0,
  mochaOpts: { timeout: 120_000 },
  services: [
    [
      'appium',
      {
        args: { address: '127.0.0.1', port: 4723, basePath: '/' },
        logPath: './reports/ios-smoke',
      },
    ],
  ],
  capabilities: [
    {
      platformName: 'iOS',
      browserName: 'Safari',
      'appium:automationName': 'XCUITest',
      'appium:udid': udid,
      'appium:platformVersion': platformVersion,
      'appium:noReset': false,
      'appium:newCommandTimeout': 120,
      'xq:project': 'ios-simulator-smoke',
    },
  ],
};
