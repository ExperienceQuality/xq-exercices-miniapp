<script lang="ts">
  import type { RoutineV2 } from '../fitness/domain/model';

  let {
    routine,
    onBack,
    onOpenSession,
    onAddSession,
    onCaptureSnapshot,
  }: {
    routine: RoutineV2;
    onBack: () => void;
    onOpenSession: (id: string) => void;
    onAddSession: () => void;
    onCaptureSnapshot: () => void;
  } = $props();

  const latest = $derived(routine.snapshots.at(-1));
</script>

<section class="page-screen" aria-label={`${routine.name} routine`}>
  <header class="detail-header">
    <button
      class="navigation-button"
      type="button"
      aria-label="Back"
      onclick={onBack}
      ><svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        ><path
          d="M15 6l-6 6 6 6"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        /></svg
      ></button
    >
  </header>

  <p class="section-label">Routine</p>
  <h1 tabindex="-1">{routine.name}</h1>
  {#if routine.notes}<p class="subtitle">{routine.notes}</p>{/if}

  <div class="section-heading-row">
    <p class="section-label">Sessions</p>
    <button class="text-action" type="button" onclick={onAddSession}
      >Add Training Session</button
    >
  </div>
  {#if routine.sessions.length === 0}
    <ul class="grouped-list">
      <li class="grouped-row static-row empty-list-row">
        No training sessions. Add a session, then add exercises.
      </li>
    </ul>
  {:else}
    <ul class="grouped-list">
      {#each [...routine.sessions].sort((a, b) => a.order - b.order) as item (item.id)}
        <li class="grouped-row">
          <button
            class="list-button"
            type="button"
            onclick={() => onOpenSession(item.id)}
            ><span class="row-copy"
              ><strong>{item.name}</strong><small
                >Session {item.order} · {item.exercises.length}
                {item.exercises.length === 1 ? 'exercise' : 'exercises'}</small
              ></span
            ><svg
              class="row-chevron-icon"
              width="21"
              height="21"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
              ><path
                d="M9 6l6 6-6 6"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              /></svg
            ></button
          >
        </li>
      {/each}
    </ul>
  {/if}

  <div class="section-heading-row">
    <p class="section-label">Progress</p>
    <button class="text-action" type="button" onclick={onCaptureSnapshot}
      >Capture Progress</button
    >
  </div>
  <p class="list-hint">Compare your latest snapshots.</p>
  {#if latest && latest.entries.length === 0}
    <p class="empty-report">
      No Exercises Captured<br /><span
        >Add exercises before your next snapshot.</span
      >
    </p>
  {:else if latest}
    <ul class="grouped-list">
      {#each latest.entries as entry (entry.foldedName)}
        <li class="grouped-row static-row progress-row">
          <span class="row-copy"
            ><strong>{entry.name}</strong><small
              >{entry.sets} sets · {entry.repetitions} reps{entry.repetitionsProgress ===
              'first'
                ? ''
                : ` (${entry.repetitionsProgress})`} · {entry.weightKg}
              kg{entry.weightProgress === 'first'
                ? ''
                : ` (${entry.weightProgress})`}{entry.repetitionsProgress ===
                'first' || entry.weightProgress === 'first'
                ? ' · First snapshot'
                : ''}</small
            ></span
          >
        </li>
      {/each}
    </ul>
  {/if}
</section>
