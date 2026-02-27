<script lang="ts">
  interface Props {
    onclick: () => void
    isSubmitting: boolean
  }
  const { onclick, isSubmitting }: Props = $props()
</script>

<button
  type="button"
  class="h-full flex items-center px-3"
  aria-label="Update"
  {onclick}
  disabled={isSubmitting}
>
  {#if isSubmitting}
    <i class="bi bi-hourglass-split text-2xl text-warning"></i>
  {:else}
    <i class="bi bi-floppy text-2xl hover:text-warning transition-all"></i>
  {/if}
</button>
