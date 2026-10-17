# XQ Exercises Mini App

Fitness-only, client-rendered Svelte single-page application. It is built with Vite and stores personal Fitness data in browser-local IndexedDB. It has no server-side rendering, service worker, application backend, telemetry, or runtime third-party asset dependency.

## Toolchain

- Node.js 24 LTS (`24.20.0` used by the initial lockfile), npm 11.19.0
- Svelte 5.57.2, Vite 8.3.4, TypeScript 6.0.3, Vitest 4.1.1
- WebdriverIO 9.31.1 with Chrome/ChromeDriver 155.0.8059.40 managed by WebdriverIO

Install the Node major declared in `.nvmrc`, then run:

```sh
npm ci
npm run format:check
npm run lint
npm run check
npm run test:unit
npm run build
```

`npm run test:browser` runs the authoritative acceptance suite against desktop Chrome and 390 x 844 and 320 x 568 touch-emulation profiles. Physical-device and iOS Simulator validation are outside scope; the earlier Appium/XCUITest smoke lane has been removed from the test strategy.

The browser suites are populated by the separate SDET assignment; they are intentionally absent in this foundation commit.

## Local data and privacy limits

Production, automated-test, and UI-test storage use different validated IndexedDB names. Test cleanup is never given the production database name. Browser-local data is not encryption or backup: clearing Chrome site data, storage eviction, Incognito teardown, changing origin, or losing the device can remove it. The production scheme, host, and port are therefore data-compatibility boundaries.

The production build uses the GitHub Pages base `/xq-exercices-miniapp/`. Pages deployment is not configured by this repository.
