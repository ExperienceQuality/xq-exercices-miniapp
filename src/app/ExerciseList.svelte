<script lang="ts">
  import ReorderableList from './ReorderableList.svelte';
  import type { ExerciseV2 } from '../fitness/domain/model';

  let {
    exercises,
    onEditExercise,
    onDeleteExercise,
    onReorderExercises,
    reorderPending = false,
  }: {
    exercises: readonly ExerciseV2[];
    onEditExercise: (id: string) => void;
    onDeleteExercise: (id: string) => void;
    onReorderExercises: (exerciseIds: readonly string[]) => Promise<void>;
    reorderPending?: boolean;
  } = $props();

  // The session's exercises array position IS the canonical order — the
  // adapter passes it through untouched.
  const items = $derived(exercises);
</script>

<ReorderableList
  {items}
  listLabel="Exercises"
  kind="exercise"
  onReorder={onReorderExercises}
  {reorderPending}
>
  {#snippet children(exercise)}
    <span class="row-copy"
      ><strong class="exercise-name">{exercise.name}</strong><small
        >{exercise.sets} sets · {exercise.repetitions} reps · {exercise.weightKg}
        kg</small
      ></span
    >
  {/snippet}
  {#snippet actions(exercise)}
    <button
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
  {/snippet}
</ReorderableList>
