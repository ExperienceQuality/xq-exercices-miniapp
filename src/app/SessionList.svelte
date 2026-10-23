<script lang="ts">
  import { onDestroy, tick, untrack } from 'svelte';
  import type { TrainingSessionV2 } from '../fitness/domain/model';

  let {
    sessions,
    onOpenSession,
    onReorderSessions,
    reorderPending = false,
  }: {
    sessions: readonly TrainingSessionV2[];
    onOpenSession: (id: string) => void;
    onReorderSessions: (sessionIds: readonly string[]) => Promise<void>;
    reorderPending?: boolean;
  } = $props();

  const DRAG_THRESHOLD_PX = 6;
  const EDGE_ZONE_PX = 56;
  const MAX_SCROLL_PX_PER_FRAME = 14;

  const committed = $derived(
    [...sessions].sort((left, right) => left.order - right.order),
  );
  let previewIds = $state<readonly string[] | null>(null);
  let pending = $state(false);
  let announcement = $state('');
  let listElement = $state<HTMLUListElement | undefined>(undefined);

  const displayed = $derived(
    previewIds
      ? previewIds
          .map((id) => committed.find((session) => session.id === id))
          .filter((session): session is TrainingSessionV2 => Boolean(session))
      : committed,
  );
  const controlsDisabled = $derived(
    pending || reorderPending || committed.length < 2,
  );

  interface DragState {
    pointerId: number;
    handle: HTMLElement;
    sessionId: string;
    startY: number;
    currentY: number;
    dragging: boolean;
    startIndex: number;
    frame: number;
  }
  let drag = $state<DragState | null>(null);

  const committedIds = () => committed.map((session) => session.id);

  const rows = () =>
    Array.from(
      listElement?.querySelectorAll<HTMLElement>('li[data-session-id]') ?? [],
    );

  const previewFor = (sessionId: string, targetIndex: number): string[] => {
    const without = displayed
      .filter((session) => session.id !== sessionId)
      .map((session) => session.id);
    without.splice(
      Math.max(0, Math.min(without.length, targetIndex)),
      0,
      sessionId,
    );
    return without;
  };

  const indexFromPoint = (clientY: number, sessionId: string): number => {
    const others = displayed.filter((session) => session.id !== sessionId);
    for (const row of rows()) {
      const rowId = row.dataset.sessionId;
      if (rowId === sessionId) continue;
      const bounds = row.getBoundingClientRect();
      if (clientY < bounds.top + bounds.height / 2) {
        const index = others.findIndex((session) => session.id === rowId);
        return index < 0 ? others.length : index;
      }
    }
    return others.length;
  };

  const updatePreview = () => {
    if (!drag?.dragging) return;
    previewIds = previewFor(
      drag.sessionId,
      indexFromPoint(drag.currentY, drag.sessionId),
    );
  };

  const autoScrollStep = () => {
    if (!drag?.dragging) return;
    const viewportHeight =
      window.innerHeight || document.documentElement.clientHeight;
    const y = drag.currentY;
    let delta = 0;
    if (y < EDGE_ZONE_PX) {
      delta = -MAX_SCROLL_PX_PER_FRAME * (1 - Math.max(0, y) / EDGE_ZONE_PX);
    } else if (y > viewportHeight - EDGE_ZONE_PX) {
      delta =
        MAX_SCROLL_PX_PER_FRAME *
        (1 - Math.max(0, viewportHeight - y) / EDGE_ZONE_PX);
    }
    if (delta !== 0) window.scrollBy(0, delta);
    updatePreview();
    drag.frame = requestAnimationFrame(autoScrollStep);
  };

  const onDragKeydown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    cancelDrag();
  };

  const cleanupDrag = () => {
    const state = drag;
    if (!state) return;
    drag = null;
    window.removeEventListener('keydown', onDragKeydown, true);
    window.removeEventListener('pointermove', onDragPointerMove);
    window.removeEventListener('pointerup', onDragPointerEnd);
    window.removeEventListener('pointercancel', onDragPointerCancel);
    if (state.frame) cancelAnimationFrame(state.frame);
    try {
      state.handle.releasePointerCapture(state.pointerId);
    } catch {
      // Capture may already be released by the browser.
    }
  };

  const cancelDrag = () => {
    cleanupDrag();
    previewIds = null;
  };

  const commit = async (
    ids: readonly string[],
    movedName: string,
    movedIndex: number,
  ) => {
    pending = true;
    try {
      await onReorderSessions(ids);
      // Clear, flush, then set so assistive tech announces again when a
      // repeated move produces an identical message.
      announcement = '';
      await tick();
      announcement = `${movedName} moved to position ${movedIndex + 1}.`;
    } catch {
      // The controller surfaces the error; the preview simply rolls back.
    } finally {
      pending = false;
      previewIds = null;
    }
  };

  const finishDrag = () => {
    const state = drag;
    const wasDragging = state?.dragging ?? false;
    cleanupDrag();
    if (!state || !wasDragging) {
      previewIds = null;
      return;
    }
    const ids = previewIds ?? committedIds();
    const targetIndex = ids.indexOf(state.sessionId);
    if (targetIndex < 0 || targetIndex === state.startIndex) {
      previewIds = null;
      return;
    }
    const name =
      committed.find((session) => session.id === state.sessionId)?.name ?? '';
    void commit(ids, name, targetIndex);
  };

  const onHandlePointerDown = (event: PointerEvent, sessionId: string) => {
    if (controlsDisabled || drag) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const startIndex = committed.findIndex(
      (session) => session.id === sessionId,
    );
    if (startIndex < 0) return;
    const handle = event.currentTarget as HTMLElement;
    event.preventDefault();
    try {
      handle.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture may be unsupported; dragging still works via events.
    }
    drag = {
      pointerId: event.pointerId,
      handle,
      sessionId,
      startY: event.clientY,
      currentY: event.clientY,
      dragging: false,
      startIndex,
      frame: 0,
    };
    // Window-level listeners keep the gesture alive even when the browser
    // releases pointer capture (autoscroll, DOM preview reorder) — the
    // events still bubble to window from whatever element they target.
    window.addEventListener('keydown', onDragKeydown, true);
    window.addEventListener('pointermove', onDragPointerMove);
    window.addEventListener('pointerup', onDragPointerEnd);
    window.addEventListener('pointercancel', onDragPointerCancel);
  };

  const onDragPointerMove = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag.currentY = event.clientY;
    if (!drag.dragging) {
      if (Math.abs(event.clientY - drag.startY) < DRAG_THRESHOLD_PX) return;
      drag.dragging = true;
      previewIds = committedIds();
      drag.frame = requestAnimationFrame(autoScrollStep);
    }
    updatePreview();
  };

  const onDragPointerEnd = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    finishDrag();
  };

  const onDragPointerCancel = (event: PointerEvent) => {
    // Only the gesture's own pointer can cancel it; a second touch or a
    // different pointer must not interrupt the active drag.
    if (drag && event.pointerId === drag.pointerId) cancelDrag();
  };

  const move = async (sessionId: string, delta: -1 | 1) => {
    if (controlsDisabled) return;
    const ids = committedIds();
    const from = ids.indexOf(sessionId);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to]!, ids[from]!];
    const name = committed[from]!.name;
    await commit(ids, name, to);
    // Keep focus with the moved session. The activated control may have
    // blurred to the body when the pending state disabled it, or it may now
    // sit at a boundary — focus an enabled control on the moved row in
    // either case; never touch focus after the list has unmounted.
    await tick();
    const row = listElement?.querySelector<HTMLElement>(
      `li[data-session-id="${CSS.escape(sessionId)}"]`,
    );
    if (!row?.isConnected) return;
    const active = document.activeElement;
    if (
      active instanceof HTMLButtonElement &&
      !active.disabled &&
      row.contains(active)
    ) {
      return;
    }
    const up = row.querySelector<HTMLButtonElement>('button[data-move="up"]');
    const down = row.querySelector<HTMLButtonElement>(
      'button[data-move="down"]',
    );
    const preferred = delta === -1 ? up : down;
    const fallback = delta === -1 ? down : up;
    (preferred && !preferred.disabled ? preferred : fallback)?.focus();
  };

  const membership = $derived(committed.map((session) => session.id).join(''));

  let previousMembership = '';
  $effect(() => {
    // Session membership changed: discard any stale drag/preview state so a
    // gesture can never write into the wrong set.
    const signature = membership;
    untrack(() => {
      if (signature !== previousMembership) {
        previousMembership = signature;
        cancelDrag();
      }
    });
  });

  onDestroy(() => {
    cleanupDrag();
  });
