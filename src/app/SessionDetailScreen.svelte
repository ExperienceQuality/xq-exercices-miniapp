<script lang="ts">
  import type { RoutineV2, TrainingSessionV2 } from '../fitness/domain/model';

  let {
    routine,
    session,
    onBack,
    onAddExercise,
    onEditExercise,
    onDeleteExercise,
    onRenameSession,
    onDeleteSession,
  }: {
    routine: RoutineV2;
    session: TrainingSessionV2;
    onBack: () => void;
    onAddExercise: () => void;
    onEditExercise: (id: string) => void;
    onDeleteExercise: (id: string) => void;
    onRenameSession: () => void;
    onDeleteSession: () => void;
  } = $props();

  const initials = (name: string) =>
    name
      .split(' ')
      .filter((part) => part.length > 0)
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
</script>

<section class="page-screen" aria-label={`${session.name} session`}>
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
    <div class="header-actions">
      <button
        class="quiet"
        type="button"
        aria-label="Edit Training Session"
        onclick={onRenameSession}>Edit</button
      ><button
        class="quiet danger"
        type="button"
        aria-label="Delete Training Session"
        onclick={onDeleteSession}>Delete</button
      >
    </div>
  </header>

  <p class="section-label">Session</p>
  <h1 tabindex="-1">{session.name}</h1>
  <p class="subtitle">{routine.name} · Session {session.order}</p>

  <div class="section-heading-row">
    <p class="section-label">Exercises</p>
    <button class="text-action" type="button" onclick={onAddExercise}
      >Add Exercise</button
    >
  </div>
  {#if session.exercises.length === 0}
    <div class="empty-state">
      <p>No exercises yet.</p>
      <button class="primary-cta" type="button" onclick={onAddExercise}
        >Add Exercise</button
      >
    </div>
  {:else}
    <ul class="grouped-list">
      {#each session.exercises as exercise (exercise.id)}
        <li class="grouped-row static-row exercise-row">
          <span class="exercise-mark" aria-hidden="true"
            >{initials(exercise.name)}</span
          ><span class="row-copy"
            ><strong>{exercise.name}</strong><small
              >{exercise.sets} sets · {exercise.repetitions} reps · {exercise.weightKg}
              kg</small
            ></span
          ><button
            class="quiet"
            type="button"
            aria-label={`Edit ${exercise.name}`}
            onclick={() => onEditExercise(exercise.id)}>Edit</button
          ><button
            class="quiet danger row-delete"
            type="button"
            aria-label={`Delete ${exercise.name}`}
            onclick={() => onDeleteExercise(exercise.id)}>Delete</button
          >
        </li>
      {/each}
    </ul>
  {/if}
</section>
