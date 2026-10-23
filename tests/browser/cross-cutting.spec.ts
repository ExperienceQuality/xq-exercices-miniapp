import AxeBuilder from '@axe-core/playwright';

import { expect, test } from './support/app.js';

test.describe('Cross-cutting Chrome acceptance', () => {
  test('BROWSER-A11Y-01 has no serious or critical axe violations', async ({
    app,
  }) => {
    await app.startFreshApp('a11y');
    await app.createRoutine('Accessible Synthetic Routine', 'Synthetic notes');
    await expect(
      app.page.getByRole('heading', {
        name: 'Accessible Synthetic Routine',
      }),
    ).toBeFocused();
    await app.click('Back');
    await expect(
      app.page.getByRole('heading', { name: 'Routines' }),
    ).toBeFocused();
    await app.click('Accessible Synthetic Routine');
    await app.addSession('Accessible Session');
    await app.openSession('Accessible Session');
    await expect(
      app.page.getByRole('heading', { name: 'Accessible Session' }),
    ).toBeFocused();
    await app.addExercise({ name: 'Accessible Exercise' });
    await expect(
      app.page.getByRole('button', { name: 'Add Exercise' }).first(),
    ).toBeFocused();

    const seriousCritical = async () => {
      const result = await new AxeBuilder({ page: app.page }).analyze();
      return result.violations
        .filter(({ impact }) => ['serious', 'critical'].includes(impact ?? ''))
        .map(({ id, impact, nodes }) => `${id}:${impact}:${nodes.length}`);
    };
    expect(await seriousCritical()).toEqual([]);

    await app.click('Add Exercise');
    const editor = app.page.getByRole('dialog', { name: 'Add Exercise' });
    await expect(editor).toBeVisible();
    await expect(app.page.getByLabel('Exercise name')).toBeFocused();
    expect(await seriousCritical()).toEqual([]);
    await app.page.keyboard.press('Escape');
    await expect(editor).toHaveCount(0);
    await expect(
      app.page.getByRole('button', { name: 'Add Exercise' }).first(),
    ).toBeFocused();

    await app.click('Delete Accessible Exercise');
    const confirm = app.page.getByRole('alertdialog');
    await expect(confirm).toBeVisible();
    await expect(confirm).toBeFocused();
    expect(await seriousCritical()).toEqual([]);
    await app.page.keyboard.press('Escape');
    await expect(confirm).toHaveCount(0);
    await expect(
      app.page.getByRole('button', { name: 'Delete Accessible Exercise' }),
    ).toBeFocused();
    await app.expectText('Accessible Exercise');
    await app.click('Back');
    await expect(
      app.page.getByRole('heading', {
        name: 'Accessible Synthetic Routine',
      }),
    ).toBeFocused();
    await app.click('Back');
    await expect(
      app.page.getByRole('heading', { name: 'Routines' }),
    ).toBeFocused();
  });

  test('BROWSER-RESP-01 prevents overflow and preserves mobile touch/input sizing', async ({
    app,
  }) => {
    await app.startFreshApp('responsive');
    await app.createRoutine('Responsive Routine');
    await app.click('Back');
    await app.click('Responsive Routine');
    await app.addSession('Responsive Session');
    await app.openSession('Responsive Session');
    await app.click('Add Exercise');

    const metrics = await app.page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);

    const controlSizes = await app
      .allInteractiveControls()
      .evaluateAll((elements) =>
        elements.map((element) => {
          const box = element.getBoundingClientRect();
          return Math.max(box.height, box.width);
        }),
      );
    expect(controlSizes.length).toBeGreaterThan(0);
    expect(Math.min(...controlSizes)).toBeGreaterThanOrEqual(44);

    const fontSizes = await app.page
      .locator('input, textarea, select')
      .evaluateAll((elements) =>
        elements.map((element) =>
          Number.parseFloat(getComputedStyle(element).fontSize),
        ),
      );
    expect(fontSizes.length).toBeGreaterThan(0);
    expect(Math.min(...fontSizes)).toBeGreaterThanOrEqual(16);
  });

  test('BROWSER-NET-01 keeps Fitness operations local after application assets load', async ({
    app,
  }) => {
    const requests: Array<{
      method: string;
      postData: string | null;
      url: string;
    }> = [];
    await app.startFreshApp('network');
    app.page.on('request', (request) =>
      requests.push({
        method: request.method(),
        postData: request.postData(),
        url: request.url(),
      }),
    );

    const secret = 'Network Privacy Sentinel';
    await app.createRoutine(secret, 'Never transmit these notes');
    await app.click('Back');
    await app.importFixture('invalid-v2.json');
    await app.expectText('invalid');
    expect(requests).toEqual([]);

    await app.page.reload();
    await app.expectText(secret);
    expect(
      requests.every(
        (request) =>
          request.method === 'GET' &&
          request.postData === null &&
          !request.url.includes(secret),
      ),
    ).toBe(true);
  });

  test('BROWSER-BASE-01 serves built assets beneath the Pages repository base', async ({
    app,
  }) => {
    await app.startFreshApp('base-path');
    expect(app.page.url()).toMatch(/\/xq-exercices-miniapp\//);
    const assetUrls = await app.page.evaluate(() =>
      [...document.querySelectorAll('script[src], link[href]')].map(
        (element) =>
          (element as HTMLScriptElement).src ||
          (element as HTMLLinkElement).href,
      ),
    );
    expect(assetUrls.length).toBeGreaterThan(0);
    expect(
      assetUrls.every((url) =>
        new URL(url).pathname.startsWith('/xq-exercices-miniapp/'),
      ),
    ).toBe(true);
  });

  test('BROWSER-PRIV-01 excludes Fitness data from URL, requests, and console', async ({
    app,
  }) => {
    const consoleMessages: string[] = [];
    const requests: Array<{ postData: string | null; url: string }> = [];
    app.page.on('console', (message) => consoleMessages.push(message.text()));
    app.page.on('pageerror', (error) => consoleMessages.push(error.message));
    app.page.on('request', (request) =>
      requests.push({ postData: request.postData(), url: request.url() }),
    );
    await app.startFreshApp('privacy');

    const secret = 'Synthetic-Privacy-Sentinel-9284';
    await app.createRoutine(secret, `${secret}-notes`);
    expect(app.page.url()).not.toContain(secret);
    expect(consoleMessages.every((message) => !message.includes(secret))).toBe(
      true,
    );
    expect(
      requests.every(
        (request) =>
          !request.url.includes(secret) &&
          !(request.postData ?? '').includes(secret),
      ),
    ).toBe(true);
  });
});
