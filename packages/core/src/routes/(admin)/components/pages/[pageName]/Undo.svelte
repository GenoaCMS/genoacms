<script lang="ts">
  export let isEnabled: boolean
</script>

<button
  type="submit"
  form="undo-form"
  class="h-full flex items-center cursor-pointer px-3"
  class:cursor-pointer={isEnabled}
  disabled={!isEnabled}
  aria-label="Undo">
    <i class:hover:text-warning={isEnabled} class="bi bi-arrow-counterclockwise text-2xl transition-all"></i>
</button>
