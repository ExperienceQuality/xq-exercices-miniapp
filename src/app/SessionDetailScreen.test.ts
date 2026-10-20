import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import SessionDetailScreen from './SessionDetailScreen.svelte';
import type { RoutineV2, TrainingSessionV2 } from '../fitness/domain/model';

const routine: RoutineV2 = {
  id: 'routine-1',
  name: 'Routine One',
  sessions: [],
  snapshots: [],
};

const buildSession = (name: string): TrainingSessionV2 => ({
  id: 'session-1',
  name: 'Session One',
  order: 1,
  exercises: [
    {
      id: 'exercise-1',
      name,
      sets: 3,
      repetitions: 10,
      weightKg: 12.5,
    },
  ],
});

const renderScreen = (session: TrainingSessionV2) =>
  render(SessionDetailScreen, {
    props: {
      routine,
      session,
      onBack: () => {},
      onAddExercise: () => {},
      onEditExercise: () => {},
      onDeleteExercise: () => {},
      onRenameSession: () => {},
      onDeleteSession: () => {},
    },
  });

describe('SessionDetailScreen', () => {
  it('renders the full exercise name inside a wrap-enabled element', () => {
    const longName =
      'Extremely long exercise name that must remain fully visible to the user';
    renderScreen(buildSession(longName));

    const element = screen.getByText(longName);
    expect(element.tagName).toBe('STRONG');
    expect(element.classList.contains('exercise-name')).toBe(true);
  });
});
