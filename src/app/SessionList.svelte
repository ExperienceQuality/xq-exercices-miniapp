<script lang="ts">
  import ReorderableList from './ReorderableList.svelte';
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

  // Sessions arrive unordered from the document; the adapter sorts by the
  // numeric order field before handing canonical items to the shared list.
  const items = $derived(
    [...sessions].sort((left, right) => left.order - right.order),
  );
</script>

<ReorderableList
  {items}
  listLabel="Training sessions"
  kind="session"
  onReorder={onReorderSessions}
  {reorderPending}
>
  {#snippet children(session)}
    <button
      class="list-button"
      type="button"
      onclick={() => onOpenSession(session.id)}
      ><span class="row-copy"
        ><strong>{session.name}</strong><small
          >{session.exercises.length}
          {session.exercises.length === 1 ? 'exercise' : 'exercises'}</small
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
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        /></svg
      ></button
    >
  {/snippet}
</ReorderableList>
