<script lang="ts">
    import type { Snippet } from 'svelte'
    import type { HTMLLabelAttributes } from 'svelte/elements'

    interface Props extends HTMLLabelAttributes {
      class?: string;
      children?: Snippet;
    }

    const { class: className = '', children, ...rest }: Props = $props()
</script>

<label class="label {className}" {...rest}>
    <span class="label-text">
        {@render children?.()}
    </span>
</label>
