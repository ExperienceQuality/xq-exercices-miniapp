import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, test as base } from '@playwright/test';

const namespaceIsolationSource = `(() => {
  const prefix = 'xq-fitness-ui-test-';
  const mapName = (name) =>
    name === 'xq-fitness' && window.name ? prefix + window.name : name;
  const open = indexedDB.open.bind(indexedDB);
  const remove = indexedDB.deleteDatabase.bind(indexedDB);
  indexedDB.open = (name, ...args) => open(mapName(name), ...args);
  indexedDB.deleteDatabase = (name) => remove(mapName(name));
})();`;

const accessibleRoles = [
  'button',
  'link',
  'tab',
  'menuitem',
  'checkbox',
  'radio',
  'switch',
  'textbox',
  'searchbox',
  'spinbutton',
  'slider',
  'combobox',
  'listbox',
  'option',
];
const isolatedContexts = new WeakSet();

export const fixturePath = (name) =>
  path.resolve(process.cwd(), 'tests', 'fixtures', 'compatibility', name);

export const test = base.extend({
  context: async ({ context }, use) => {
    await installNamespaceIsolation(context);
    await use(context);
  },
  app: async ({ context, page }, use, testInfo) => {
    let sequence = 0;

    const controlLocator = (name) => {
      let locator = page.getByLabel(name);
      for (const role of accessibleRoles) {
        locator = locator.or(page.getByRole(role, { name }));
      }
      return locator;
    };

    const delay = (milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds));

    const waitForSettled = async (predicate, timeoutMsg, timeout = 60_000) => {
      const deadline = Date.now() + timeout;
      let lastError;

      for (;;) {
        try {
          const result = await predicate();
          if (result) return result;
          lastError = undefined;
        } catch (error) {
          lastError = error;
        }

        if (Date.now() >= deadline) break;
        await delay(50);
      }

      const detail = lastError
        ? ` Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`
        : '';
      throw new Error(`${timeoutMsg}${detail}`, { cause: lastError });
    };

    const retryWithTimeout = (operation, timeoutMsg, timeout = 10_000) =>
      waitForSettled(
        async () => {
          try {
            return await operation();
          } catch {
            return false;
          }
        },
        timeoutMsg,
        timeout,
      );

    const bodyText = async () =>
      retryWithTimeout(async () => {
        const text = await page.locator('body').innerText();
        return text.replace(/\s+/g, ' ').trim();
      }, 'Body text could not be read.');

    const control = async (name) =>
      retryWithTimeout(async () => {
        const locator = controlLocator(name);
        return (await locator.count()) > 0 ? locator.first() : false;
      }, `Control ${name} did not appear.`);

    const click = async (name) => {
      const locator = controlLocator(name);
      await waitForSettled(
        async () => {
          const count = await locator.count();
          for (let index = 0; index < count; index += 1) {
            const candidate = locator.nth(index);
            if (!(await candidate.isVisible())) continue;
            if (!(await candidate.isEnabled())) continue;
            await candidate.click({ timeout: 1_000 });
            return true;
          }
          return false;
        },
        `${name} could not be clicked.`,
        10_000,
      );
    };

    // Opening a session must target the row navigation button
    // (.list-button) by exact name: the new reorder handle and
    // "Move {name} up/down" controls would otherwise win the fuzzy
    // `click(name)` locator match.
    const openSession = async (name) => {
      const button = page.locator('.list-button').filter({
        has: page.locator('strong', {
          hasText: new RegExp(`^${escapeRegExp(name)}$`),
        }),
      });
      await waitForSettled(
        async () => {
          if ((await button.count()) === 0) return false;
          const candidate = button.first();
          if (!(await candidate.isVisible())) return false;
          if (!(await candidate.isEnabled())) return false;
          await candidate.click({ timeout: 1_000 });
          return true;
        },
        `Session row ${name} could not be opened.`,
        10_000,
      );
    };

    const fill = async (name, value) => {
      await waitForSettled(async () => {
        const text = (await bodyText()).toLowerCase();
        return text.includes(name.toLowerCase());
      }, `Field label ${name} did not appear before filling.`);
      const element = page.getByLabel(name).first();
      await element.waitFor({ state: 'visible', timeout: 10_000 });
      await element.fill(String(value));
    };

    const expectText = async (text) => {
      const pattern = new RegExp(escapeRegExp(text), 'i');
      await waitForSettled(
        async () => pattern.test(await bodyText()),
        `Expected page text to include ${text}.`,
      );
      assert.match(await bodyText(), pattern);
    };

    const expectNoText = async (text) => {
      const pattern = new RegExp(escapeRegExp(text), 'i');
      await waitForSettled(
        async () => !pattern.test(await bodyText()),
        `Expected page text not to include ${text}.`,
      );
      assert.doesNotMatch(await bodyText(), pattern);
    };

    const expectDisabled = async (name, disabled = true) => {
      const element = await control(name);
      if (disabled) await expect(element).toBeDisabled();
      else await expect(element).toBeEnabled();
    };

    const waitForEditorSave = async (fieldName, savedName) => {
      const normalizedName = savedName.trim();
      await waitForSettled(async () => {
        const editorCount = await page
          .getByLabel(fieldName, { exact: true })
          .count();
        return editorCount === 0 && (await bodyText()).includes(normalizedName);
      }, `${fieldName} editor did not close after saving ${normalizedName}.`);
    };

    const createRoutine = async (name, notes) => {
      await click('Create Routine');
      await fill('Routine name', name);
      if (notes !== undefined) await fill('Notes', notes);
      await click('Save');
      await waitForEditorSave('Routine name', name);
    };

    const addSession = async (name) => {
      await click('Add Training Session');
      await fill('Session name', name);
      await click('Save');
      await waitForEditorSave('Session name', name);
    };

    const addExercise = async ({
      name,
      sets = 3,
      repetitions = 10,
      weightKg = 0,
    }) => {
      await click('Add Exercise');
      await fill('Exercise name', name);
      await fill('Sets', sets);
      await fill('Repetitions', repetitions);
      await fill('Weight in kilograms', weightKg);
      await click('Save');
      await waitForEditorSave('Exercise name', name);
    };

    const importFixture = async (name) => {
      const input = page.locator('input[type="file"]');
      await input.waitFor({ state: 'attached', timeout: 10_000 });
      await input.setInputFiles(fixturePath(name));
      await waitForSettled(async () => {
        const text = (await bodyText()).toLowerCase();
        return [
          'imported.',
          'invalid',
          'not supported',
          'could not be saved',
        ].some((message) => text.includes(message));
      }, `Import did not complete for ${name}.`);
    };

    // Imports an in-memory schema-v2 document through the existing file
    // input — lets reorder tests use ordered fixtures without adding repo
    // fixture files.
    const importDocument = async (
      document,
      filename = 'inline-import.json',
    ) => {
      const input = page.locator('input[type="file"]');
      await input.waitFor({ state: 'attached', timeout: 10_000 });
      await input.setInputFiles({
        name: filename,
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(document), 'utf8'),
      });
      await waitForSettled(async () => {
        const text = (await bodyText()).toLowerCase();
        return [
          'imported.',
          'invalid',
          'not supported',
          'could not be saved',
        ].some((message) => text.includes(message));
      }, `Import did not complete for ${filename}.`);
    };

    // Applies browser text scaling by setting the root font size (the
    // 200%-text-zoom contract), NOT by shrinking the layout viewport.
    const setTextScale = async (factor) => {
      await page.evaluate((value) => {
        document.documentElement.style.fontSize = `${value * 100}%`;
      }, factor);
    };

    const allInteractiveControls = () =>
      page.locator('button, a[href], input, select, textarea');

    const seedRecords = async ({ primary, recovery }) => {
      await page.evaluate(
        async (records) => {
          const database = await new Promise((resolve, reject) => {
            const request = indexedDB.open('xq-fitness');
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
          });

          if (!database.objectStoreNames.contains('records')) {
            database.close();
            throw new Error('Fitness records store is unavailable.');
          }

          await new Promise((resolve, reject) => {
            const transaction = database.transaction('records', 'readwrite');
            const store = transaction.objectStore('records');
            if (records.primary !== undefined)
              store.put(records.primary, 'primary');
            if (records.recovery !== undefined)
              store.put(records.recovery, 'recovery');
            transaction.oncomplete = () => {
              database.close();
              resolve();
            };
            transaction.onerror = () => {
              database.close();
              reject(transaction.error);
            };
            transaction.onabort = () => {
              database.close();
              reject(transaction.error);
            };
          });
        },
        { primary, recovery },
      );

      await waitForSettled(
        () =>
          page.evaluate(
            () =>
              new Promise((resolve) => {
                const request = indexedDB.open('xq-fitness');
                request.onerror = () => resolve(false);
                request.onsuccess = () => {
                  const database = request.result;
                  const transaction = database.transaction(
                    'records',
                    'readonly',
                  );
                  transaction.objectStore('records').get('primary');
                  transaction.oncomplete = () => {
                    database.close();
                    resolve(true);
                  };
                  transaction.onerror = () => resolve(false);
                  transaction.onabort = () => resolve(false);
                };
              }),
          ),
        'Seeded fitness records did not flush.',
      );
    };

    const readFixture = async (name) =>
      JSON.parse(await readFile(fixturePath(name), 'utf8'));

    const startFreshApp = async (scenario) => {
      const runId =
        `${testInfo.project.name}-${scenario}-${++sequence}-${testInfo.testId}`
          .replace(/[^A-Za-z0-9_-]/g, '-')
          .slice(0, 64)
          .replace(/-$/, 'x');
      await page.goto('about:blank');
      await page.evaluate((id) => {
        window.name = id;
      }, runId);
      await page.goto('./');
      await waitForSettled(
        async () => (await page.locator('[data-ready="true"]').count()) > 0,
        'App did not finish loading.',
      );
      return runId;
    };

    await use({
      addExercise,
      addSession,
      allInteractiveControls,
      bodyText,
      click,
      context,
      control,
      createRoutine,
      expectDisabled,
      expectNoText,
      expectText,
      fill,
      fixturePath,
      importDocument,
      importFixture,
      installLoadGate: () => installLoadGate(context),
      openSession,
      installNamespaceIsolation: () => installNamespaceIsolation(context),
      page,
      readFixture,
      seedRecords,
      setTextScale,
      startFreshApp,
      waitForSettled,
    });
  },
});

