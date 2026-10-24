<script lang="ts">
  import ReorderableList from './ReorderableList.svelte';

  export interface HarnessItem {
    id: string;
    name: string;
    detail?: string;
  }

  let {
    items,
    listLabel = 'Training sessions',
    kind = 'session',
    onReorder,
    reorderPending = false,
  }: {
    items: readonly HarnessItem[];
    listLabel?: string;
    kind?: 'session' | 'exercise';
    onReorder: (ids: readonly string[]) => Promise<void>;
    reorderPending?: boolean;
  } = $props();
</script>

<ReorderableList {items} {listLabel} {kind} {onReorder} {reorderPending}>
  {#snippet children(item)}
    <span class="row-copy"
      ><strong>{item.name}</strong>{#if item.detail}<small>{item.detail}</small
        >{/if}</span
    >
  {/snippet}
  {#snippet actions(item)}
    <button type="button" class="row-action">Open {item.name}</button>
  {/snippet}
</ReorderableList>
