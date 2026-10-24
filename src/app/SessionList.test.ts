import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';

import SessionList from './SessionList.svelte';
import type { TrainingSessionV2 } from '../fitness/domain/model';

const session = (
  id: string,
  name: string,
  order: number,
): TrainingSessionV2 => ({ id, name, order, exercises: [] });

const renderList = (
  sessions: TrainingSessionV2[],
  onReorderSessions = vi.fn(async () => {}),
  reorderPending = false,
) => {
  const onOpenSession = vi.fn();
  render(SessionList, {
    props: { sessions, onOpenSession, onReorderSessions, reorderPending },
  });
  return { onOpenSession, onReorderSessions };
};

const pointer = (
  type: string,
  init: MouseEventInit & { pointerId?: number } = {},
) => {
  const { pointerId, ...mouseInit } = init;
  const event = new MouseEvent(type, {
    bubbles: true,
    button: 0,
    ...mouseInit,
  });
  if (pointerId !== undefined) Object.assign(event, { pointerId });
  return event;
};

const grip = (name: string) =>
  screen.getByRole('button', { name: `Reorder ${name}` });

describe('SessionList', () => {
  // FIT-059/FIT-062: accessible names for the list and the grip, rendered
  // as a sibling of the row navigation button — there are no visible
  // up/down buttons in the new affordance.
  it('exposes a labelled list and one grip per row beside the opener', () => {
    renderList([
      session('a', 'Alpha', 1),
      session('b', 'Beta', 2),
      session('c', 'Gamma', 3),
    ]);
    expect(
      screen.getByRole('list', { name: 'Training sessions' }),
    ).toBeTruthy();
    const handle = grip('Beta');
    const row = handle.closest('li')!;
    expect(row.dataset.sessionId).toBe('b');
    expect(row.querySelector('.list-button')).toBeTruthy();
    expect(row.querySelector('.list-button')!.contains(handle)).toBe(false);
    expect(row.querySelectorAll('[data-move]')).toHaveLength(0);
    expect(
      screen.queryByRole('button', { name: /Move Beta (up|down)/ }),
    ).toBeNull();
  });

  // FIT-063: the tap-to-move menu disables boundary items; grips never
  // become the visible arrow buttons.
  it('disables the boundary menu items', async () => {
    renderList([session('a', 'Alpha', 1), session('b', 'Beta', 2)]);
    await fireEvent.click(grip('Alpha'));
    expect(
      screen.getByRole('menuitem', { name: 'Move earlier' }),
    ).toHaveProperty('disabled', true);
    expect(screen.getByRole('menuitem', { name: 'Move later' })).toHaveProperty(
      'disabled',
      false,
    );
    await fireEvent.keyDown(window, { key: 'Escape' });
    await fireEvent.click(grip('Beta'));
    expect(screen.getByRole('menuitem', { name: 'Move later' })).toHaveProperty(
      'disabled',
      true,
    );
  });

  // FIT-056: a singleton list exposes no enabled reorder control.
  it('offers no enabled reorder control for a single session', () => {
    renderList([session('a', 'Solo', 1)]);
    expect(grip('Solo')).toHaveProperty('disabled', true);
  });

  // FIT-070/FIT-071: no generated numbering; a user-authored "Session 1"
  // is kept.
  it('shows only the exercise count and preserves a user name "Session 1"', () => {
    renderList([session('a', 'Session 1', 1), session('b', 'Legs', 2)]);
    expect(screen.getByText('Session 1')).toBeTruthy();
    expect(screen.getAllByText('0 exercises')).toHaveLength(2);
    expect(screen.queryByText(/Session 2/)).toBeNull();
  });

  // FIT-057/FIT-058: sessions are sorted by numeric order before display,
  // not document order.
  it('sorts sessions by their numeric order field', () => {
    renderList([
      session('b', 'Beta', 20),
      session('a', 'Alpha', 3),
      session('c', 'Gamma', 10),
    ]);
    const rows = Array.from(
      document.querySelectorAll('li[data-session-id]'),
    ).map((row) => (row as HTMLElement).dataset.sessionId);
    expect(rows).toEqual(['a', 'c', 'b']);
  });

  // FIT-062/FIT-064: a keyboard move commits the permutation, announces
  // the result, and keeps focus on the moved session's grip.
  it('moves a session down, announces the result, and keeps focus', async () => {
    const { onReorderSessions } = renderList([
      session('a', 'Alpha', 1),
      session('b', 'Beta', 2),
      session('c', 'Gamma', 3),
    ]);
    const handle = grip('Alpha');
    handle.focus();
    await fireEvent.keyDown(handle, { key: 'ArrowDown' });
    await vi.waitFor(() =>
      expect(onReorderSessions).toHaveBeenCalledWith(['b', 'a', 'c']),
    );
    await vi.waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain(
        'Alpha moved to position 2.',
      ),
    );
    await vi.waitFor(() => expect(document.activeElement).toBe(grip('Alpha')));
  });

  // FIT-062: the move menu drives the same reorder pipeline.
  it('moves a session via the tap-to-move menu', async () => {
    const { onReorderSessions } = renderList([
      session('a', 'Alpha', 1),
      session('b', 'Beta', 2),
    ]);
    await fireEvent.click(grip('Alpha'));
    await fireEvent.click(screen.getByRole('menuitem', { name: 'Move later' }));
    await vi.waitFor(() =>
      expect(onReorderSessions).toHaveBeenCalledWith(['b', 'a']),
    );
  });

  // FIT-068: while a save is pending every reorder control is suppressed.
  it('suppresses all reorder controls and marks the list busy while pending', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { onReorderSessions } = renderList(
      [session('a', 'Alpha', 1), session('b', 'Beta', 2)],
      vi.fn(() => gate),
    );
    const list = screen.getByRole('list', { name: 'Training sessions' });
    const alpha = grip('Alpha');
    alpha.focus();
    await fireEvent.keyDown(alpha, { key: 'ArrowDown' });
    expect(list.getAttribute('aria-busy')).toBe('true');
    expect(grip('Beta')).toHaveProperty('disabled', true);
    await fireEvent.click(grip('Beta'));
    expect(screen.queryByRole('menu')).toBeNull();
    release();
    await vi.waitFor(() =>
      expect(list.getAttribute('aria-busy')).toBe('false'),
    );
    expect(onReorderSessions).toHaveBeenCalledTimes(1);
  });

  // FIT-066: a failed save rolls back to the committed order without
  // retry and announces the failure.
  it('rolls back the preview and re-enables controls after a failed save', async () => {
    const { onReorderSessions } = renderList(
      [session('a', 'Alpha', 1), session('b', 'Beta', 2)],
      vi.fn(async () => {
        throw new Error('save failed');
      }),
    );
    const alpha = grip('Alpha');
    alpha.focus();
    await fireEvent.keyDown(alpha, { key: 'ArrowDown' });
    await vi.waitFor(() =>
      expect(grip('Beta')).toHaveProperty('disabled', false),
    );
    await vi.waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain(
        'Could not move Alpha.',
      ),
    );
    expect(onReorderSessions).toHaveBeenCalledTimes(1);
  });

  // FIT-057: pointer drag beyond the threshold commits the preview order.
  it('commits a pointer drag that crosses the movement threshold', async () => {
    const { onReorderSessions } = renderList([
      session('a', 'Alpha', 1),
      session('b', 'Beta', 2),
      session('c', 'Gamma', 3),
    ]);
    const handle = grip('Alpha');
    await fireEvent(handle, pointer('pointerdown', { clientY: 10 }));
    await fireEvent(handle, pointer('pointermove', { clientY: 80 }));
    await fireEvent(handle, pointer('pointerup', { clientY: 80 }));
    await vi.waitFor(() =>
      expect(onReorderSessions).toHaveBeenCalledWith(['b', 'c', 'a']),
    );
  });

  // FIT-075: Escape cancels the drag without writing.
  it('cancels an in-progress drag with Escape and writes nothing', async () => {
    const { onReorderSessions } = renderList([
      session('a', 'Alpha', 1),
      session('b', 'Beta', 2),
      session('c', 'Gamma', 3),
    ]);
    const handle = grip('Alpha');
    await fireEvent(handle, pointer('pointerdown', { clientY: 10 }));
    await fireEvent(handle, pointer('pointermove', { clientY: 80 }));
    await fireEvent.keyDown(window, { key: 'Escape' });
    await fireEvent(handle, pointer('pointerup', { clientY: 80 }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onReorderSessions).not.toHaveBeenCalled();
  });

  // FIT-075: a sub-threshold release writes nothing; the tap may open the
  // move menu instead.
  it('writes nothing when the pointer never crosses the threshold', async () => {
    const { onReorderSessions } = renderList([
      session('a', 'Alpha', 1),
      session('b', 'Beta', 2),
    ]);
    const handle = grip('Alpha');
    await fireEvent(handle, pointer('pointerdown', { clientY: 10 }));
    await fireEvent(handle, pointer('pointermove', { clientY: 12 }));
    await fireEvent(handle, pointer('pointerup', { clientY: 12 }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onReorderSessions).not.toHaveBeenCalled();
  });

  // FIT-068: a reorder pending elsewhere suppresses controls and marks
  // the list busy even though this list has no local save in flight.
  it('disables controls and marks the list busy while an external reorder is pending', () => {
    renderList(
      [session('a', 'Alpha', 1), session('b', 'Beta', 2)],
      vi.fn(async () => {}),
      true,
    );
    const list = screen.getByRole('list', { name: 'Training sessions' });
    expect(list.getAttribute('aria-busy')).toBe('true');
    for (const label of ['Reorder Alpha', 'Reorder Beta']) {
      expect(screen.getByRole('button', { name: label })).toHaveProperty(
        'disabled',
        true,
      );
    }
  });

  // FIT-075: a pointercancel from a different pointer leaves the drag
  // active instead of cancelling it.
  it('ignores pointercancel events from other pointers', async () => {
    const { onReorderSessions } = renderList([
      session('a', 'Alpha', 1),
      session('b', 'Beta', 2),
      session('c', 'Gamma', 3),
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
      expect(onReorderSessions).toHaveBeenCalledWith(['b', 'c', 'a']),
    );
  });

  // FIT-059: tapping the row body opens the session; the grip never does.
  it('navigates from the row body and never from the grip', async () => {
    const { onOpenSession, onReorderSessions } = renderList([
      session('a', 'Alpha', 1),
      session('b', 'Beta', 2),
    ]);
    const row = grip('Alpha').closest('li')!;
    await fireEvent.click(row.querySelector('.list-button')!);
    expect(onOpenSession).toHaveBeenCalledWith('a');
    expect(onReorderSessions).not.toHaveBeenCalled();
  });

  // FIT-062: a deliberate focus change during a pending save wins; the
  // component must not steal focus back to the moved row.
  it('keeps deliberate focus outside the moved row after a pending save', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    renderList(
      [
        session('a', 'Alpha', 1),
        session('b', 'Beta', 2),
        session('c', 'Gamma', 3),
      ],
      vi.fn(() => gate),
    );
    const list = screen.getByRole('list', { name: 'Training sessions' });
    const deliberate = grip('Gamma')
      .closest('li')!
      .querySelector<HTMLElement>('.list-button')!;
    await fireEvent.keyDown(grip('Alpha'), { key: 'ArrowDown' });
    // The user deliberately focuses another row's navigation button while
    // the reorder save is in flight.
    deliberate.focus();
    release();
    await vi.waitFor(() =>
      expect(list.getAttribute('aria-busy')).toBe('false'),
    );
    await vi.waitFor(() => expect(document.activeElement).toBe(deliberate));
  });

  // FIT-075: a session-membership change mid-drag cancels the gesture
  // even when the ID sets collide under naive string concatenation
  // ('ab'+'c' === 'a'+'bc' — the signature must be unambiguous).
  it('cancels a drag when session membership changes mid-gesture', async () => {
    const onReorderSessions = vi.fn(async () => {});
    const { rerender } = render(SessionList, {
      props: {
        sessions: [session('ab', 'Alpha', 1), session('c', 'Beta', 2)],
        onOpenSession: vi.fn(),
        onReorderSessions,
      },
    });
    const handle = grip('Alpha');
    await fireEvent(handle, pointer('pointerdown', { clientY: 10 }));
    await fireEvent(handle, pointer('pointermove', { clientY: 80 }));
    await rerender({
      sessions: [session('a', 'Alpha', 1), session('bc', 'Beta', 2)],
      onOpenSession: vi.fn(),
      onReorderSessions,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    // Fire on window: the rerender detaches the old rows, and the
    // gesture's listeners live on window — this is the release that must
    // not write.
    await fireEvent(window, pointer('pointerup', { clientY: 80 }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onReorderSessions).not.toHaveBeenCalled();
  });
});
