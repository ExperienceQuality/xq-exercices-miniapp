<script lang="ts" generics="T extends { id: string; name: string }">
  import { onDestroy, tick, untrack } from 'svelte';
  import type { Snippet } from 'svelte';

  let {
    items,
    listLabel,
    kind,
    onReorder,
    reorderPending = false,
    children,
    actions,
  }: {
    items: readonly T[];
    listLabel: string;
    kind: 'session' | 'exercise';
    onReorder: (ids: readonly string[]) => Promise<void>;
    reorderPending?: boolean;
    children: Snippet<[T]>;
    actions?: Snippet<[T]>;
  } = $props();

  const DRAG_THRESHOLD_PX = 6;
  const EDGE_ZONE_PX = 56;
  const MAX_SCROLL_PX_PER_FRAME = 14;

  // The adapter passes `items` already in canonical order; this component
  // never sorts them and never holds domain knowledge.
  const committed = $derived(items);
  let previewIds = $state<readonly string[] | null>(null);
  let pending = $state(false);
  let announcement = $state('');
  let listElement = $state<HTMLUListElement | undefined>(undefined);
  let menuElement = $state<HTMLElement | undefined>(undefined);
  interface MenuState {
    id: string;
    anchorTop: number;
    anchorBottom: number;
    anchorLeft: number;
    top: number;
    left: number;
  }
  let menu = $state<MenuState | null>(null);
  // A completed drag still produces a click on the grip; that click must
  // never open the move menu.
  let suppressNextGripClick = $state(false);

  const rowAttr = $derived(`data-${kind}-id`);
  // Unique per component instance so aria-describedby stays valid even if
  // two lists ever coexist.
  const hintId = $props.id();

  const displayed = $derived(
    previewIds
      ? previewIds
          .map((id) => committed.find((item) => item.id === id))
          .filter((item): item is T => Boolean(item))
      : committed,
  );
  const controlsDisabled = $derived(
    pending || reorderPending || committed.length < 2,
  );

  interface DragState {
    pointerId: number;
    handle: HTMLElement;
    itemId: string;
    startY: number;
    currentY: number;
    dragging: boolean;
    startIndex: number;
    frame: number;
  }
  let drag = $state<DragState | null>(null);

  const committedIds = () => committed.map((item) => item.id);

  const rows = () =>
    Array.from(
      listElement?.querySelectorAll<HTMLElement>(`li[${rowAttr}]`) ?? [],
    );

  const gripFor = (itemId: string) =>
    listElement?.querySelector<HTMLElement>(
      `li[${rowAttr}="${CSS.escape(itemId)}"] .reorder-grip`,
    );

  const previewFor = (itemId: string, targetIndex: number): string[] => {
    const without = displayed
      .filter((item) => item.id !== itemId)
      .map((item) => item.id);
    without.splice(
      Math.max(0, Math.min(without.length, targetIndex)),
      0,
      itemId,
    );
    return without;
  };

  const indexFromPoint = (clientY: number, itemId: string): number => {
    const others = displayed.filter((item) => item.id !== itemId);
    for (const row of rows()) {
      const rowId = row.getAttribute(rowAttr);
      if (rowId === itemId) continue;
      const bounds = row.getBoundingClientRect();
      // Variable-height rows: midpoint hit-testing stays correct even
      // when wrapped rows differ in height.
      if (clientY < bounds.top + bounds.height / 2) {
        const index = others.findIndex((item) => item.id === rowId);
        return index < 0 ? others.length : index;
      }
    }
    return others.length;
  };

  const updatePreview = () => {
    if (!drag?.dragging) return;
    previewIds = previewFor(
      drag.itemId,
      indexFromPoint(drag.currentY, drag.itemId),
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
    // A cancelled drag may still emit a trailing click on the grip; it
    // must not open the move menu.
    if (drag?.dragging) suppressNextGripClick = true;
    cleanupDrag();
    previewIds = null;
  };

  const closeMenu = (returnFocus: boolean) => {
    const open = menu;
    menu = null;
    if (open && returnFocus) {
      void tick().then(() => gripFor(open.id)?.focus());
    }
  };

  const openMenu = (itemId: string, grip: HTMLElement) => {
    if (controlsDisabled || drag) return;
    const bounds = grip.getBoundingClientRect();
    // Initial guess anchors the menu below the grip's left edge; the
    // layout effect below measures the rendered menu and clamps it inside
    // the viewport (the element is portalled to <body>, so grouped-list
    // overflow can never clip it). Only custom properties carry position —
    // all other geometry lives in shared CSS.
    menu = {
      id: itemId,
      anchorTop: bounds.top,
      anchorBottom: bounds.bottom,
      anchorLeft: bounds.left,
      top: bounds.bottom,
      left: bounds.left,
    };
  };

  const commit = async (
    ids: readonly string[],
    movedName: string,
    movedIndex: number,
  ) => {
    pending = true;
    // Announce the in-flight save so pending time is not silent.
    announcement = `Moving ${movedName}…`;
    try {
      await onReorder(ids);
      // Clear, flush, then set so assistive tech announces again when a
      // repeated move produces an identical message.
      announcement = '';
      await tick();
      announcement = `${movedName} moved to position ${movedIndex + 1}.`;
    } catch {
      // The adapter propagates the rejection to the parent, which surfaces
      // a visible error; the preview rolls back and the failure is also
      // announced accessibly here.
      announcement = '';
      await tick();
      announcement = `Could not move ${movedName}.`;
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
    suppressNextGripClick = true;
    const ids = previewIds ?? committedIds();
    const targetIndex = ids.indexOf(state.itemId);
    if (targetIndex < 0 || targetIndex === state.startIndex) {
      previewIds = null;
      return;
    }
    const name = committed.find((item) => item.id === state.itemId)?.name ?? '';
    void commit(ids, name, targetIndex);
  };

  const onHandlePointerDown = (event: PointerEvent, itemId: string) => {
    if (controlsDisabled || drag) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const startIndex = committed.findIndex((item) => item.id === itemId);
    if (startIndex < 0) return;
    const handle = event.currentTarget as HTMLElement;
    menu = null;
    // A fresh pointer gesture resets the sticky suppression left by a
    // completed or cancelled drag — only that drag's own trailing click is
    // ignored, never the next tap.
    suppressNextGripClick = false;
    event.preventDefault();
    try {
      handle.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture may be unsupported; dragging still works via events.
    }
    drag = {
      pointerId: event.pointerId,
      handle,
      itemId,
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

  const onGripClick = (
    event: MouseEvent,
    itemId: string,
    grip: HTMLElement,
  ) => {
    // Only a genuine pointer trailing click (detail > 0) is suppressed;
    // keyboard/programmatic clicks (detail 0, e.g. AT activation) always
    // open the menu and leave the flag for a later real pointer click.
    if (suppressNextGripClick && event.detail > 0) {
      suppressNextGripClick = false;
      return;
    }
    if (menu?.id === itemId) {
      closeMenu(true);
    } else {
      openMenu(itemId, grip);
    }
  };

  const onGripKeydown = (event: KeyboardEvent, itemId: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      // Keyboard activation resets stale drag-click suppression so the
      // resulting click opens the menu as usual.
      suppressNextGripClick = false;
      return;
    }
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      // While a menu is open arrow keys navigate it; they never move.
      if (menu) return;
      void move(itemId, event.key === 'ArrowUp' ? -1 : 1);
    }
  };

  const menuOptions = () =>
    Array.from(
      menuElement?.querySelectorAll<HTMLButtonElement>(
        'button:not([disabled])',
      ) ?? [],
    );

  const onMenuKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Tab') {
      // The portalled menu sits at the end of <body>: a default Tab would
      // strand focus in browser chrome. Return focus to the grip instead;
      // the next Tab then advances normally from the list (Shift+Tab
      // takes the same path — the menu never traps).
      event.preventDefault();
      closeMenu(true);
      return;
    }
    if (
      event.key !== 'ArrowUp' &&
      event.key !== 'ArrowDown' &&
      event.key !== 'Home' &&
      event.key !== 'End'
    ) {
      return;
    }
    event.preventDefault();
    const options = menuOptions();
    if (options.length === 0) return;
    const active = document.activeElement;
    const index = options.findIndex((option) => option === active);
    let next: number;
    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = options.length - 1;
    else if (event.key === 'ArrowDown') next = (index + 1) % options.length;
    else next = (index - 1 + options.length) % options.length;
    options[next]?.focus();
  };

  const move = async (itemId: string, delta: -1 | 1) => {
    if (controlsDisabled) return;
    const ids = committedIds();
    const from = ids.indexOf(itemId);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to]!, ids[from]!];
    const name = committed[from]!.name;
    await commit(ids, name, to);
    // Keep focus with the moved item's grip. The activated control may
    // have blurred to the body when the pending state disabled it; never
    // touch focus after the list has unmounted, and never steal focus the
    // user deliberately moved elsewhere mid-save.
    await tick();
    const row = listElement?.querySelector<HTMLElement>(
      `li[${rowAttr}="${CSS.escape(itemId)}"]`,
    );
    const grip = row?.querySelector<HTMLElement>('.reorder-grip');
    if (!row?.isConnected || !grip) return;
    const active = document.activeElement;
    if (active !== document.body && active !== null && !row.contains(active)) {
      return;
    }
    if (
      active instanceof HTMLButtonElement &&
      !active.disabled &&
      row.contains(active)
    ) {
      return;
    }
    grip.focus();
  };

  const moveFromMenu = (itemId: string, delta: -1 | 1) => {
    menu = null;
    void move(itemId, delta);
  };

  // JSON.stringify keeps the signature unambiguous: arbitrary item IDs
  // could concatenate identically ('ab'+'c' vs 'a'+'bc').
  const membership = $derived(JSON.stringify(committed.map((item) => item.id)));

  let previousMembership = '';
  $effect(() => {
    // Membership changed: discard any stale drag/preview/menu state so a
    // gesture can never write into the wrong set.
    const signature = membership;
    untrack(() => {
      if (signature !== previousMembership) {
        previousMembership = signature;
        cancelDrag();
        menu = null;
      }
    });
  });

  // Once the menu renders, measure it and clamp the custom-property
  // position inside the viewport (flip above the grip when it would
  // overflow below), then move focus to the first enabled item so
  // keyboard users land in the menu — arrows navigate there, not the grip.
  $effect(() => {
    if (!menu || !menuElement) return;
    const open = menu;
    const element = menuElement;
    const rect = element.getBoundingClientRect();
    const margin = 16;
    const viewportWidth =
      window.innerWidth || document.documentElement.clientWidth;
    const viewportHeight =
      window.innerHeight || document.documentElement.clientHeight;
    const left = Math.min(
      Math.max(margin, open.anchorLeft),
      Math.max(margin, viewportWidth - margin - rect.width),
    );
    const fitsBelow =
      open.anchorBottom + rect.height <= viewportHeight - margin;
    const top = fitsBelow
      ? open.anchorBottom
      : Math.max(margin, open.anchorTop - rect.height);
    if (top !== open.top || left !== open.left) {
      menu = { ...open, top, left };
    }
    if (!element.contains(document.activeElement)) {
      element
        .querySelector<HTMLButtonElement>('button:not([disabled])')
        ?.focus();
    }
  });

  // An open menu is dismissed by outside interaction or Escape (which
  // returns focus to the grip); it is also suppressed while a reorder save
  // is pending.
  $effect(() => {
    if (!menu) return;
    const open = menu;
    const onOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node) {
        if (menuElement?.contains(target)) return;
        if (gripFor(open.id)?.contains(target)) return;
      }
      // Anything else — including a non-element target such as the window
      // itself — counts as outside. Close, then return focus to the grip
      // only if the browser's default handling did not intentionally move
      // focus onto an interactive control (or into a newly opened
      // dialog). A programmatically focusable non-control such as an
      // h1[tabindex="-1"] is not a deliberate destination.
      const grip = gripFor(open.id);
      menu = null;
      setTimeout(() => {
        if (!grip?.isConnected) return;
        // A drag started on another grip meanwhile — its gesture owns
        // focus now; never pull focus back to the dismissed menu's grip.
        if (drag) return;
        const active = document.activeElement;
        if (!active || isInteractiveTarget(active)) return;
        grip.focus();
      }, 0);
    };
    const onMenuEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      menu = null;
      void tick().then(() => gripFor(open.id)?.focus());
    };
    window.addEventListener('pointerdown', onOutsidePointerDown, true);
    window.addEventListener('keydown', onMenuEscape, true);
    return () => {
      window.removeEventListener('pointerdown', onOutsidePointerDown, true);
      window.removeEventListener('keydown', onMenuEscape, true);
    };
  });

  $effect(() => {
    if (controlsDisabled && menu) menu = null;
  });

  // Deliberate focus destinations: enabled form controls, links,
  // editable regions, and anything inside an open dialog. body,
  // documentElement, and non-interactive elements (even ones with
  // tabindex="-1") do not count.
  const isInteractiveTarget = (element: Element): boolean => {
    if (!(element instanceof HTMLElement)) return false;
    if (element === document.body || element === document.documentElement) {
      return false;
    }
    if (element.closest('[role="dialog"], [role="alertdialog"]')) {
      return true;
    }
    const control = element.closest(
      'button, input, textarea, select, a[href], [contenteditable=""], [contenteditable="true"]',
    );
    if (!control) return false;
    if (
      control instanceof HTMLButtonElement ||
      control instanceof HTMLInputElement ||
      control instanceof HTMLTextAreaElement ||
      control instanceof HTMLSelectElement
    ) {
      return !control.disabled;
    }
    return true;
  };

  // The menu is portalled to <body> so it can never be clipped by
  // grouped-list overflow; CSS positions it with the custom properties set
  // on the element and keeps it inside the viewport.
  const portal = (element: HTMLElement) => {
    document.body.appendChild(element);
    return {
      destroy() {
        element.remove();
      },
    };
  };

  onDestroy(() => {
    cleanupDrag();
  });
