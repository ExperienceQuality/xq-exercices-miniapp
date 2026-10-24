import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';

import Harness from './ReorderableListHarness.svelte';
import type { HarnessItem } from './ReorderableListHarness.svelte';

const item = (id: string, name: string, detail?: string): HarnessItem => ({
  id,
  name,
  detail,
});

const renderList = (
  items: HarnessItem[],
  onReorder = vi.fn(async () => {}),
  options: {
    kind?: 'session' | 'exercise';
    listLabel?: string;
    reorderPending?: boolean;
  } = {},
) => {
  render(Harness, {
    props: {
      items,
      onReorder,
      kind: options.kind ?? 'session',
      listLabel: options.listLabel ?? 'Training sessions',
      reorderPending: options.reorderPending ?? false,
    },
  });
  return { onReorder };
};

const pointer = (
  type: string,
  init: MouseEventInit & { pointerId?: number; pointerType?: string } = {},
) => {
  const { pointerId, pointerType, ...mouseInit } = init;
  const event = new MouseEvent(type, {
    bubbles: true,
    button: 0,
    ...mouseInit,
  });
  if (pointerId !== undefined) Object.assign(event, { pointerId });
  if (pointerType !== undefined) Object.assign(event, { pointerType });
  return event;
};

const grip = (name: string) =>
  screen.getByRole('button', { name: `Reorder ${name}` });

const rowOf = (name: string) => grip(name).closest('li')!;

