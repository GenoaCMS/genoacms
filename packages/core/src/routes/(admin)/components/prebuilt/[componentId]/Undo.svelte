<script lang="ts">
  interface Props {
    historyLength: number
  }
  const { historyLength }: Props = $props()

</script>

<form action="?/undo">
  <button type="submit" disabled={!historyLength} aria-label="Undo" class="h-full flex items-center px-3">
    <i class="bi bi-arrow-counterclockwise text-2xl transition-all"></i>
  </button>
</form>
