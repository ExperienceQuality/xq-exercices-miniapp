<script lang="ts">
  import type { RoutineV2, TrainingSessionV2 } from '../fitness/domain/model';
  import ExerciseList from './ExerciseList.svelte';

  let {
    routine,
    session,
    onBack,
    onAddExercise,
    onEditExercise,
    onDeleteExercise,
    onReorderExercises,
    reorderPending = false,
    onRenameSession,
    onDeleteSession,
  }: {
    routine: RoutineV2;
    session: TrainingSessionV2;
    onBack: () => void;
    onAddExercise: () => void;
    onEditExercise: (id: string) => void;
    onDeleteExercise: (id: string) => void;
    onReorderExercises: (exerciseIds: readonly string[]) => Promise<void>;
    reorderPending?: boolean;
    onRenameSession: () => void;
    onDeleteSession: () => void;
  } = $props();
</script>

<section class="page-screen" aria-label={`${session.name} session`}>
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
  <p class="subtitle">{routine.name}</p>

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
    {#key `${routine.id}:${session.id}`}
      <ExerciseList
        exercises={session.exercises}
        {onEditExercise}
        {onDeleteExercise}
        {onReorderExercises}
        {reorderPending}
      />
    {/key}
    <p class="list-hint">Drag the grip to reorder exercises.</p>
  {/if}
</section>
