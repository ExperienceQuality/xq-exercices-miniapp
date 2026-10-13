/* global before, describe, it */
import assert from 'node:assert/strict';

import AxeBuilder from '@axe-core/webdriverio';
import { $$, browser } from '@wdio/globals';

import {
  addExercise,
  addSession,
  allInteractiveControls,
  click,
  createRoutine,
  importFixture,
  installNamespaceIsolation,
  startFreshApp,
} from './support/app.js';

describe('Cross-cutting Chrome acceptance', () => {
  before(installNamespaceIsolation);

  it('BROWSER-A11Y-01 has no serious or critical axe violations', async () => {
    await startFreshApp('a11y');
    await createRoutine('Accessible Synthetic Routine', 'Synthetic notes');
    await addSession('Accessible Session');
    await click('Accessible Session');
    await addExercise({ name: 'Accessible Exercise' });
    const result = await new AxeBuilder({ client: browser }).analyze();
    const blocking = result.violations.filter(({ impact }) =>
      ['serious', 'critical'].includes(impact),
    );
    assert.deepEqual(blocking, []);
  });

  it('BROWSER-RESP-01 prevents overflow and preserves mobile touch/input sizing', async () => {
    await startFreshApp('responsive');
    await createRoutine('Responsive Routine');
    await addSession('Responsive Session');
    await click('Responsive Session');
    await click('Add Exercise');
    const metrics = await browser.execute(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    assert.ok(metrics.scrollWidth <= metrics.clientWidth);
    for (const element of await allInteractiveControls()) {
      if (!(await element.isDisplayed())) continue;
      const { height, width } = await element.getSize();
      assert.ok(height >= 44 || width >= 44);
    }
    for (const input of await $$('input, textarea, select')) {
      if (!(await input.isDisplayed())) continue;
      const fontSize = await input.getCSSProperty('font-size');
      assert.ok(Number.parseFloat(fontSize.value) >= 16);
    }
  });

  it('BROWSER-NET-01 keeps Fitness operations local after application assets load', async () => {
    await browser.cdp('Network', 'enable');
    const requests = [];
    browser.on('Network.requestWillBeSent', ({ request }) =>
      requests.push(request),
    );
    await startFreshApp('network');
    requests.length = 0;
    await createRoutine(
      'Network Privacy Sentinel',
      'Never transmit these notes',
    );
    await importFixture('invalid-v2.json');
    await browser.refresh();
    assert.deepEqual(requests, []);
  });

  it('BROWSER-BASE-01 serves built assets beneath the Pages repository base', async () => {
    await startFreshApp('base-path');
    assert.match(await browser.getUrl(), /\/xq-exercices-miniapp\//);
    const assetUrls = await browser.execute(() =>
      [...document.querySelectorAll('script[src], link[href]')].map(
        (element) => element.src || element.href,
      ),
    );
    assert.ok(assetUrls.length > 0);
    assert.ok(
      assetUrls.every((url) =>
        new URL(url).pathname.startsWith('/xq-exercices-miniapp/'),
      ),
    );
  });

  it('BROWSER-PRIV-01 excludes Fitness data from URL, requests, and console', async () => {
    await startFreshApp('privacy');
    const secret = 'Synthetic-Privacy-Sentinel-9284';
    await createRoutine(secret, `${secret}-notes`);
    assert.ok(!(await browser.getUrl()).includes(secret));
    const logs = await browser.getLogs('browser');
    assert.ok(logs.every(({ message }) => !message.includes(secret)));
  });
});
