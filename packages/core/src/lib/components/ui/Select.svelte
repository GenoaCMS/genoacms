<script lang="ts">
    import type { Snippet } from 'svelte'

    interface Props {
      value?: string
      class?: string
      children?: Snippet
      [key: string]: any
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
