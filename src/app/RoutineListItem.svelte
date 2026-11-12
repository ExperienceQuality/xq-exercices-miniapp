<script lang="ts">
  // FIT-113 / FIT-117: swipe reveal (64px, axis lock 10px, pan-y) and
  // persistent ≥52px Delete; reduced-motion snaps without slide dependency.
  import type { RoutineV2 } from '../fitness/domain/model';

  const AXIS_LOCK_PX = 10;
  const REVEAL_PX = 64;
  const SNAP_OPEN_PX = 32;

  let {
    routine,
    revealed = false,
    onOpen,
    onDelete,
    onReveal,
    onCloseReveal,
  }: {
    routine: RoutineV2;
    revealed?: boolean;
    onOpen: (id: string) => void;
    onDelete: (id: string, name: string) => void;
    onReveal: (id: string) => void;
    onCloseReveal: () => void;
  } = $props();

  let dragOffset = $state(0);
  let suppressNextOpenClick = $state(false);
  let gesture = $state<{
    pointerId: number;
    routineId: string;
    handle: HTMLElement;
    startX: number;
    startY: number;
    origin: number;
    axis: 'undecided' | 'horizontal' | 'vertical';
    moved: boolean;
  } | null>(null);

  const reducedMotion = () =>
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const sessionLabel = $derived(
    routine.sessions.length === 1 ? 'session' : 'sessions',
  );

  // While a gesture is active, follow the finger; otherwise mirror parent
  // reveal state (writable-derived pattern — no $effect sync).
  let offset = $derived(gesture ? dragOffset : revealed ? REVEAL_PX : 0);

  const clampReveal = (value: number) =>
    Math.min(REVEAL_PX, Math.max(0, value));

  const endGesture = (pointerId: number, commit: boolean) => {
    if (!gesture || gesture.pointerId !== pointerId) return;
    const wasHorizontal = gesture.axis === 'horizontal';
    const moved = gesture.moved;
    const routineId = gesture.routineId;
    const finalOffset = dragOffset;
    gesture = null;
    window.removeEventListener('pointermove', onWindowPointerMove);
    window.removeEventListener('pointerup', onWindowPointerUp);
    window.removeEventListener('pointercancel', onWindowPointerCancel);
    if (!wasHorizontal) {
      dragOffset = revealed ? REVEAL_PX : 0;
      return;
    }
    if (moved) suppressNextOpenClick = true;
    if (!commit) {
      dragOffset = revealed ? REVEAL_PX : 0;
      return;
    }
    if (finalOffset >= SNAP_OPEN_PX) {
      dragOffset = REVEAL_PX;
      onReveal(routineId);
    } else {
      dragOffset = 0;
      if (revealed) onCloseReveal();
    }
  };

  const onWindowPointerMove = (event: PointerEvent) => {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    if (gesture.axis === 'undecided') {
      if (Math.hypot(dx, dy) < AXIS_LOCK_PX) return;
      const axis = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
      gesture = { ...gesture, axis };
      if (axis === 'vertical') return;
      // Capture only after horizontal lock so plain taps still click the row.
      try {
        gesture.handle.setPointerCapture(event.pointerId);
      } catch {
        // Optional on unsupported hosts.
      }
    }
    if (gesture.axis !== 'horizontal') return;
    event.preventDefault();
    gesture = { ...gesture, moved: true };
    // Leftward only: positive offset reveals Delete under the row.
    dragOffset = clampReveal(gesture.origin - dx);
  };

  const onWindowPointerUp = (event: PointerEvent) => {
    endGesture(event.pointerId, true);
  };

  const onWindowPointerCancel = (event: PointerEvent) => {
    endGesture(event.pointerId, false);
  };

  const onSurfacePointerDown = (event: PointerEvent) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (gesture) return;
    // Never begin a swipe from the persistent Delete control.
    if (
      (event.target as Element | null)?.closest?.(
        'button.routine-persistent-delete',
      )
    )
      return;
    dragOffset = offset;
    gesture = {
      pointerId: event.pointerId,
      routineId: routine.id,
      handle: event.currentTarget as HTMLElement,
      startX: event.clientX,
      startY: event.clientY,
      origin: offset,
      axis: 'undecided',
      moved: false,
    };
    window.addEventListener('pointermove', onWindowPointerMove);
    window.addEventListener('pointerup', onWindowPointerUp);
    window.addEventListener('pointercancel', onWindowPointerCancel);
  };

  const onOpenClick = () => {
    if (suppressNextOpenClick) {
      suppressNextOpenClick = false;
      return;
    }
    if (revealed) {
      onCloseReveal();
      return;
    }
    onOpen(routine.id);
  };
</script>

<li
  class="grouped-row routine-row"
  class:routine-row-revealed={revealed || offset > 0}
  data-routine-id={routine.id}
>
  <div class="routine-reveal" aria-hidden={offset <= 0 ? 'true' : undefined}>
    <button
      class="routine-reveal-delete"
      type="button"
      tabindex={offset > 0 ? 0 : -1}
      aria-label={`Delete ${routine.name}`}
      onclick={() => onDelete(routine.id, routine.name)}>Delete</button
    >
  </div>
  <div
    class="routine-swipe-track"
    class:routine-swipe-snap={!reducedMotion() && !gesture}
    style={`transform: translateX(${-offset}px)`}
  >
    <div
      class="routine-swipe-surface"
      role="group"
      aria-label={routine.name}
      style="touch-action: pan-y"
      onpointerdown={onSurfacePointerDown}
    >
      <button class="list-button" type="button" onclick={onOpenClick}
        ><span class="row-copy"
          ><strong>{routine.name}</strong><small
            >{routine.sessions.length} {sessionLabel}</small
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
    </div>
    <button
      class="routine-persistent-delete"
      type="button"
      aria-label={`Delete ${routine.name}`}
      onclick={(event) => {
        event.stopPropagation();
        onDelete(routine.id, routine.name);
      }}>Delete</button
    >
  </div>
</li>
