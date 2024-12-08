<script lang="ts">
  import { Button, Card } from 'flowbite-svelte'

  type T = string | number | boolean
  type Props = {
    reference: T
    deleteReference: (i: T) => void
  }
  const { reference, deleteReference }: Props = $props()
</script>

<Card target="_blank" padding="sm" class="min-w-full mb-2">
  <div class="flex">
    <div class="flex-grow whitespace-nowrap">
      {reference}
    </div>
    <div class="w-auto h-auto my-auto">
      <Button onclick={() => deleteReference(reference)}>
        <i class="bi bi-x-circle text-2xl text-warning"></i>
      </Button>
    </div>
  </div>
</Card>
