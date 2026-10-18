<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
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
  import RoutinesScreen from './RoutinesScreen.svelte';
  import RoutineDetailScreen from './RoutineDetailScreen.svelte';
  import SessionDetailScreen from './SessionDetailScreen.svelte';
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
  let fitnessDocument: FitnessDocumentV2 = controller.document;
  let notice: string | null = null;
  let error: string | null = null;
  let editingExerciseId: string | null = null;
  // Drill-down level: routines list, routine detail, or session detail.
  let screen: 'routines' | 'routine' | 'session' = 'routines';
  const unsubscribe = controller.subscribe(() => {
    appStatus = controller.status;
    dataReady = controller.status === 'ready';
    routine = controller.routine;
    session = controller.session;
    fitnessDocument = controller.document;
    notice = controller.notice;
    error = controller.error;
    editingExerciseId = controller.editingExerciseId;
    if (!controller.routine) {
      screen = 'routines';
    } else if (
      screen === 'routines' ||
      (screen === 'session' && !controller.session)
    ) {
      screen = 'routine';
    }
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
    weightKg = '0';
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
  const openRoutine = (id: string) => {
    controller.selectRoutine(id);
    screen = 'routine';
    void focusScreenHeading();
  };
  const openSession = (id: string) => {
    controller.selectSession(id);
    screen = 'session';
    void focusScreenHeading();
  };
  const backToRoutines = () => {
    controller.backToList();
    screen = 'routines';
    void focusScreenHeading();
  };
  const backToRoutine = () => {
    controller.deselectSession();
    screen = 'routine';
    void focusScreenHeading();
  };
  let editorDialog: HTMLElement | undefined;
  let confirmDialog: HTMLElement | undefined;
  let screenHost: HTMLElement | undefined;
  let returnFocus: HTMLElement | null = null;
  const captureReturnFocus = () => {
    const active = window.document.activeElement;
    returnFocus = active instanceof HTMLElement ? active : null;
  };
  const focusScreenHeading = async () => {
    await tick();
    screenHost?.querySelector<HTMLElement>('h1:not(.sr-only)')?.focus();
  };
  const restoreReturnFocus = async () => {
    const target = returnFocus;
    returnFocus = null;
    // Wait for the DOM update that removes `inert` before focusing.
    await tick();
    if (target && target.isConnected) target.focus();
    else focusScreenHeading();
  };
  const focusEditor = async () => {
    await tick();
    const firstField =
      editorDialog?.querySelector<HTMLElement>('input, textarea');
    (firstField ?? editorDialog)?.focus();
  };
  const focusConfirm = async () => {
    await tick();
    confirmDialog?.focus();
  };
  const onSheetKeydown = (event: KeyboardEvent, dismiss: () => void) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      dismiss();
      return;
    }
    if (event.key !== 'Tab') return;
    const container = event.currentTarget as HTMLElement;
    const focusables = Array.from(
      container.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      ),
    );
    const first = focusables[0];
    const last = focusables.at(-1);
    if (!first || !last) {
      event.preventDefault();
      return;
    }
    const active = window.document.activeElement;
    if (event.shiftKey) {
      if (
        active === first ||
        active === container ||
        !container.contains(active)
      ) {
        event.preventDefault();
        last.focus();
      }
    } else if (
      active === last ||
      active === container ||
      !container.contains(active)
    ) {
      event.preventDefault();
      first.focus();
    }
  };
  const openRoutineEditor = () => {
    captureReturnFocus();
    editorKind = 'routine';
    controller.openEditor('routine');
    void focusEditor();
  };
  const openSessionEditor = (intent: 'add' | 'rename') => {
    captureReturnFocus();
    sessionEditorIntent = intent;
    sessionName = intent === 'rename' ? (session?.name ?? '') : '';
    editorKind = 'session';
    controller.openEditor('session');
    void focusEditor();
  };
  const closeEditor = () => {
    editorKind = null;
    controller.closeEditor();
    restoreReturnFocus();
  };
  const openConfirm = (
    target: { kind: 'session' } | { kind: 'exercise'; id: string },
  ) => {
    captureReturnFocus();
    confirmDelete = target;
    void focusConfirm();
  };
  const dismissConfirm = () => {
    confirmDelete = null;
    restoreReturnFocus();
  };
  const saveRoutine = async () => {
    try {
      await controller.saveRoutine(routineName, routineNotes);
      closeEditor();
      routineName = '';
      routineNotes = '';
      // saveRoutine auto-selects the new routine: land on its heading.
      void focusScreenHeading();
    } catch {
      void 0;
    }
  };
  const saveSession = async () => {
    try {
      await controller.saveSession(sessionName);
      closeEditor();
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
      closeEditor();
      exerciseName = '';
      sets = 3;
      repetitions = 10;
      weightKg = '0';
    } catch {
      void 0;
    }
  };
  const startExercise = (id: string | null = null) => {
    captureReturnFocus();
    editorKind = 'exercise';
    controller.openEditor('exercise', id);
    if (id) {
      const item = controller.session?.exercises.find((e) => e.id === id);
      if (item) {
        exerciseName = item.name;
        sets = item.sets;
        repetitions = item.repetitions;
        weightKg = String(item.weightKg);
      }
    } else {
      exerciseName = '';
      sets = 3;
      repetitions = 10;
      weightKg = '0';
    }
    void focusEditor();
  };
  const validName = (value: string) => value.trim().length > 0;
  const validExercise = () =>
    validName(exerciseName) &&
    Number.isInteger(Number(sets)) &&
    Number(sets) >= 1 &&
    Number.isInteger(Number(repetitions)) &&
    Number(repetitions) >= 1 &&
    weightKg.trim() !== '' &&
    Number.isFinite(Number(weightKg)) &&
    Number(weightKg) >= 0;
