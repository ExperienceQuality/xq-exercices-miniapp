import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [svelte()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts', 'src/**/*.svelte'],
      exclude: ['src/**/*.test.ts', 'src/main.ts'],
      thresholds: {
        'src/fitness/domain/**': { statements: 95, branches: 95 },
        'src/fitness/persistence/**': { statements: 95, branches: 95 },
        'src/fitness/import/**': { statements: 95, branches: 95 },
        'src/app/fitness-controller.ts': { statements: 80, branches: 80 },
        'src/fitness/ui/**': { statements: 80, branches: 80 },
      },
    },
  },
});
