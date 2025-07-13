<script lang="ts">
  export let isEnabled: boolean
</script>

<button
  type="submit"
  form="redo-form"
  class="h-full flex items-center px-3"
  class:cursor-pointer={isEnabled}
  disabled={!isEnabled}
  aria-label="Redo">
    <i class:hover:text-warning={isEnabled} class="bi bi-arrow-clockwise text-2xl transition-all"></i>
</button>