describe('ReorderableList', () => {
  // FIT-094 (RUI-AC-18): row anatomy — primary snippet content plus one
  // grip in .reorderable-main, optional actions on their own row below,
  // and no visible arrow buttons.
  it('renders snippet content, one grip, and actions row with no arrow buttons', () => {
    renderList([
      item('a', 'Alpha', '3 exercises'),
      item('b', 'Beta', '1 exercise'),
    ]);
    const row = rowOf('Alpha');
    expect(row.dataset.sessionId).toBe('a');
    expect(row.className).toContain('grouped-row');
    expect(row.className).toContain('reorderable-item');
    expect(row.className).toContain('session-row');
    const main = row.querySelector('.reorderable-main')!;
    expect(main.contains(row.querySelector('.row-copy')!)).toBe(true);
    expect(main.contains(grip('Alpha'))).toBe(true);
    const actions = row.querySelector('.reorder-actions')!;
    expect(actions.textContent).toContain('Open Alpha');
    // No visible up/down arrow controls exist in the new affordance.
    expect(row.querySelectorAll('[data-move]')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /up|down/i })).toBeNull();
    expect(
      screen.getByRole('list', { name: 'Training sessions' }),
    ).toBeTruthy();
  });

  // FIT-094 (RUI-AC-18): kind selects the row data attribute and class so
  // the same component serves both lists.
  it('uses exercise attributes and label for kind=exercise', () => {
    renderList([item('x', 'Squat'), item('y', 'Bench')], undefined, {
      kind: 'exercise',
      listLabel: 'Exercises',
    });
    expect(screen.getByRole('list', { name: 'Exercises' })).toBeTruthy();
    const row = rowOf('Squat');
    expect(row.dataset.exerciseId).toBe('x');
    expect(row.dataset.sessionId).toBeUndefined();
    expect(row.className).toContain('exercise-row');
  });

  // FIT-087 (RUI-AC-11): a pointer drag that crosses the threshold
  // reorders the preview and commits the new ID order once.
  it('commits a pointer drag that crosses the movement threshold', async () => {
    const { onReorder } = renderList([
      item('a', 'Alpha'),
      item('b', 'Beta'),
      item('c', 'Gamma'),
    ]);
    const handle = grip('Alpha');
    await fireEvent(handle, pointer('pointerdown', { clientY: 10 }));
    await fireEvent(handle, pointer('pointermove', { clientY: 80 }));
    // Live preview shows the new order before the drop lands.
    const list = screen.getByRole('list', { name: 'Training sessions' });
    const order = () =>
      Array.from(list.querySelectorAll('li[data-session-id]')).map(
        (row) => (row as HTMLElement).dataset.sessionId,
      );
    expect(order()).toEqual(['b', 'c', 'a']);
    await fireEvent(handle, pointer('pointerup', { clientY: 80 }));
    await vi.waitFor(() =>
      expect(onReorder).toHaveBeenCalledWith(['b', 'c', 'a']),
    );
    expect(onReorder).toHaveBeenCalledTimes(1);
  });

  // FIT-088 (RUI-AC-12): a touch-pointer drag drives the same pipeline;
  // trusted CDP proof lives in the browser lane.
  it('commits a touch-pointer drag through the same pipeline', async () => {
    const { onReorder } = renderList([item('a', 'Alpha'), item('b', 'Beta')]);
    const handle = grip('Alpha');
    await fireEvent(
      handle,
      pointer('pointerdown', {
        clientY: 10,
        pointerId: 7,
        pointerType: 'touch',
      }),
    );
    await fireEvent(
      handle,
      pointer('pointermove', {
        clientY: 60,
        pointerId: 7,
        pointerType: 'touch',
      }),
    );
    await fireEvent(
      handle,
      pointer('pointerup', { clientY: 60, pointerId: 7, pointerType: 'touch' }),
    );
    await vi.waitFor(() => expect(onReorder).toHaveBeenCalledWith(['b', 'a']));
  });

  // FIT-089 (RUI-AC-13): a release below the 6px threshold never commits.
  it('writes nothing when the pointer never crosses the threshold', async () => {
    const { onReorder } = renderList([item('a', 'Alpha'), item('b', 'Beta')]);
    const handle = grip('Alpha');
    await fireEvent(handle, pointer('pointerdown', { clientY: 10 }));
    await fireEvent(handle, pointer('pointermove', { clientY: 12 }));
    await fireEvent(handle, pointer('pointerup', { clientY: 12 }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onReorder).not.toHaveBeenCalled();
  });

  // FIT-090 (RUI-AC-14): Escape discards the preview and removes the
  // gesture; the later release writes nothing.
  it('cancels an in-progress drag with Escape and writes nothing', async () => {
    const { onReorder } = renderList([
      item('a', 'Alpha'),
      item('b', 'Beta'),
      item('c', 'Gamma'),
    ]);
    const handle = grip('Alpha');
    const list = screen.getByRole('list', { name: 'Training sessions' });
    await fireEvent(handle, pointer('pointerdown', { clientY: 10 }));
    await fireEvent(handle, pointer('pointermove', { clientY: 80 }));
    await fireEvent.keyDown(window, { key: 'Escape' });
    const order = Array.from(list.querySelectorAll('li[data-session-id]')).map(
      (row) => (row as HTMLElement).dataset.sessionId,
    );
    expect(order).toEqual(['a', 'b', 'c']);
    await fireEvent(handle, pointer('pointerup', { clientY: 80 }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onReorder).not.toHaveBeenCalled();
  });

  // FIT-090 (RUI-AC-14): pointercancel from the gesture's own pointer
  // cancels; a different pointer's cancel is ignored.
  it('honours pointercancel only from the active pointer', async () => {
    const { onReorder } = renderList([
      item('a', 'Alpha'),
      item('b', 'Beta'),
      item('c', 'Gamma'),
    ]);
    const handle = grip('Alpha');
    await fireEvent(
      handle,
      pointer('pointerdown', { clientY: 10, pointerId: 1 }),
    );
    await fireEvent(
      handle,
      pointer('pointermove', { clientY: 80, pointerId: 1 }),
    );
    await fireEvent(handle, pointer('pointercancel', { pointerId: 2 }));
    await fireEvent(
      handle,
      pointer('pointerup', { clientY: 80, pointerId: 1 }),
    );
    await vi.waitFor(() =>
      expect(onReorder).toHaveBeenCalledWith(['b', 'c', 'a']),
    );

    const second = vi.fn(async () => {});
    render(Harness, {
      props: {
        items: [item('x', 'One'), item('y', 'Two')],
        onReorder: second,
      },
    });
    const gripTwo = screen.getByRole('button', { name: 'Reorder One' });
    await fireEvent(
      gripTwo,
      pointer('pointerdown', { clientY: 10, pointerId: 3 }),
    );
    await fireEvent(
      gripTwo,
      pointer('pointermove', { clientY: 80, pointerId: 3 }),
    );
    await fireEvent(gripTwo, pointer('pointercancel', { pointerId: 3 }));
    await fireEvent(
      gripTwo,
      pointer('pointerup', { clientY: 80, pointerId: 3 }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(second).not.toHaveBeenCalled();
  });

  // FIT-090 (RUI-AC-14): a membership change mid-gesture cancels the drag
  // even when ID sets collide under naive concatenation ('ab'+'c' ===
  // 'a'+'bc'); the release after the change writes nothing.
  it('cancels a drag when item membership changes mid-gesture', async () => {
    const onReorder = vi.fn(async () => {});
    const { rerender } = render(Harness, {
      props: {
        items: [item('ab', 'Alpha'), item('c', 'Beta')],
        onReorder,
      },
    });
    const handle = grip('Alpha');
    await fireEvent(handle, pointer('pointerdown', { clientY: 10 }));
    await fireEvent(handle, pointer('pointermove', { clientY: 80 }));
    await rerender({
      items: [item('a', 'Alpha'), item('bc', 'Beta')],
      onReorder,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fireEvent(window, pointer('pointerup', { clientY: 80 }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onReorder).not.toHaveBeenCalled();
  });

  // FIT-090 (RUI-AC-14): unmounting mid-drag cleans up window listeners so
  // a later pointerup cannot write.
  it('cleans up the gesture on unmount', async () => {
    const onReorder = vi.fn(async () => {});
    const view = render(Harness, {
      props: { items: [item('a', 'Alpha'), item('b', 'Beta')], onReorder },
    });
    const handle = grip('Alpha');
    await fireEvent(handle, pointer('pointerdown', { clientY: 10 }));
    await fireEvent(handle, pointer('pointermove', { clientY: 80 }));
    view.unmount();
    await fireEvent(window, pointer('pointerup', { clientY: 80 }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onReorder).not.toHaveBeenCalled();
  });

  // FIT-091 (RUI-AC-15): dropping back on the original position is a
  // no-op even though the drag itself was real.
  it('writes nothing when the drag ends at the original position', async () => {
    // jsdom rows have no layout; give each row a 50px band so midpoint
    // hit-testing behaves like a real list.
    const rect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        const tops: Record<string, number> = { a: 0, b: 50, c: 100 };
        const top = this.dataset?.sessionId
          ? (tops[this.dataset.sessionId] ?? 0)
          : 0;
        return {
          top,
          bottom: top + 50,
          height: 50,
          left: 0,
          right: 100,
          width: 100,
          x: 0,
          y: top,
          toJSON: () => ({}),
        } as DOMRect;
      });
    try {
      const { onReorder } = renderList([
        item('a', 'Alpha'),
        item('b', 'Beta'),
        item('c', 'Gamma'),
      ]);
      const handle = grip('Beta');
      await fireEvent(handle, pointer('pointerdown', { clientY: 60 }));
      // Real drag away from the start position...
      await fireEvent(handle, pointer('pointermove', { clientY: 160 }));
      // ...then back into Beta's own band, and release.
      await fireEvent(handle, pointer('pointermove', { clientY: 60 }));
      await fireEvent(handle, pointer('pointerup', { clientY: 60 }));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(onReorder).not.toHaveBeenCalled();
    } finally {
      rect.mockRestore();
    }
  });

  // FIT-092 (RUI-AC-16): dragging near the viewport edge drives the
  // animation-frame autoscroll; cancelling that drag writes nothing.
  it('autoscrolls near the viewport edge and cancels cleanly', async () => {
    const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {});
    const onReorder = vi.fn(async () => {});
    try {
      renderList([item('a', 'Alpha'), item('b', 'Beta')], onReorder);
      const handle = grip('Alpha');
      await fireEvent(handle, pointer('pointerdown', { clientY: 10 }));
      await fireEvent(handle, pointer('pointermove', { clientY: 30 }));
      // Park inside the top edge zone and let a frame run.
      await fireEvent(handle, pointer('pointermove', { clientY: 30 }));
      await vi.waitFor(() => expect(scrollBy).toHaveBeenCalled());
      expect(scrollBy.mock.calls[0]![1]).toBeLessThan(0);
      await fireEvent.keyDown(window, { key: 'Escape' });
      await fireEvent(window, pointer('pointerup', { clientY: 30 }));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(onReorder).not.toHaveBeenCalled();
    } finally {
      scrollBy.mockRestore();
    }
  });

  // FIT-093 (RUI-AC-17): pointer activity that starts off the grip never
  // begins a drag and never activates a reorder.
  it('ignores pointer gestures that start outside the grip', async () => {
    const { onReorder } = renderList([item('a', 'Alpha'), item('b', 'Beta')]);
    const body = rowOf('Alpha').querySelector('.row-copy')!;
    await fireEvent(body, pointer('pointerdown', { clientY: 10 }));
    await fireEvent(body, pointer('pointermove', { clientY: 80 }));
    await fireEvent(body, pointer('pointerup', { clientY: 80 }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onReorder).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  // FIT-095 (RUI-AC-19): a grip tap (pointerdown/up without crossing the
  // threshold, then click) opens the move menu; Enter opens it too; a
  // completed drag release never opens it.
  it('opens the move menu on grip tap and Enter, but not after a drag', async () => {
    renderList([item('a', 'Alpha'), item('b', 'Beta'), item('c', 'Gamma')]);
    const beta = grip('Beta');
    await fireEvent(beta, pointer('pointerdown', { clientY: 40 }));
    await fireEvent(beta, pointer('pointerup', { clientY: 41 }));
    await fireEvent.click(beta);
    const menu = screen.getByRole('menu', { name: 'Move Beta' });
    expect(screen.getByRole('menuitem', { name: 'Move earlier' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Move later' })).toBeTruthy();
    // Outside interaction dismisses without mutation.
    await fireEvent(window, pointer('pointerdown'));
    await vi.waitFor(() => expect(screen.queryByRole('menu')).toBeNull());

    await fireEvent.keyDown(grip('Gamma'), { key: 'Enter' });
    await fireEvent.click(grip('Gamma'));
    expect(screen.getByRole('menu', { name: 'Move Gamma' })).toBeTruthy();
    await fireEvent.keyDown(window, { key: 'Escape' });
    await vi.waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(document.activeElement).toBe(grip('Gamma'));

    // A released drag must not open the menu via its trailing click
    // (real pointer clicks carry detail > 0).
    const alpha = grip('Alpha');
    await fireEvent(alpha, pointer('pointerdown', { clientY: 10 }));
    await fireEvent(alpha, pointer('pointermove', { clientY: 80 }));
    await fireEvent(alpha, pointer('pointerup', { clientY: 80 }));
    await fireEvent(
      alpha,
      new MouseEvent('click', { bubbles: true, detail: 1 }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByRole('menu')).toBeNull();
    expect(menu).toBeTruthy();
  });

  // FIT-095/096 (RUI-AC-19/20): opening the menu moves focus into the
  // first enabled item; arrows/Home/End navigate there, Enter activates
  // the focused item through the reorder pipeline, and Tab dismisses the
  // menu without trapping focus.
  it('moves focus into the menu and navigates items with menu keys', async () => {
    const { onReorder } = renderList([
      item('a', 'Alpha'),
      item('b', 'Beta'),
      item('c', 'Gamma'),
    ]);
    const beta = grip('Beta');
    beta.focus();
    await fireEvent.keyDown(beta, { key: 'Enter' });
    await fireEvent.click(beta);
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('menuitem', { name: 'Move earlier' }),
      ),
    );
    await fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(
      screen.getByRole('menuitem', { name: 'Move later' }),
    );
    await fireEvent.keyDown(document.activeElement!, { key: 'End' });
    expect(document.activeElement).toBe(
      screen.getByRole('menuitem', { name: 'Move later' }),
    );
    await fireEvent.keyDown(document.activeElement!, { key: 'Home' });
    expect(document.activeElement).toBe(
      screen.getByRole('menuitem', { name: 'Move earlier' }),
    );
    // Enter activates the focused menu item (a real Enter on a button
    // fires click) — it moves one position via the shared pipeline, not
    // the grip's arrow shortcut.
    await fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    await fireEvent.click(document.activeElement!);
    await vi.waitFor(() =>
      expect(onReorder).toHaveBeenCalledWith(['a', 'c', 'b']),
    );
    await vi.waitFor(() => expect(document.activeElement).toBe(grip('Beta')));

    // Tab returns focus to the grip (the portalled menu sits at the end
    // of <body>, so a default Tab would strand focus in browser chrome);
    // Shift+Tab takes the same path and the menu never traps.
    await fireEvent.click(grip('Alpha'));
    await vi.waitFor(() => expect(screen.getByRole('menu')).toBeTruthy());
    await fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
    await vi.waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await vi.waitFor(() => expect(document.activeElement).toBe(grip('Alpha')));
    await fireEvent.click(grip('Beta'));
    await vi.waitFor(() => expect(screen.getByRole('menu')).toBeTruthy());
    await fireEvent.keyDown(document.activeElement!, {
      key: 'Tab',
      shiftKey: true,
    });
    await vi.waitFor(() => expect(document.activeElement).toBe(grip('Beta')));
    expect(onReorder).toHaveBeenCalledTimes(1);
  });

  // FIT-096 (RUI-AC-20): the portalled menu is clamped inside the
  // viewport — left never exceeds the right edge and it flips above the
  // grip when it would overflow below.
  it('clamps the menu inside the viewport using measured rect', async () => {
    const rect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        if (this.classList?.contains('reorder-menu')) {
          return {
            top: 0,
            bottom: 60,
            height: 60,
            left: 0,
            right: 120,
            width: 120,
            x: 0,
            y: 0,
            toJSON: () => ({}),
          } as DOMRect;
        }
        if (this.classList?.contains('reorder-grip')) {
          // Grip near the bottom-right corner of an 800x600 viewport.
          return {
            top: 570,
            bottom: 590,
            height: 20,
            left: 760,
            right: 780,
            width: 20,
            x: 760,
            y: 570,
            toJSON: () => ({}),
          } as DOMRect;
        }
        return {
          top: 0,
          bottom: 0,
          height: 0,
          left: 0,
          right: 0,
          width: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        } as DOMRect;
      });
    const width = vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(800);
    const height = vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(600);
    try {
      renderList([item('a', 'Alpha'), item('b', 'Beta')]);
      await fireEvent.click(grip('Beta'));
      await vi.waitFor(() => {
        const menu = screen.getByRole('menu');
        // 800 - 16 - 120 = 664: clamped inside the right edge.
        expect(menu.style.getPropertyValue('--reorder-menu-left')).toBe(
          '664px',
        );
        // 600-16-60 = 524 < 590: flipped above the grip (570 - 60 = 510).
        expect(menu.style.getPropertyValue('--reorder-menu-top')).toBe('510px');
      });
    } finally {
      rect.mockRestore();
      width.mockRestore();
      height.mockRestore();
    }
  });

  // FIT-095 (RUI-AC-19): a completed or cancelled drag leaves no sticky
  // suppression — the next fresh tap or Enter press opens the menu.
  it('opens the menu on a fresh tap after a completed or cancelled drag', async () => {
    const onReorder = vi.fn(async () => {});
    renderList([item('a', 'Alpha'), item('b', 'Beta')], onReorder);
    const alpha = grip('Alpha');
    // Complete a real drag without emitting the trailing click.
    await fireEvent(alpha, pointer('pointerdown', { clientY: 10 }));
    await fireEvent(alpha, pointer('pointermove', { clientY: 80 }));
    await fireEvent(alpha, pointer('pointerup', { clientY: 80 }));
    await vi.waitFor(() => expect(onReorder).toHaveBeenCalledTimes(1));
    // A fresh tap still opens the menu.
    await fireEvent(alpha, pointer('pointerdown', { clientY: 10 }));
    await fireEvent(alpha, pointer('pointerup', { clientY: 10 }));
    await fireEvent.click(alpha);
    await vi.waitFor(() => expect(screen.getByRole('menu')).toBeTruthy());
    await fireEvent.keyDown(window, { key: 'Escape' });
    await vi.waitFor(() => expect(screen.queryByRole('menu')).toBeNull());

    // Cancel a drag, then keyboard Enter still opens the menu.
    const beta = grip('Beta');
    await fireEvent(beta, pointer('pointerdown', { clientY: 60 }));
    await fireEvent(beta, pointer('pointermove', { clientY: 120 }));
    await fireEvent.keyDown(window, { key: 'Escape' });
    await fireEvent.keyDown(beta, { key: 'Enter' });
    await fireEvent.click(beta);
    await vi.waitFor(() =>
      expect(screen.getByRole('menu', { name: 'Move Beta' })).toBeTruthy(),
    );
    expect(onReorder).toHaveBeenCalledTimes(1);
  });

  // FIT-095 (RUI-AC-19): a programmatic/AT click (detail 0) after a
  // completed drag that emitted no trailing click still opens the menu —
  // suppression only swallows genuine pointer clicks.
  it('opens the menu on an AT click after a completed drag', async () => {
    const onReorder = vi.fn(async () => {});
    renderList([item('a', 'Alpha'), item('b', 'Beta')], onReorder);
    const alpha = grip('Alpha');
    await fireEvent(alpha, pointer('pointerdown', { clientY: 10 }));
    await fireEvent(alpha, pointer('pointermove', { clientY: 80 }));
    await fireEvent(alpha, pointer('pointerup', { clientY: 80 }));
    await vi.waitFor(() => expect(onReorder).toHaveBeenCalledTimes(1));
    // No trailing click arrived; an assistive-tech click (detail 0) must
    // not be swallowed by the stale suppression flag.
    await fireEvent(
      alpha,
      new MouseEvent('click', { bubbles: true, detail: 0 }),
    );
    await vi.waitFor(() => expect(screen.getByRole('menu')).toBeTruthy());
  });

  // FIT-096 (RUI-AC-20): dismissing a menu by starting a drag on a
  // different grip never pulls focus back to the dismissed menu's grip.
  it('does not steal focus back when dismissal was a different grip drag', async () => {
    const onReorder = vi.fn(async () => {});
    renderList(
      [item('a', 'Alpha'), item('b', 'Beta'), item('c', 'Gamma')],
      onReorder,
    );
    await fireEvent.click(grip('Alpha'));
    await vi.waitFor(() => expect(screen.getByRole('menu')).toBeTruthy());
    // The outside pointerdown on Beta's grip dismisses Alpha's menu and
    // immediately starts Beta's drag gesture.
    const beta = grip('Beta');
    beta.focus();
    await fireEvent(beta, pointer('pointerdown', { clientY: 60 }));
    await fireEvent(beta, pointer('pointermove', { clientY: 120 }));
    await vi.waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.activeElement).not.toBe(grip('Alpha'));
    await fireEvent.keyDown(window, { key: 'Escape' });
    await fireEvent(beta, pointer('pointerup', { clientY: 120 }));
  });

  // FIT-099 (RUI-AC-23): the in-flight save is announced while pending.
  it('announces the in-flight move while the save settles', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    renderList(
      [item('a', 'Alpha'), item('b', 'Beta')],
      vi.fn(() => gate),
    );
    const alpha = grip('Alpha');
    alpha.focus();
    await fireEvent.keyDown(alpha, { key: 'ArrowDown' });
    await vi.waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('Moving Alpha'),
    );
    release();
    await vi.waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain(
        'Alpha moved to position 2.',
      ),
    );
  });

  // FIT-096 (RUI-AC-20): outside dismissal returns focus to the grip —
  // even when the browser's default lands focus on a non-interactive
  // programmatically focusable element like h1[tabindex="-1"] — but never
  // steals focus deliberately placed on a real control or inside a newly
  // opened dialog.
  it('returns focus to the grip after outside dismissal unless a control wins', async () => {
    const onReorder = vi.fn(async () => {});
    renderList([item('a', 'Alpha'), item('b', 'Beta')], onReorder);

    // h1[tabindex="-1"] is not a deliberate destination.
    const heading = document.createElement('h1');
    heading.tabIndex = -1;
    heading.textContent = 'Details';
    document.body.appendChild(heading);
    await fireEvent.click(grip('Alpha'));
    await vi.waitFor(() => expect(screen.getByRole('menu')).toBeTruthy());
    await fireEvent(heading, pointer('pointerdown'));
    heading.focus(); // simulate the browser default focus move
    await vi.waitFor(() => expect(document.activeElement).toBe(grip('Alpha')));
    expect(onReorder).not.toHaveBeenCalled();
    heading.remove();

    // A real control keeps deliberate focus.
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Elsewhere';
    document.body.appendChild(button);
    await fireEvent.click(grip('Alpha'));
    await vi.waitFor(() => expect(screen.getByRole('menu')).toBeTruthy());
    await fireEvent(button, pointer('pointerdown'));
    button.focus();
    await vi.waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.activeElement).toBe(button);
    button.remove();

    // Focus inside a newly opened dialog is never stolen back.
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const input = document.createElement('input');
    dialog.appendChild(input);
    document.body.appendChild(dialog);
    await fireEvent.click(grip('Alpha'));
    await vi.waitFor(() => expect(screen.getByRole('menu')).toBeTruthy());
    await fireEvent(dialog, pointer('pointerdown'));
    input.focus();
    await vi.waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.activeElement).toBe(input);
    dialog.remove();
    expect(onReorder).not.toHaveBeenCalled();
  });

  // FIT-096 (RUI-AC-20): menu items move one step through the same
  // pipeline, boundary items are disabled, Escape dismisses and refocuses
  // the grip, and pending saves suppress the menu.
  it('moves via menu items, disables boundaries, and suppresses while pending', async () => {
    const { onReorder } = renderList([
      item('a', 'Alpha'),
      item('b', 'Beta'),
      item('c', 'Gamma'),
    ]);
    // First row: "Move earlier" is unavailable.
    await fireEvent.click(grip('Alpha'));
    expect(
      screen.getByRole('menuitem', { name: 'Move earlier' }),
    ).toHaveProperty('disabled', true);
    await fireEvent.click(screen.getByRole('menuitem', { name: 'Move later' }));
    await vi.waitFor(() =>
      expect(onReorder).toHaveBeenCalledWith(['b', 'a', 'c']),
    );
    expect(screen.queryByRole('menu')).toBeNull();
    await vi.waitFor(() => expect(document.activeElement).toBe(grip('Alpha')));

    // Last row: "Move later" is unavailable.
    await fireEvent.click(grip('Gamma'));
    expect(screen.getByRole('menuitem', { name: 'Move later' })).toHaveProperty(
      'disabled',
      true,
    );
    await fireEvent.keyDown(window, { key: 'Escape' });
    await vi.waitFor(() => expect(document.activeElement).toBe(grip('Gamma')));
  });

  // FIT-096 (RUI-AC-20/32): a pending save suppresses opening the menu.
  it('suppresses the menu while a reorder save is pending', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { onReorder } = renderList(
      [item('a', 'Alpha'), item('b', 'Beta')],
      vi.fn(() => gate),
    );
    const alpha = grip('Alpha');
    alpha.focus();
    await fireEvent.keyDown(alpha, { key: 'ArrowDown' });
    expect(onReorder).toHaveBeenCalledTimes(1);
    await fireEvent.click(grip('Beta'));
    expect(screen.queryByRole('menu')).toBeNull();
    release();
    await vi.waitFor(() =>
      expect(
        screen.getByRole('list', { name: 'Training sessions' }),
      ).toHaveProperty('ariaBusy', 'false'),
    );
  });

  // FIT-097 (RUI-AC-21): ArrowUp/ArrowDown on a focused grip moves one
  // position per press and focus stays on the moved item's grip.
  it('moves one position per arrow press and keeps focus on the grip', async () => {
    const { onReorder } = renderList([
      item('a', 'Alpha'),
      item('b', 'Beta'),
      item('c', 'Gamma'),
    ]);
    const beta = grip('Beta');
    beta.focus();
    await fireEvent.keyDown(beta, { key: 'ArrowUp' });
    await vi.waitFor(() =>
      expect(onReorder).toHaveBeenCalledWith(['b', 'a', 'c']),
    );
    await vi.waitFor(() => expect(document.activeElement).toBe(grip('Beta')));
  });

  // FIT-098 (RUI-AC-22): arrows toward a boundary are a no-op — nothing
  // moves and nothing is written.
  it('ignores arrows toward the boundary', async () => {
    const { onReorder } = renderList([item('a', 'Alpha'), item('b', 'Beta')]);
    await fireEvent.keyDown(grip('Alpha'), { key: 'ArrowUp' });
    await fireEvent.keyDown(grip('Beta'), { key: 'ArrowDown' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onReorder).not.toHaveBeenCalled();
  });

  // FIT-099 (RUI-AC-23): a persisted move announces "{name} moved to
  // position {n}." and the grip carries a usage description and
  // aria-keyshortcuts.
  it('announces persisted moves and describes grip usage', async () => {
    renderList([item('a', 'Alpha'), item('b', 'Beta')]);
    const alpha = grip('Alpha');
    expect(alpha.getAttribute('aria-keyshortcuts')).toContain('ArrowUp');
    expect(alpha.getAttribute('aria-keyshortcuts')).toContain('ArrowDown');
    const describedBy = alpha.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)?.textContent).toContain(
      'arrow keys',
    );
    alpha.focus();
    await fireEvent.keyDown(alpha, { key: 'ArrowDown' });
    await vi.waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain(
        'Alpha moved to position 2.',
      ),
    );
  });

  // FIT-106 (RUI-AC-30): a failed save rolls the preview back to the
  // committed order, announces the failure accessibly, and never retries.
  it('rolls back and announces failure when the save rejects', async () => {
    const onReorder = vi.fn(async () => {
      throw new Error('save failed');
    });
    renderList(
      [item('a', 'Alpha'), item('b', 'Beta'), item('c', 'Gamma')],
      onReorder,
    );
    const alpha = grip('Alpha');
    alpha.focus();
    await fireEvent.keyDown(alpha, { key: 'ArrowDown' });
    await vi.waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain(
        'Could not move Alpha.',
      ),
    );
    const list = screen.getByRole('list', { name: 'Training sessions' });
    const order = Array.from(list.querySelectorAll('li[data-session-id]')).map(
      (row) => (row as HTMLElement).dataset.sessionId,
    );
    expect(order).toEqual(['a', 'b', 'c']);
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(grip('Alpha')).toHaveProperty('disabled', false);
  });

  // FIT-106 (RUI-AC-30/32): a drag preview is discarded when its save
  // rejects — latest committed props win.
  it('discards the drag preview when the save rejects', async () => {
    const onReorder = vi.fn(async () => {
      throw new Error('conflict');
    });
    renderList([item('a', 'Alpha'), item('b', 'Beta')], onReorder);
    const handle = grip('Alpha');
    const list = screen.getByRole('list', { name: 'Training sessions' });
    await fireEvent(handle, pointer('pointerdown', { clientY: 10 }));
    await fireEvent(handle, pointer('pointermove', { clientY: 80 }));
    await fireEvent(handle, pointer('pointerup', { clientY: 80 }));
    await vi.waitFor(() => expect(onReorder).toHaveBeenCalledTimes(1));
    await vi.waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain(
        'Could not move Alpha.',
      ),
    );
    const order = Array.from(list.querySelectorAll('li[data-session-id]')).map(
      (row) => (row as HTMLElement).dataset.sessionId,
    );
    expect(order).toEqual(['a', 'b']);
  });

  // FIT-100 (RUI-AC-24): zero or one item offers no enabled reorder
  // affordance.
  it('offers no enabled grip for empty or singleton lists', () => {
    renderList([item('a', 'Solo')]);
    expect(grip('Solo')).toHaveProperty('disabled', true);
    render(Harness, {
      props: { items: [], onReorder: vi.fn(async () => {}) },
    });
    expect(screen.queryAllByRole('button', { name: /^Reorder / })).toHaveLength(
      1,
    );
  });

  // FIT-100 (RUI-AC-24/32): the external reorderPending gate disables all
  // grips and marks the list busy even without a local save.
  it('disables grips and marks the list busy while externally pending', () => {
    renderList([item('a', 'Alpha'), item('b', 'Beta')], undefined, {
      reorderPending: true,
    });
    const list = screen.getByRole('list', { name: 'Training sessions' });
    expect(list.getAttribute('aria-busy')).toBe('true');
    expect(grip('Alpha')).toHaveProperty('disabled', true);
    expect(grip('Beta')).toHaveProperty('disabled', true);
  });
});
