import { describe, expect, it, vi } from 'vitest';
import {
  addExercise,
  addSession,
  captureSnapshot,
  createRoutine,
  deleteSession,
  reorderSessions,
} from './commands';
import { FitnessError } from './errors';
import { emptyFitnessDocument, type FitnessDocumentV2 } from './model';

const ids = (...values: string[]) => ({
  next: vi.fn(() => values.shift() ?? crypto.randomUUID()),
});
const clock = (value = '2026-01-01T00:00:00.000Z') => ({ nowIso: () => value });

describe('session reordering', () => {
  const threeSessions = () => {
    let state = createRoutine(
      emptyFitnessDocument(),
      { name: 'Split' },
      ids('r'),
    ).document;
    state = addSession(state, 'r', 'Alpha', ids('a')).document;
    state = addSession(state, 'r', 'Beta', ids('b')).document;
    state = addSession(state, 'r', 'Gamma', ids('c')).document;
    return state;
  };
  const sortedIds = (state: FitnessDocumentV2, routineId = 'r') =>
    [...state.routines.find((item) => item.id === routineId)!.sessions]
      .sort((left, right) => left.order - right.order)
      .map((session) => session.id);

  // FIT-053: a forward multi-position move produces the committed permutation.
  it('moves a session forward across multiple positions', () => {
    const state = threeSessions();
    const result = reorderSessions(state, 'r', ['c', 'a', 'b']);
    expect(result.mutation).toEqual({
      kind: 'reorder-sessions',
      routineId: 'r',
      sessionIds: ['c', 'a', 'b'],
    });
    expect(sortedIds(result.document)).toEqual(['c', 'a', 'b']);
    expect(state.routines[0]!.sessions.map((session) => session.order)).toEqual(
      [1, 2, 3],
    );
  });

  // FIT-073: a backward multi-position move permutes order values only.
  it('moves a session backward across multiple positions preserving content', () => {
    let state = threeSessions();
    state = addExercise(
      state,
      'r',
      'a',
      { name: 'Press', sets: 3, repetitions: 10, weightKg: 5 },
      ids('e1'),
    ).document;
    const result = reorderSessions(state, 'r', ['b', 'c', 'a']);
    expect(sortedIds(result.document)).toEqual(['b', 'c', 'a']);
    const moved = result.document.routines[0]!.sessions.find(
      (session) => session.id === 'a',
    )!;
    expect(moved).toMatchObject({
      id: 'a',
      name: 'Alpha',
      order: 3,
      exercises: [
        { id: 'e1', name: 'Press', sets: 3, repetitions: 10, weightKg: 5 },
      ],
    });
  });

  // FIT-054: malformed permutations — duplicate, omitted, extra, unknown,
  // foreign-routine, and empty inputs — are rejected at command level.
  it.each([
    ['duplicate', ['a', 'a', 'b']],
    ['omitted', ['a', 'b']],
    ['extra', ['a', 'b', 'c', 'd']],
    ['unknown', ['a', 'b', 'nope']],
    ['foreign', ['a', 'b', 'other-session']],
    ['empty', []],
  ])('rejects a %s permutation without writing', (_label, sessionIds) => {
    let state = threeSessions();
    state = createRoutine(state, { name: 'Other' }, ids('r2')).document;
    state = addSession(state, 'r2', 'Elsewhere', ids('other-session')).document;
    const call = () => reorderSessions(state, 'r', sessionIds);
    expect(call).toThrow(FitnessError);
    expect(call).toThrow(
      'Session order must include every session exactly once.',
    );
    try {
      call();
    } catch (error) {
      expect((error as FitnessError).code).toBe('validation');
    }
    expect(sortedIds(state)).toEqual(['a', 'b', 'c']);
  });

  // FIT-054: a reorder against a missing routine fails before any write.
  it('reports a missing routine for reorder', () => {
    expect(() => reorderSessions(threeSessions(), 'missing', ['a'])).toThrow(
      'The routine no longer exists.',
    );
  });

  // FIT-075: a no-op returns the identical document reference.
  it('returns the original document for identical, empty, and single orders', () => {
    const state = threeSessions();
    expect(reorderSessions(state, 'r', ['a', 'b', 'c']).document).toBe(state);
    const single = createRoutine(
      emptyFitnessDocument(),
      { name: 'Solo' },
      ids('solo'),
    ).document;
    const withOne = addSession(single, 'solo', 'Only', ids('s')).document;
    expect(reorderSessions(withOne, 'solo', ['s']).document).toBe(withOne);
    const empty = createRoutine(
      emptyFitnessDocument(),
      { name: 'Empty' },
      ids('r-empty'),
    ).document;
    expect(reorderSessions(empty, 'r-empty', []).document).toBe(empty);
  });

  // FIT-073: noncontiguous existing order values remain valid input.
  it('accepts routines whose existing order values have gaps', () => {
    let state = threeSessions();
    state = deleteSession(state, 'r', 'b').document;
    const result = reorderSessions(state, 'r', ['c', 'a']);
    expect(sortedIds(result.document)).toEqual(['c', 'a']);
    expect(
      result.document.routines[0]!.sessions.map((session) => session.order),
    ).toEqual([2, 1]);
  });

  // FIT-072: duplicate names resolve by stable session identity.
  it('reorders sessions that share a name by id', () => {
    let state = createRoutine(
      emptyFitnessDocument(),
      { name: 'Same' },
      ids('r'),
    ).document;
    state = addSession(state, 'r', 'Session 1', ids('a')).document;
    state = addSession(state, 'r', 'Session 1', ids('b')).document;
    const result = reorderSessions(state, 'r', ['b', 'a']);
    expect(sortedIds(result.document)).toEqual(['b', 'a']);
  });

  // FIT-055: other routines are untouched and input documents stay immutable.
  it('leaves other routines and the input document unchanged', () => {
    let state = threeSessions();
    state = createRoutine(state, { name: 'Other' }, ids('r2')).document;
    state = addSession(state, 'r2', 'Elsewhere', ids('z')).document;
    const before = state.routines[1];
    const result = reorderSessions(state, 'r', ['c', 'a', 'b']);
    expect(result.document.routines[1]).toBe(before);
    expect(sortedIds(state)).toEqual(['a', 'b', 'c']);
  });

  // FIT-073/FIT-074: snapshots are preserved verbatim through reorder, and
  // append/delete keep the committed order intact.
  it('preserves snapshots and supports append and delete after reorder', () => {
    let state = threeSessions();
    state = captureSnapshot(state, 'r', ids('snap'), clock()).document;
    const snapshots = state.routines[0]!.snapshots;
    state = reorderSessions(state, 'r', ['c', 'a', 'b']).document;
    expect(state.routines[0]!.snapshots).toBe(snapshots);
    state = addSession(state, 'r', 'Delta', ids('d')).document;
    expect(
      state.routines[0]!.sessions.find((session) => session.id === 'd')!.order,
    ).toBe(4);
    expect(sortedIds(state)).toEqual(['c', 'a', 'b', 'd']);
    state = deleteSession(state, 'r', 'a').document;
    expect(sortedIds(state)).toEqual(['c', 'b', 'd']);
  });
});
