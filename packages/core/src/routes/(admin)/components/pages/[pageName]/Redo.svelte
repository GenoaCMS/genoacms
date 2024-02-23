<script lang="ts">
  export let isEnabled: boolean
</script>

<button type="submit" form="redo-form" disabled={!isEnabled} class="h-full flex items-center px-3">
    <i class:hover:text-warning={isEnabled} class="bi bi-arrow-clockwise text-2xl transition-all"/>
</button>
