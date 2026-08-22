<script lang="ts">
  /**
   * The checkbox itself — what it looks like and what it announces, with no opinion about where it
   * goes. `SelectionCheckbox` places it.
   */
  interface Props {
    isSelected: boolean
    onselect: () => void
    /** The accessible name, which is how tests and screen readers address it. */
    label: string
  }
  const { isSelected, onselect, label }: Props = $props()
</script>

<button
  type="button"
  onclick={onselect}
  aria-label={label}
  aria-pressed={isSelected}
  class="p-2"
>
  <i
    class="bi text-2xl transition-all"
    class:bi-square={!isSelected}
    class:bi-check-square={isSelected}
  ></i>
</button>
