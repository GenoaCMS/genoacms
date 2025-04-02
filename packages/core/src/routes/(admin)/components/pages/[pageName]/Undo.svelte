<script lang="ts">
  export let isEnabled: boolean
</script>

<button type="submit" form="undo-form" disabled={!isEnabled} class="h-full flex items-center px-3" aria-label="Undo">
    <i class:hover:text-warning={isEnabled} class="bi bi-arrow-counterclockwise text-2xl transition-all"></i>
</button>
