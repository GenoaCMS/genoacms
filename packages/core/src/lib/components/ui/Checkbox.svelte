<script lang="ts">
    import type { Snippet } from 'svelte'

    interface Props {
      checked?: boolean
      class?: string
      children?: Snippet
      [key: string]: any
    }

    let {
      checked = $bindable(),
      class: className = '',
      children,
      ...rest
    }: Props = $props()
</script>

<label class="flex items-center space-x-2 {className}">
    <input type="checkbox" bind:checked class="checkbox" {...rest} />
    {#if children}
        <span>{@render children?.()}</span>
    {/if}
</label>