</script>

<ul
  class="grouped-list"
  aria-label={listLabel}
  aria-busy={pending || reorderPending}
  bind:this={listElement}
>
  {#each displayed as item, index (item.id)}
    <li
      class="grouped-row reorderable-item {kind}-row"
      class:reorderable-preview={previewIds !== null &&
        item.id === drag?.itemId}
      {...{ [rowAttr]: item.id }}
    >
      <div class="reorderable-main">
        {@render children(item)}<button
          class="reorder-grip"
          type="button"
          aria-label={`Reorder ${item.name}`}
          aria-describedby={hintId}
          aria-keyshortcuts="ArrowUp ArrowDown Enter"
          aria-haspopup="menu"
          aria-expanded={menu?.id === item.id}
          disabled={controlsDisabled}
          onpointerdown={(event) => onHandlePointerDown(event, item.id)}
          onclick={(event) =>
            onGripClick(event, item.id, event.currentTarget as HTMLElement)}
          onkeydown={(event) => onGripKeydown(event, item.id)}
          ><svg
            width="28"
            height="28"
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
        >
      </div>
      {#if actions}
        <div class="reorder-actions">{@render actions(item)}</div>
      {/if}
      {#if menu?.id === item.id}
        <div
          class="reorder-menu"
          role="menu"
          aria-label={`Move ${item.name}`}
          tabindex="-1"
          style={`--reorder-menu-top:${menu.top}px;--reorder-menu-left:${menu.left}px`}
          bind:this={menuElement}
          use:portal
          onkeydown={onMenuKeydown}
        >
          <button
            type="button"
            role="menuitem"
            disabled={index === 0}
            onclick={() => moveFromMenu(item.id, -1)}>Move earlier</button
          >
          <button
            type="button"
            role="menuitem"
            disabled={index === displayed.length - 1}
            onclick={() => moveFromMenu(item.id, 1)}>Move later</button
          >
        </div>
      {/if}
    </li>
  {/each}
</ul>
<span id={hintId} class="sr-only"
  >Use arrow keys to move, or press Enter for move options.</span
>
<p class="sr-only" role="status">{announcement}</p>
