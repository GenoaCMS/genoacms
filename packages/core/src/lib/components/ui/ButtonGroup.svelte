<script lang="ts">
    import type { Snippet } from 'svelte'

    interface Props {
      class?: string
      children?: Snippet
    }

    const { class: className = '', children }: Props = $props()
</script>

<div class="inline-flex rounded-md shadow-sm {className}" role="group">
    {@render children?.()}
</div>
