<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { FitnessDocumentV2 } from '../fitness/domain/model';
  import RoutineListItem from './RoutineListItem.svelte';

  let {
    document,
    dataReady,
    onOpenRoutine,
    onCreateRoutine,
    onImportFile,
    onDeleteRoutine,
  }: {
    document: FitnessDocumentV2;
    dataReady: boolean;
    onOpenRoutine: (id: string) => void;
    onCreateRoutine: () => void;
    onImportFile: (file: File | undefined) => void;
    onDeleteRoutine: (id: string, name: string) => void;
  } = $props();

  let revealedId = $state<string | null>(null);

  const closeReveal = () => {
    revealedId = null;
  };

  const onDocumentPointerDown = (event: PointerEvent) => {
    if (!revealedId) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest(`[data-routine-id="${revealedId}"]`)) return;
    closeReveal();
  };

  const onDocumentKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && revealedId) {
      event.preventDefault();
      closeReveal();
    }
  };

  const onDocumentScroll = () => {
    if (revealedId) closeReveal();
  };

  onMount(() => {
    window.addEventListener('pointerdown', onDocumentPointerDown, true);
    window.addEventListener('keydown', onDocumentKeydown, true);
    window.addEventListener('scroll', onDocumentScroll, true);
  });
  onDestroy(() => {
    window.removeEventListener('pointerdown', onDocumentPointerDown, true);
    window.removeEventListener('keydown', onDocumentKeydown, true);
    window.removeEventListener('scroll', onDocumentScroll, true);
  });
</script>

<section class="page-screen" aria-label="Routines">
  <header class="page-header">
    <div>
      <p class="section-label">XQ Fitness</p>
      <h1 tabindex="-1">Routines</h1>
    </div>
    <div class="header-actions">
      <label class="import"
        ><span>Import Fitness JSON</span><input
          type="file"
          accept="application/json,.json"
          aria-label="Import Fitness JSON"
          onchange={(event) => {
            onImportFile((event.currentTarget as HTMLInputElement).files?.[0]);
          }}
        /></label
      ><button
        class="circular-action"
        type="button"
        aria-label="Create Routine"
        disabled={!dataReady}
        onclick={onCreateRoutine}
        ><svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          ><path
            d="M12 5v14M5 12h14"
            stroke="currentColor"
            stroke-width="2.4"
            stroke-linecap="round"
          /></svg
        ></button
      >
    </div>
  </header>

  <p class="section-label list-label">Routine plans</p>
  {#if document.routines.length === 0}
    <div class="empty-state" aria-labelledby="empty-routines-title">
      <h2 id="empty-routines-title">No routines yet</h2>
      <p>Create a routine to start training.</p>
      <button
        class="primary-cta"
        type="button"
        disabled={!dataReady}
        onclick={onCreateRoutine}>Create Routine</button
      >
    </div>
  {:else}
    <ul class="grouped-list routine-list">
      {#each document.routines as routine (routine.id)}
        <RoutineListItem
          {routine}
          revealed={revealedId === routine.id}
          onOpen={onOpenRoutine}
          onDelete={onDeleteRoutine}
          onReveal={(id) => {
            revealedId = id;
          }}
          onCloseReveal={closeReveal}
        />
      {/each}
    </ul>
  {/if}
</section>
