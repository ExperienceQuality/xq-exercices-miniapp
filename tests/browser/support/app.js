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

export async function control(name) {
  const element = await $(`aria/${name}`);
  await element.waitForExist();
  return element;
}

export async function click(name) {
  const element = await control(name);
  await element.waitForClickable();
  await element.click();
}

export async function fill(name, value) {
  const element = await control(name);
  await element.setValue(String(value));
}

export async function bodyText() {
  return (await $('body').getText()).replace(/\s+/g, ' ').trim();
}

export async function expectText(text) {
  assert.match(await bodyText(), new RegExp(escapeRegExp(text), 'i'));
}

export async function expectNoText(text) {
  assert.doesNotMatch(await bodyText(), new RegExp(escapeRegExp(text), 'i'));
}

export async function expectDisabled(name, disabled = true) {
  assert.equal(await (await control(name)).isEnabled(), !disabled);
}

export async function createRoutine(name, notes) {
  await click('Create Routine');
  await fill('Routine name', name);
  if (notes !== undefined) await fill('Notes', notes);
  await click('Save');
}

export async function addSession(name) {
  await click('Add Training Session');
  await fill('Session name', name);
  await click('Save');
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
}

export async function importFixture(name) {
  const input = await $('input[type="file"]');
  await input.waitForExist();
  await input.setValue(fixturePath(name));
  if (name === 'valid-v1.json' || name === 'valid-v2.json') {
    await browser.waitUntil(
      async () => (await bodyText()).includes('Fitness data imported.'),
      { timeoutMsg: `Import did not complete for ${name}.` },
    );
  }
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
}

export async function readFixture(name) {
  const { readFile } = await import('node:fs/promises');
  return JSON.parse(await readFile(fixturePath(name), 'utf8'));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
