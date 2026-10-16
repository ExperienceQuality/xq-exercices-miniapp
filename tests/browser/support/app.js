import assert from 'node:assert/strict';
import path from 'node:path';

import { $, $$, browser } from '@wdio/globals';

let sequence = 0;

export const fixturePath = (name) =>
  path.resolve(process.cwd(), 'tests', 'fixtures', 'compatibility', name);

export async function installNamespaceIsolation() {
  await browser.cdp('Page', 'addScriptToEvaluateOnNewDocument', {
    source: `(() => {
      const prefix = 'xq-fitness-ui-test-';
      const mapName = (name) => name === 'xq-fitness' && window.name
        ? prefix + window.name
        : name;
      const open = indexedDB.open.bind(indexedDB);
      const remove = indexedDB.deleteDatabase.bind(indexedDB);
      indexedDB.open = (name, ...args) => open(mapName(name), ...args);
      indexedDB.deleteDatabase = (name) => remove(mapName(name));
    })();`,
  });
}

export async function startFreshApp(scenario) {
  const project = String(browser.capabilities['xq:project'] ?? 'chrome');
  const runId = `${project}-${scenario}-${++sequence}`
    .replace(/[^A-Za-z0-9_-]/g, '-')
    .slice(0, 64)
    .replace(/-$/, 'x');
  await browser.url('about:blank');
  await browser.execute((id) => {
    window.name = id;
  }, runId);
  await browser.url('./');
  return runId;
}

async function retryWithTimeout(operation, timeoutMsg, timeout = 10_000) {
  return browser.waitUntil(
    async () => {
      try {
        return await operation();
      } catch {
        return false;
      }
    },
    { timeout, interval: 50, timeoutMsg },
  );
}

export async function control(name) {
  return retryWithTimeout(async () => {
    const element = await $(`aria/${name}`);
    const exists = await element.isExisting();
    return exists ? element : false;
  }, `Control ${name} did not appear.`);
}

export async function click(name) {
  await retryWithTimeout(async () => {
    const element = await control(name);
    const clickable = await element.isClickable();
    if (!clickable) return false;
    await element.click();
    return true;
  }, `${name} could not be clicked.`);
}

export async function fill(name, value) {
  const element = await retryWithTimeout(async () => {
    const el = await $(`aria/${name}`);
    const exists = await el.isExisting();
    return exists ? el : false;
  }, `Field ${name} did not appear for filling.`);
  await element.setValue(String(value));
}

export async function waitForSettled(predicate, timeoutMsg) {
  await browser.waitUntil(predicate, {
    timeout: 60_000,
    interval: 50,
    timeoutMsg,
  });
}

export async function bodyText() {
  return retryWithTimeout(
    async () => (await $('body').getText()).replace(/\s+/g, ' ').trim(),
    'Body text could not be read.',
  );
}

export async function expectText(text) {
  const pattern = new RegExp(escapeRegExp(text), 'i');
  await waitForSettled(
    async () => pattern.test(await bodyText()),
    `Expected page text to include ${text}.`,
  );
  assert.match(await bodyText(), pattern);
}

export async function expectNoText(text) {
  const pattern = new RegExp(escapeRegExp(text), 'i');
  await waitForSettled(
    async () => !pattern.test(await bodyText()),
    `Expected page text not to include ${text}.`,
  );
  assert.doesNotMatch(await bodyText(), pattern);
}

export async function expectDisabled(name, disabled = true) {
  assert.equal(await (await control(name)).isEnabled(), !disabled);
}

export async function createRoutine(name, notes) {
  await click('Create Routine');
  await fill('Routine name', name);
  if (notes !== undefined) await fill('Notes', notes);
  await click('Save');
  await waitForEditorSave('Routine name', name);
}

export async function addSession(name) {
  await click('Add Training Session');
  await fill('Session name', name);
  await click('Save');
  await waitForEditorSave('Session name', name);
}

export async function addExercise({
  name,
  sets = 3,
  repetitions = 10,
  weightKg = 0,
}) {
  await click('Add Exercise');
  await fill('Exercise name', name);
  await fill('Sets', sets);
  await fill('Repetitions', repetitions);
  await fill('Weight in kilograms', weightKg);
  await click('Save');
  await waitForEditorSave('Exercise name', name);
}

export async function importFixture(name) {
  const input = await $('input[type="file"]');
  await input.waitForExist();
  await input.setValue(fixturePath(name));
  await waitForSettled(async () => {
    const text = (await bodyText()).toLowerCase();
    return ['imported.', 'invalid', 'not supported', 'could not be saved'].some(
      (message) => text.includes(message),
    );
  }, `Import did not complete for ${name}.`);
}

export async function allInteractiveControls() {
  return $$('button, a[href], input, select, textarea');
}

export async function seedRecords({ primary, recovery }) {
  await browser.executeAsync(
    (records, done) => {
      const request = indexedDB.open('xq-fitness');
      request.onerror = () => done(String(request.error));
      request.onsuccess = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains('records')) {
          database.close();
          done('Fitness records store is unavailable.');
          return;
        }
        const transaction = database.transaction('records', 'readwrite');
        const store = transaction.objectStore('records');
        if (records.primary !== undefined)
          store.put(records.primary, 'primary');
        if (records.recovery !== undefined)
          store.put(records.recovery, 'recovery');
        transaction.oncomplete = () => {
          database.close();
          done();
        };
        transaction.onerror = () => done(String(transaction.error));
        transaction.onabort = () => done(String(transaction.error));
      };
    },
    { primary, recovery },
  );
  await waitForSettled(
    () =>
      browser.executeAsync((done) => {
        const request = indexedDB.open('xq-fitness');
        request.onerror = () => done(false);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction('records', 'readonly');
          transaction.objectStore('records').get('primary');
          transaction.oncomplete = () => {
            database.close();
            done(true);
          };
          transaction.onerror = () => done(false);
          transaction.onabort = () => done(false);
        };
      }),
    'Seeded fitness records did not flush.',
  );
}

export async function readFixture(name) {
  const { readFile } = await import('node:fs/promises');
  return JSON.parse(await readFile(fixturePath(name), 'utf8'));
}

async function waitForEditorSave(fieldName, savedName) {
  const normalizedName = savedName.trim();
  await waitForSettled(async () => {
    const editor = await $(`aria/${fieldName}`);
    return (
      !(await editor.isExisting()) &&
      (await bodyText()).includes(normalizedName)
    );
  }, `${fieldName} editor did not close after saving ${normalizedName}.`);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
