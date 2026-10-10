<script lang="ts">
  interface Props {
    onclick: () => void
    isSubmitting: boolean
    isDirty: boolean
  }
  const { onclick, isSubmitting, isDirty }: Props = $props()
</script>

<div class="flex items-center gap-3 px-2">
  <span class="hidden sm:flex items-center gap-1.5 text-xs text-surface-500" aria-live="polite">
    {#if isDirty}
      <span class="size-2 rounded-full bg-warning-500"></span>
      Unsaved changes
    {:else}
      <i class="bi bi-check2"></i>
      Saved
    {/if}
  </span>
  <button
    type="button"
    class="btn {isDirty ? 'preset-filled-primary-500' : 'preset-tonal'}"
    title="Save (Ctrl+S)"
    {onclick}
    disabled={isSubmitting}
  >
    {#if isSubmitting}
      <i class="bi bi-hourglass-split"></i>
      <span>Saving…</span>
    {:else}
      <i class="bi bi-floppy"></i>
      <span>Save</span>
    {/if}
  </button>
</div>
