<script lang="ts">
  interface Props {
    historyLength: number
  }
  const { historyLength }: Props = $props()

</script>

<form action="?/undo">
  <button
    type="submit"
    aria-label="Undo"
    class="h-full flex items-center px-3"
    class:cursor-pointer={!!historyLength}
    disabled={!historyLength}
  >
    <i class="bi bi-arrow-counterclockwise text-2xl transition-all"></i>
  </button>
</form>
