import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/xq-exercices-miniapp/',
  plugins: [svelte()],
});