</script>

<ul
  class="grouped-list"
  aria-label="Training sessions"
  aria-busy={pending || reorderPending}
  bind:this={listElement}
>
  {#each displayed as item, index (item.id)}
    <li
      class="grouped-row session-row"
      class:session-row-preview={previewIds !== null &&
        item.id === drag?.sessionId}
      data-session-id={item.id}
    >
      <button
        class="list-button"
        type="button"
        onclick={() => onOpenSession(item.id)}
        ><span class="row-copy"
          ><strong>{item.name}</strong><small
            >{item.exercises.length}
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
      ><span class="reorder-controls"
        ><button
          class="quiet"
          type="button"
          data-move="up"
          aria-label={`Move ${item.name} up`}
          disabled={controlsDisabled || index === 0}
          onclick={() => void move(item.id, -1)}
          ><span aria-hidden="true">↑</span></button
        ><button
          class="quiet"
          type="button"
          data-move="down"
          aria-label={`Move ${item.name} down`}
          disabled={controlsDisabled || index === displayed.length - 1}
          onclick={() => void move(item.id, 1)}
          ><span aria-hidden="true">↓</span></button
        ><button
          class="reorder-handle"
          type="button"
          aria-label={`Reorder ${item.name}`}
          disabled={controlsDisabled}
          onpointerdown={(event) => onHandlePointerDown(event, item.id)}
          ><svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            ><path
              d="M8 6h.01M16 6h.01M8 12h.01M16 12h.01M8 18h.01M16 18h.01"
              stroke="currentColor"
              stroke-width="3"
              stroke-linecap="round"
            /></svg
          ></button
        ></span
      >
    </li>
  {/each}
</ul>
<p class="sr-only" role="status">{announcement}</p>
