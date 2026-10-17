<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import {
    createProductionNamespace,
    type FitnessDependencies,
  } from './dependencies';
  import { createIndexedDbFitnessRepository } from '../fitness/persistence/indexeddb-fitness-repository';
  import { FitnessController, type EditorKind } from './fitness-controller';
  import type { ExerciseInput } from '../fitness/domain/commands';
  import type {
    FitnessDocumentV2,
    RoutineV2,
    TrainingSessionV2,
  } from '../fitness/domain/model';
  import '../styles/app.css';

  const dependencies: FitnessDependencies = {
    repository: createIndexedDbFitnessRepository(createProductionNamespace()),
    ids: { next: () => crypto.randomUUID() },
    clock: { nowIso: () => new Date().toISOString() },
    importFileReader: { readText: (file) => file.text() },
  };
  const controller = new FitnessController(dependencies);
  const initialLoad = controller.load();
  // Keep the shell gated until the first load has published a usable state.
  let appStatus: 'loading' | 'ready' | 'unavailable' = 'ready';
  let dataReady = false;
  let routine: RoutineV2 | undefined;
  let session: TrainingSessionV2 | undefined;
  let document: FitnessDocumentV2 = controller.document;
  let notice: string | null = null;
  let error: string | null = null;
  let editingExerciseId: string | null = null;
  const unsubscribe = controller.subscribe(() => {
    appStatus = controller.status;
    dataReady = controller.status === 'ready';
    routine = controller.routine;
    session = controller.session;
    document = controller.document;
    notice = controller.notice;
    error = controller.error;
    editingExerciseId = controller.editingExerciseId;
  });
  onDestroy(unsubscribe);
  let editorKind: EditorKind = null;
  let sessionEditorIntent: 'add' | 'rename' = 'add';
  let routineName = '',
    routineNotes = '',
    sessionName = '',
    exerciseName = '',
    sets = 3,
    repetitions = 10,
    weightKg = 0;
  let confirmDelete:
    { kind: 'session' } | { kind: 'exercise'; id: string } | null = null;
  onMount(async () => {
    await initialLoad;
    appStatus = controller.status;
    dataReady = controller.status === 'ready';
  });
  const retryLoad = async () => {
    await controller.load();
    appStatus = controller.status;
    dataReady = controller.status === 'ready';
  };
  const openRoutineEditor = () => {
    editorKind = 'routine';
    controller.openEditor('routine');
  };
  const openSessionEditor = (intent: 'add' | 'rename') => {
    sessionEditorIntent = intent;
    sessionName = intent === 'rename' ? (session?.name ?? '') : '';
    editorKind = 'session';
    controller.openEditor('session');
  };
  const closeEditor = () => {
    editorKind = null;
    controller.closeEditor();
  };
  const saveRoutine = async () => {
    try {
      await controller.saveRoutine(routineName, routineNotes);
      editorKind = null;
      routineName = '';
      routineNotes = '';
    } catch {
      void 0;
    }
  };
  const saveSession = async () => {
    try {
      await controller.saveSession(sessionName);
      editorKind = null;
      sessionName = '';
    } catch {
      void 0;
    }
  };
  const saveExercise = async () => {
    const input: ExerciseInput = {
      name: exerciseName,
      sets: Number(sets),
      repetitions: Number(repetitions),
      weightKg: Number(weightKg),
    };
    try {
      await controller.saveExercise(input);
      editorKind = null;
      exerciseName = '';
      sets = 3;
      repetitions = 10;
      weightKg = 0;
    } catch {
      void 0;
    }
  };
  const startExercise = (id: string | null = null) => {
    editorKind = 'exercise';
    controller.openEditor('exercise', id);
    if (id) {
      const item = controller.session?.exercises.find((e) => e.id === id);
      if (item) {
        exerciseName = item.name;
        sets = item.sets;
        repetitions = item.repetitions;
        weightKg = item.weightKg;
      }
    }
  };
  const validName = (value: string) => value.trim().length > 0;
  const validExercise = () =>
    validName(exerciseName) &&
    Number.isInteger(Number(sets)) &&
    Number(sets) >= 1 &&
    Number.isInteger(Number(repetitions)) &&
    Number(repetitions) >= 1 &&
    Number.isFinite(Number(weightKg)) &&
    Number(weightKg) >= 0;
</script>

