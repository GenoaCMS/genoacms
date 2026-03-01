<script lang="ts">
  import type { ComponentNode as ComponentNodeT } from '$lib/script/components/page/entry/types'
  import { Card } from '$lib/components/ui/index'
  import { confirmationModal } from '$lib/script/alert'
  import { dragHandle } from 'svelte-dnd-action'

  interface Props {
    node: ComponentNodeT,
    ondelete: (uid: string) => void
  }
  const { node, ondelete }: Props = $props()

  async function deleteNode () {
    const confirmation = await confirmationModal(`Do you want to delete component ${node.name}?`)
    if (confirmation.isConfirmed) {
      ondelete(node.uid)
    }
  }
</script>

<Card class="p-3 mt-1">
  <div class="flex flex-wrap items-center gap-6">
    <div class="me-auto">
      {node.name} <span class="text-xs text-dark/70">#{node.uid.substring(0, 5)}</span>
    </div>
    <div class="ms-auto flex gap-6">
      <a href={node.uid} aria-label="Edit">
        <i class="bi bi-pencil-square text-2xl m-auto"></i>
      </a>
      <button aria-label="Dragger" type="button" use:dragHandle>
        <i class="bi bi-arrow-down-up text-2xl m-auto"></i>
      </button>
      <button aria-label="Delete" type="button" class="cursor-pointer" onclick={deleteNode}>
        <i class="bi bi-trash text-2xl m-auto text-red-700"></i>
      </button>
    </div>

  </div>
</Card>
