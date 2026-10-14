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

async function executeChromeCdp(domain, command, params = {}) {
  const hostname = this.options.hostname ?? '127.0.0.1';
  const port = this.options.port;
  const path = this.options.path ?? '/';

  if (!port || !this.sessionId) {
    throw new Error('ChromeDriver session details are unavailable.');
  }

  const endpoint = new URL(
    `session/${this.sessionId}/goog/cdp/execute`,
    `http://${hostname}:${port}${path}`,
  );
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ cmd: `${domain}.${command}`, params }),
  });
  const payload = await response.json();

  if (!response.ok || payload.value?.error) {
    throw new Error(
      payload.value?.message ??
        `ChromeDriver CDP command failed with HTTP ${response.status}.`,
    );
  }

  return payload.value;
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
  before: (_capabilities, _specs, browser) => {
    browser.addCommand('cdp', executeChromeCdp);
  },
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
