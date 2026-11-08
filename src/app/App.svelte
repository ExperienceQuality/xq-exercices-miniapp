<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import {
    createProductionNamespace,
    type FitnessDependencies,
  } from './dependencies';
  import { createIndexedDbFitnessRepository } from '../fitness/persistence/indexeddb-fitness-repository';
  import { FitnessController, type EditorKind } from './fitness-controller';
  import type { ExerciseInput } from '../fitness/domain/commands';
  import { parseDecimalInput } from '../fitness/ui/decimal';
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
  let reorderPending = controller.reorderPending;
  let deletePending = controller.deletePending;
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
    reorderPending = controller.reorderPending;
    deletePending = controller.deletePending;
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
  // FIT-114 / FIT-116: routine delete alertdialog — named cascade body,
  // initial Cancel focus, busy/disabled confirm guard, Escape/backdrop dismiss.
  let confirmDelete:
    | { kind: 'session' }
    | { kind: 'exercise'; id: string }
    | { kind: 'routine'; id: string; name: string }
    | null = null;
  let confirmBusy = false;
  let confirmCancelButton: HTMLButtonElement | undefined;
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
    // Routine delete focuses the safe action; other confirms keep prior focus.
    if (confirmDelete?.kind === 'routine' && confirmCancelButton) {
      confirmCancelButton.focus();
      return;
    }
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
    target:
      | { kind: 'session' }
      | { kind: 'exercise'; id: string }
      | { kind: 'routine'; id: string; name: string },
  ) => {
    if (confirmBusy) return;
    captureReturnFocus();
    confirmDelete = target;
    void focusConfirm();
  };
  const dismissConfirm = () => {
    if (confirmBusy) return;
    confirmDelete = null;
    restoreReturnFocus();
  };
  const confirmRoutineDelete = async () => {
    if (confirmDelete?.kind !== 'routine' || confirmBusy || deletePending)
      return;
    const target = confirmDelete;
    confirmBusy = true;
    try {
      await controller.removeRoutine(target.id);
      confirmDelete = null;
      screen = 'routines';
      await tick();
      focusScreenHeading();
    } catch {
      void 0;
    } finally {
      confirmBusy = false;
    }
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
      weightKg: parseDecimalInput(weightKg) ?? Number.NaN,
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
  const validExercise = () => {
    const weight = parseDecimalInput(weightKg);
    return (
      validName(exerciseName) &&
      Number.isInteger(Number(sets)) &&
      Number(sets) >= 1 &&
      Number.isInteger(Number(repetitions)) &&
      Number(repetitions) >= 1 &&
      weight !== null &&
      weight >= 0
    );
  };
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
        {@const routineId = routine.id}
        {@const sessionId = session.id}
        <SessionDetailScreen
          {routine}
          {session}
          onBack={backToRoutine}
          onAddExercise={() => startExercise()}
          onEditExercise={(id) => startExercise(id)}
          onDeleteExercise={(id) => openConfirm({ kind: 'exercise', id })}
          onReorderExercises={(exerciseIds) =>
            controller.reorderExercises(routineId, sessionId, exerciseIds)}
          {reorderPending}
          onRenameSession={() => openSessionEditor('rename')}
          onDeleteSession={() => openConfirm({ kind: 'session' })}
        />
      {:else if screen === 'routine' && routine}
        {@const routineId = routine.id}
        {@const routineNameForDelete = routine.name}
        <RoutineDetailScreen
          {routine}
          onBack={backToRoutines}
          onOpenSession={openSession}
          onAddSession={() => openSessionEditor('add')}
          onCaptureSnapshot={() => {
            void controller.snapshot().catch(() => {});
          }}
          onDeleteRoutine={() =>
            openConfirm({
              kind: 'routine',
              id: routineId,
              name: routineNameForDelete,
            })}
          onReorderSessions={(sessionIds) =>
            controller.reorderSessions(routineId, sessionIds)}
          {reorderPending}
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
          onDeleteRoutine={(id, name) =>
            openConfirm({ kind: 'routine', id, name })}
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
  {#if confirmDelete}<button
      class="sheet-backdrop"
      type="button"
      aria-label="Dismiss"
      tabindex="-1"
      onclick={dismissConfirm}
    ></button>
    <div
      class="confirm sheet"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-body"
      aria-busy={confirmBusy || deletePending ? 'true' : undefined}
      tabindex="-1"
      bind:this={confirmDialog}
      onkeydown={(event) => onSheetKeydown(event, dismissConfirm)}
    >
      <h2 id="confirm-title">
        {confirmDelete.kind === 'routine'
          ? 'Delete routine?'
          : confirmDelete.kind === 'session'
            ? 'Delete session?'
            : 'Delete exercise?'}
      </h2>
      <p id="confirm-body">
        {#if confirmDelete.kind === 'routine'}
          “{confirmDelete.name}” and all of its sessions, exercises, and
          progress snapshots will be permanently removed.
        {:else if confirmDelete.kind === 'session'}
          This removes the session and its exercises.
        {:else}
          This removes the exercise.
        {/if}
      </p>
      <button
        class="primary-cta danger-solid"
        type="button"
        aria-busy={confirmBusy || deletePending ? 'true' : undefined}
        aria-disabled={confirmBusy || deletePending ? 'true' : undefined}
        disabled={confirmBusy || deletePending}
        onclick={async () => {
          if (confirmDelete?.kind === 'routine') {
            await confirmRoutineDelete();
            return;
          }
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
        >{confirmDelete.kind === 'routine'
          ? 'Delete'
          : confirmDelete.kind === 'session'
            ? 'Delete Session'
            : 'Delete Exercise'}</button
      ><button
        class="secondary-cta"
        type="button"
        bind:this={confirmCancelButton}
        disabled={confirmBusy || deletePending}
        onclick={dismissConfirm}>Cancel</button
      >
    </div>{/if}
</main>
