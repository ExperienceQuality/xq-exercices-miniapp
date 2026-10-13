/* global describe, it */
import assert from 'node:assert/strict';

import { $, browser } from '@wdio/globals';

describe('Safari Simulator smoke', () => {
  it('contains exactly the four approved smoke assertions', async () => {
    await browser.url('./');
    const heading = await $('aria/Fitness');
    assert.equal(await heading.isDisplayed(), true, 'IOS-SMOKE-01 launch');

    await (await $('aria/Create Routine')).click();
    await (await $('aria/Routine name')).setValue('iOS Synthetic Routine');
    await (await $('aria/Save')).click();
    const routine = await $('aria/iOS Synthetic Routine');
    assert.equal(
      await routine.isDisplayed(),
      true,
      'IOS-SMOKE-02 create routine',
    );

    await browser.refresh();
    assert.equal(
      await routine.isDisplayed(),
      true,
      'IOS-SMOKE-03 retain after reload',
    );

    const importControl = await $('input[type="file"]');
    assert.equal(
      Boolean(await importControl.getComputedLabel()),
      true,
      'IOS-SMOKE-04 import control',
    );
  });
});
