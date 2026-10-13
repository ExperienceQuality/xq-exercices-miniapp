const baseUrl = 'http://127.0.0.1:4173/xq-exercices-miniapp/';
const chromeVersion = '155.0.8059.40';
const mobileUserAgent =
  'Mozilla/5.0 (Linux; Android 15; XQ Test Device) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';

function chromeCapability(name, windowSize, mobileEmulation) {
  const args = ['--headless=new', '--disable-gpu', '--no-sandbox'];
  if (windowSize) args.push(`--window-size=${windowSize}`);

  return {
    browserName: 'chrome',
    browserVersion: chromeVersion,
    'wdio:enforceWebDriverClassic': true,
    'goog:chromeOptions': {
      args,
      ...(mobileEmulation ? { mobileEmulation } : {}),
    },
    'xq:project': name,
  };
}

export const config = {
  runner: 'local',
  framework: 'mocha',
  reporters: ['spec'],
  specs: ['./tests/browser/**/*.spec.{js,ts}'],
  maxInstances: 1,
  baseUrl,
  waitforTimeout: 10_000,
  connectionRetryTimeout: 120_000,
  connectionRetryCount: 1,
  mochaOpts: { timeout: 60_000 },
  capabilities: [
    chromeCapability('chrome-desktop', '1440,900'),
    chromeCapability('chrome-mobile-390', undefined, {
      deviceMetrics: {
        width: 390,
        height: 844,
        pixelRatio: 3,
        touch: true,
        mobile: true,
      },
      userAgent: mobileUserAgent,
    }),
    chromeCapability('chrome-small-320', undefined, {
      deviceMetrics: {
        width: 320,
        height: 568,
        pixelRatio: 2,
        touch: true,
        mobile: true,
      },
      userAgent: mobileUserAgent,
    }),
  ],
};