<svelte:head><title>XQ Fitness</title></svelte:head>
<main class="shell" aria-labelledby="app-title" data-ready={dataReady}>
  <header class="topbar">
    <div>
      <p class="eyebrow">XQ FITNESS</p>
      <h1 id="app-title">Strength routines</h1>
    </div>
    <label class="import"
      ><span>Import Fitness JSON</span><input
        type="file"
        accept="application/json,.json"
        aria-label="Import Fitness JSON"
        onchange={(event) => {
          void controller
            .importFile((event.currentTarget as HTMLInputElement).files?.[0])
            .catch(() => {});
        }}
      /></label
    >
  </header>
  {#if appStatus === 'loading'}<section
      class="card"
      aria-live="polite"
      aria-busy="true"
    >
      <p>Loading Fitness data…</p>
    </section>
  {:else if appStatus === 'unavailable'}<section
      class="card error-panel"
      aria-labelledby="unavailable-title"
      role="alert"
    >
      <h2 id="unavailable-title">Fitness is unavailable</h2>
      <p>{error}</p>
      <button onclick={retryLoad}>Retry</button>
    </section>
  {:else}
    {#if notice}<p class="status" role="status">
        {notice}
      </p>{/if}
    {#if error}<p class="status" role="alert">
        {error}
      </p>{/if}
    {#if !routine}
      <section class="card" aria-labelledby="routine-list-title">
        <div class="section-heading">
          <div>
            <p class="eyebrow">YOUR PLAN</p>
            <h2 id="routine-list-title">Routines</h2>
          </div>
          <button disabled={!dataReady} onclick={openRoutineEditor}
            >Create Routine</button
          >
        </div>
        {#if document.routines.length === 0}<div class="empty">
            <h3>No routines yet</h3>
            <p>Create a routine to start training.</p>
            <button disabled={!dataReady} onclick={openRoutineEditor}
              >Create Routine</button
            >
          </div>{:else}<div class="routine-grid">
            {#each document.routines as routine (routine.id)}<button
                class="routine-card"
                onclick={() => controller.selectRoutine(routine.id)}
                ><strong>{routine.name}</strong>{#if routine.notes}<span
                    >{routine.notes}</span
                  >{/if}<small
                  >{routine.sessions.length}
                  {routine.sessions.length === 1
                    ? 'session'
                    : 'sessions'}</small
                ></button
              >{/each}
          </div>{/if}
      </section>
    {:else}
      <section class="card workspace">
        <button
          class="back"
          aria-label="Back"
          onclick={() =>
            controller.session
              ? controller.deselectSession()
              : controller.backToList()}>← All routines</button
        >
        <div class="section-heading">
          <div>
            <p class="eyebrow">ROUTINE</p>
            <h2>{routine.name}</h2>
            {#if routine.notes}<p class="muted">
                {routine.notes}
              </p>{/if}
          </div>
          <button onclick={() => openSessionEditor('add')}
            >Add Training Session</button
          >
        </div>
        {#if routine.sessions.length === 0}<div class="empty">
            <h3>No training sessions</h3>
            <p>Add a session, then add exercises.</p>
          </div>{:else}<div class="session-tabs" role="tablist">
            {#each [...routine.sessions].sort((a, b) => a.order - b.order) as item (item.id)}<button
                role="tab"
                aria-selected={session?.id === item.id}
                class:active={session?.id === item.id}
                onclick={() => controller.selectSession(item.id)}
                >{item.name}</button
              >{/each}
          </div>{/if}
        {#if session}<div class="session-head">
            <div>
              <h3>{session.name}</h3>
              <p class="muted">Session {session.order}</p>
            </div>
            <div class="actions">
              <button
                class="quiet"
                aria-label="Edit Training Session"
                onclick={() => openSessionEditor('rename')}>Rename</button
              ><button
                class="danger quiet"
                aria-label="Delete Training Session"
                onclick={() => (confirmDelete = { kind: 'session' })}
                >Delete</button
              >
            </div>
          </div>
          {#if session.exercises.length === 0}<div class="empty compact">
              <p>No exercises yet.</p>
              <button onclick={() => startExercise()}>Add Exercise</button>
            </div>{:else}<div class="exercise-list">
              {#each session.exercises as exercise (exercise.id)}<article
                  class="exercise"
                >
                  <div>
                    <strong>{exercise.name}</strong>
                    <p>
                      {exercise.sets} sets · {exercise.repetitions} reps · {exercise.weightKg}
                      kg
                    </p>
                  </div>
                  <div class="actions">
                    <button
                      class="quiet"
                      aria-label={`Edit ${exercise.name}`}
                      onclick={() => startExercise(exercise.id)}>Edit</button
                    ><button
                      class="danger quiet"
                      aria-label={`Delete ${exercise.name}`}
                      onclick={() =>
                        (confirmDelete = {
                          kind: 'exercise',
                          id: exercise.id,
                        })}>Delete</button
                    >
                  </div>
                </article>{/each}
            </div>
            <button class="secondary" onclick={() => startExercise()}
              >Add Exercise</button
            >{/if}
        {/if}
        <div class="progress">
          <div>
            <h3>Progress</h3>
            <p class="muted">Compare your latest snapshots.</p>
          </div>
          <button class="secondary" onclick={() => controller.snapshot()}
            >Capture Progress</button
          >{#if routine.snapshots.at(-1)?.entries.length === 0 && routine.snapshots.length > 0}<p
              class="empty-report"
            >
              No Exercises Captured<br /><span
                >Add exercises before your next snapshot.</span
              >
            </p>{:else if routine.snapshots.at(-1)}<ul>
              {#each routine.snapshots.at(-1)!.entries as entry (entry.foldedName)}<li
                >
                  <strong>{entry.name}</strong><span
                    >{entry.sets} sets · {entry.repetitions} reps{entry.repetitionsProgress ===
                    'first'
                      ? ''
                      : ` (${entry.repetitionsProgress})`} · {entry.weightKg}
                    kg{entry.weightProgress === 'first'
                      ? ''
                      : ` (${entry.weightProgress})`}{entry.repetitionsProgress ===
                      'first' || entry.weightProgress === 'first'
                      ? ' · First snapshot'
                      : ''}</span
                  >
                </li>{/each}
            </ul>{/if}
        </div>
      </section>
    {/if}
  {/if}

  {#if editorKind}<div
      class="editor card"
      role="dialog"
      aria-modal="true"
      aria-labelledby="editor-title"
    >
      <div class="section-heading">
        <h2 id="editor-title">
          {editorKind === 'routine'
            ? 'Create Routine'
            : editorKind === 'session'
              ? sessionEditorIntent === 'rename'
                ? 'Rename Training Session'
                : 'Add Training Session'
              : editingExerciseId
                ? 'Edit Exercise'
                : 'Add Exercise'}
        </h2>
        <button class="quiet" onclick={closeEditor}>Cancel</button>
      </div>
      {#if error}<p class="field-error" role="alert">
          {error}
        </p>{/if}
      {#if editorKind === 'routine'}<label
          >Routine name<input
            bind:value={routineName}
            aria-invalid={!validName(routineName)}
          /></label
        ><label
          >Notes <span class="muted">(optional)</span><textarea
            bind:value={routineNotes}></textarea></label
        ><button disabled={!validName(routineName)} onclick={saveRoutine}
          >Save</button
        >
      {:else if editorKind === 'session'}<label
          >Session name<input
            bind:value={sessionName}
            aria-invalid={!validName(sessionName)}
          /></label
        ><button
          disabled={!validName(sessionName)}
          onclick={sessionEditorIntent === 'rename'
            ? async () => {
                try {
                  await controller.renameSelectedSession(sessionName);
                  editorKind = null;
                  sessionName = '';
                } catch {
                  void 0;
                }
              }
            : saveSession}>Save</button
        >
      {:else}<label for="exercise-name"
          >Exercise name<input
            id="exercise-name"
            bind:value={exerciseName}
            aria-invalid={!validName(exerciseName)}
          /></label
        ><label for="exercise-sets"
          >Sets<input
            id="exercise-sets"
            type="number"
            min="1"
            step="1"
            bind:value={sets}
          /></label
        ><label for="exercise-repetitions"
          >Repetitions<input
            id="exercise-repetitions"
            type="number"
            min="1"
            step="1"
            bind:value={repetitions}
          /></label
        ><label for="exercise-weight"
          >Weight in kilograms<input
            id="exercise-weight"
            type="number"
            min="0"
            step="0.1"
            inputmode="decimal"
            bind:value={weightKg}
          /></label
        ><button disabled={!validExercise()} onclick={saveExercise}>Save</button
        >{/if}
    </div>{/if}
  {#if confirmDelete}<div
      class="confirm card"
      role="alertdialog"
      aria-modal="true"
    >
      <h2>
        {confirmDelete.kind === 'session'
          ? 'Delete session?'
          : 'Delete exercise?'}
      </h2>
      <p>
        {confirmDelete.kind === 'session'
          ? 'This removes the session and its exercises.'
          : 'This removes the exercise.'}
      </p>
      <button
        class="danger"
        aria-label="Confirm Delete"
        onclick={async () => {
          const target = confirmDelete;
          confirmDelete = null;
          try {
            if (target?.kind === 'session') {
              await controller.removeSession();
            } else if (target?.kind === 'exercise') {
              await controller.removeExercise(target.id);
            }
          } catch {
            void 0;
          }
        }}
        >{confirmDelete.kind === 'session'
          ? 'Delete Session'
          : 'Delete Exercise'}</button
      ><button class="quiet" onclick={() => (confirmDelete = null)}
        >Cancel</button
      >
    </div>{/if}
</main>