export { expect };
export { developerOwnedAutomation } from '../traceability.js';

async function installNamespaceIsolation(context) {
  if (isolatedContexts.has(context)) return;
  await context.addInitScript(namespaceIsolationSource);
  isolatedContexts.add(context);
}

async function installLoadGate(context) {
  await context.addInitScript(gateFirstIndexedDbOpen);
}

function gateFirstIndexedDbOpen() {
  const open = indexedDB.open.bind(indexedDB);
  const eventTypes = ['upgradeneeded', 'blocked', 'success', 'error'];
  let gated = true;

  indexedDB.open = (...args) => {
    if (!gated) return open(...args);
    gated = false;

    const listeners = new Map();
    const state = {
      error: null,
      readyState: 'pending',
      result: undefined,
      source: null,
      transaction: null,
    };
    const fake = Object.create(IDBRequest.prototype);
    const emit = (type, event) => {
      for (const listener of listeners.get(type) ?? []) {
        if (typeof listener === 'function') listener.call(fake, event);
        else listener.handleEvent(event);
      }
    };

    Object.defineProperties(fake, {
      addEventListener: {
        value: (type, listener) => {
          if (!listener) return;
          const registered = listeners.get(type) ?? new Set();
          registered.add(listener);
          listeners.set(type, registered);
        },
      },
      dispatchEvent: {
        value: (event) => {
          emit(event.type, event);
          return !event.defaultPrevented;
        },
      },
      error: { get: () => state.error },
      readyState: { get: () => state.readyState },
      removeEventListener: {
        value: (type, listener) => listeners.get(type)?.delete(listener),
      },
      result: { get: () => state.result },
      source: { get: () => state.source },
      transaction: { get: () => state.transaction },
    });
    for (const type of eventTypes) {
      Object.defineProperty(fake, `on${type}`, {
        get: () => [...(listeners.get(type) ?? [])][0] ?? null,
        set: (listener) => {
          listeners.set(type, new Set(listener ? [listener] : []));
        },
      });
    }

    Object.assign(window, {
      __releaseFitnessLoad: () =>
        new Promise((resolve) => {
          indexedDB.open = open;
          const request = open(...args);
          for (const type of eventTypes) {
            request.addEventListener(type, (event) => {
              state.readyState = request.readyState;
              state.error = request.error;
              state.source = request.source;
              if (type === 'upgradeneeded' || type === 'success') {
                state.result = request.result;
                state.transaction = request.transaction;
              }
              emit(type, event);
              if (type === 'success' || type === 'error') resolve();
            });
          }
        }),
    });
    return fake;
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
