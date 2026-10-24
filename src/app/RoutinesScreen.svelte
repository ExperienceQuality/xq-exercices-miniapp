<script lang="ts">
  import type { FitnessDocumentV2 } from '../fitness/domain/model';

  let {
    document,
    dataReady,
    onOpenRoutine,
    onCreateRoutine,
    onImportFile,
  }: {
    document: FitnessDocumentV2;
    dataReady: boolean;
    onOpenRoutine: (id: string) => void;
    onCreateRoutine: () => void;
    onImportFile: (file: File | undefined) => void;
  } = $props();
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
    <ul class="grouped-list">
      {#each document.routines as routine (routine.id)}
        <li class="grouped-row">
          <button
            class="list-button"
            type="button"
            onclick={() => onOpenRoutine(routine.id)}
            ><span class="row-copy"
              ><strong>{routine.name}</strong><small
                >{routine.sessions.length}
                {routine.sessions.length === 1 ? 'session' : 'sessions'}</small
              ></span
            ><svg
              class="row-chevron-icon"
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
              ><path
                d="M9 6l6 6-6 6"
                stroke="currentColor"
                stroke-width="2.4"
                stroke-linecap="round"
                stroke-linejoin="round"
              /></svg
            ></button
          >
        </li>
      {/each}
    </ul>
  {/if}
</section>
