<script lang="ts">
    import type { Snippet } from 'svelte'
    import type { HTMLSelectAttributes } from 'svelte/elements'

    interface Props extends HTMLSelectAttributes {
      value?: string
      class?: string
      children?: Snippet
    }

    let {
      value = $bindable(),
      class: className = '',
      children,
      ...rest
    }: Props = $props()
</script>

<select bind:value class="select {className}" {...rest}>
    {@render children?.()}
</select>
