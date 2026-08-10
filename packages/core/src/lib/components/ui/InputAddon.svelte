<script lang="ts">
    import type { Snippet } from 'svelte'

    interface Props {
      class?: string
      children?: Snippet
      [key: string]: any
    }

    const { class: className = '', children, ...rest }: Props = $props()
</script>

<span
    class="inline-flex items-center px-3 rounded-l-md border border-r-0 border-surface-300 bg-surface-100-900 text-surface-500 sm:text-sm {className}"
    {...rest}
>
    {@render children?.()}
</span>
