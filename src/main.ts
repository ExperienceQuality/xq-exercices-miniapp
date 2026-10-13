import { mount, type Component } from 'svelte';

const target = document.querySelector<HTMLElement>('#app');

if (!target) {
  throw new Error('Application mount point is unavailable.');
}

const applicationModules = import.meta.glob<{ default: Component }>(
  './app/App.svelte',
  {
    eager: true,
  },
);
const application = applicationModules['./app/App.svelte']?.default;

if (application) {
  mount(application, { target });
} else {
  target.setAttribute('aria-busy', 'true');
  target.textContent = 'Fitness application is being prepared.';
}
