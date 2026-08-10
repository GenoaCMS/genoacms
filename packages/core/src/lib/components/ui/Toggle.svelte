<script lang="ts">
    import type { Snippet } from 'svelte'

    interface Props {
      checked?: boolean
      class?: string
      children?: Snippet
      [key: string]: any
    }

    let {
      checked = $bindable(false),
      class: className = '',
      children,
      ...rest
    }: Props = $props()
</script>

<label class="flex items-center cursor-pointer {className}">
    <div class="relative">
        <input type="checkbox" bind:checked class="sr-only" {...rest} />
        <div
            class="block bg-surface-300 w-10 h-6 rounded-full transition-colors duration-200 ease-in-out {checked
              ? 'bg-primary-500'
              : ''}"
        ></div>
        <div
            class="dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform duration-200 ease-in-out {checked
              ? 'transform translate-x-4'
              : ''}"
        ></div>
    </div>
    {#if children}
        <div class="ml-3 text-surface-900 font-medium">
            {@render children?.()}
        </div>
    {/if}
</label>