</script>

<svelte:head><title>XQ Fitness</title></svelte:head>
<main class="shell" aria-labelledby="app-title" data-ready={dataReady}>
  <h1 id="app-title" class="sr-only">XQ Fitness</h1>
  {#if appStatus === 'loading'}<section
      class="panel"
      aria-live="polite"
      aria-busy="true"
    >
      <p>Loading Fitness data…</p>
    </section>
  {:else if appStatus === 'unavailable'}<section
      class="panel error-panel"
      aria-labelledby="unavailable-title"
      role="alert"
    >
      <h2 id="unavailable-title">Fitness is unavailable</h2>
      <p>{error}</p>
      <button class="primary-cta" type="button" onclick={retryLoad}
        >Retry</button
      >
    </section>
  {:else}
    <div
      class="screen-host"
      bind:this={screenHost}
      inert={editorKind !== null || confirmDelete !== null}
    >
      {#if notice}<p class="status" role="status">
          {notice}
        </p>{/if}
      {#if error}<p class="status" role="alert">
          {error}
        </p>{/if}
      {#if screen === 'session' && routine && session}
        <SessionDetailScreen
          {routine}
          {session}
          onBack={backToRoutine}
          onAddExercise={() => startExercise()}
          onEditExercise={(id) => startExercise(id)}
          onDeleteExercise={(id) => openConfirm({ kind: 'exercise', id })}
          onRenameSession={() => openSessionEditor('rename')}
          onDeleteSession={() => openConfirm({ kind: 'session' })}
        />
      {:else if screen === 'routine' && routine}
        <RoutineDetailScreen
          {routine}
          onBack={backToRoutines}
          onOpenSession={openSession}
          onAddSession={() => openSessionEditor('add')}
          onCaptureSnapshot={() => {
            void controller.snapshot().catch(() => {});
          }}
        />
      {:else}
        <RoutinesScreen
          document={fitnessDocument}
          {dataReady}
          onOpenRoutine={openRoutine}
          onCreateRoutine={openRoutineEditor}
          onImportFile={(file) => {
            void controller.importFile(file).catch(() => {});
          }}
        />
      {/if}
    </div>
  {/if}

  {#if editorKind}<div class="sheet-backdrop" aria-hidden="true"></div>
    <div
      class="editor sheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby="editor-title"
      tabindex="-1"
      bind:this={editorDialog}
      onkeydown={(event) => onSheetKeydown(event, closeEditor)}
    >
      <div class="sheet-heading">
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
        <button class="quiet" type="button" onclick={closeEditor}>Cancel</button
        >
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
        ><button
          class="primary-cta"
          type="button"
          disabled={!validName(routineName)}
          onclick={saveRoutine}>Save</button
        >
      {:else if editorKind === 'session'}<label
          >Session name<input
            bind:value={sessionName}
            aria-invalid={!validName(sessionName)}
          /></label
        ><button
          class="primary-cta"
          type="button"
          disabled={!validName(sessionName)}
          onclick={sessionEditorIntent === 'rename'
            ? async () => {
                try {
                  await controller.renameSelectedSession(sessionName);
                  closeEditor();
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
            type="text"
            inputmode="decimal"
            bind:value={weightKg}
          /></label
        ><button
          class="primary-cta"
          type="button"
          disabled={!validExercise()}
          onclick={saveExercise}>Save</button
        >{/if}
    </div>{/if}
  {#if confirmDelete}<div class="sheet-backdrop" aria-hidden="true"></div>
    <div
      class="confirm sheet"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-body"
      tabindex="-1"
      bind:this={confirmDialog}
      onkeydown={(event) => onSheetKeydown(event, dismissConfirm)}
    >
      <h2 id="confirm-title">
        {confirmDelete.kind === 'session'
          ? 'Delete session?'
          : 'Delete exercise?'}
      </h2>
      <p id="confirm-body">
        {confirmDelete.kind === 'session'
          ? 'This removes the session and its exercises.'
          : 'This removes the exercise.'}
      </p>
      <button
        class="primary-cta danger-solid"
        type="button"
        onclick={async () => {
          const target = confirmDelete;
          dismissConfirm();
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
      ><button class="secondary-cta" type="button" onclick={dismissConfirm}
        >Cancel</button
      >
    </div>{/if}
</main>
