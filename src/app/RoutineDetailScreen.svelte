<script lang="ts">
  import type { ProgressClass, RoutineV2 } from '../fitness/domain/model';
  import SessionList from './SessionList.svelte';

  const progressArrow = (progress: ProgressClass) =>
    progress === 'increased' ? '↑' : progress === 'decreased' ? '↓' : '→';

  let {
    routine,
    onBack,
    onOpenSession,
    onAddSession,
    onCaptureSnapshot,
    onReorderSessions,
    reorderPending = false,
  }: {
    routine: RoutineV2;
    onBack: () => void;
    onOpenSession: (id: string) => void;
    onAddSession: () => void;
    onCaptureSnapshot: () => void;
    onReorderSessions: (sessionIds: readonly string[]) => Promise<void>;
    reorderPending?: boolean;
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
        width="28"
        height="28"
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
    <ul class="grouped-list" aria-label="Training sessions">
      <li class="grouped-row static-row empty-list-row">
        No training sessions. Add a session, then add exercises.
      </li>
    </ul>
  {:else}
    {#key routine.id}
      <SessionList
        sessions={routine.sessions}
        {onOpenSession}
        {onReorderSessions}
        {reorderPending}
      />
    {/key}
    <p class="list-hint">Drag the grip to reorder sessions.</p>
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
              >{entry.sets} sets · {entry.repetitions} reps{#if entry.repetitionsProgress !== 'first'}&nbsp;<span
                  class="progress-arrow progress-{entry.repetitionsProgress}"
                  role="img"
                  aria-label={entry.repetitionsProgress}
                  >{progressArrow(entry.repetitionsProgress)}</span
                >{/if} · {entry.weightKg} kg{#if entry.weightProgress !== 'first'}&nbsp;<span
                  class="progress-arrow progress-{entry.weightProgress}"
                  role="img"
                  aria-label={entry.weightProgress}
                  >{progressArrow(entry.weightProgress)}</span
                >{/if}{entry.repetitionsProgress === 'first' ||
              entry.weightProgress === 'first'
                ? ' · First snapshot'
                : ''}</small
            ></span
          >
        </li>
      {/each}
    </ul>
  {/if}
</section>
