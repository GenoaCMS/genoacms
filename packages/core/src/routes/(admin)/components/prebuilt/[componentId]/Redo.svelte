<script lang="ts">
  interface Props {
    futureLength: number
  }
  const { futureLength }: Props = $props()

</script>

<form action="?/redo">
  <button type="submit" disabled={!futureLength} aria-label="Redo" class="h-full flex items-center px-3">
    <i class="bi bi-arrow-clockwise text-2xl transition-all"></i>
  </button>
</form>
