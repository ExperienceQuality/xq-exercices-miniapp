import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';

import ExerciseList from './ExerciseList.svelte';
import type { ExerciseV2 } from '../fitness/domain/model';

const exercise = (
  id: string,
  name: string,
  sets = 3,
  repetitions = 10,
  weightKg = 20,
): ExerciseV2 => ({
  id,
  name,
  sets,
  repetitions,
  weightKg,
});

const renderList = (
  exercises: ExerciseV2[],
  overrides: {
    onEditExercise?: (id: string) => void;
    onDeleteExercise?: (id: string) => void;
    onReorderExercises?: (ids: readonly string[]) => Promise<void>;
    reorderPending?: boolean;
  } = {},
) => {
  const props = {
    exercises,
    onEditExercise: vi.fn(),
    onDeleteExercise: vi.fn(),
    onReorderExercises: vi.fn(async () => {}),
    reorderPending: false,
    ...overrides,
  };
  render(ExerciseList, { props });
  return props;
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

describe('ExerciseList', () => {
  // FIT-094/FIT-102 (RUI-AC-18/26): the exercise row shows name plus
  // metadata with the grip on top and Edit/Delete on their own row below
  // — no initials badge, no visible arrows.
  it('renders name, metadata, grip, and an actions row without initials', () => {
    renderList([
      exercise('x', 'Bench Press', 4, 8, 62.5),
      exercise('y', 'Squat'),
    ]);
    expect(screen.getByRole('list', { name: 'Exercises' })).toBeTruthy();
    const row = grip('Bench Press').closest('li')!;
    expect(row.dataset.exerciseId).toBe('x');
    expect(row.className).toContain('exercise-row');
    const meta = row.querySelector('small')!.textContent!.replace(/\s+/g, ' ');
    expect(meta).toContain('4 sets · 8 reps · 62.5 kg');
    expect(row.querySelector('.reorder-actions')).toBeTruthy();
    expect(row.querySelector('.exercise-mark')).toBeNull();
    expect(row.querySelectorAll('[data-move]')).toHaveLength(0);
    expect(
      screen.getByRole('button', { name: 'Edit Bench Press' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Delete Bench Press' }),
    ).toBeTruthy();
  });

  // FIT-101/FIT-103 (RUI-AC-25/27): the exercises array order is the
  // canonical order — the adapter never re-sorts.
  it('preserves the session exercise array order', () => {
    renderList([
      exercise('c', 'Gamma'),
      exercise('a', 'Alpha'),
      exercise('b', 'Beta'),
    ]);
    const rows = Array.from(
      document.querySelectorAll('li[data-exercise-id]'),
    ).map((row) => (row as HTMLElement).dataset.exerciseId);
    expect(rows).toEqual(['c', 'a', 'b']);
  });

  // FIT-104 (RUI-AC-28): identity resolves by stable ID — a reorder of a
  // duplicate-named exercise commits the right IDs, and Edit still acts
  // on the moved row's ID afterwards.
  it('moves the right duplicate-named exercise and edits by ID', async () => {
    const onReorderExercises = vi.fn(async () => {});
    const onEditExercise = vi.fn();
    renderList(
      [exercise('x', 'Curl'), exercise('y', 'Curl'), exercise('z', 'Press')],
      { onReorderExercises, onEditExercise },
    );
    const rows = document.querySelectorAll('li[data-exercise-id]');
    const secondGrip = rows[1]!.querySelector<HTMLElement>('.reorder-grip')!;
    secondGrip.focus();
    await fireEvent.keyDown(secondGrip, { key: 'ArrowDown' });
    await vi.waitFor(() =>
      expect(onReorderExercises).toHaveBeenCalledWith(['x', 'z', 'y']),
    );
    // Edit on the same row still resolves the second Curl's ID.
    const edit = rows[1]!.querySelector<HTMLElement>(
      'button[aria-label="Edit Curl"]',
    )!;
    await fireEvent.click(edit);
    expect(onEditExercise).toHaveBeenCalledWith('y');
    expect(onEditExercise).not.toHaveBeenCalledWith('x');
  });

  // FIT-101: Edit/Delete callbacks receive the exercise ID, never a name
  // or index.
  it('forwards typed Edit and Delete callbacks by ID', async () => {
    const onEditExercise = vi.fn();
    const onDeleteExercise = vi.fn();
    renderList([exercise('x', 'Bench'), exercise('y', 'Squat')], {
      onEditExercise,
      onDeleteExercise,
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Edit Squat' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Delete Bench' }));
    expect(onEditExercise).toHaveBeenCalledWith('y');
    expect(onDeleteExercise).toHaveBeenCalledWith('x');
  });

  // FIT-090/FIT-106 (RUI-AC-14/30): a rejected reorder restores the
  // committed array order and does not retry.
  it('rolls back to the committed order when the reorder rejects', async () => {
    const onReorderExercises = vi.fn(async () => {
      throw new Error('conflict');
    });
    renderList([exercise('a', 'Alpha'), exercise('b', 'Beta')], {
      onReorderExercises,
    });
    const handle = grip('Alpha');
    await fireEvent(handle, pointer('pointerdown', { clientY: 10 }));
    await fireEvent(handle, pointer('pointermove', { clientY: 80 }));
    await fireEvent(handle, pointer('pointerup', { clientY: 80 }));
    await vi.waitFor(() =>
      expect(onReorderExercises).toHaveBeenCalledWith(['b', 'a']),
    );
    await vi.waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain(
        'Could not move Alpha.',
      ),
    );
    const rows = Array.from(
      document.querySelectorAll('li[data-exercise-id]'),
    ).map((row) => (row as HTMLElement).dataset.exerciseId);
    expect(rows).toEqual(['a', 'b']);
    expect(onReorderExercises).toHaveBeenCalledTimes(1);
  });

  // FIT-100/FIT-108 (RUI-AC-24/32): pending suppresses the exercise list
  // the same way as the session list — shared gate, no adapter logic.
  it('disables grips while a shared reorder save is pending', () => {
    renderList([exercise('a', 'Alpha'), exercise('b', 'Beta')], {
      reorderPending: true,
    });
    expect(
      screen.getByRole('list', { name: 'Exercises' }).getAttribute('aria-busy'),
    ).toBe('true');
    expect(grip('Alpha')).toHaveProperty('disabled', true);
    expect(grip('Beta')).toHaveProperty('disabled', true);
  });

  // FIT-100 (RUI-AC-24): a single exercise exposes no enabled reorder
  // affordance but keeps its actions.
  it('offers no enabled grip for a single exercise', () => {
    renderList([exercise('a', 'Only')]);
    expect(grip('Only')).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Edit Only' })).toHaveProperty(
      'disabled',
      false,
    );
  });
});
